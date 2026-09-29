import { FOOD_BY_ID } from '@/data/foods';
import { add, bmi, bmiBand, giBand, scale, steadyGoal, targets, ZERO, type Profile } from '@/lib/nutrition';

const base: Profile = { name: 'Test', gender: 'Male', age: 25, heightCm: 175, weightKg: 70, targetKg: 65, activity: 'Sedentary', goal: 'maintain', pace: 0, diet: 'veg' };

describe('daily targets (Mifflin–St Jeor)', () => {
  test('resting energy matches the published equation', () => {
    // 10 × 70 + 6.25 × 175 − 5 × 25 + 5 = 1673.75 kcal
    expect(targets(base).bmr).toBe(1674);
    // Sedentary activity factor 1.2
    expect(targets(base).tdee).toBe(2009);
    // Female constant is −161 instead of +5
    expect(targets({ ...base, gender: 'Female' }).bmr).toBe(1508);
  });

  test('losing weight takes the deficit for the chosen pace', () => {
    const t = targets({ ...base, activity: 'Moderate', goal: 'lose', pace: 0.5 });
    // TDEE 1673.75 × 1.55 = 2594.3; 0.5 kg a week × 7,700 kcal / 7 days = 550 kcal a day less
    expect(t.kcal).toBe(2040);
    expect(t.floorHit).toBe(false);
  });

  test('the budget never goes below resting energy (BMR)', () => {
    const t = targets({ ...base, goal: 'lose', pace: 0.5 });
    expect(t.kcal).toBe(1670);
    expect(t.floorHit).toBe(true);
  });

  test('the budget never drops below a safe minimum', () => {
    const t = targets({ ...base, gender: 'Female', age: 50, heightCm: 150, weightKg: 48, goal: 'lose', pace: 0.75 });
    expect(t.kcal).toBeGreaterThanOrEqual(1200);
    expect(t.floorHit).toBe(true);
  });

  test('gaining weight adds a surplus', () => {
    expect(targets({ ...base, goal: 'gain', pace: 0.25 }).kcal).toBeGreaterThan(targets(base).kcal);
  });

  test('protein per kg follows the goal', () => {
    expect(targets(base).protein).toBe(70); // 1.0 g/kg, healthy eating
    expect(targets({ ...base, goal: 'lose', pace: 0.5 }).protein).toBe(98); // 1.4 g/kg
    expect(targets({ ...base, goal: 'fitness' }).protein).toBe(112); // 1.6 g/kg
  });

  test('carbs, protein and fat add up to the calorie budget', () => {
    for (const goal of ['lose', 'maintain', 'gain', 'fitness'] as const) {
      const t = targets({ ...base, goal, pace: steadyGoal(goal) ? 0 : 0.5 });
      expect(Math.abs(t.carb * 4 + t.protein * 4 + t.fat * 9 - t.kcal)).toBeLessThanOrEqual(10);
    }
  });

  test('a custom budget overrides the calculation', () => {
    expect(targets(base, 1800).kcal).toBe(1800);
  });

  test('fitness and healthy eating keep the weight steady', () => {
    expect(steadyGoal('fitness')).toBe(true);
    expect(steadyGoal('maintain')).toBe(true);
    expect(steadyGoal('lose')).toBe(false);
  });
});

describe('BMI with Asian cut-offs (WHO 2004)', () => {
  test('bands', () => {
    expect(bmiBand(18.4).label).toBe('Underweight');
    expect(bmiBand(22.9).label).toBe('Healthy');
    expect(bmiBand(23).label).toBe('Overweight');
    expect(bmiBand(27.5).label).toBe('Obese');
  });
  test('value', () => {
    expect(bmi(base)).toBeCloseTo(22.86, 2);
  });
});

describe('portions and glycemic index', () => {
  test('nutrition scales with the weight eaten', () => {
    const roti = FOOD_BY_ID.chapati;
    const one = scale(roti, 40);
    expect(one.kcal).toBeCloseTo(105.6, 1);
    expect(scale(roti, 80).kcal).toBeCloseTo(one.kcal * 2, 5);
    expect(add(ZERO, one)).toEqual(one);
  });
  test('GI bands', () => {
    expect(giBand(55)).toBe('Low');
    expect(giBand(56)).toBe('Medium');
    expect(giBand(70)).toBe('High');
    expect(giBand(null)).toBeNull();
  });
});
