import { ALL_FOODS, defaultPortion, FOOD_BY_ID } from '@/data/foods';
import { unitLabel } from '@/lib/format';
import { searchFoods } from '@/lib/search';

const top = (q: string) => searchFoods(q, ALL_FOODS)[0]?.id;

describe('food search', () => {
  test('finds everyday foods by English and Hindi names', () => {
    expect(top('chapati')).toBe('chapati');
    expect(top('roti')).toBe('chapati');
    expect(top('dahi')).toBe('curd');
    expect(top('paneer butter masala')).toBe('paneer-butter-masala');
  });

  test('tolerates small typos', () => {
    expect(top('chapatti')).toBe('chapati');
    expect(top('panner butter masala')).toBe('paneer-butter-masala');
  });

  test('still returns something when one word of a dish is unknown', () => {
    expect(searchFoods('chole bhature', ALL_FOODS).length).toBeGreaterThan(0);
  });

  test('returns nothing for nonsense', () => {
    expect(searchFoods('qzxv', ALL_FOODS)).toHaveLength(0);
  });

  test('is fast enough to search as you type over the whole database', () => {
    const queries = ['dal', 'paneer', 'chicken biryani', 'masala dosa', 'banana', 'chai', 'rajma chawal', 'idli sambar', 'aloo paratha', 'gulab jamun'];
    searchFoods('warm up', ALL_FOODS);
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) for (const q of queries) searchFoods(q, ALL_FOODS);
    const perQuery = (performance.now() - t0) / (queries.length * 10);
    console.log(`search: ${ALL_FOODS.length} foods, ${perQuery.toFixed(2)} ms per query`);
    // Well inside the 0.1 s limit for a response to feel instant (Nielsen, 1993), even on a busy machine.
    expect(perQuery).toBeLessThan(50);
  });
});

describe('portions', () => {
  test('a household unit is the default portion', () => {
    expect(defaultPortion(FOOD_BY_ID.chapati)).toMatchObject({ qty: 1, grams: 40, label: '1 roti' });
  });
  test('unit labels read naturally', () => {
    expect(unitLabel('katori', 2)).toBe('katoris');
    expect(unitLabel('1 bowl', 1)).toBe('bowl');
    expect(unitLabel('gram', 150)).toBe('g');
  });
});
