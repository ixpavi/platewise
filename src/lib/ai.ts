// Gemini through Firebase AI Logic. The app never holds a Gemini key: requests go through your
// Firebase project, and the key stays on Google's servers (README, "AI features").
// Used only for things the food database can't answer: reading a packet's nutrition label from a
// photo, and estimating a dish that isn't in the database.
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import type { Schema as SchemaT, TypedSchema } from 'firebase/ai';
import type { Category, Diet, Food } from '@/data/foods';
import { getCloud } from './firebase';

// Google retires model versions (2.5 Flash is gone for new projects), so ask for the latest Flash
// and fall back to a pinned one if the alias isn't available.
const MODELS = ['gemini-flash-latest', 'gemini-3.8-flash'];

export class AiError extends Error {}

/** AI needs the app's Firebase project (the same settings that turn on cloud accounts). */
export const aiAvailable = () => !!getCloud();

export type Per100 = { kcal: number; carb: number; protein: number; fat: number; fibre: number; sugar: number };
export type LabelRead = { name: string | null; isDrink: boolean; diet: Diet | null; per100: Per100; servingGrams: number | null; servingLabel: string | null };
export type Estimate = { name: string; cat: Category; diet: Diet; base: 'g' | 'ml'; per100: Per100; portions: { label: string; grams: number }[] };

function friendly(e: unknown): AiError {
  if (e instanceof AiError) return e;
  const code = String((e as { code?: string })?.code ?? '');
  const msg = String((e as Error)?.message ?? '');
  if (code === 'api-not-enabled' || /AI Logic API|has not been used|is disabled/i.test(msg)) return new AiError('AI isn’t switched on for this app yet. The app’s owner can turn it on in Firebase (AI Logic).');
  if (/429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|quota|rate limit/i.test(msg)) return new AiError('The AI is busy right now. Try again in a minute.');
  if (code === 'fetch-error' || /network request failed|failed to fetch|network/i.test(msg)) return new AiError('No internet connection. Check it and try again.');
  if (/SAFETY|blocked|RECITATION/i.test(msg)) return new AiError('The AI couldn’t read that. Try a clearer photo.');
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

async function ask<T>(parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[], schema: (s: typeof SchemaT) => TypedSchema): Promise<T> {
  const cloud = getCloud();
  if (!cloud) throw new AiError('AI needs the app’s Firebase settings.');
  polyfillForAi();
  // Loaded on first use so the AI SDK never affects app start-up.
  const { getAI, getGenerativeModel, GoogleAIBackend, Schema } = await withTimeout(import('firebase/ai'), 15_000).catch((e: unknown) => {
    throw friendly(e);
  });
  const ai = getAI(cloud.app, { backend: new GoogleAIBackend() });
  let last: unknown;
  for (const name of MODELS) {
    const model = getGenerativeModel(ai, { model: name, generationConfig: { responseMimeType: 'application/json', responseSchema: schema(Schema), temperature: 0.1 } }, { timeout: 45_000 });
    // Gemini is sometimes overloaded (503) at busy times: retry twice, waiting a little longer each time.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await withTimeout(model.generateContent(parts), 50_000);
        return JSON.parse(res.response.text()) as T;
      } catch (e) {
        last = e;
        const msg = String((e as Error)?.message ?? '');
        if (/503|UNAVAILABLE|overloaded/i.test(msg) && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        if (/404|NOT_FOUND|not found|no longer available/i.test(msg)) break; // try the next model
        throw friendly(e);
      }
    }
  }
  throw friendly(last);
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
  const width = asset.width && asset.width > 0 ? Math.min(asset.width, 1400) : 1400;
  const ref = await ImageManipulator.manipulate(asset.uri).resize({ width }).renderAsync();
  const out = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new AiError('Couldn’t prepare that photo. Try another one.');
  return out.base64;
}

type LabelRaw = { readable: boolean; name?: string | null; isDrink?: boolean; vegMark?: string; per100?: Record<string, unknown>; servingGrams?: number | null; servingLabel?: string | null };

/** Reads the nutrition table on a packet from a photo. */
export async function readLabel(jpegBase64: string): Promise<LabelRead> {
  const raw = await ask<LabelRaw>(
    [
      {
        text:
          'This is a photo of a packaged food or drink. Read its nutrition information table.\n' +
          '- Give values per 100 g, or per 100 ml for drinks. If the table only lists values per serving, convert them using the serving size.\n' +
          '- Energy in kcal; if only kJ is printed, divide by 4.184.\n' +
          '- carb = total carbohydrate, fat = total fat, fibre = dietary fibre, sugar = total sugars (use added sugars only if total is not printed).\n' +
          '- Use null for fibre or sugar when they are not printed. Never invent numbers that are not on the label.\n' +
          '- If there is no readable nutrition table, set readable to false.\n' +
          '- name: the product name with its brand, if visible.\n' +
          '- vegMark: "veg" for the Indian green dot-in-square symbol, "nonveg" for the brown or red one, otherwise "none".\n' +
          '- servingGrams and servingLabel: the serving size printed on the label (for example 30 and "1 bar"), or null.',
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
          per100: S.object({
            properties: { kcal: S.number(), carb: S.number(), protein: S.number(), fat: S.number(), fibre: S.number({ nullable: true }), sugar: S.number({ nullable: true }) },
          }),
          servingGrams: S.number({ nullable: true }),
          servingLabel: S.string({ nullable: true }),
        },
      }),
  );
  if (!raw?.readable || !raw.per100) throw new AiError('Couldn’t find a nutrition table in that photo. Take a closer, sharper photo of the label.');
  const serving = Number(raw.servingGrams);
  return {
    name: raw.name?.trim().slice(0, 60) || null,
    isDrink: !!raw.isDrink,
    diet: raw.vegMark === 'veg' ? 'veg' : raw.vegMark === 'nonveg' ? 'nonveg' : null,
    per100: per100Of(raw.per100),
    servingGrams: Number.isFinite(serving) && serving >= 1 && serving <= 2000 ? Math.round(serving * 10) / 10 : null,
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
