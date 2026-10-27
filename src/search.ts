// Search by words, on this computer: BM25 over the sections of the docs. No
// embeddings and no outside service, so it works offline and sends nothing
// anywhere.

// Words too common to tell one section from another.
const STOP = new Set(
  'a an and are as at be by can do does for from has have how i in is it its of on or that the this to was what when where which who why will with you your'.split(' '),
);

// Lower case, without accents, split at anything not a letter or a digit,
// without the common words, and each cut back to a rough stem, so that
// "followers", "follower" and "following" meet.
export function words(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOP.has(word))
    .map(stem);
}

function stem(word: string): string {
  if (word.length <= 4) return word;
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ing') && word.length > 6) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 5) return word.slice(0, -2);
  if (word.endsWith('es') && /(ss|sh|ch|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export interface Searchable {
  // What a match there is worth more for: a page's title, a heading.
  title: string;
  text: string;
}

// How much more a word in a title counts than one in the text.
const TITLE_WEIGHT = 3;
const K1 = 1.2;
const B = 0.75;

export class Index<T extends Searchable> {
  private docs: { item: T; counts: Map<string, number>; length: number }[];
  private frequency = new Map<string, number>();
  private average: number;

  constructor(items: T[]) {
    this.docs = items.map((item) => {
      const counts = new Map<string, number>();
      const add = (word: string, by: number) => counts.set(word, (counts.get(word) || 0) + by);
      for (const word of words(item.title)) add(word, TITLE_WEIGHT);
      for (const word of words(item.text)) add(word, 1);
      let length = 0;
      for (const n of counts.values()) length += n;
      return { item, counts, length };
    });
    for (const { counts } of this.docs) {
      for (const word of counts.keys()) this.frequency.set(word, (this.frequency.get(word) || 0) + 1);
    }
    this.average = this.docs.reduce((sum, doc) => sum + doc.length, 0) / (this.docs.length || 1);
  }

  // The best matches first, each with its score; nothing scores zero.
  search(query: string, limit = 8, keep: (item: T) => boolean = () => true): { item: T; score: number }[] {
    const terms = [...new Set(words(query))];
    const n = this.docs.length;
    const found: { item: T; score: number }[] = [];
    for (const doc of this.docs) {
      if (!keep(doc.item)) continue;
      let score = 0;
      let matched = 0;
      for (const term of terms) {
        const tf = doc.counts.get(term);
        if (!tf) continue;
        matched += 1;
        const df = this.frequency.get(term) || 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * doc.length) / this.average)));
      }
      // A section with every word asked for comes before one with some.
      if (score > 0) found.push({ item: doc.item, score: score * (1 + matched / terms.length) });
    }
    return found.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
