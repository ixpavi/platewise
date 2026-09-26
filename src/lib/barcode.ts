// Packaged food lookup with Open Food Facts (free, open database, no key needed).
// https://openfoodfacts.github.io/openfoodfacts-server/api/
import type { Category, Food } from '@/data/foods';

export type BarcodeResult =
  | { status: 'found'; food: Food }
  | { status: 'nodata'; name: string } // product exists but has no nutrition facts
  | { status: 'notfound' };

export class LookupError extends Error {}

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  serving_quantity_unit?: string;
  nutrition_data_per?: string;
  categories_tags?: string[];
  ingredients_analysis_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
};

/** EAN-13, EAN-8, UPC-A (12) and UPC-E (8) with a valid check digit. */
export function validBarcode(code: string) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * The product code in anything the scanner reads: a plain barcode, a GS1 Digital Link QR code
 * (https://…/01/<GTIN>/…, printed on newer packs) or a GS1 element string (01<GTIN>…) from a QR or
 * Data Matrix code. Returns null for codes without a product number, such as UPI or website QR codes.
 */
export function productCodeFromScan(data: string): string | null {
  const raw = data.trim();
  if (/^\d+$/.test(raw) && validBarcode(raw)) return raw;
  const m = raw.match(/\/01\/(\d{8,14})(?:[/?#]|$)/) ?? raw.replace(/^\][A-Za-z]\d/, '').match(/^01(\d{14})/);
  if (!m) return null;
  const gtin = m[1].padStart(14, '0');
  if (!validBarcode(gtin)) return null;
  // Leading zeros don't change the check digit: GTIN-8 and EAN-13 / UPC are GTIN-14 with zeros in front.
  if (gtin.startsWith('000000')) return gtin.slice(6);
  return gtin.startsWith('0') ? gtin.slice(1) : gtin;
}

const n = (v: unknown) => {
  const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(x) && x >= 0 ? x : NaN;
};
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * OFF categories are hierarchical and "en:plant-based-foods-and-beverages" is a parent of almost
 * every plant food, so match whole category names (or their last word), never substrings.
 */
function category(tags: string[]): Category {
  const names = tags.map((t) => t.replace(/^[a-z]{2}:/, '')).filter((t) => !t.includes('foods-and-beverages'));
  const has = (re: RegExp) => names.some((t) => re.test(t));
  if (has(/(^|-)(beverages|drinks|juices|milks|waters|sodas|teas|coffees)$/)) return 'Drink';
  if (has(/(^|-)(desserts|chocolates|biscuits|cookies|cakes|ice-creams|confectioneries|sweets|candies)$/)) return 'Dessert';
  if (has(/(^|-)(spreads|sauces|condiments|nuts|seeds|oils|sugars|honeys)$/)) return 'Other';
  return 'Food';
}

export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<BarcodeResult> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,product_name_en,brands,serving_size,serving_quantity,serving_quantity_unit,nutrition_data_per,categories_tags,ingredients_analysis_tags,nutriments`;
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { 'User-Agent': 'Platewise/1.0 (nutrition tracker app)' } });
  } catch {
    if (signal?.aborted) throw new LookupError('Cancelled.');
    throw new LookupError('Please check your internet connection and try again.');
  }
  if (res.status === 404) return { status: 'notfound' };
  if (!res.ok) throw new LookupError('The food database isn’t responding. Try again in a minute.');
  const data = (await res.json()) as { status?: number; product?: OffProduct };
  const p = data.product;
  if (data.status !== 1 || !p) return { status: 'notfound' };
  const name = [p.product_name_en || p.product_name, p.brands?.split(',')[0]?.trim()].filter(Boolean).join(' · ').slice(0, 60) || `Product ${code}`;
  const nt = p.nutriments ?? {};
  let kcal = n(nt['energy-kcal_100g']);
  if (!Number.isFinite(kcal) && Number.isFinite(n(nt['energy_100g']))) kcal = n(nt['energy_100g']) / 4.184;
  const carb = n(nt['carbohydrates_100g']);
  const protein = n(nt['proteins_100g']);
  const fat = n(nt['fat_100g']);
  if (!Number.isFinite(kcal) && ![carb, protein, fat].every(Number.isFinite)) return { status: 'nodata', name };
  const c = Number.isFinite(carb) ? carb : 0;
  const pr = Number.isFinite(protein) ? protein : 0;
  const f = Number.isFinite(fat) ? fat : 0;
  if (!Number.isFinite(kcal)) kcal = c * 4 + pr * 4 + f * 9;
  if (kcal > 950 || c + pr + f > 105) return { status: 'nodata', name }; // clearly bad data
  const cat = category(p.categories_tags ?? []);
  // Nutrients are "per 100 g" or "per 100 ml". OFF often files drinks per 100 g; for drinks 1 g ≈ 1 ml,
  // so they're always measured in ml. Otherwise trust OFF's flag and only guess when it's missing.
  const per = p.nutrition_data_per;
  const base: 'g' | 'ml' = cat === 'Drink' || per === '100ml' || (!per && (p.serving_quantity_unit === 'ml' || /ml\b/i.test(p.serving_size ?? ''))) ? 'ml' : 'g';
  const serving = n(p.serving_quantity);
  const units = [
    ...(Number.isFinite(serving) && serving >= 1 && serving <= 2000 ? [{ id: 'serving', label: 'serving', grams: serving }] : []),
    { id: base, label: base === 'ml' ? 'ml' : 'gram', grams: 1 },
  ];
  const fibre = n(nt['fiber_100g']);
  const sugar = n(nt['sugars_100g']);
  const food: Food = {
    id: `bc-${code}`,
    name,
    aliases: `${name.toLowerCase()} ${code}`,
    cat,
    icon: cat === 'Drink' ? 'bottle-soda-outline' : cat === 'Dessert' ? 'cookie' : 'barcode',
    diet: (p.ingredients_analysis_tags ?? []).includes('en:non-vegetarian') ? 'nonveg' : 'veg',
    base,
    gi: null,
    n: { kcal: Math.round(kcal), carb: r1(c), protein: r1(pr), fat: r1(f), fibre: Number.isFinite(fibre) ? r1(fibre) : 0, sugar: Number.isFinite(sugar) ? r1(Math.min(sugar, c || sugar)) : 0 },
    units,
    custom: true,
  };
  return { status: 'found', food };
}
