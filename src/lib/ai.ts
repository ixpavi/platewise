// Gemini through Firebase AI Logic. The app never holds a Gemini key: requests go through your
// Firebase project, and the key stays on Google's servers (README, "AI features").
// Used only for things the food database can't answer: reading a packet's nutrition label from a
// photo, finding the values a brand or restaurant publishes (with Google Search), and estimating a
// dish that isn't in the database.
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import type { EnhancedGenerateContentResponse, ModelParams, Schema as SchemaT, TypedSchema } from 'firebase/ai';
import type { Category, Diet, Food } from '@/data/foods';
import { getCloud } from './firebase';

// Google retires model versions (2.5 Flash is gone for new projects), so ask for the latest Flash
// and fall back to a pinned one if the alias isn't available.
// Flash-Lite is the last resort: it has more spare capacity when the others are overloaded.
const MODELS = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-flash-lite-latest'];

export class AiError extends Error {}

/** AI needs the app's Firebase project (the same settings that turn on cloud accounts). */
export const aiAvailable = () => !!getCloud();

export type Per100 = { kcal: number; carb: number; protein: number; fat: number; fibre: number; sugar: number };
/**
 * What a label, menu or screenshot says. per100 is missing when only per-serving values are given
 * without a serving weight (common on menus and delivery apps).
 */
export type LabelRead = {
  name: string | null;
  isDrink: boolean;
  diet: Diet | null;
  per100: Per100 | null;
  perServing: Per100 | null;
  servingGrams: number | null;
  servingLabel: string | null;
};
export type Estimate = { name: string; cat: Category; diet: Diet; base: 'g' | 'ml'; per100: Per100; portions: { label: string; grams: number }[] };

// The SDK reports every failed server response as "fetch-error", so look at the HTTP status too.
const messageOf = (e: unknown) => String((e as Error)?.message ?? '');
function statusOf(e: unknown): number {
  const s = Number((e as { customErrorData?: { status?: number } })?.customErrorData?.status);
  if (Number.isFinite(s) && s > 0) return s;
  const m = messageOf(e).match(/\[(\d{3})\b/);
  return m ? Number(m[1]) : 0;
}
/** Overloaded or rate limited: worth retrying or trying another model. */
const isBusy = (e: unknown) => {
  const s = statusOf(e);
  return s === 429 || s >= 500 || /high demand|overloaded|UNAVAILABLE|RESOURCE_EXHAUSTED|try again later/i.test(messageOf(e));
};
const isMissingModel = (e: unknown) => statusOf(e) === 404 || /no longer available|NOT_FOUND/i.test(messageOf(e));
/** Out of free allowance. Each model has its own, so another model may still answer, but retrying this one won't. */
const isQuota = (e: unknown) => statusOf(e) === 429 && /quota/i.test(messageOf(e));
const isDailyQuota = (e: unknown) => isQuota(e) && /PerDay/i.test(messageOf(e));
/**
 * Google Search isn't part of Gemini's free tier: a search request is refused as "quota exceeded"
 * without saying which limit, unlike a real limit. The project needs the Blaze (pay-as-you-go) plan.
 */
const isSearchOff = (e: unknown) => isQuota(e) && !/QuotaFailure|RetryInfo|PerDay|PerMinute/i.test(messageOf(e));
export class SearchOffError extends AiError {}
let searchOff = false;
/** Online search is offered until Google says this app's plan doesn't include it (checked again after a restart). */
export const webSearchAvailable = () => aiAvailable() && !searchOff;

/** The free Gemini allowance resets at midnight US Pacific time. Returns that moment in the phone's own time. */
function quotaResetTime(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  // US daylight saving: second Sunday of March to first Sunday of November, 2 am local.
  const sunday = (month: number, nth: number) => {
    const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (nth - 1) * 7;
  };
  const dstStart = Date.UTC(y, 2, sunday(2, 2), 10);
  const dstEnd = Date.UTC(y, 10, sunday(10, 1), 9);
  const offset = now.getTime() >= dstStart && now.getTime() < dstEnd ? 7 : 8;
  const reset = new Date(now);
  reset.setUTCHours(offset, 0, 0, 0);
  if (reset.getTime() <= now.getTime()) reset.setUTCDate(reset.getUTCDate() + 1);
  const h = reset.getHours();
  const m = reset.getMinutes();
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}

function friendly(e: unknown, search = false): AiError {
  if (e instanceof AiError) return e;
  const code = String((e as { code?: string })?.code ?? '');
  const msg = messageOf(e);
  const status = statusOf(e);
  if (search && isSearchOff(e)) return new SearchOffError('Searching Google needs Google’s paid AI plan, which isn’t turned on for this app yet. Photograph the values (box, menu or a screenshot of the brand’s site) or type them in.');
  if (code === 'api-not-enabled' || /AI Logic API|has not been used|is disabled/i.test(msg)) return new AiError('AI isn’t switched on for this app yet. The app’s owner can turn it on in Firebase (AI Logic).');
  if (/App Check/i.test(msg) || status === 401 || status === 403) return new AiError('AI requests are being refused by the app’s Firebase security settings (App Check). The app’s owner can fix this in Firebase.');
  if (isDailyQuota(e)) return new AiError(`Today’s free AI allowance is used up. It resets at ${quotaResetTime()} your time. You can still enter the values yourself.`);
  if (isQuota(e)) return new AiError('Too many AI requests in a short time. Wait a minute and try again.');
  if (isBusy(e)) return new AiError('The AI is busy right now. Try again in a minute.');
  if (/SAFETY|blocked|RECITATION/i.test(msg)) return new AiError('The AI couldn’t read that. Try a clearer photo.');
  if (!status && /network request failed|failed to fetch|network error|internet/i.test(msg)) return new AiError('Please check your internet connection and try again.');
  return new AiError('The AI couldn’t answer right now. Try again.');
}

/**
 * The Firebase AI SDK uses two browser APIs that React Native's JavaScript engine doesn't have:
 * DOMException (for its request timeout) and AbortSignal.any. Without them a slow request never
 * times out, so add small stand-ins when they're missing.
 */
function polyfillForAi() {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.DOMException === 'undefined') {
    g.DOMException = class DOMException extends Error {
      constructor(message?: string, name?: string) {
        super(message);
        this.name = name ?? 'Error';
      }
    };
  }
  const AS = AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal };
  if (typeof AbortSignal !== 'undefined' && typeof AS.any !== 'function') {
    AS.any = (signals) => {
      const controller = new AbortController();
      for (const s of signals) {
        if (s.aborted) {
          controller.abort();
          break;
        }
        s.addEventListener('abort', () => controller.abort());
      }
      return controller.signal;
    };
  }
}

/** Never leave a button spinning: give up with a clear message if anything takes too long. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new AiError('The AI took too long to answer. Check your connection and try again.')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
type AiSdk = typeof import('firebase/ai');
type ModelSettings = Omit<ModelParams, 'model'>;

/** Sends one request, moving on to the next model when one is overloaded, retired or out of allowance. */
async function generate(parts: Part[], settings: (sdk: AiSdk) => ModelSettings, search = false): Promise<EnhancedGenerateContentResponse> {
  const cloud = getCloud();
  if (!cloud) throw new AiError('AI needs the app’s Firebase settings.');
  polyfillForAi();
  // Loaded on first use so the AI SDK never affects app start-up.
  const sdk = await withTimeout(import('firebase/ai'), 15_000).catch((e: unknown) => {
    throw friendly(e);
  });
  const ai = sdk.getAI(cloud.app, { backend: new sdk.GoogleAIBackend() });
  let last: unknown;
  for (const name of MODELS) {
    const model = sdk.getGenerativeModel(ai, { model: name, ...settings(sdk) }, { timeout: 45_000 });
    // Gemini is often overloaded at busy times (500 "high demand", 503): retry once, then move on
    // to the next model. A retired model (404) or a used-up allowance (429 quota) moves on at once.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return (await withTimeout(model.generateContent(parts), 50_000)).response;
      } catch (e) {
        last = e;
        // Search not on the free tier: the same for every model, so don't try the others.
        if (search && isSearchOff(e)) throw friendly(e, true);
        if (isBusy(e) && !isQuota(e) && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        if (isBusy(e) || isMissingModel(e)) break;
        throw friendly(e, search);
      }
    }
  }
  throw friendly(last, search);
}

/** Asks for an answer in a fixed JSON shape. */
async function ask<T>(parts: Part[], schema: (s: typeof SchemaT) => TypedSchema): Promise<T> {
  const res = await generate(parts, (sdk) => ({ generationConfig: { responseMimeType: 'application/json', responseSchema: schema(sdk.Schema), temperature: 0.1 } }));
  return JSON.parse(res.text()) as T;
}

const num = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(0, n)) * 10) / 10 : 0;
};

function per100Of(raw: Partial<Record<keyof Per100, unknown>> | undefined): Per100 {
  const carb = num(raw?.carb, 100);
  const p: Per100 = { kcal: Math.round(num(raw?.kcal, 900)), carb, protein: num(raw?.protein, 100), fat: num(raw?.fat, 100), fibre: num(raw?.fibre, 100), sugar: Math.min(num(raw?.sugar, 100), carb) };
  if (!p.kcal) p.kcal = Math.round(p.carb * 4 + p.protein * 4 + p.fat * 9);
  if (p.carb + p.protein + p.fat > 105) throw new AiError('Those numbers don’t add up. Try a clearer photo, or type them in.');
  return p;
}

/** Values for one serving: no per-100 g sanity check is possible, so only keep them in range. */
function servingOf(raw: Partial<Record<keyof Per100, unknown>> | undefined): Per100 {
  const carb = num(raw?.carb, 1000);
  const p: Per100 = { kcal: Math.round(num(raw?.kcal, 5000)), carb, protein: num(raw?.protein, 1000), fat: num(raw?.fat, 1000), fibre: num(raw?.fibre, 1000), sugar: Math.min(num(raw?.sugar, 1000), carb) };
  if (!p.kcal) p.kcal = Math.round(p.carb * 4 + p.protein * 4 + p.fat * 9);
  return p;
}

// ---------------------------------------------------------------- label photos

/** Takes or picks a photo and returns it small enough to send quickly (about 200 KB). */
export async function labelPhoto(source: 'camera' | 'gallery'): Promise<string | null> {
  if (source === 'camera' && Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new AiError('Allow camera access for Platewise in your phone’s settings, or choose a photo instead.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, allowsEditing: false, exif: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const asset = res.canceled ? null : res.assets?.[0];
  if (!asset) return null;
  return photoForAi(asset.uri, asset.width);
}

/** Shrinks a photo to send quickly (about 200 KB) and returns it as base64 JPEG. */
export async function photoForAi(uri: string, width?: number, maxWidth = 1400): Promise<string> {
  const w = width && width > 0 ? Math.min(width, maxWidth) : maxWidth;
  const ref = await ImageManipulator.manipulate(uri).resize({ width: w }).renderAsync();
  const out = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new AiError('Couldn’t prepare that photo. Try another one.');
  return out.base64;
}

// ---------------------------------------------------------------- food recognition from a meal photo

export type SeenFood = { name: string; grams: number; confidence: number };

/**
 * Identifies the foods on a plate and estimates each portion. `known` is a list of food names in
 * the app's database; the AI uses them when one fits, so the names match on search.
 */
export async function identifyFoods(jpegBase64: string, known: string[]): Promise<SeenFood[]> {
  const raw = await ask<{ isFood: boolean; items?: { name?: string; grams?: number; confidence?: number }[] }>(
    [
      {
        text:
          'This is a photo of a meal, snack or drink. Identify each separate food and drink in it. Indian home food is common.\n' +
          '- name: a short common name for the dish, such as "dal tadka", "jeera rice", "chapati", "aloo gobi", "chicken curry", "curd". When one of the names in the list below fits, use it exactly.\n' +
          '- grams: your estimate of the weight of that portion as served in the photo (ml for drinks). Judge the size from the plate, bowl, glass or hand.\n' +
          '- confidence: from 0 to 1, how sure you are of what the food is.\n' +
          '- Leave out garnish, cutlery, plates and packaging. If the photo shows no food or drink, set isFood to false.\n' +
          `Names in the app's food list (separated by semicolons): ${known.join('; ')}`,
      },
      { inlineData: { mimeType: 'image/jpeg', data: jpegBase64 } },
    ],
    (S) =>
      S.object({
        properties: {
          isFood: S.boolean(),
          items: S.array({ items: S.object({ properties: { name: S.string(), grams: S.number(), confidence: S.number() } }) }),
        },
      }),
  );
  if (!raw?.isFood) return [];
  return (raw.items ?? [])
    .map((i) => ({ name: String(i.name ?? '').trim().slice(0, 50), grams: Math.round(Number(i.grams)), confidence: Math.min(1, Math.max(0, Number(i.confidence) || 0)) }))
    .filter((i) => i.name && i.grams >= 1 && i.grams <= 2000)
    .slice(0, 8);
}

type LabelRaw = {
  readable: boolean;
  name?: string | null;
  isDrink?: boolean;
  vegMark?: string;
  basis?: string;
  values?: Record<string, unknown>;
  servingGrams?: number | null;
  servingLabel?: string | null;
};

/** Reads nutrition values from a photo: a packet's label, a menu, or a screenshot of a brand's site or a delivery app. */
export async function readLabel(jpegBase64: string): Promise<LabelRead> {
  const raw = await ask<LabelRaw>(
    [
      {
        text:
          'This photo shows nutrition information: a packet’s nutrition table, a restaurant menu or box, or a screenshot of a brand’s website or a delivery app. Read the nutrition values.\n' +
          '- Copy the values as printed. basis: "per100" if they are per 100 g or 100 ml, "serving" if they are per serving, portion, box or item. If both are printed, use the per 100 g values.\n' +
          '- Energy in kcal; if only kJ is printed, divide by 4.184.\n' +
          '- carb = total carbohydrate, fat = total fat, fibre = dietary fibre, sugar = total sugars (use added sugars only if total is not printed).\n' +
          '- Use null for fibre or sugar when they are not printed. Never invent numbers that are not in the photo.\n' +
          '- If there are no readable nutrition values, set readable to false.\n' +
          '- name: the product or dish name with its brand, if visible.\n' +
          '- vegMark: "veg" for the Indian green dot-in-square symbol, "nonveg" for the brown or red one, otherwise "none".\n' +
          '- servingGrams and servingLabel: the serving size printed (for example 30 and "1 bar", or 450 and "1 box"), or null if no weight is printed.',
      },
      { inlineData: { mimeType: 'image/jpeg', data: jpegBase64 } },
    ],
    (S) =>
      S.object({
        properties: {
          readable: S.boolean(),
          name: S.string({ nullable: true }),
          isDrink: S.boolean(),
          vegMark: S.enumString({ enum: ['veg', 'nonveg', 'none'] }),
          basis: S.enumString({ enum: ['per100', 'serving'] }),
          values: S.object({
            properties: { kcal: S.number(), carb: S.number(), protein: S.number(), fat: S.number(), fibre: S.number({ nullable: true }), sugar: S.number({ nullable: true }) },
          }),
          servingGrams: S.number({ nullable: true }),
          servingLabel: S.string({ nullable: true }),
        },
      }),
  );
  if (!raw?.readable || !raw.values) throw new AiError('Couldn’t find nutrition values in that photo. Take a closer, sharper photo of the table.');
  const sg = Number(raw.servingGrams);
  const servingGrams = Number.isFinite(sg) && sg >= 1 && sg <= 3000 ? Math.round(sg * 10) / 10 : null;
  const scaled = (v: Record<string, unknown>, by: number) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x == null ? x : Number(x) * by]));
  let per100: Per100 | null;
  let perServing: Per100 | null;
  if (raw.basis === 'serving') {
    perServing = servingOf(raw.values);
    per100 = servingGrams ? per100Of(scaled(raw.values, 100 / servingGrams)) : null;
  } else {
    per100 = per100Of(raw.values);
    perServing = servingGrams ? servingOf(scaled(raw.values, servingGrams / 100)) : null;
  }
  return {
    name: raw.name?.trim().slice(0, 60) || null,
    isDrink: !!raw.isDrink,
    diet: raw.vegMark === 'veg' ? 'veg' : raw.vegMark === 'nonveg' ? 'nonveg' : null,
    per100,
    perServing,
    servingGrams,
    servingLabel: raw.servingLabel?.trim().slice(0, 24) || null,
  };
}

// ---------------------------------------------------------------- estimates for unknown dishes

type EstimateRaw = { isFood: boolean; name?: string; category?: string; diet?: string; per100?: Record<string, unknown>; portions?: { label?: string; grams?: number }[] };

/** Estimates typical nutrition for a dish or drink that isn't in the database. */
export async function estimateFood(query: string): Promise<Estimate> {
  const dish = query.replace(/["\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const raw = await ask<EstimateRaw>(
    [
      {
        text:
          `Estimate typical nutrition for this food or drink: "${dish}".\n` +
          '- Assume it is prepared and eaten as is common in India (home-style unless the name says restaurant or packaged).\n' +
          '- Give values per 100 g, or per 100 ml for drinks.\n' +
          '- portions: one to three everyday portions. label is a short unit name of one or two words (for example "katori", "plate", "piece", "glass"), grams is its weight.\n' +
          '- diet: "veg", "egg" (has egg but no meat or fish) or "nonveg".\n' +
          '- name: a short, clean English name, with the Indian name in brackets if helpful.\n' +
          '- If the text is not a food or drink, set isFood to false.',
      },
    ],
    (S) =>
      S.object({
        properties: {
          isFood: S.boolean(),
          name: S.string(),
          category: S.enumString({ enum: ['Food', 'Drink', 'Dessert', 'Other'] }),
          diet: S.enumString({ enum: ['veg', 'egg', 'nonveg'] }),
          per100: S.object({ properties: { kcal: S.number(), carb: S.number(), protein: S.number(), fat: S.number(), fibre: S.number(), sugar: S.number() } }),
          portions: S.array({ items: S.object({ properties: { label: S.string(), grams: S.number() } }) }),
        },
      }),
  );
  if (!raw?.isFood || !raw.per100) throw new AiError(`“${dish}” doesn’t look like a food. Try another name.`);
  const cat: Category = raw.category === 'Drink' || raw.category === 'Dessert' || raw.category === 'Other' ? raw.category : 'Food';
  const portions = (raw.portions ?? [])
    .map((p) => ({ label: String(p.label ?? '').replace(/\(.*?\)/g, '').replace(/^1\s+/, '').trim().slice(0, 18).toLowerCase(), grams: Math.round(Number(p.grams)) }))
    .filter((p) => p.label && p.grams >= 1 && p.grams <= 1500)
    .slice(0, 3);
  return {
    name: (raw.name || dish).trim().slice(0, 60),
    cat,
    diet: raw.diet === 'egg' || raw.diet === 'nonveg' ? raw.diet : 'veg',
    base: cat === 'Drink' ? 'ml' : 'g',
    per100: per100Of(raw.per100),
    portions,
  };
}

const CAT_ICON: Record<Category, string> = { Food: 'silverware-fork-knife', Drink: 'cup', Dessert: 'cupcake', Other: 'food-variant' };

/** Turns an estimate into a food the user can log (saved like a custom food, marked as AI). */
export function estimateToFood(id: string, query: string, e: Estimate): Food {
  const units: Food['units'] = [];
  for (const p of e.portions) {
    if (p.label !== e.base && !units.some((u) => u.id === p.label)) units.push({ id: p.label, label: p.label, grams: p.grams });
  }
  return {
    id,
    name: e.name,
    aliases: `${query.toLowerCase()} ${e.name.toLowerCase()}`,
    cat: e.cat,
    icon: CAT_ICON[e.cat],
    diet: e.diet,
    base: e.base,
    gi: null,
    n: e.per100,
    units: [...units, { id: e.base, label: e.base === 'ml' ? 'ml' : 'gram', grams: 1 }],
    custom: true,
    src: 'ai',
  };
}

// ---------------------------------------------------------------- published values for brands and restaurants

export type WebFind = {
  found: boolean;
  name: string;
  /** What one serving is, as published: "1 box", "Regular", "100 g". */
  servingLabel: string;
  /** Published weight of that serving, or null when the brand doesn't give one. */
  servingGrams: number | null;
  isDrink: boolean;
  diet: Diet | null;
  perServing: Per100;
  /** Calories weren't published, so they're worked out from carbs, protein and fat. */
  kcalFromMacros: boolean;
  /** Where the numbers come from, in the AI's words ("Swiggy menu", "brand website"). */
  from: string | null;
  /** Web pages Google Search used for the answer. */
  sources: { title: string; uri: string }[];
  /** Google Search suggestions (HTML). Google requires showing these with the answer. */
  searchHtml: string | null;
};

type WebRaw = {
  found?: boolean;
  name?: string;
  servingLabel?: string | null;
  servingGrams?: number | null;
  kcal?: number | null;
  carb?: number | null;
  protein?: number | null;
  fat?: number | null;
  fibre?: number | null;
  sugar?: number | null;
  diet?: string | null;
  isDrink?: boolean;
  source?: string | null;
};

/** Pulls the JSON object out of a text answer (it may come wrapped in a code block). */
function jsonIn(text: string): WebRaw | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as WebRaw;
  } catch {
    return null;
  }
}

/**
 * Searches the web (Google Search, through Gemini) for the nutrition values a brand or restaurant
 * publishes for a dish, e.g. a delivery biryani, which can be far from a home-style recipe.
 */
export async function findOnline(query: string): Promise<WebFind> {
  const dish = query.replace(/["\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const res = await generate(
    [
      {
        text:
          `Search the web for the nutrition values published for this food: "${dish}".\n` +
          'It is most likely a branded, restaurant or packaged food sold in India, so look at the brand’s own website or menu, its packaging, and its listing on delivery apps such as Swiggy, Zomato or EatSure.\n' +
          'Rules:\n' +
          '- Use only numbers that are actually published for this product, or for the closest named item from the same brand. Never estimate a number yourself; use null for anything not published.\n' +
          '- Give the values for one serving exactly as published, and say what the serving is (for example "1 box", "Regular", "1 portion"). If only values per 100 g are published, give those, with servingLabel "100 g" and servingGrams 100.\n' +
          '- servingGrams: the published weight of that serving in grams, or null if no weight is published.\n' +
          '- name: the item as the brand names it, with the brand, for example "Behrouz Lazeez Bhuna Murgh Biryani".\n' +
          '- diet: "veg", "egg" or "nonveg", judged from the item.\n' +
          '- source: the website the numbers come from.\n' +
          '- If you found no published nutrition values, set found to false.\n' +
          'Reply with only this JSON object and no other text:\n' +
          '{"found": true, "name": "", "servingLabel": "", "servingGrams": null, "kcal": null, "carb": null, "protein": null, "fat": null, "fibre": null, "sugar": null, "diet": null, "isDrink": false, "source": ""}',
      },
    ],
    () => ({ tools: [{ googleSearch: {} }], generationConfig: { temperature: 0.1 } }),
    true,
  ).catch((e: unknown) => {
    if (e instanceof SearchOffError) searchOff = true;
    throw e;
  });
  const g = res.candidates?.[0]?.groundingMetadata;
  const sources: WebFind['sources'] = [];
  for (const c of g?.groundingChunks ?? []) {
    const uri = c.web?.uri;
    if (uri && /^https:\/\//.test(uri) && !sources.some((s) => s.uri === uri)) sources.push({ uri, title: (c.web?.title || c.web?.domain || 'Source').slice(0, 60) });
  }
  const searchHtml = g?.searchEntryPoint?.renderedContent || null;
  const raw = jsonIn(res.text());

  const kcalRaw = raw?.kcal == null ? NaN : Number(raw.kcal);
  const has = (v: unknown) => v != null && Number.isFinite(Number(v));
  const macros = has(raw?.carb) && has(raw?.protein) && has(raw?.fat);
  const perServing: Per100 = { kcal: 0, carb: num(raw?.carb, 1000), protein: num(raw?.protein, 1000), fat: num(raw?.fat, 1000), fibre: num(raw?.fibre, 1000), sugar: 0 };
  perServing.sugar = Math.min(num(raw?.sugar, 1000), perServing.carb || 1000);
  const kcalFromMacros = !(kcalRaw > 0) && macros;
  perServing.kcal = kcalRaw > 0 ? Math.round(Math.min(kcalRaw, 5000)) : Math.round(perServing.carb * 4 + perServing.protein * 4 + perServing.fat * 9);

  const grams = Number(raw?.servingGrams);
  const servingLabel = String(raw?.servingLabel ?? '').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'serving';
  return {
    found: !!raw?.found && perServing.kcal > 0 && (kcalRaw > 0 || macros),
    name: (raw?.name || dish).trim().slice(0, 60),
    servingLabel,
    servingGrams: Number.isFinite(grams) && grams >= 5 && grams <= 3000 ? Math.round(grams) : null,
    isDrink: !!raw?.isDrink,
    diet: raw?.diet === 'veg' || raw?.diet === 'egg' || raw?.diet === 'nonveg' ? raw.diet : null,
    perServing,
    kcalFromMacros,
    from: raw?.source?.trim().slice(0, 60) || null,
    sources: sources.slice(0, 4),
    searchHtml,
  };
}

/** Turns values found online into a food the user can log (saved like a custom food, marked as from the web). */
export function webToFood(id: string, query: string, w: WebFind, fallbackDiet: Diet): Food {
  const base = w.isDrink ? 'ml' : 'g';
  const cat: Category = w.isDrink ? 'Drink' : 'Food';
  // Without a published weight, a serving stands in as 100 g, so values per 100 g are values per serving.
  const g = w.servingGrams ?? 100;
  const per = (v: number) => Math.round((v / g) * 1000) / 10;
  const p = w.perServing;
  const label = w.servingLabel.replace(/^1\s+(?=\D)/, '') || 'serving';
  const gramUnit = { id: base, label: base === 'ml' ? 'ml' : 'gram', grams: 1 };
  // Values published per 100 g: log by weight.
  const per100Only = w.servingGrams === 100 && /^100\s*(g|gm|grams?|ml)$/i.test(label);
  return {
    id,
    name: w.name,
    aliases: `${query.toLowerCase()} ${w.name.toLowerCase()}`,
    cat,
    icon: CAT_ICON[cat],
    diet: w.diet ?? fallbackDiet,
    base,
    gi: null,
    n: { kcal: Math.round((p.kcal / g) * 100), carb: per(p.carb), protein: per(p.protein), fat: per(p.fat), fibre: per(p.fibre), sugar: per(p.sugar) },
    units: per100Only ? [gramUnit] : w.servingGrams ? [{ id: 'serving', label, grams: g }, gramUnit] : [{ id: 'serving', label, grams: g }],
    custom: true,
    src: 'web',
    ...(w.from || w.sources[0] ? { from: (w.from || w.sources[0].title).slice(0, 60) } : {}),
    ...(w.servingGrams ? {} : { noWeight: true }),
  };
}
