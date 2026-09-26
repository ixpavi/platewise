import { useMemo } from 'react';
import type { Food, Nutrients } from '@/data/foods';
import { MEALS, useStore, type Entry, type Meal } from './store';
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
      byMeal[r.meal].rows.push(r);
      byMeal[r.meal].total = add(byMeal[r.meal].total, r.nut);
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

export function mealForNow(d = new Date()): Meal {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 10.5) return 'Breakfast';
  if (h < 12) return 'Morning snack';
  if (h < 15.5) return 'Lunch';
  if (h < 19) return 'Evening snack';
  return 'Dinner';
}
