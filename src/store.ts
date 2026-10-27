// Where the docs come from: two files on Anahita's website, fetched when they
// are first needed and kept on this computer, so that the server works
// offline with what it fetched last.
//
//   <site>/docs/index.json    every page of the docs, cut into sections
//   <site>/api/anahita.json   the API reference, OpenAPI 3.1
//
// The site is https://www.anahita.io unless ANAHITA_SITE names another (a
// local build of the site, say). Nothing else is ever sent anywhere.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_SITE = 'https://www.anahita.io';

// How long what was fetched is used before asking the site again.
const FRESH_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 15 * 1000;

export interface Section {
  id: string;
  heading: string | null;
  level: number;
  markdown: string;
}

export interface Page {
  source: string;
  slug: string;
  title: string;
  group: string | null;
  url: string;
  sections: Section[];
}

export interface DocsIndex {
  version: number;
  site: string;
  api: string;
  sources: { key: string; title: string; side: string; repo: string }[];
  pages: Page[];
}

// The parts of OpenAPI 3.1 read here; the rest is passed along untouched.
export interface OpenApi {
  info: { title: string; version?: string };
  tags?: { name: string; description?: string }[];
  'x-tagGroups'?: { name: string; tags: string[] }[];
  paths: Record<string, Record<string, any>>;
  components?: { schemas?: Record<string, any> };
}

// The folder for what was fetched, where each system keeps caches.
export function cacheFolder(): string {
  if (process.env.ANAHITA_MCP_CACHE) return process.env.ANAHITA_MCP_CACHE;
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Caches', 'anahita-mcp');
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'anahita-mcp', 'Cache');
  return path.join(process.env.XDG_CACHE_HOME || path.join(home, '.cache'), 'anahita-mcp');
}

interface Kept {
  url: string;
  etag?: string;
  fetchedAt: number;
  body: string;
}

export class Store {
  readonly site: string;
  private folder: string;
  private fetcher: typeof fetch;
  private loaded = new Map<string, { at: number; value: unknown }>();

  constructor({ site = process.env.ANAHITA_SITE || DEFAULT_SITE, folder = cacheFolder(), fetcher = fetch } = {}) {
    this.site = site.replace(/\/+$/, '');
    this.folder = folder;
    this.fetcher = fetcher;
  }

  docs(): Promise<DocsIndex> {
    return this.get<DocsIndex>(`${this.site}/docs/index.json`);
  }

  api(): Promise<OpenApi> {
    return this.get<OpenApi>(`${this.site}/api/anahita.json`);
  }

  // A file from the site, parsed: from memory while fresh, else asked for
  // again (only if it changed, by its ETag), else what was kept on disk when
  // the site cannot be reached. Throws only when there is nothing at all.
  private async get<T>(url: string): Promise<T> {
    const inMemory = this.loaded.get(url);
    if (inMemory && Date.now() - inMemory.at < FRESH_MS) return inMemory.value as T;

    const file = path.join(this.folder, `${encodeURIComponent(url)}.json`);
    const kept = await readKept(file);
    let body = kept?.body;
    if (!kept || Date.now() - kept.fetchedAt >= FRESH_MS) {
      try {
        const answer = await this.fetcher(url, {
          headers: kept?.etag ? { 'if-none-match': kept.etag } : {},
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (answer.status === 304 && kept) {
          await writeKept(file, { ...kept, fetchedAt: Date.now() });
        } else if (answer.ok) {
          body = await answer.text();
          JSON.parse(body);
          await writeKept(file, { url, etag: answer.headers.get('etag') || undefined, fetchedAt: Date.now(), body });
        } else if (!kept) {
          throw new Error(`${url} answered ${answer.status}`);
        }
      } catch (error) {
        if (!kept) throw new Error(`Could not fetch ${url}, and there is no copy on this computer yet: ${(error as Error).message}`);
      }
    }
    const value = JSON.parse(body as string) as T;
    this.loaded.set(url, { at: Date.now(), value });
    return value;
  }
}

async function readKept(file: string): Promise<Kept | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as Kept;
  } catch {
    return null;
  }
}

async function writeKept(file: string, kept: Kept): Promise<void> {
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(kept));
  } catch {
    // A cache that cannot be written only means fetching again next time.
  }
}
