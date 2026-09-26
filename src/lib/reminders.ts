// Local reminders (scheduled on the phone, no server). Work in Expo Go and in the APK.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type Reminders = {
  meals: boolean;
  breakfast: string; // "HH:MM"
  lunch: string;
  dinner: string;
  water: boolean;
  waterFrom: number; // hour
  waterTo: number;
  weighIn: boolean;
  weighDay: number; // 1 = Sunday … 7 = Saturday
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

export const remindersSupported = true;
const CHANNEL = 'reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

/** Asks for permission if needed. Returns false when the user said no. */
export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    // Android 13+ only shows the permission prompt once a channel exists.
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return { hour: Math.min(23, Math.max(0, h || 0)), minute: Math.min(59, Math.max(0, m || 0)) };
};

/** Replaces all scheduled reminders with the given settings. Returns how many were scheduled. */
export async function applyReminders(r: Reminders): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!r.meals && !r.water && !r.weighIn) return 0;
  const jobs: Notifications.NotificationRequestInput[] = [];
  const daily = (hour: number, minute: number) => ({ type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL }) as const;
  if (r.meals) {
    jobs.push({ content: { title: 'Log your breakfast', body: 'A photo and two taps keeps your day on track.' }, trigger: daily(hm(r.breakfast).hour, hm(r.breakfast).minute) });
    jobs.push({ content: { title: 'Lunch time?', body: 'Log lunch while you still remember the portions.' }, trigger: daily(hm(r.lunch).hour, hm(r.lunch).minute) });
    jobs.push({ content: { title: 'Log your dinner', body: 'See how your day added up.' }, trigger: daily(hm(r.dinner).hour, hm(r.dinner).minute) });
  }
  if (r.water) {
    for (let h = r.waterFrom; h <= r.waterTo; h += 2) {
      jobs.push({ content: { title: 'Time for a glass of water', body: 'Tap + on the water card after you drink.' }, trigger: daily(h, 0) });
    }
  }
  if (r.weighIn) {
    jobs.push({
      content: { title: 'Weekly weigh-in', body: 'Weigh yourself before breakfast and log it in Platewise.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: r.weighDay, hour: 8, minute: 0, channelId: CHANNEL },
    });
  }
  for (const j of jobs) await Notifications.scheduleNotificationAsync(j);
  return jobs.length;
}

/** On app start: re-schedule saved reminders, but only if permission was already given (never prompts). */
export async function restoreReminders(r: Reminders) {
  if (!r.meals && !r.water && !r.weighIn) return;
  const perm = await Notifications.getPermissionsAsync();
  if (perm.granted) await applyReminders(r);
}

export async function testReminder() {
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Reminders are on', body: 'This is how Platewise reminders will look.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, channelId: CHANNEL },
  });
}
