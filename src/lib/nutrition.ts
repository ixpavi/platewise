import type { Food, Nutrients } from '@/data/foods';

export type Gender = 'Female' | 'Male' | 'Other';
export type ActivityLevel = 'Sedentary' | 'Light' | 'Moderate' | 'Active';
export type Goal = 'lose' | 'maintain' | 'gain';
export type Profile = {
  name: string;
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  targetKg: number;
  activity: ActivityLevel;
  goal: Goal;
  pace: number; // kg per week
  diet: 'veg' | 'egg' | 'nonveg';
};

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = { Sedentary: 1.2, Light: 1.375, Moderate: 1.55, Active: 1.725 };
export const ACTIVITY_HINT: Record<ActivityLevel, string> = {
  Sedentary: 'Desk job, little exercise',
  Light: 'On your feet some of the day, or 1–3 workouts a week',
  Moderate: 'Active job, or 3–5 workouts a week',
  Active: 'Hard training most days',
};
export const KCAL_PER_KG = 7700;

export type Targets = { kcal: number; carb: number; protein: number; fat: number; fibre: number; waterMl: number; bmr: number; tdee: number; floorHit: boolean };

/** Daily budget with the Mifflin–St Jeor equation, a pace-based deficit or surplus, and safety floors. */
export function targets(p: Profile | null, override?: number | null): Targets {
  if (!p) return { kcal: 2000, carb: 250, protein: 60, fat: 62, fibre: 30, waterMl: 2500, bmr: 0, tdee: 2000, floorHit: false };
  const sex = p.gender === 'Male' ? 5 : p.gender === 'Female' ? -161 : -78;
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + sex;
  const tdee = bmr * ACTIVITY_FACTOR[p.activity];
  const delta = (p.pace * KCAL_PER_KG) / 7;
  let kcal = p.goal === 'lose' ? tdee - delta : p.goal === 'gain' ? tdee + delta : tdee;
  const floor = Math.max(p.gender === 'Male' ? 1500 : 1200, bmr);
  let floorHit = false;
  if (p.goal === 'lose' && kcal < floor) {
    kcal = floor;
    floorHit = true;
  }
  if (override && override >= 800 && override <= 6000) kcal = override;
  kcal = Math.round(kcal / 10) * 10;
  const perKg = p.goal === 'maintain' ? 1.0 : 1.4;
  const protein = Math.round(p.weightKg * perKg);
  const fat = Math.round((kcal * 0.28) / 9);
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const fibre = Math.round((kcal / 1000) * 14);
  const waterMl = Math.round((p.weightKg * 35) / 250) * 250;
  return { kcal, carb, protein, fat, fibre, waterMl, bmr: Math.round(bmr), tdee: Math.round(tdee), floorHit };
}

export function bmi(p: Profile) {
  const m = p.heightCm / 100;
  return p.weightKg / (m * m);
}
export function bmiBand(b: number) {
  if (b < 18.5) return { label: 'Underweight', tone: 'warn' as const };
  if (b < 23) return { label: 'Healthy', tone: 'good' as const }; // Asian cut-offs (WHO 2004)
  if (b < 27.5) return { label: 'Overweight', tone: 'warn' as const };
  return { label: 'Obese', tone: 'bad' as const };
}

export const ZERO: Nutrients = { kcal: 0, carb: 0, protein: 0, fat: 0, fibre: 0, sugar: 0 };

export function scale(food: Food, grams: number): Nutrients {
  const k = grams / 100;
  const n = food.n;
  return { kcal: n.kcal * k, carb: n.carb * k, protein: n.protein * k, fat: n.fat * k, fibre: n.fibre * k, sugar: n.sugar * k };
}

export function add(a: Nutrients, b: Nutrients): Nutrients {
  return { kcal: a.kcal + b.kcal, carb: a.carb + b.carb, protein: a.protein + b.protein, fat: a.fat + b.fat, fibre: a.fibre + b.fibre, sugar: a.sugar + b.sugar };
}

export function fmt(v: number) {
  if (!Number.isFinite(v) || v === 0) return '0';
  if (Math.abs(v) >= 10) return String(Math.round(v));
  return String(Math.round(v * 10) / 10);
}
export function kcalStr(v: number) {
  return Math.round(v).toLocaleString('en-IN');
}

/**
 * 1–10 health score for a food, per 100 kcal: rewards protein and fibre; penalises sugar
 * that isn't packaged with fibre (so whole fruit isn't treated like cola), fat-heavy energy
 * in low-fibre foods (fried snacks, not nuts), refined starch, energy density and a high GI.
 */
export function healthScore(f: Food): number {
  const n = f.n;
  if (n.kcal < 5) return 8; // water, black coffee, green tea
  const per100kcal = 100 / n.kcal;
  const protein = n.protein * per100kcal; // g per 100 kcal
  const fibre = n.fibre * per100kcal;
  const freeSugar = Math.max(0, n.sugar * per100kcal - fibre * 3);
  const fatShare = (n.fat * 9) / n.kcal;
  let s = 5;
  s += Math.min(protein, 12) * 0.28;
  s += Math.min(fibre, 6) * 0.45;
  s -= Math.min(freeSugar, 25) * 0.16;
  const carbShare = (n.carb * 4) / n.kcal;
  const wholeFood = fibre >= 1.5 || (protein >= 3.5 && fibre >= 1); // nuts, seeds, pulses, veg
  if (fatShare > 0.4 && !wholeFood) s -= (fatShare - 0.4) * 8;
  if (carbShare > 0.4 && fibre < 1) s -= 1; // refined starch: white rice, maida, sugar
  const dense = wholeFood ? 450 : 250;
  if (n.kcal > dense) s -= (n.kcal - dense) / (wholeFood ? 120 : 100);
  if (f.gi != null) s -= f.gi >= 70 ? 1 : f.gi <= 55 ? -0.5 : 0;
  return Math.max(1, Math.min(10, Math.round(s)));
}
export function scoreTone(s: number) {
  return s >= 7 ? 'good' : s >= 4 ? 'warn' : 'bad';
}

export function giBand(gi: number | null) {
  if (gi == null) return null;
  return gi <= 55 ? 'Low' : gi < 70 ? 'Medium' : 'High';
}

/** Approximate kcal from walking steps: ~0.04 kcal per step at 70 kg, scaled by weight. */
export function stepKcal(steps: number, weightKg = 65) {
  return steps * 0.04 * (weightKg / 70);
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
