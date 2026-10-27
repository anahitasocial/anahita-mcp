// The tools' answers, against a few real pages and routes copied from the
// site into test/fixtures/.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { listEndpoints, readEndpoint, readShape } from '../src/api.js';
import { findPage, listDocs, readDoc, searchDocs } from '../src/docs.js';
import { words } from '../src/search.js';
import type { DocsIndex, OpenApi } from '../src/store.js';

const docs = JSON.parse(fs.readFileSync('test/fixtures/index.json', 'utf8')) as DocsIndex;
const api = JSON.parse(fs.readFileSync('test/fixtures/anahita.json', 'utf8')) as OpenApi;

test('words: lower case, no accents, no common words, rough stems', () => {
  assert.deepEqual(words('The Followers of Café groups'), ['follower', 'cafe', 'group']);
  assert.deepEqual(words('policies'), ['policy']);
});

test('search_docs finds the half-life where it is explained', () => {
  const found = searchDocs(docs, 'half-life old posts fade');
  assert.match(found.split('\n')[0], /How things are found/);
  assert.match(found, /read_doc\("services\/how-things-are-found", "[\w-]+"\)/);
  assert.match(found, /https:\/\/www\.anahita\.io\/docs\/services\/how-things-are-found\/#/);
});

test('search_docs keeps to one source, and says when nothing matches', () => {
  assert.doesNotMatch(searchDocs(docs, 'graph nodes edges', { source: 'web' }), /The graph ›/);
  assert.match(searchDocs(docs, 'zzzqqq'), /Nothing in the docs matches/);
});

test('a page is found by its name, its slug or its address', () => {
  assert.equal(findPage(docs, 'services/the-graph')?.slug, 'the-graph');
  assert.equal(findPage(docs, 'the-graph')?.slug, 'the-graph');
  assert.equal(findPage(docs, 'https://www.anahita.io/docs/services/the-graph/#nodes')?.slug, 'the-graph');
  assert.equal(findPage(docs, 'web')?.slug, 'README');
  assert.equal(findPage(docs, 'nowhere'), undefined);
});

test('read_doc gives a section with the sections under it, and no more', () => {
  const page = docs.pages.find((p) => p.slug === 'the-graph')!;
  const h2 = page.sections.findIndex((s) => s.level === 2);
  const next = page.sections.findIndex((s, at) => at > h2 && s.level === 2);
  const text = readDoc(docs, 'services/the-graph', page.sections[h2].id);
  assert.match(text, new RegExp(`## ${page.sections[h2].heading}`));
  if (next !== -1) assert.doesNotMatch(text, new RegExp(`## ${page.sections[next].heading}\\n`));
  assert.match(readDoc(docs, 'services/the-graph', 'no-such-section'), /has no section/);
  assert.match(readDoc(docs, 'nowhere'), /No page called/);
});

test('list_docs names every page by what read_doc takes', () => {
  const list = listDocs(docs);
  assert.match(list, /\*\*services\/the-graph\*\*: The graph/);
  assert.match(list, /\*\*web\*\*/);
  assert.match(listDocs(docs, 'nope'), /No docs called/);
});

test('list_endpoints: the services, one service, or routes by words', () => {
  assert.match(listEndpoints(api), /## Run a site[\s\S]*abuse-report-service/);
  assert.match(listEndpoints(api, { service: 'abuse-report' }), /`POST \/abuse-reports`/);
  assert.match(listEndpoints(api, { query: 'reasons' }), /\/abuse-reports\/reasons/);
  assert.match(listEndpoints(api, { service: 'nope' }), /No service called/);
});

test('read_endpoint: a route in full, by its path or as it is called', () => {
  const post = readEndpoint(api, 'post', '/abuse-reports');
  assert.match(post, /## Body \(application\/json\)/);
  assert.match(post, /- `target_id` integer \(int64\), required, at least 1/);
  assert.match(post, /\*\*400\*\*/);
  assert.match(post, /Shapes named here, for read_shape: .*Refusal/);
  assert.match(readEndpoint(api, 'GET', '/abuse-reports/cases/12'), /`GET \/abuse-reports\/cases\/\{id\}`/);
  assert.match(readEndpoint(api, 'GET', '/nowhere'), /No route/);
});

test('read_shape: a shape and its fields, whatever its case', () => {
  assert.match(readShape(api, 'refusal'), /^# Refusal/);
  assert.match(readShape(api, 'Case'), /Did you mean: .*abusereport\.Case/);
});
