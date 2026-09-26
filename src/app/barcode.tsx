import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, Icon, LightStatusBar, Notice, RoundButton, Sheet, tap } from '@/components/ui';
import { lookupBarcode, LookupError, productCodeFromScan, validBarcode } from '@/lib/barcode';
import { dayKey } from '@/lib/dates';
import { goBack } from '@/lib/nav';
import { useStore } from '@/lib/store';
import { useMeals } from '@/lib/summary';
import { C, R, T } from '@/theme';

type Result = { k: 'idle' } | { k: 'looking'; code: string } | { k: 'notfound'; code: string } | { k: 'nodata'; code: string; name: string } | { k: 'error'; code: string; msg: string };

export default function Barcode() {
  const params = useLocalSearchParams<{ meal?: string; day?: string }>();
  const mealNow = useMeals().now;
  const meal = params.meal || mealNow;
  const day = params.day || dayKey();
  const { state, saveCustomFood } = useStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [result, setResult] = useState<Result>({ k: 'idle' });
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState('');
  const [typedErr, setTypedErr] = useState('');
  const [qrHint, setQrHint] = useState(false);
  const lock = useRef(false);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => () => ctl.current?.abort(), []);
  // The "not a product QR" hint fades once the stray QR code is out of view.
  useEffect(() => {
    if (!qrHint) return;
    const t = setTimeout(() => setQrHint(false), 4000);
    return () => clearTimeout(t);
  }, [qrHint]);

  const open = (foodId: string) => router.replace({ pathname: '/food/[id]', params: { id: foodId, meal, day } });

  const lookup = async (code: string) => {
    if (lock.current) return;
    lock.current = true;
    setQrHint(false);
    tap();
    // Scanned before: no need to hit the network again.
    const known = state.custom[`bc-${code}`];
    if (known) return open(known.id);
    setResult({ k: 'looking', code });
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    try {
      const r = await lookupBarcode(code, c.signal);
      if (r.status === 'found') {
        saveCustomFood(r.food);
        tap('success');
        open(r.food.id);
        return;
      }
      tap('warn');
      setResult(r.status === 'nodata' ? { k: 'nodata', code, name: r.name } : { k: 'notfound', code });
    } catch (e) {
      if (c.signal.aborted) return;
      setResult({ k: 'error', code, msg: e instanceof LookupError ? e.message : 'Something went wrong. Try again.' });
    }
  };

  const onScan = (s: BarcodeScanningResult) => {
    if (lock.current || result.k !== 'idle') return;
    const code = productCodeFromScan(s.data);
    if (code) return lookup(code);
    // A QR code without a product number (payment, website): say so, keep scanning.
    if (s.type === 'qr' || s.type === 'datamatrix') setQrHint(true);
  };

  const again = () => {
    lock.current = false;
    setResult({ k: 'idle' });
  };

  const submitTyped = () => {
    const code = typed.replace(/\D/g, '');
    if (!validBarcode(code)) {
      setTypedErr('That doesn’t look like a full barcode. Type all 8 or 13 digits under the bars.');
      return;
    }
    setManual(false);
    setTypedErr('');
    lock.current = false;
    lookup(code);
  };

  const granted = permission?.granted;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0E1410' }} edges={['top', 'bottom']}>
      <LightStatusBar />
      <View style={styles.top}>
        <RoundButton icon="close" label="Close" bg="rgba(255,255,255,0.12)" color="#fff" onPress={goBack} />
        <Text style={[T.h3, { color: '#fff', flex: 1, textAlign: 'center' }]}>Scan barcode or QR</Text>
        {granted && Platform.OS !== 'web' ? (
          <RoundButton icon={torch ? 'flashlight-off' : 'flashlight'} label={torch ? 'Turn torch off' : 'Turn torch on'} bg="rgba(255,255,255,0.12)" color="#fff" onPress={() => setTorch(!torch)} />
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <View style={styles.cameraWrap}>
        {!permission ? (
          <ActivityIndicator color="#fff" />
        ) : !granted ? (
          <View style={{ alignItems: 'center', gap: 12, padding: 24 }}>
            <Icon name="camera-off-outline" size={48} color="rgba(255,255,255,0.6)" />
            <Text style={[T.h3, { color: '#fff', textAlign: 'center' }]}>Allow camera access to scan</Text>
            <Text style={[T.small, { color: 'rgba(255,255,255,0.7)', textAlign: 'center' }]}>Platewise only uses the camera while this screen is open. You can also type the barcode.</Text>
            {permission.canAskAgain ? (
              <Button label="Allow camera" kind="citrus" small onPress={requestPermission} />
            ) : (
              <Button label="Open Settings" kind="citrus" small onPress={() => Linking.openSettings()} />
            )}
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'datamatrix'] }}
              onBarcodeScanned={result.k === 'idle' ? onScan : undefined}
            />
            <View style={[styles.frame, { pointerEvents: 'none' }]}>
              <View style={styles.laser} />
            </View>
          </>
        )}
      </View>

      <View style={styles.panel}>
        {result.k === 'idle' ? (
          <>
            <Text style={[T.body, { color: qrHint ? C.citrus : '#fff', textAlign: 'center' }]}>
              {qrHint ? 'That QR code has no product details. Try the barcode (the black bars) on the pack.' : 'Point at the barcode or QR code on a packet. It scans automatically.'}
            </Text>
            <Button label="Type the barcode instead" icon="keyboard-outline" kind="onDark" small onPress={() => setManual(true)} />
          </>
        ) : result.k === 'looking' ? (
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.citrus} />
            <Text style={[T.body, { color: '#fff' }]}>Looking up {result.code}…</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {result.k === 'notfound' ? (
              <>
                <Text style={T.h3}>We don’t know this product yet</Text>
                <Text style={T.small}>{`Barcode ${result.code} isn’t in the Open Food Facts database. Add it yourself from the pack’s nutrition label.`}</Text>
              </>
            ) : result.k === 'nodata' ? (
              <>
                <Text style={T.h3}>Nutrition information for this food is currently unavailable.</Text>
                <Text style={T.small}>{`We found “${result.name}”, but it has no nutrition facts yet. Enter them from the label, or pick a similar food.`}</Text>
              </>
            ) : (
              <Notice tone="bad" icon="wifi-off">
                {result.msg}
              </Notice>
            )}
            <View style={{ gap: 8, marginTop: 6 }}>
              {result.k === 'error' ? <Button label="Try again" icon="refresh" small onPress={() => ((lock.current = false), lookup(result.code))} /> : null}
              {result.k !== 'error' ? (
                <Button label="Add it from the label" icon="plus" small onPress={() => router.replace({ pathname: '/custom-food', params: { name: result.k === 'nodata' ? result.name : '', code: result.code } })} />
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label="Scan another" kind="ghost" small style={{ flex: 1 }} onPress={again} />
                <Button label="Search foods" kind="ghost" small style={{ flex: 1 }} onPress={() => router.replace({ pathname: '/log', params: { meal, day } })} />
              </View>
            </View>
          </View>
        )}
        <Text style={[T.tiny, { color: 'rgba(255,255,255,0.45)', textAlign: 'center' }]}>Product data from Open Food Facts (openfoodfacts.org), an open database. Check values against the pack.</Text>
      </View>

      <Sheet visible={manual} onClose={() => setManual(false)} title="Type the barcode">
        <Field
          label="Digits under the barcode"
          value={typed}
          onChangeText={(t) => (setTyped(t.replace(/\D/g, '')), setTypedErr(''))}
          keyboardType="number-pad"
          maxLength={14}
          placeholder="e.g. 8901058851298"
          error={typedErr}
          onSubmitEditing={submitTyped}
          autoFocus
        />
        <Button label="Look it up" style={{ marginTop: 14 }} onPress={submitTyped} disabled={typed.length < 8} />
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8 },
  cameraWrap: { flex: 1, marginHorizontal: 18, borderRadius: R.xl, overflow: 'hidden', backgroundColor: '#1A221D', alignItems: 'center', justifyContent: 'center' },
  frame: { width: '78%', height: 150, borderRadius: 18, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', justifyContent: 'center' },
  laser: { height: 2, marginHorizontal: 14, backgroundColor: C.citrus, opacity: 0.9 },
  panel: { padding: 18, gap: 12 },
  card: { backgroundColor: C.bg, borderRadius: R.lg, padding: 16, gap: 6 },
});

