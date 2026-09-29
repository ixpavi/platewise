export const fmtQty = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(q < 1 ? 2 : 1).replace(/0$/, ''));

/** "katori" -> "katoris" for plurals; grams and ml become g/ml; multi-word units stay as they are. */
export const unitLabel = (raw: string, qty: number) => {
  // Custom foods can have units like "1 bowl"; the quantity already says how many.
  const label = raw.replace(/^1\s+(?=\D)/, '');
  if (label === 'gram') return 'g';
  if (label === 'ml') return 'ml';
  // Half a katori or one roti: singular. Only more than one takes a plural.
  if (qty <= 1 || label.includes(' ') || label.endsWith('s')) return label;
  if (label.endsWith('y') && !/[aeiou]y$/.test(label)) return label.slice(0, -1) + 'ies';
  if (/(ch|sh|x)$/.test(label)) return label + 'es';
  return label + 's';
};
