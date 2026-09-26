import Svg, { Circle, Path } from 'react-native-svg';
import { C } from '@/theme';

/** Plate inside a viewfinder: the app's mark. */
export function Logo({ size = 32, ring = C.brand, dot = C.citrus }: { size?: number; ring?: string; dot?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Path d="M4 12V7a3 3 0 0 1 3-3h5M28 4h5a3 3 0 0 1 3 3v5M36 28v5a3 3 0 0 1-3 3h-5M12 36H7a3 3 0 0 1-3-3v-5" fill="none" stroke={ring} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={20} cy={20} r={10} fill="none" stroke={ring} strokeWidth={3} />
      <Circle cx={20} cy={20} r={4.5} fill={dot} />
    </Svg>
  );
}
