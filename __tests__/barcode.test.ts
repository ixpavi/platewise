import { lookupBarcode, LookupError, productCodeFromScan, validBarcode } from '@/lib/barcode';

describe('barcodes and QR codes', () => {
  test('check digits', () => {
    expect(validBarcode('8901058851298')).toBe(true); // Maggi noodles, EAN-13
    expect(validBarcode('8901058851297')).toBe(false);
    expect(validBarcode('12345')).toBe(false);
  });

  test('reads the product number from a GS1 Digital Link QR code', () => {
    expect(productCodeFromScan('https://id.gs1.org/01/08901058851298/10/ABC123')).toBe('8901058851298');
  });

  test('reads a GS1 element string', () => {
    expect(productCodeFromScan('0108901058851298172612311012345')).toBe('8901058851298');
  });

  test('ignores QR codes without a product, such as payment codes', () => {
    expect(productCodeFromScan('upi://pay?pa=shop@bank&pn=Shop')).toBeNull();
    expect(productCodeFromScan('https://example.com/menu')).toBeNull();
  });
});

describe('Open Food Facts lookup', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const reply = (status: number, body: unknown) => {
    globalThis.fetch = jest.fn().mockResolvedValue({ status, ok: status < 400, json: async () => body }) as unknown as typeof fetch;
  };

  test('a known product becomes a food with values per 100 g', async () => {
    reply(200, {
      status: 1,
      product: { product_name: 'Masala noodles', brands: 'Maggi', serving_quantity: 70, nutrition_data_per: '100g', categories_tags: ['en:noodles'], nutriments: { 'energy-kcal_100g': 427, carbohydrates_100g: 63, proteins_100g: 8.6, fat_100g: 15.4, sugars_100g: 2.4 } },
    });
    const r = await lookupBarcode('8901058851298');
    expect(r.status).toBe('found');
    if (r.status !== 'found') return;
    expect(r.food).toMatchObject({ id: 'bc-8901058851298', name: 'Masala noodles · Maggi', base: 'g', cat: 'Food' });
    expect(r.food.n).toMatchObject({ kcal: 427, carb: 63, protein: 8.6, fat: 15.4 });
    expect(r.food.units[0]).toMatchObject({ id: 'serving', grams: 70 });
  });

  test('a product that is not in the database', async () => {
    reply(404, {});
    expect(await lookupBarcode('8900000000000')).toEqual({ status: 'notfound' });
  });

  test('a product without nutrition facts', async () => {
    reply(200, { status: 1, product: { product_name: 'Mystery snack', nutriments: {} } });
    expect(await lookupBarcode('8901234567894')).toEqual({ status: 'nodata', name: 'Mystery snack' });
  });

  test('impossible values are rejected', async () => {
    reply(200, { status: 1, product: { product_name: 'Bad data', nutriments: { 'energy-kcal_100g': 4000, carbohydrates_100g: 90, proteins_100g: 40, fat_100g: 30 } } });
    expect((await lookupBarcode('8901234567894')).status).toBe('nodata');
  });

  test('no internet gives the plain message from the project brief', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
    await expect(lookupBarcode('8901058851298')).rejects.toThrow(new LookupError('Please check your internet connection and try again.'));
  });
});
