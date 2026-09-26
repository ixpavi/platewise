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

/** Ranks foods by prefix, substring and small-typo matches on name and aliases (incl. Hindi names). */
export function searchFoods(query: string, foods: Food[]): Food[] {
  const q = normalise(query);
  if (!q) return foods;
  const words = q.split(' ');
  return foods
    .map((f) => {
      const hay = normalise(`${f.name} ${f.aliases}`);
      const toks = hay.split(' ');
      let score = 0;
      if (normalise(f.name).startsWith(q)) score += 120;
      else if (hay.includes(q)) score += 70;
      for (const w of words) {
        if (toks.some((t) => t.startsWith(w))) score += 25;
        else if (w.length >= 4 && toks.some((t) => lev(t, w) <= (w.length >= 7 ? 2 : 1))) score += 14;
        else score -= 20;
      }
      return { f, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.f.name.length - b.f.name.length)
    .map((x) => x.f);
}
