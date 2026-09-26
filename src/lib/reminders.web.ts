// Browsers can't schedule notifications while the page is closed, so reminders are phone-only.
export type Reminders = {
  meals: boolean;
  breakfast: string;
  lunch: string;
  dinner: string;
  water: boolean;
  waterFrom: number;
  waterTo: number;
  weighIn: boolean;
  weighDay: number;
};

export const DEFAULT_REMINDERS: Reminders = {
  meals: false,
  breakfast: '09:00',
  lunch: '13:30',
  dinner: '20:30',
  water: false,
  waterFrom: 10,
  waterTo: 20,
  weighIn: false,
  weighDay: 1,
};

export const remindersSupported = false;
export async function ensurePermission() {
  return false;
}
export async function applyReminders() {
  return 0;
}
export async function testReminder() {}
export async function restoreReminders() {}
