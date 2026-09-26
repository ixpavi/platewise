// Food recognition layer. Kept separate from the screens (framework section 9) so an
// image-recognition model or API can be plugged in later without touching the UI.
// Today there is no automatic recognition: the user tags the foods in their photo,
// helped by suggestions drawn from what they usually eat at that meal.

import { FOOD_BY_ID } from '@/data/foods';
import { addDays, dayKey } from './dates';
import type { Meal, State } from './store';

export type Detected = { foodId: string; grams: number; confidence: number };

export interface Recognizer {
  /** Human-readable name shown in the UI. */
  readonly name: string;
  /** Whether this recognizer can identify food automatically. */
  readonly automatic: boolean;
  /** Returns detected foods, or null when the user should tag the photo themselves. */
  recognize(photoUri: string): Promise<Detected[] | null>;
}

export const manualRecognizer: Recognizer = {
  name: 'Manual tagging',
  automatic: false,
  async recognize() {
    return null;
  },
};

/** Swap this for a model- or API-backed recognizer when one is added. */
export const recognizer: Recognizer = manualRecognizer;

const MEAL_STAPLES: Record<Meal, string[]> = {
  Breakfast: ['poha', 'idli', 'chai', 'upma', 'aloo-paratha', 'boiled-egg', 'oats', 'dosa', 'brown-bread', 'banana'],
  'Morning snack': ['banana', 'apple', 'almonds', 'chai', 'roasted-chana', 'buttermilk', 'papaya', 'makhana'],
  Lunch: ['rice', 'chapati', 'dal', 'mix-veg', 'curd', 'rajma', 'chole', 'salad', 'chicken-curry', 'raita'],
  'Evening snack': ['chai', 'biscuit', 'samosa', 'roasted-chana', 'bhel-puri', 'makhana', 'apple', 'filter-coffee'],
  Dinner: ['chapati', 'dal', 'rice', 'mix-veg', 'palak-paneer', 'khichdi', 'curd', 'salad', 'chicken-curry', 'aloo-gobi'],
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
