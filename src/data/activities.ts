// MET values from the 2024 Adult Compendium of Physical Activities.
// kcal burned = MET × body weight (kg) × hours.
export type Activity = { id: string; name: string; icon: string; met: number };

export const ACTIVITIES: Activity[] = [
  { id: 'walk', name: 'Walking, brisk', icon: 'walk', met: 4.3 },
  { id: 'walk-easy', name: 'Walking, easy', icon: 'walk', met: 2.8 },
  { id: 'run', name: 'Running', icon: 'run-fast', met: 9.8 },
  { id: 'cycle', name: 'Cycling', icon: 'bike', met: 7.5 },
  { id: 'yoga', name: 'Yoga', icon: 'yoga', met: 2.5 },
  { id: 'surya', name: 'Surya namaskar', icon: 'weather-sunny', met: 3.8 },
  { id: 'gym', name: 'Weight training', icon: 'dumbbell', met: 5.0 },
  { id: 'hiit', name: 'HIIT', icon: 'lightning-bolt', met: 8.0 },
  { id: 'swim', name: 'Swimming', icon: 'swim', met: 7.0 },
  { id: 'dance', name: 'Dancing', icon: 'human-female-dance', met: 5.0 },
  { id: 'badminton', name: 'Badminton', icon: 'badminton', met: 5.5 },
  { id: 'cricket', name: 'Cricket', icon: 'cricket', met: 4.8 },
  { id: 'football', name: 'Football', icon: 'soccer', met: 7.0 },
  { id: 'skipping', name: 'Skipping rope', icon: 'jump-rope', met: 11.8 },
  { id: 'stairs', name: 'Climbing stairs', icon: 'stairs', met: 8.0 },
  { id: 'housework', name: 'Housework', icon: 'broom', met: 3.3 },
];

export const ACTIVITY_BY_ID: Record<string, Activity> = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a]));
