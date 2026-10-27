// The docs tools' answers, as Markdown for the agent to read.
import { Index, words } from './search.js';
import type { DocsIndex, Page, Section } from './store.js';

// A page is named by its source and slug, "services/the-graph"; the README
// of a source is its overview, "services". A slug alone does where only one
// source has it, and so does the page's address on the site.
export function findPage(docs: DocsIndex, name: string): Page | undefined {
  const wanted = name
    .trim()
    .replace(/^https?:\/\/[^/]+\/docs\//, '')
    .replace(/#.*$/, '')
    .replace(/\.md$/, '')
    .replace(/^\/+|\/+$/g, '');
  const [first, second] = wanted.split('/');
  if (second) return docs.pages.find((page) => page.source === first && page.slug === second);
  const overview = docs.pages.find((page) => page.source === first && page.slug === 'README');
  if (overview) return overview;
  const bySlug = docs.pages.filter((page) => page.slug === first);
  return bySlug.length === 1 ? bySlug[0] : undefined;
}

export function pageName(page: Page): string {
  return page.slug === 'README' ? page.source : `${page.source}/${page.slug}`;
}

function sectionUrl(page: Page, section: Section): string {
  return section.id ? `${page.url}#${section.id}` : page.url;
}

// Every page, by source and then by group, with its sections' headings.
export function listDocs(docs: DocsIndex, source?: string): string {
  const sources = docs.sources.filter((s) => !source || s.key === source);
  if (!sources.length) return `No docs called "${source}". There are: ${docs.sources.map((s) => s.key).join(', ')}.`;
  const out: string[] = [];
  for (const s of sources) {
    out.push(`# ${s.title} (${s.key})`, '');
    let group: string | null | undefined;
    for (const page of docs.pages.filter((p) => p.source === s.key)) {
      if (page.group !== group && page.group) out.push('', `## ${page.group}`, '');
      group = page.group;
      const headings = page.sections.filter((x) => x.level === 2).map((x) => x.heading);
      out.push(`- **${pageName(page)}**: ${page.title}${headings.length ? `. Sections: ${headings.join('; ')}` : ''}`);
    }
    out.push('');
  }
  return out.join('\n').trim();
}

// A page, or one section of it with the sections under it.
export function readDoc(docs: DocsIndex, name: string, section?: string): string {
  const page = findPage(docs, name);
  if (!page) return `No page called "${name}". Call list_docs for their names, or search_docs.`;
  let sections = page.sections;
  if (section) {
    const wanted = section.trim().replace(/^#/, '').toLowerCase();
    const at = sections.findIndex((x) => x.id === wanted || (x.heading || '').toLowerCase() === wanted);
    if (at === -1) {
      const headings = sections.filter((x) => x.heading).map((x) => `${x.heading} (${x.id})`);
      return `"${page.title}" has no section "${section}". Its sections: ${headings.join('; ')}.`;
    }
    const level = sections[at].level;
    let end = at + 1;
    while (end < sections.length && sections[end].level > level) end += 1;
    sections = sections.slice(at, end);
  }
  const out = [`# ${page.title}`, '', section ? sectionUrl(page, sections[0]) : page.url, ''];
  for (const x of sections) {
    if (x.heading) out.push(`${'#'.repeat(x.level)} ${x.heading}`, '');
    if (x.markdown) out.push(x.markdown, '');
  }
  return out.join('\n').trim();
}

interface Hit {
  page: Page;
  section: Section;
  title: string;
  text: string;
}

const indexes = new WeakMap<DocsIndex, Index<Hit>>();

function indexOf(docs: DocsIndex): Index<Hit> {
  let index = indexes.get(docs);
  if (!index) {
    const hits = docs.pages.flatMap((page) =>
      page.sections.map((section) => ({ page, section, title: `${page.title} ${section.heading || ''}`, text: section.markdown })),
    );
    index = new Index(hits);
    indexes.set(docs, index);
  }
  return index;
}

// The sections that match, best first, each with where it is and a few lines
// of it.
export function searchDocs(docs: DocsIndex, query: string, { source, limit = 8 }: { source?: string; limit?: number } = {}): string {
  const found = indexOf(docs).search(query, limit, (hit) => !source || hit.page.source === source);
  if (!found.length) return `Nothing in the docs matches "${query}". Try other words, or list_docs.`;
  const out: string[] = [];
  found.forEach(({ item }, at) => {
    const where = item.section.heading ? `${item.page.title} › ${item.section.heading}` : item.page.title;
    out.push(`${at + 1}. **${where}**`);
    out.push(`   read_doc("${pageName(item.page)}"${item.section.id ? `, "${item.section.id}"` : ''}) · ${sectionUrl(item.page, item.section)}`);
    out.push(`   ${snippet(item.section.markdown, query)}`, '');
  });
  return out.join('\n').trim();
}

// The paragraph of a section (or the list item, or the table row) with most
// of the words asked for, on one line and cut short around the first of
// them. The docs wrap their lines, so a line alone is half a sentence.
function snippet(markdown: string, query: string): string {
  const terms = [...new Set(words(query))];
  const blocks = markdown
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n\s*\n|\n(?=\s*(?:[-*]|\d+\.|\|) )/)
    .map((block) => block.replace(/\s+/g, ' ').trim())
    .filter((block) => block && !/^\|?[\s|:-]+\|?$/.test(block));
  const count = (block: string) => {
    const has = new Set(words(block));
    return terms.filter((t) => has.has(t)).length;
  };
  const best = blocks.reduce((a, b) => (count(b) > count(a) ? b : a), blocks[0] || '');
  if (best.length <= 240) return best;
  const lower = best.toLowerCase();
  const at = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), best.length);
  const start = at > 120 ? best.lastIndexOf(' ', at - 60) + 1 : 0;
  const cut = best.slice(start, start + 237);
  return `${start ? '…' : ''}${cut.slice(0, cut.lastIndexOf(' ') > 200 ? cut.lastIndexOf(' ') : cut.length)}…`;
}
