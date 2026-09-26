// One-shot hand-off between screens, e.g. the plate review asks the food search to pick
// a food and hand it back. The receiver registers before navigating; the picker resolves.
type Pick = { foodId: string; grams?: number };
let pending: ((p: Pick) => void) | null = null;

export const pickBus = {
  request(cb: (p: Pick) => void) {
    pending = cb;
  },
  get active() {
    return pending !== null;
  },
  resolve(p: Pick) {
    const cb = pending;
    pending = null;
    cb?.(p);
  },
  cancel() {
    pending = null;
  },
};
