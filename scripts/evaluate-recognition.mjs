// Measures how well photo recognition identifies Indian dishes.
//
//   node scripts/evaluate-recognition.mjs
//
// It downloads a set of openly licensed food photos from Wikimedia Commons, sends each one to Gemini
// through your Firebase project (the same prompt, schema and model order as the app, read from
// src/lib/ai.ts), and checks whether the expected dish was named. It also checks how many names are
// exact names from the food database, which is what lets the app attach nutrition to them.
// Needs the Firebase settings in .env and AI Logic turned on (README, step 7). Uses one AI request per photo.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend, Schema as S } from 'firebase/ai';

const root = new URL('../', import.meta.url);
const out = new URL('.food-cache/recognition-eval/', root);
mkdirSync(out, { recursive: true });

// Each case: a Commons search for one dish, and the words that count as naming it correctly.
const CASES = [
  ['idli sambar', ['idli']],
  ['masala dosa', ['dosa']],
  ['samosa', ['samosa']],
  ['poha breakfast', ['poha']],
  ['chole bhature', ['chole', 'bhatura', 'bhature', 'chickpea']],
  ['rajma chawal', ['rajma', 'kidney bean']],
  ['paneer butter masala', ['paneer']],
  ['gulab jamun', ['gulab jamun']],
  ['aloo paratha', ['paratha']],
  ['pav bhaji', ['pav bhaji']],
  ['chicken biryani', ['biryani']],
  ['jalebi', ['jalebi']],
  ['dhokla', ['dhokla']],
  ['upma', ['upma']],
  ['masala chai cup', ['chai', 'tea']],
];

const env = Object.fromEntries(
  readFileSync(new URL('.env', root), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const app = initializeApp({ apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY, projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, appId: env.EXPO_PUBLIC_FIREBASE_APP_ID });
const ai = getAI(app, { backend: new GoogleAIBackend() });

// The app's prompt and model order, taken from the source so this measures what the app does.
const src = readFileSync(new URL('src/lib/ai.ts', root), 'utf8');
const block = src.slice(src.indexOf("'This is a photo of a meal"), src.indexOf("`Names in the app's food list"));
const prompt = [...block.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).join('').replace(/\\n/g, '\n');
const MODELS = JSON.parse(src.match(/const MODELS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
const foodsTs = readFileSync(new URL('src/data/foods.ts', root), 'utf8');
const curated = [...foodsTs.matchAll(/^\s*\['[^']+',\s*'([^']+)'/gm)].map((m) => m[1].toLowerCase());
const extra = JSON.parse(readFileSync(new URL('src/data/foods-extra.json', root), 'utf8')).map((r) => String(r[1]).toLowerCase());
const known = new Set([...curated, ...extra]);
const text = `${prompt}Names in the app's food list (separated by semicolons): ${curated.join('; ')}`;
const schema = S.object({ properties: { isFood: S.boolean(), items: S.array({ items: S.object({ properties: { name: S.string(), grams: S.number(), confidence: S.number() } }) }) } });

const UA = { 'User-Agent': 'platewise-evaluation/1.0 (open-source student project)' };
async function commonsPhoto(query) {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1024&format=json`;
  const pages = Object.values((await (await fetch(api, { headers: UA })).json()).query?.pages ?? {}).sort((a, b) => a.index - b.index);
  const p = pages.find((x) => /\.(jpe?g|png)$/i.test(x.title));
  if (!p) return null;
  const ii = p.imageinfo[0];
  const bytes = Buffer.from(await (await fetch(ii.thumburl ?? ii.url, { headers: UA })).arrayBuffer());
  return { title: p.title, page: ii.descriptionurl, license: ii.extmetadata?.LicenseShortName?.value ?? '?', author: (ii.extmetadata?.Artist?.value ?? '').replace(/<[^>]+>/g, '').trim(), bytes };
}

async function identify(bytes) {
  for (const model of MODELS) {
    try {
      const t0 = Date.now();
      const m = getGenerativeModel(ai, { model, generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.1 } });
      const res = await m.generateContent([{ text }, { inlineData: { mimeType: 'image/jpeg', data: bytes.toString('base64') } }]);
      return { model, ms: Date.now() - t0, ...JSON.parse(res.response.text()) };
    } catch (e) {
      if (!/\b(429|500|503|404)\b/.test(String(e.message))) throw e;
    }
  }
  throw new Error('every model is out of allowance or busy');
}

const results = [];
for (const [query, expected] of CASES) {
  const photo = await commonsPhoto(query);
  if (!photo) {
    console.log(`${query}: no photo found`);
    continue;
  }
  writeFileSync(new URL(`${query.replace(/\W+/g, '-')}.jpg`, out), photo.bytes);
  const r = await identify(photo.bytes);
  const names = (r.items ?? []).map((i) => i.name.toLowerCase());
  const hit = names.some((n) => expected.some((w) => n.includes(w)));
  const exact = names.filter((n) => known.has(n)).length;
  results.push({ query, photo: photo.title, license: photo.license, author: photo.author, page: photo.page, model: r.model, ms: r.ms, items: r.items, hit, exactNames: exact, names: names.length });
  console.log(`${hit ? 'OK  ' : 'MISS'} ${query.padEnd(22)} ${r.ms} ms  ${names.join(' | ')}`);
}

const n = results.length;
const summary = {
  photos: n,
  dishIdentified: results.filter((r) => r.hit).length,
  accuracy: n ? Math.round((results.filter((r) => r.hit).length / n) * 1000) / 10 : 0,
  namesReturned: results.reduce((s, r) => s + r.names, 0),
  exactDatabaseNames: results.reduce((s, r) => s + r.exactNames, 0),
  medianMs: n ? results.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(n / 2)] : 0,
};
writeFileSync(new URL('results.json', out), JSON.stringify({ summary, results }, null, 2));
console.log(summary);
process.exit(0);
