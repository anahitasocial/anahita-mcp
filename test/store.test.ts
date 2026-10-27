// Fetching from the site, keeping a copy, and working from the copy when the
// site cannot be reached; then the server end to end, over an in-memory
// transport, as a client sees it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, VERSION } from '../src/server.js';
import { Store } from '../src/store.js';

const index = fs.readFileSync('test/fixtures/index.json', 'utf8');
const api = fs.readFileSync('test/fixtures/anahita.json', 'utf8');

// A site that answers from the fixtures, counts what it is asked, and can be
// taken down.
function site() {
  const asked: { url: string; etag?: string }[] = [];
  let down = false;
  const fetcher = (async (url: string, init?: RequestInit) => {
    const etag = (init?.headers as Record<string, string>)?.['if-none-match'];
    asked.push({ url, etag });
    if (down) throw new Error('offline');
    if (etag === '"v1"') return new Response(null, { status: 304 });
    const body = url.endsWith('/docs/index.json') ? index : url.endsWith('/api/anahita.json') ? api : null;
    return body ? new Response(body, { headers: { etag: '"v1"' } }) : new Response('no', { status: 404 });
  }) as typeof fetch;
  return { asked, fetcher, takeDown: () => (down = true) };
}

const folder = () => fs.mkdtempSync(path.join(os.tmpdir(), 'anahita-mcp-'));

test('fetched once, then from memory', async () => {
  const s = site();
  const store = new Store({ site: 'https://docs.test/', folder: folder(), fetcher: s.fetcher });
  assert.equal((await store.docs()).pages.length, 5);
  await store.docs();
  assert.deepEqual(s.asked.map((a) => a.url), ['https://docs.test/docs/index.json']);
});

test('the copy on disk is used when the site is down, and asked again by its ETag', async () => {
  const s = site();
  const kept = folder();
  await new Store({ site: 'https://docs.test', folder: kept, fetcher: s.fetcher }).api();

  // An hour on: make the copy stale, then try with the site up, and down.
  for (const file of fs.readdirSync(kept)) {
    const full = path.join(kept, file);
    fs.writeFileSync(full, JSON.stringify({ ...JSON.parse(fs.readFileSync(full, 'utf8')), fetchedAt: 0 }));
  }
  await new Store({ site: 'https://docs.test', folder: kept, fetcher: s.fetcher }).api();
  assert.equal(s.asked.at(-1)?.etag, '"v1"');
  for (const file of fs.readdirSync(kept)) {
    const full = path.join(kept, file);
    fs.writeFileSync(full, JSON.stringify({ ...JSON.parse(fs.readFileSync(full, 'utf8')), fetchedAt: 0 }));
  }
  s.takeDown();
  const offline = await new Store({ site: 'https://docs.test', folder: kept, fetcher: s.fetcher }).api();
  assert.equal(offline.info.title, 'Anahita');
});

test('with no copy and no site, it says so', async () => {
  const s = site();
  s.takeDown();
  await assert.rejects(new Store({ site: 'https://docs.test', folder: folder(), fetcher: s.fetcher }).docs(), /no copy on this computer yet/);
});

test('the server: six read-only tools, answering over MCP', async () => {
  const s = site();
  const server = createServer(new Store({ site: 'https://docs.test', folder: folder(), fetcher: s.fetcher }));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(clientSide);

  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['list_docs', 'list_endpoints', 'read_doc', 'read_endpoint', 'read_shape', 'search_docs']);
  assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true));
  assert.match(client.getInstructions() || '', /search_docs first/);

  const found = await client.callTool({ name: 'search_docs', arguments: { query: 'half-life' } });
  assert.match((found.content as { text: string }[])[0].text, /How things are found/);
  const route = await client.callTool({ name: 'read_endpoint', arguments: { method: 'POST', path: '/abuse-reports' } });
  assert.match((route.content as { text: string }[])[0].text, /target_id/);
  await client.close();
});

test('the version is the package\'s', () => {
  assert.equal(VERSION, JSON.parse(fs.readFileSync('package.json', 'utf8')).version);
});
