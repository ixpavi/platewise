import { useMemo } from 'react';
import type { Food, Nutrients } from '@/data/foods';
import { DEFAULT_MEALS, MEAL_INFO, MEALS, useStore, type Entry, type Meal } from './store';
import { add, scale, targets, ZERO, type Targets } from './nutrition';
import { lastNDays } from './dates';

export type Row = Entry & { food: Food; nut: Nutrients };
export type DaySummary = {
  rows: Row[];
  byMeal: Record<Meal, { rows: Row[]; total: Nutrients }>;
  total: Nutrients;
  targets: Targets;
};

export function useTargets() {
  const { state } = useStore();
  return useMemo(() => targets(state.profile, state.settings.calorieOverride), [state.profile, state.settings.calorieOverride]);
}

export function useDaySummary(key: string): DaySummary {
  const { food, day } = useStore();
  const t = useTargets();
  return useMemo(() => {
    const rows: Row[] = day(key)
      .food.map((e) => {
        const f = food(e.foodId);
        return f ? { ...e, food: f, nut: scale(f, e.grams) } : null;
      })
      .filter((x): x is Row => !!x)
      .sort((a, b) => a.t - b.t);
    const byMeal = Object.fromEntries(MEALS.map((m) => [m, { rows: [] as Row[], total: ZERO }])) as DaySummary['byMeal'];
    let total = ZERO;
    for (const r of rows) {
      const m = byMeal[r.meal] ? r.meal : 'Dinner'; // a meal from a newer app version
      byMeal[m].rows.push(r);
      byMeal[m].total = add(byMeal[m].total, r.nut);
      total = add(total, r.nut);
    }
    return { rows, byMeal, total, targets: t };
  }, [key, day, food, t]);
}

/** Totals for a list of days (used by Progress). */
export function useRange(days: number) {
  const { food, day } = useStore();
  return useMemo(() => {
    return lastNDays(days).map((k) => {
      const d = day(k);
      let total = ZERO;
      for (const e of d.food) {
        const f = food(e.foodId);
        if (f) total = add(total, scale(f, e.grams));
      }
      return { key: k, total, logged: d.food.length > 0 };
    });
  }, [days, day, food]);
}

/** The meal someone is most likely logging now, out of the meals they eat. Just after midnight still counts as the night before. */
export function mealForNow(meals: readonly Meal[] = DEFAULT_MEALS, d = new Date()): Meal {
  const list = MEALS.filter((m) => meals.includes(m));
  if (!list.length) return 'Dinner';
  let h = d.getHours() + d.getMinutes() / 60;
  if (h < 4) h += 24;
  for (let i = 0; i < list.length - 1; i++) {
    if (h < (MEAL_INFO[list[i]].hour + MEAL_INFO[list[i + 1]].hour) / 2) return list[i];
  }
  return list[list.length - 1];
}

/** Share of the day's calories for one meal, among the meals someone eats. */
export function mealShare(meal: Meal, meals: readonly Meal[]) {
  const total = MEALS.filter((m) => meals.includes(m) || m === meal).reduce((s, m) => s + MEAL_INFO[m].weight, 0);
  return total ? MEAL_INFO[meal].weight / total : 0;
}

/** The meals this person eats, and the one they're most likely logging right now. */
export function useMeals() {
  const { state } = useStore();
  const meals = state.settings.meals;
  return { meals, now: mealForNow(meals), options: (current?: Meal) => MEALS.filter((m) => meals.includes(m) || m === current) };
}
