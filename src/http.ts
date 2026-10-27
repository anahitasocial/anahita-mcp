// The same server over HTTP (MCP's Streamable HTTP, at /mcp), for a hosted
// copy that nobody has to install: on AWS Lambda (lambda.ts), or anywhere
// with `anahita-mcp --http`. Each request stands alone, with no sessions,
// and is answered as JSON, so it suits a function that sleeps between
// calls. What was fetched from the site is shared between requests.
//
// Nothing about a request is kept or logged: not the question, not who
// asked.
import http from 'node:http';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer, VERSION } from './server.js';
import { Store } from './store.js';

// A question is a few hundred bytes; nothing an agent sends is near this.
const MAX_BODY = 64 * 1024;

const ABOUT = `anahita-mcp ${VERSION}: Anahita's docs and API reference for AI agents, over MCP.

Add https://<this address>/mcp to your MCP client, or run it on your own
computer with npx -y anahita-mcp. https://github.com/anahitasocial/anahita-mcp
`;

export function handler(store = new Store()) {
  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (pathname === '/' && request.method === 'GET') {
      return new Response(ABOUT.replace('https://<this address>', new URL(request.url).origin), {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    if (pathname !== '/mcp') return new Response('Not found\n', { status: 404 });
    // With no sessions there is no stream to open and nothing to close.
    if (request.method !== 'POST') {
      return Response.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: POST to /mcp' }, id: null }, { status: 405, headers: { allow: 'POST' } });
    }
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: MAX_BODY,
    });
    const server = createServer(store);
    await server.connect(transport);
    try {
      return await transport.handleRequest(request);
    } finally {
      await server.close();
    }
  };
}

// `anahita-mcp --http`: listens on 127.0.0.1:8080, or HOST and PORT.
export function listen({ host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 8080) } = {}): http.Server {
  const handle = handler();
  const server = http.createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > MAX_BODY) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(chunk as Buffer);
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const body = chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined;
      const answer = await handle(new Request(`http://${req.headers.host || `${host}:${port}`}${req.url}`, { method: req.method, headers, body }));
      res.writeHead(answer.status, Object.fromEntries(answer.headers));
      res.end(Buffer.from(await answer.arrayBuffer()));
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  server.listen(port, host, () => console.error(`anahita-mcp ${VERSION} on http://${host}:${port}/mcp`));
  return server;
}
