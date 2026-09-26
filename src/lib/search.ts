import type { Food } from '@/data/foods';

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

export function normalise(q: string) {
  return q.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

// With thousands of foods, work per keystroke has to stay small: each list gets a word index once
// (every distinct word -> the foods containing it), and typo matching runs over distinct words only.
type Norm = { name: string; hay: string };
type Index = { norms: Norm[]; vocab: Map<string, number[]> };
const indexes = new WeakMap<Food[], Index>();

function indexFor(foods: Food[]): Index {
  let ix = indexes.get(foods);
  if (!ix) {
    const vocab = new Map<string, number[]>();
    const norms = foods.map((f, i) => {
      const hay = normalise(`${f.name} ${f.aliases}`);
      for (const t of new Set(hay.split(' '))) {
        const list = vocab.get(t);
        if (list) list.push(i);
        else vocab.set(t, [i]);
      }
      return { name: normalise(f.name), hay };
    });
    ix = { norms, vocab };
    indexes.set(foods, ix);
  }
  return ix;
}

const MISSING_WORD = 20;

/**
 * Ranks foods by prefix, substring and small-typo matches on name and aliases (incl. Hindi names).
 * Foods matching only some words of the query still show, after the full matches ("chole bhature"
 * finds both dishes). The curated list and the user's own foods come before the large open
 * datasets on equal matches.
 */
export function searchFoods(query: string, foods: Food[]): Food[] {
  const q = normalise(query);
  if (!q) return foods;
  const words = q.split(' ');
  const { norms, vocab } = indexFor(foods);

  // For each food: summed best match per query word (25 prefix, 14 small typo) and how many words matched.
  const sum = new Map<number, number>();
  const matched = new Map<number, number>();
  for (const w of words) {
    const best = new Map<number, number>();
    const typos = w.length >= 7 ? 2 : 1;
    for (const [t, ids] of vocab) {
      const s = t.startsWith(w) ? 25 : w.length >= 4 && Math.abs(t.length - w.length) <= typos && lev(t, w) <= typos ? 14 : 0;
      if (!s) continue;
      for (const i of ids) if ((best.get(i) ?? 0) < s) best.set(i, s);
    }
    for (const [i, s] of best) {
      sum.set(i, (sum.get(i) ?? 0) + s);
      matched.set(i, (matched.get(i) ?? 0) + 1);
    }
  }

  const out: { f: Food; score: number }[] = [];
  for (const [i, s] of sum) {
    const { name, hay } = norms[i];
    let score = s - MISSING_WORD * (words.length - (matched.get(i) ?? 0));
    if (name.startsWith(q)) score += 120;
    else if (hay.includes(q)) score += 70;
    if (score <= 0) continue;
    out.push({ f: foods[i], score: score + (foods[i].src ? 0 : 12) });
  }
  return out.sort((a, b) => b.score - a.score || a.f.name.length - b.f.name.length).map((x) => x.f);
}
