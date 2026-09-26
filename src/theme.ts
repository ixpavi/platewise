import { Platform, TextStyle } from 'react-native';

// Platewise palette. Light, card-based UI; basil green brand with a citrus accent for the
// Snap action, and one fixed colour per tracker so users learn them at a glance.
export const C = {
  bg: '#F3F5F1',
  card: '#FFFFFF',
  ink: '#15201A',
  ink2: '#4E5C53',
  ink3: '#86938A',
  line: '#E3E8E0',
  line2: '#EEF1EB',

  brand: '#1F6B47',
  brandDeep: '#16412C',
  brandSoft: '#E3F0E7',
  citrus: '#F5C23E',
  citrusInk: '#2A2106',
  citrusSoft: '#FDF3D4',

  carb: '#E0A22B',
  protein: '#B24A74',
  fat: '#2D8391',
  fibre: '#6E9A3B',

  water: '#2E86DE',
  waterSoft: '#E4F0FB',
  steps: '#EE7F2D',
  stepsSoft: '#FDEDE0',
  sleep: '#6E5BD6',
  sleepSoft: '#ECE9FB',
  weight: '#12A08A',
  weightSoft: '#DDF4EF',
  workout: '#E0513F',
  workoutSoft: '#FCE6E2',
  coach: '#5B4BB7',
  coachSoft: '#EDEAF9',

  good: '#2A8A4A',
  warn: '#C98A0C',
  bad: '#C8452F',
  veg: '#1E8E3E',
  nonveg: '#8B2E16',
};

export const F = {
  display: 'BricolageGrotesque_700Bold',
  displayHeavy: 'BricolageGrotesque_800ExtraBold',
  body: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semi: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
};

export const R = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 };

export const shadow = Platform.select({
  ios: { shadowColor: '#1C2B22', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 2 },
  default: { boxShadow: '0 6px 18px -8px rgba(28,43,34,0.18)' } as object,
});

export const T: Record<string, TextStyle> = {
  h1: { fontFamily: F.display, fontSize: 28, color: C.ink, letterSpacing: -0.6 },
  h2: { fontFamily: F.display, fontSize: 21, color: C.ink, letterSpacing: -0.4 },
  h3: { fontFamily: F.bold, fontSize: 16, color: C.ink },
  body: { fontFamily: F.body, fontSize: 15, color: C.ink, lineHeight: 21 },
  small: { fontFamily: F.body, fontSize: 13, color: C.ink2, lineHeight: 18 },
  tiny: { fontFamily: F.medium, fontSize: 11.5, color: C.ink3 },
  label: { fontFamily: F.bold, fontSize: 11.5, color: C.ink3, letterSpacing: 0.8, textTransform: 'uppercase' },
  num: { fontFamily: F.displayHeavy, color: C.ink, fontVariant: ['tabular-nums'] },
};
