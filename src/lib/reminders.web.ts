// Browsers can't schedule notifications while the page is closed, so reminders are phone-only.
export type Reminders = {
  meals: boolean;
  breakfast: string;
  brunch: string;
  lunch: string;
  dinner: string;
};

export const DEFAULT_REMINDERS: Reminders = {
  meals: false,
  breakfast: '09:00',
  brunch: '11:30',
  lunch: '13:30',
  dinner: '20:30',
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
