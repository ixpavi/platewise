export const fmtQty = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(q < 1 ? 2 : 1).replace(/0$/, ''));

/** "katori" -> "katoris" for plurals; grams and ml become g/ml; multi-word units stay as they are. */
export const unitLabel = (label: string, qty: number) => {
  if (label === 'gram') return 'g';
  if (label === 'ml') return 'ml';
  if (qty === 1 || label.includes(' ') || label.endsWith('s')) return label;
  if (label.endsWith('y') && !/[aeiou]y$/.test(label)) return label.slice(0, -1) + 'ies';
  if (/(ch|sh|x)$/.test(label)) return label + 'es';
  return label + 's';
};
