export const DAY_MS = 86_400_000;

export function dayKey(d: Date | number = new Date()): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function isToday(key: string) {
  return key === dayKey();
}

export function relativeDay(key: string): string {
  const today = dayKey();
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  if (key === addDays(today, 1)) return 'Tomorrow';
  return fromKey(key).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function weekdayShort(key: string) {
  return fromKey(key).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3);
}

export function timeLabel(t: number) {
  return new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function lastNDays(n: number, end = dayKey()): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Timestamp for logging on a past or future day: keep the current clock time. */
export function stampFor(key: string): number {
  if (isToday(key)) return Date.now();
  const d = fromKey(key);
  const now = new Date();
  d.setHours(now.getHours(), now.getMinutes(), 0, 0);
  return d.getTime();
}
