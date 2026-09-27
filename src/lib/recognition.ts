// Food recognition layer. Kept separate from the screens (framework section 9) so the
// image-recognition model or API can be swapped without touching the UI.
//
//   photo -> recognizer (food names + portions) -> food database search -> nutrition
//
// With the app's Firebase project set up, Google Gemini (Firebase AI Logic) identifies the foods.
// Without it, the user tags the foods in the photo, helped by suggestions from what they usually
// eat at that meal.

import { FOOD_BY_ID, FOODS, type Food } from '@/data/foods';
import { aiAvailable, identifyFoods, photoForAi } from './ai';
import { addDays, dayKey } from './dates';
import { searchFoods } from './search';
import type { Meal, State } from './store';

/** One recognised food, matched to the food database. */
export type Detected = { foodId: string; grams: number; confidence: number; seenAs: string };
/** What the recognizer saw: foods found in the database, and names it couldn't match. */
export type Recognition = { foods: Detected[]; unmatched: string[] };

export interface Recognizer {
  /** Human-readable name shown in the UI. */
  readonly name: string;
  /** Whether this recognizer can identify food automatically. */
  readonly automatic: boolean;
  /**
   * Identifies the foods in a photo and matches them to `foods` (the database plus the user's own
   * foods). Returns null when the user should tag the photo themselves.
   */
  recognize(photoUri: string, foods: Food[], width?: number): Promise<Recognition | null>;
}

export const manualRecognizer: Recognizer = {
  name: 'Manual tagging',
  automatic: false,
  async recognize() {
    return null;
  },
};

/** Google Gemini names the foods and portions; the food database gives the nutrition. */
export const geminiRecognizer: Recognizer = {
  name: 'Google Gemini',
  automatic: true,
  async recognize(photoUri, foods, width) {
    const seen = await identifyFoods(await photoForAi(photoUri, width, 1024), FOODS.map((f) => f.name.toLowerCase()));
    const out: Recognition = { foods: [], unmatched: [] };
    for (const s of seen) {
      const match = searchFoods(s.name, foods)[0];
      if (!match) {
        out.unmatched.push(s.name);
        continue;
      }
      // Two portions of the same food (say two rotis seen separately) become one.
      const same = out.foods.find((d) => d.foodId === match.id);
      if (same) same.grams += s.grams;
      else out.foods.push({ foodId: match.id, grams: s.grams, confidence: s.confidence, seenAs: s.name });
    }
    return out;
  },
};

/** Gemini when the app has its Firebase settings, otherwise manual tagging. */
export const recognizer = (): Recognizer => (aiAvailable() ? geminiRecognizer : manualRecognizer);

const MEAL_STAPLES: Record<Meal, string[]> = {
  Breakfast: ['poha', 'idli', 'chai', 'upma', 'aloo-paratha', 'boiled-egg', 'oats', 'dosa', 'brown-bread', 'banana'],
  'Morning snack': ['banana', 'apple', 'almonds', 'chai', 'roasted-chana', 'buttermilk', 'papaya', 'makhana'],
  Lunch: ['rice', 'chapati', 'dal', 'mix-veg', 'curd', 'rajma', 'chole', 'salad', 'chicken-curry', 'raita'],
  'Evening snack': ['chai', 'biscuit', 'samosa', 'roasted-chana', 'bhel-puri', 'makhana', 'apple', 'filter-coffee'],
  Dinner: ['chapati', 'dal', 'rice', 'mix-veg', 'palak-paneer', 'khichdi', 'curd', 'salad', 'chicken-curry', 'aloo-gobi'],
  Brunch: ['aloo-paratha', 'poha', 'chole', 'masala-dosa', 'rajma', 'rice', 'chapati', 'dal', 'curd', 'boiled-egg', 'chai'],
  'Late-night snack': ['milk', 'banana', 'biscuit', 'makhana', 'almonds', 'roasted-chana', 'apple', 'chai'],
};

/**
 * Foods most likely to be on this plate: what the user logged at this meal in the last
 * two weeks (most frequent first), then their recent foods, then common staples for the meal.
 */
export function suggestFoods(state: State, meal: Meal, limit = 10): string[] {
  const counts = new Map<string, number>();
  const today = dayKey();
  for (let i = 0; i < 14; i++) {
    for (const e of state.days[addDays(today, -i)]?.food ?? []) {
      if (e.meal === meal) counts.set(e.foodId, (counts.get(e.foodId) ?? 0) + 1);
    }
  }
  const byMeal = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const known = (id: string) => !!FOOD_BY_ID[id] || !!state.custom[id];
  const out: string[] = [];
  for (const id of [...byMeal, ...state.recents, ...MEAL_STAPLES[meal]]) {
    if (known(id) && !out.includes(id)) out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}
