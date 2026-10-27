// The API tools' answers, from the OpenAPI 3.1 reference, as Markdown: the
// services and their routes, one route in full, and one shape (a schema
// under components.schemas) in full.
import { Index } from './search.js';
import type { OpenApi } from './store.js';

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

interface Route {
  method: string;
  path: string;
  op: any;
  service: string;
  title: string;
  text: string;
}

function routes(api: OpenApi): Route[] {
  return Object.entries(api.paths).flatMap(([path, ops]) =>
    METHODS.filter((m) => ops[m]).map((method) => {
      const op = ops[method];
      return {
        method,
        path,
        op,
        service: op.tags?.[0] || 'other',
        title: `${path} ${op.summary || ''}`,
        text: `${op.operationId || ''} ${op.description || ''}`,
      };
    }),
  );
}

// "auth", "auth-service" and "Auth-Service" all name auth-service.
function findService(api: OpenApi, name: string): string | undefined {
  const wanted = name.trim().toLowerCase().replace(/-service$/, '');
  return (api.tags || []).map((t) => t.name).find((tag) => tag.toLowerCase().replace(/-service$/, '') === wanted);
}

const line = (r: Route) => `- \`${r.method.toUpperCase()} ${r.path}\`: ${r.op.summary || r.op.operationId || ''}`;

// With nothing asked for, the services in their groups; with a service, its
// routes; with words, the routes that match them.
export function listEndpoints(api: OpenApi, { service, query }: { service?: string; query?: string } = {}): string {
  const all = routes(api);
  if (query) {
    const keep = service ? findService(api, service) : undefined;
    const found = new Index(all).search(query, 20, (r) => !keep || r.service === keep);
    if (!found.length) return `No route matches "${query}".`;
    return found.map(({ item }) => `${line(item)} (${item.service})`).join('\n');
  }
  if (service) {
    const tag = findService(api, service);
    if (!tag) return `No service called "${service}". Call list_endpoints without arguments for the services.`;
    const description = api.tags?.find((t) => t.name === tag)?.description;
    return [`# ${tag}`, description ? `\n${description}\n` : '', ...all.filter((r) => r.service === tag).map(line)].join('\n');
  }
  const count = (tag: string) => all.filter((r) => r.service === tag).length;
  const described = new Map((api.tags || []).map((t) => [t.name, t.description || '']));
  const groups = api['x-tagGroups'] || [{ name: 'Services', tags: [...described.keys()] }];
  const out = [`# ${api.info.title} API: ${all.length} routes`, '', 'Call list_endpoints with a service for its routes, or with words to find a route.', ''];
  for (const group of groups) {
    out.push(`## ${group.name}`, '');
    for (const tag of group.tags) out.push(`- **${tag}** (${count(tag)}): ${described.get(tag) || ''}`);
    out.push('');
  }
  return out.join('\n').trim();
}

// The route for a method and a path, given as the reference has it
// ("/people/{id}") or as it is called ("/people/12").
function findRoute(api: OpenApi, method: string, path: string): Route | undefined {
  const all = routes(api).filter((r) => r.method === method.toLowerCase());
  const bare = path.trim().replace(/\?.*$/, '').replace(/\/+$/, '') || '/';
  const pattern = (p: string) =>
    new RegExp(`^${p.split('/').map((part) => (/^\{.+\}$/.test(part) ? '[^/]+' : part.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&'))).join('/')}$`);
  return all.find((r) => r.path === bare) || all.find((r) => pattern(r.path).test(bare));
}

export function readEndpoint(api: OpenApi, method: string, path: string): string {
  const route = findRoute(api, method, path);
  if (!route) return `No route ${method.toUpperCase()} ${path}. Find it with list_endpoints.`;
  const { op } = route;
  const out = [`# ${op.summary || op.operationId}`, '', `\`${route.method.toUpperCase()} ${route.path}\` · ${route.service}${op['x-internal'] ? ' · inside the installation only' : ''}`, ''];
  if (op.description) out.push(op.description, '');

  const parameters = [...(api.paths[route.path].parameters || []), ...(op.parameters || [])].map((p: any) => resolve(api, p));
  if (parameters.length) {
    out.push('## Parameters', '');
    for (const p of parameters) out.push(field(api, p.name, p.schema || {}, p.required, `${p.in}${p.description ? `. ${p.description}` : ''}`));
    out.push('');
  }

  for (const [media, body] of Object.entries<any>(op.requestBody?.content || {})) {
    out.push(`## Body (${media})`, '');
    const fields = fieldsOf(api, body.schema || {});
    out.push(...(fields.length ? fields : [`${typeOf(body.schema || {})}`]), '');
  }

  out.push('## Answers', '');
  for (const [code, response] of Object.entries<any>(op.responses || {})) {
    const answer = resolve(api, response);
    const shapes = Object.entries<any>(answer.content || {}).map(([media, c]) => `${typeOf(c.schema || {})} (${media})`);
    out.push(`- **${code}**: ${answer.description || ''}${shapes.length ? `. ${shapes.join('; ')}` : ''}`);
  }
  const named = [...new Set(JSON.stringify(op).match(/#\/components\/schemas\/[\w.-]+/g) || [])].map((r) => r.split('/').pop());
  if (named.length) out.push('', `Shapes named here, for read_shape: ${named.join(', ')}.`);
  return out.join('\n').trim();
}

export function readShape(api: OpenApi, name: string): string {
  const schemas = api.components?.schemas || {};
  const key = Object.keys(schemas).find((k) => k.toLowerCase() === name.trim().toLowerCase());
  if (!key) {
    const close = Object.keys(schemas).filter((k) => k.toLowerCase().includes(name.trim().toLowerCase())).slice(0, 12);
    return `No shape called "${name}".${close.length ? ` Did you mean: ${close.join(', ')}?` : ''}`;
  }
  const schema = schemas[key];
  const out = [`# ${key}`, ''];
  if (schema.description) out.push(schema.description, '');
  const fields = fieldsOf(api, schema);
  out.push(...(fields.length ? fields : [typeOf(schema)]));
  return out.join('\n').trim();
}

function resolve(api: OpenApi, value: any): any {
  let at = value;
  for (let hops = 0; at?.$ref && hops < 8; hops += 1) {
    const parts = String(at.$ref).replace(/^#\//, '').split('/');
    at = parts.reduce((node: any, part) => node?.[part], api);
  }
  return at || {};
}

// An object's fields, one line each; allOf is read as one object.
function fieldsOf(api: OpenApi, schema: any): string[] {
  const whole = resolve(api, schema);
  const parts = whole.allOf ? whole.allOf.map((s: any) => resolve(api, s)) : [whole];
  const required = new Set(parts.flatMap((s: any) => s.required || []));
  return parts.flatMap((s: any) =>
    Object.entries<any>(s.properties || {}).map(([name, p]) => field(api, name, p, required.has(name), p.description)),
  );
}

function field(api: OpenApi, name: string, schema: any, required: boolean, description?: string): string {
  const own = schema.$ref ? { ...resolve(api, schema), ...schema } : schema;
  const limits = constraints(own);
  return `- \`${name}\` ${typeOf(schema)}${required ? ', required' : ''}${limits ? `, ${limits}` : ''}${description || own.description ? `: ${description || own.description}` : ''}`;
}

export function typeOf(schema: any): string {
  if (!schema || typeof schema !== 'object') return 'any';
  if (schema.$ref) return String(schema.$ref).split('/').pop() as string;
  for (const key of ['oneOf', 'anyOf']) if (schema[key]) return schema[key].map(typeOf).join(' or ');
  if (schema.allOf) return schema.allOf.map(typeOf).join(' and ');
  const types: string[] = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const named = types.map((t) => {
    if (t === 'array') return `array of ${typeOf(schema.items)}`;
    if (t !== 'null' && schema.format) return `${t} (${schema.format})`;
    return t;
  });
  return named.join(' or ') || (schema.properties ? 'object' : 'any');
}

function constraints(schema: any): string {
  const said: string[] = [];
  if (schema.enum) said.push(`one of ${schema.enum.map((v: unknown) => `\`${v}\``).join(', ')}`);
  if (schema.const !== undefined) said.push(`always \`${schema.const}\``);
  if (schema.minimum !== undefined) said.push(`at least ${schema.minimum}`);
  if (schema.maximum !== undefined) said.push(`at most ${schema.maximum}`);
  if (schema.minLength !== undefined) said.push(`${schema.minLength} characters or more`);
  if (schema.maxLength !== undefined) said.push(`${schema.maxLength} characters at most`);
  if (schema.minItems !== undefined) said.push(`${schema.minItems} or more`);
  if (schema.maxItems !== undefined) said.push(`${schema.maxItems} at most`);
  if (schema.pattern) said.push(`matching \`${schema.pattern}\``);
  if (schema.default !== undefined) said.push(`${JSON.stringify(schema.default)} if left out`);
  return said.join(', ');
}
