import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { CATEGORY_TINT, type Food } from '@/data/foods';
import { C, F, R, shadow, T } from '@/theme';

/** Light status-bar icons while a dark screen is on top. */
export function LightStatusBar() {
  return useIsFocused() ? <StatusBar style="light" /> : null;
}

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
export const Icon = ({ name, size = 22, color = C.ink }: { name: string; size?: number; color?: string }) => (
  <MaterialCommunityIcons name={name as IconName} size={size} color={color} accessible={false} accessibilityElementsHidden importantForAccessibility="no" />
);

export function tap(kind: 'light' | 'success' | 'warn' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else if (kind === 'warn') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/* ---------------- layout ---------------- */

// Android 15+ draws edge-to-edge and no longer resizes the window for the keyboard,
// so native platforms lift content themselves.
const KB_BEHAVIOR = Platform.OS === 'web' ? undefined : 'padding';

export function Screen({ children, scroll = true, padded = true, edges = ['top'], style, bottomInset = 32 }: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom')[];
  style?: StyleProp<ViewStyle>;
  bottomInset?: number;
}) {
  const inner = padded ? { paddingHorizontal: 18 } : null;
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: C.bg }, style]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={KB_BEHAVIOR}>
        {scroll ? (
          <ScrollView contentContainerStyle={[inner, { paddingBottom: bottomInset }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, inner]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Header({ title, onBack, right, subtitle }: { title: string; onBack?: () => void; right?: React.ReactNode; subtitle?: string }) {
  return (
    <View style={s.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="arrow-left" size={22} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[T.h2, { fontSize: 20 }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={T.small}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  if (onPress)
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [s.card, shadow, style, pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] }]}>
        {children}
      </Pressable>
    );
  return <View style={[s.card, shadow, style]}>{children}</View>;
}

export function Section({ title, action, onAction, children, style }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: 22 }, style]}>
      <View style={s.sectionHead}>
        <Text style={T.h3}>{title}</Text>
        {action ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <Text style={[T.small, { color: C.brand, fontFamily: F.bold }]}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/* ---------------- controls ---------------- */

type BtnKind = 'primary' | 'citrus' | 'ghost' | 'soft' | 'danger' | 'coach' | 'text' | 'onDark' | 'textOnDark';
export function Button({ label, onPress, kind = 'primary', icon, disabled, loading, style, small }: {
  label: string;
  onPress?: () => void;
  kind?: BtnKind;
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const bg = { primary: C.brand, citrus: C.citrus, ghost: C.card, soft: C.brandSoft, danger: C.bad, coach: C.coach, text: 'transparent', onDark: 'rgba(255,255,255,0.1)', textOnDark: 'transparent' }[kind];
  const fg = { primary: '#fff', citrus: C.citrusInk, ghost: C.ink, soft: C.brand, danger: '#fff', coach: '#fff', text: C.brand, onDark: '#fff', textOnDark: 'rgba(255,255,255,0.85)' }[kind];
  return (
    <Pressable
      onPress={() => {
        if (disabled || loading) return;
        tap();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        { backgroundColor: bg },
        kind === 'ghost' && { borderWidth: 1, borderColor: C.line },
        kind === 'onDark' && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
        (disabled || loading) && { opacity: 0.5 },
        pressed && !disabled && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={small ? 18 : 20} color={fg} /> : null}
      <Text style={[s.btnText, small && { fontSize: 14 }, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function RoundButton({ icon, onPress, color = C.ink, bg = C.card, size = 40, label }: { icon: string; onPress: () => void; color?: string; bg?: string; size?: number; label: string }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.7 }]}
    >
      <Icon name={icon} size={size * 0.5} color={color} />
    </Pressable>
  );
}

export function Chip({ label, active, onPress, icon, tone }: { label: string; active?: boolean; onPress?: () => void; icon?: string; tone?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={[s.chip, active && { backgroundColor: tone ?? C.ink, borderColor: tone ?? C.ink }]}
    >
      {icon ? <Icon name={icon} size={15} color={active ? '#fff' : C.ink2} /> : null}
      <Text style={[s.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Partial<Record<T, string>> }) {
  return (
    <View style={s.seg} accessibilityRole="tablist">
      {options.map((o) => (
        <Pressable
          key={o}
          onPress={() => {
            tap();
            onChange(o);
          }}
          accessibilityRole="tab"
          accessibilityState={{ selected: o === value }}
          style={[s.segItem, o === value && s.segOn]}
        >
          <Text style={[s.segText, o === value && { color: C.ink }]} numberOfLines={1}>
            {labels?.[o] ?? o}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Field({ label, error, suffix, style, ...props }: TextInputProps & { label?: string; error?: string; suffix?: string }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={[{ gap: 6, minWidth: 0 }, style as ViewStyle]}>
      {label ? <Text style={[T.small, { fontFamily: F.semi, color: C.ink2 }]}>{label}</Text> : null}
      <View style={[s.field, focus && { borderColor: C.brand }, !!error && { borderColor: C.bad }]}>
        <TextInput
          placeholderTextColor={C.ink3}
          {...props}
          onFocus={(e) => {
            setFocus(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocus(false);
            props.onBlur?.(e);
          }}
          style={s.fieldInput}
        />
        {suffix ? <Text style={[T.small, { color: C.ink3 }]}>{suffix}</Text> : null}
      </View>
      {error ? <Text style={[T.small, { color: C.bad }]}>{error}</Text> : null}
    </View>
  );
}

export function Stepper({ value, onChange, step = 1, min = 0, max = 99, format }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; format?: (v: number) => string }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)));
  return (
    <View style={s.stepper}>
      <RoundButton icon="minus" label="Less" size={36} bg={C.line2} onPress={() => set(value - step)} />
      <Text style={[T.num, { fontSize: 20, minWidth: 64, textAlign: 'center' }]}>{format ? format(value) : value}</Text>
      <RoundButton icon="plus" label="More" size={36} bg={C.line2} onPress={() => set(value + step)} />
    </View>
  );
}

/* ---------------- data display ---------------- */

export function Ring({ size, stroke, progress, color, track = C.line2, children }: { size: number; stroke: number; progress: number; color: string; track?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {p > 0 ? <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} /> : null}
      </Svg>
      {children}
    </View>
  );
}

export function Bar({ value, max, color, height = 7, track = C.line2 }: { value: number; max: number; color: string; height?: number; track?: string }) {
  const p = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${p * 100}%`, height: '100%', borderRadius: height, backgroundColor: value > max ? C.bad : color }} />
    </View>
  );
}

export function FoodIcon({ food, size = 44 }: { food: Pick<Food, 'icon' | 'cat'>; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: CATEGORY_TINT[food.cat], alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={food.icon} size={size * 0.52} color={C.ink2} />
    </View>
  );
}

export function DietMark({ diet }: { diet: Food['diet'] }) {
  const color = diet === 'veg' ? C.veg : C.nonveg;
  return (
    <View accessibilityLabel={diet === 'veg' ? 'Vegetarian' : diet === 'egg' ? 'Contains egg' : 'Non-vegetarian'} style={{ width: 14, height: 14, borderWidth: 1.5, borderColor: color, borderRadius: 3, alignItems: 'center', justifyContent: 'center' }}>
      {diet === 'veg' ? (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      ) : (
        <View style={{ width: 0, height: 0, borderLeftWidth: 3.5, borderRightWidth: 3.5, borderBottomWidth: 6, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color }} />
      )}
    </View>
  );
}

export function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: R.pill, alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: F.bold, fontSize: 11.5, color }}>{label}</Text>
    </View>
  );
}

export function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const tone = score >= 7 ? C.good : score >= 4 ? C.warn : C.bad;
  const d = size === 'sm' ? 26 : 38;
  return (
    <View accessibilityLabel={`Health score ${score} out of 10`} style={{ width: d, height: d, borderRadius: d / 2, borderWidth: 2, borderColor: tone, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.bold, fontSize: size === 'sm' ? 12 : 15, color: tone }}>{score}</Text>
    </View>
  );
}

export function Empty({ icon, title, body, action, onAction }: { icon: string; title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20, gap: 8 }}>
      <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: C.line2, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Icon name={icon} size={30} color={C.ink3} />
      </View>
      <Text style={[T.h3, { textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[T.small, { textAlign: 'center', maxWidth: 280 }]}>{body}</Text> : null}
      {action ? <Button label={action} kind="soft" small onPress={onAction} style={{ marginTop: 8, alignSelf: 'center' }} /> : null}
    </View>
  );
}

export function Notice({ icon = 'information-outline', tone = 'info', children }: { icon?: string; tone?: 'info' | 'warn' | 'bad' | 'coach'; children: React.ReactNode }) {
  const map = { info: [C.brandSoft, C.brand], warn: [C.citrusSoft, C.warn], bad: ['#FBE4DF', C.bad], coach: [C.coachSoft, C.coach] }[tone];
  return (
    <View style={{ flexDirection: 'row', gap: 10, backgroundColor: map[0], borderRadius: R.md, padding: 12, alignItems: 'flex-start' }}>
      <Icon name={icon} size={18} color={map[1]} />
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <Text style={[T.small, { color: C.ink }]}>{children}</Text> : children}</View>
    </View>
  );
}

/* ---------------- bottom sheet ---------------- */

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={KB_BEHAVIOR}>
        <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={s.grab} />
          {title ? <Text style={[T.h2, { marginBottom: 12 }]}>{title}</Text> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------------- toast ---------------- */

type ToastAction = { label: string; run: () => void };
const ToastCtx = createContext<(msg: string, action?: ToastAction) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; action?: ToastAction; id: number } | null>(null);
  const [anim] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback(
    (msg: string, action?: ToastAction) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ msg, action, id: Date.now() });
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start();
      timer.current = setTimeout(() => setToast(null), action ? 5000 : 2600);
    },
    [anim],
  );
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          style={[s.toastWrap, { pointerEvents: 'box-none' }, { bottom: insets.bottom + 92, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}
        >
          <View style={s.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <Icon name="check-circle" size={18} color={C.citrus} />
            <Text style={[T.small, { color: '#fff', flex: 1 }]}>{toast.msg}</Text>
            {toast.action ? (
              <Pressable
                hitSlop={8}
                onPress={() => {
                  toast.action?.run();
                  setToast(null);
                }}
              >
                <Text style={{ color: C.citrus, fontFamily: F.bold, fontSize: 14 }}>{toast.action.label}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 56 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: 16 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  btn: { minHeight: 52, borderRadius: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnSmall: { minHeight: 40, borderRadius: 12, paddingHorizontal: 14 },
  btnText: { fontFamily: F.bold, fontSize: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
  chipText: { fontFamily: F.semi, fontSize: 14, color: C.ink2 },
  seg: { flexDirection: 'row', backgroundColor: C.line2, borderRadius: 14, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segOn: { backgroundColor: C.card, ...(Platform.OS === 'web' ? ({ boxShadow: '0 1px 3px rgba(0,0,0,0.12)' } as object) : { elevation: 1, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }) },
  segText: { fontFamily: F.semi, fontSize: 13.5, color: C.ink2 },
  field: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 12, gap: 6, minWidth: 0 },
  fieldInput: { flex: 1, minWidth: 0, width: '100%', fontFamily: F.medium, fontSize: 16, color: C.ink, paddingVertical: 12, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 6 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,16,12,0.45)' },
  sheet: { marginTop: 'auto', backgroundColor: C.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 10, maxHeight: '90%' },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center', marginBottom: 14 },
  toastWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.ink, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, width: '100%', maxWidth: 480 },
});
