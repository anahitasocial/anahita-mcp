// The MCP server: six tools, all of them read-only, over the docs and the API
// reference that the store keeps.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listEndpoints, readEndpoint, readShape } from './api.js';
import { listDocs, readDoc, searchDocs } from './docs.js';
import { Store } from './store.js';

export const VERSION = '0.1.0';

const INSTRUCTIONS = `Anahita is open-source social software that an organisation runs for its own community, federating over ActivityPub (the fediverse) and the AT Protocol (Bluesky). Its docs are in two parts: "services" (Anahita Services, the Go services and their API: running a site, the concepts, federation, building on it) and "web" (Anahita Web, the React app).

Answer from these tools, not from memory: search_docs first, then read_doc for the sections it names. For the API, list_endpoints, then read_endpoint for one route and read_shape for a shape it names. Give people the www.anahita.io address of what you read.`;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });

// A tool's answer, or what went wrong, as text the agent can pass on.
async function answer(work: () => Promise<string>) {
  try {
    return text(await work());
  } catch (error) {
    return { ...text((error as Error).message), isError: true };
  }
}

export function createServer(store = new Store()): McpServer {
  const server = new McpServer({ name: 'anahita-mcp', title: 'Anahita docs', version: VERSION }, { instructions: INSTRUCTIONS });
  const source = z.enum(['services', 'web']).optional().describe('Only the docs of Anahita Services ("services") or Anahita Web ("web")');

  server.registerTool(
    'search_docs',
    {
      title: 'Search the docs',
      description: "Searches Anahita's docs by words and gives the best sections first, each with the page and section to read and a line of it.",
      inputSchema: {
        query: z.string().min(1).describe('Words to look for, such as "custom feed weights" or "federation opt-in"'),
        source,
        limit: z.number().int().min(1).max(25).optional().describe('How many sections, 8 if left out'),
      },
      annotations: READ_ONLY,
    },
    ({ query, source: only, limit }) => answer(async () => searchDocs(await store.docs(), query, { source: only, limit })),
  );

  server.registerTool(
    'list_docs',
    {
      title: 'List the docs',
      description: "Lists every page of Anahita's docs, in its groups, with each page's name for read_doc and its sections.",
      inputSchema: { source },
      annotations: READ_ONLY,
    },
    ({ source: only }) => answer(async () => listDocs(await store.docs(), only)),
  );

  server.registerTool(
    'read_doc',
    {
      title: 'Read a page',
      description: 'Reads one page of the docs as Markdown, or one section of it with the sections under it.',
      inputSchema: {
        page: z.string().min(1).describe('The page: "services/the-graph", "web/configuration", "services" for its overview, or its www.anahita.io address'),
        section: z.string().optional().describe('A section, by its id ("how-a-type-is-named") or its heading'),
      },
      annotations: READ_ONLY,
    },
    ({ page, section }) => answer(async () => readDoc(await store.docs(), page, section)),
  );

  server.registerTool(
    'list_endpoints',
    {
      title: 'List the API routes',
      description: "Lists the API's services in their groups; with a service, its routes; with words, the routes that match them.",
      inputSchema: {
        service: z.string().optional().describe('A service, such as "auth" or "socialgraph-service"'),
        query: z.string().optional().describe('Words to find a route by, such as "follow a group"'),
      },
      annotations: READ_ONLY,
    },
    ({ service, query }) => answer(async () => listEndpoints(await store.api(), { service, query })),
  );

  server.registerTool(
    'read_endpoint',
    {
      title: 'Read a route',
      description: 'Reads one API route in full: who may call it, its parameters and body, and every answer it gives.',
      inputSchema: {
        method: z.string().min(1).describe('GET, POST, PUT, PATCH or DELETE'),
        path: z.string().min(1).describe('The path, as the reference has it ("/actors/{id}") or as it is called ("/actors/12")'),
      },
      annotations: READ_ONLY,
    },
    ({ method, path }) => answer(async () => readEndpoint(await store.api(), method, path)),
  );

  server.registerTool(
    'read_shape',
    {
      title: 'Read a shape',
      description: 'Reads one shape of the API (a schema a route takes or answers with) and its fields.',
      inputSchema: { name: z.string().min(1).describe('The shape, such as "Refusal", as read_endpoint names it') },
      annotations: READ_ONLY,
    },
    ({ name }) => answer(async () => readShape(await store.api(), name)),
  );

  return server;
}
