// The server over HTTP, as a hosted copy answers: through the web handler,
// and through the Lambda handler with a function URL's event.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { handler } from '../src/http.js';
import { Store } from '../src/store.js';

const files: Record<string, string> = {
  '/docs/index.json': fs.readFileSync('test/fixtures/index.json', 'utf8'),
  '/api/anahita.json': fs.readFileSync('test/fixtures/anahita.json', 'utf8'),
};
const fetcher = (async (url: string) => new Response(files[new URL(url).pathname] ?? 'no', { status: files[new URL(url).pathname] ? 200 : 404 })) as typeof fetch;
const store = () => new Store({ site: 'https://docs.test', folder: fs.mkdtempSync(path.join(os.tmpdir(), 'anahita-mcp-')), fetcher });

const rpc = (body: unknown) =>
  new Request('https://mcp.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body),
  });

test('over HTTP, each request alone: initialize, list the tools, call one', async () => {
  const handle = handler(store());
  const init = await handle(rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }));
  assert.equal(init.status, 200);
  assert.equal(init.headers.get('mcp-session-id'), null);
  assert.match((await init.json()).result.instructions, /search_docs first/);

  const list = await (await handle(rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }))).json();
  assert.equal(list.result.tools.length, 6);

  const call = await (await handle(rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_docs', arguments: { query: 'half-life' } } }))).json();
  assert.match(call.result.content[0].text, /How things are found/);
});

test('over HTTP: what it is at /, nothing elsewhere, and only POST to /mcp', async () => {
  const handle = handler(store());
  assert.match(await (await handle(new Request('https://mcp.test/'))).text(), /Add https:\/\/mcp\.test\/mcp/);
  assert.equal((await handle(new Request('https://mcp.test/nowhere'))).status, 404);
  assert.equal((await handle(new Request('https://mcp.test/mcp'))).status, 405);
  const big = new Request('https://mcp.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'content-length': String(200 * 1024) }, body: 'x'.repeat(200 * 1024) });
  assert.equal((await handle(big)).status, 413);
});

test('on Lambda: a function URL event in, its answer out', async () => {
  process.env.ANAHITA_SITE = 'https://docs.test';
  process.env.ANAHITA_MCP_CACHE = fs.mkdtempSync(path.join(os.tmpdir(), 'anahita-mcp-'));
  process.env.PUBLIC_ORIGIN = 'https://mcp.anahita.test';
  const real = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    const { handler: lambda } = await import('../src/lambda.js');
    const event = (method: string, rawPath: string, body?: unknown) => ({
      rawPath,
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: body === undefined ? undefined : Buffer.from(JSON.stringify(body)).toString('base64'),
      isBase64Encoded: true,
      requestContext: { http: { method }, domainName: 'abc.lambda-url.ca-central-1.on.aws' },
    });
    const about = await lambda(event('GET', '/'));
    assert.match(about.body, /https:\/\/mcp\.anahita\.test\/mcp/);
    const call = await lambda(event('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_shape', arguments: { name: 'Refusal' } } }));
    assert.equal(call.statusCode, 200);
    assert.match(JSON.parse(call.body).result.content[0].text, /^# Refusal/);
  } finally {
    globalThis.fetch = real;
  }
});
