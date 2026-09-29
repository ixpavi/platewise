// The recognition layer with the AI replaced by a fake, so the test needs no network or quota.
import { ALL_FOODS, FOOD_BY_ID } from '@/data/foods';

const mockAi = { available: true, seen: [] as { name: string; grams: number; confidence: number }[] };
jest.mock('@/lib/ai', () => ({
  aiAvailable: () => mockAi.available,
  photoForAi: jest.fn().mockResolvedValue('base64-jpeg'),
  identifyFoods: jest.fn(async () => mockAi.seen),
}));

import { geminiRecognizer, manualRecognizer, recognizer } from '@/lib/recognition';

describe('food recognition', () => {
  test('names from the AI are matched to foods in the database', async () => {
    mockAi.seen = [
      { name: 'chapati (roti)', grams: 40, confidence: 0.95 },
      { name: 'dal tadka', grams: 150, confidence: 0.9 },
      { name: 'white rice, cooked', grams: 120, confidence: 0.9 },
    ];
    const r = await geminiRecognizer.recognize('file://plate.jpg', ALL_FOODS);
    expect(r?.foods.map((f) => f.foodId)).toEqual(['chapati', 'dal', expect.stringMatching(/rice/)]);
    expect(r?.foods[1]).toMatchObject({ grams: 150, confidence: 0.9, seenAs: 'dal tadka' });
    expect(r?.unmatched).toEqual([]);
  });

  test('two portions of the same food are combined', async () => {
    mockAi.seen = [
      { name: 'chapati', grams: 40, confidence: 0.9 },
      { name: 'roti', grams: 40, confidence: 0.8 },
    ];
    const r = await geminiRecognizer.recognize('file://plate.jpg', ALL_FOODS);
    expect(r?.foods).toHaveLength(1);
    expect(r?.foods[0]).toMatchObject({ foodId: 'chapati', grams: 80 });
  });

  test('foods with no match are reported, not dropped silently', async () => {
    mockAi.seen = [{ name: 'qzxv', grams: 200, confidence: 0.4 }];
    const r = await geminiRecognizer.recognize('file://plate.jpg', ALL_FOODS);
    expect(r).toEqual({ foods: [], unmatched: ['qzxv'] });
  });

  test('regional dishes from the Indian Nutrient Databank are found', async () => {
    mockAi.seen = [{ name: 'lemon rice', grams: 150, confidence: 0.8 }];
    const r = await geminiRecognizer.recognize('file://plate.jpg', ALL_FOODS);
    expect(FOOD_BY_ID[r!.foods[0].foodId].name).toMatch(/^Lemon rice/);
  });

  test("a dish that isn't in the database falls back to its closest match, keeping the name it was seen as", async () => {
    mockAi.seen = [{ name: 'zafrani rice', grams: 150, confidence: 0.8 }];
    const r = await geminiRecognizer.recognize('file://plate.jpg', ALL_FOODS);
    expect(FOOD_BY_ID[r!.foods[0].foodId].name.toLowerCase()).toContain('rice');
    expect(r?.foods[0].seenAs).toBe('zafrani rice');
  });

  test('nothing recognised gives an empty result', async () => {
    mockAi.seen = [];
    expect(await geminiRecognizer.recognize('file://wall.jpg', ALL_FOODS)).toEqual({ foods: [], unmatched: [] });
  });

  test('without AI the user tags the photo', async () => {
    mockAi.available = false;
    expect(recognizer()).toBe(manualRecognizer);
    expect(await recognizer().recognize('file://plate.jpg', ALL_FOODS)).toBeNull();
    mockAi.available = true;
    expect(recognizer()).toBe(geminiRecognizer);
  });
});
