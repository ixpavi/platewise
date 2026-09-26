// Which meals get a reminder: the main meals someone eats (snacks don't).
export type ReminderKey = 'breakfast' | 'brunch' | 'lunch' | 'dinner';

const MAIN: { meal: string; key: ReminderKey; title: string; body: string }[] = [
  { meal: 'Breakfast', key: 'breakfast', title: 'Log your breakfast', body: 'A photo and two taps keeps your day on track.' },
  { meal: 'Brunch', key: 'brunch', title: 'Log your brunch', body: 'Log it now while you still remember the portions.' },
  { meal: 'Lunch', key: 'lunch', title: 'Lunch time?', body: 'Log lunch while you still remember the portions.' },
  { meal: 'Dinner', key: 'dinner', title: 'Log your dinner', body: 'See how your day added up.' },
];

export const reminderMeals = (meals: readonly string[]) => MAIN.filter((m) => meals.includes(m.meal));
