import { Pedometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { dayKey } from './dates';
import { useStore } from './store';

export type StepSource = 'checking' | 'sensor' | 'denied' | 'unavailable';

/**
 * Keeps today's step count in sync with the phone's pedometer.
 * iOS can read steps since midnight; Android only reports steps while the app is open,
 * so those are added on top of what's already stored. Web and devices without a sensor
 * fall back to manual entry.
 */
export function useStepSensor(): StepSource {
  const { setSteps, day } = useStore();
  const [source, setSource] = useState<StepSource>(Platform.OS === 'web' ? 'unavailable' : 'checking');
  const dayRef = useRef(day);
  useEffect(() => {
    dayRef.current = day;
  }, [day]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let sub: { remove(): void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const available = await Pedometer.isAvailableAsync();
        if (!available) return !cancelled && setSource('unavailable');
        const perm = await Pedometer.requestPermissionsAsync();
        if (!perm.granted) return !cancelled && setSource('denied');
        if (cancelled) return;
        setSource('sensor');
        const today = dayKey();
        if (Platform.OS === 'ios') {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          const past = await Pedometer.getStepCountAsync(start, new Date());
          if (!cancelled) setSteps(today, Math.max(past.steps, dayRef.current(today).steps));
          sub = Pedometer.watchStepCount(async () => {
            const s = new Date();
            s.setHours(0, 0, 0, 0);
            const r = await Pedometer.getStepCountAsync(s, new Date());
            setSteps(dayKey(), r.steps);
          });
        } else {
          const baseline = dayRef.current(today).steps;
          sub = Pedometer.watchStepCount((r) => {
            const k = dayKey();
            setSteps(k, (k === today ? baseline : 0) + r.steps);
          });
        }
      } catch {
        if (!cancelled) setSource('unavailable');
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [setSteps]);

  return source;
}
