// The sheet that shows nutrition values found online for a brand or restaurant dish.
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Button, Icon, Notice, Sheet } from '@/components/ui';
import type { WebFind } from '@/lib/ai';
import { fmt } from '@/lib/nutrition';
import { C, F, R, T } from '@/theme';

export type WebFindState = { busy: true } | { busy: false; result: WebFind } | { busy: false; error: string };

export function WebFindSheet({
  query,
  state,
  onClose,
  onUse,
  onEdit,
  onManual,
  onEstimate,
}: {
  query: string;
  state: WebFindState | null;
  onClose: () => void;
  onUse: (w: WebFind) => void;
  onEdit: (w: WebFind) => void;
  onManual: () => void;
  onEstimate: () => void;
}) {
  const r = state && !state.busy && 'result' in state ? state.result : null;
  const error = state && !state.busy && 'error' in state ? state.error : null;
  return (
    <Sheet visible={!!state} onClose={onClose} title={r?.found ? 'Found online' : 'Search online'}>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 12, paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
        {state?.busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={C.brand} size="large" />
            <Text style={[T.body, { textAlign: 'center' }]}>{`Looking for published values for “${query}”…`}</Text>
            <Text style={[T.tiny, { textAlign: 'center' }]}>AI searches Google for the brand’s menu or its delivery app listing. This can take up to half a minute.</Text>
          </View>
        ) : null}

        {error ? (
          <>
            <Notice tone="warn" icon="alert-circle-outline">
              {error}
            </Notice>
            <Button label="Photograph or type the values" icon="pencil-outline" onPress={onManual} />
            <Button label="Get an AI estimate instead" kind="ghost" icon="creation" onPress={onEstimate} />
          </>
        ) : null}

        {r && r.found ? (
          <>
            <View style={{ gap: 2 }}>
              <Text style={T.h3}>{r.name}</Text>
              <Text style={T.small}>
                Per {r.servingLabel}
                {r.servingGrams && !/\d/.test(r.servingLabel) ? ` (${r.servingGrams} ${r.isDrink ? 'ml' : 'g'})` : ''}
              </Text>
            </View>
            <View style={styles.values}>
              <View style={{ alignItems: 'center', minWidth: 76 }}>
                <Text style={[T.num, { fontSize: 30 }]}>{Math.round(r.perServing.kcal)}</Text>
                <Text style={T.tiny}>kcal</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Macro label="Carbs" g={r.perServing.carb} color={C.carb} />
                <Macro label="Protein" g={r.perServing.protein} color={C.protein} />
                <Macro label="Fat" g={r.perServing.fat} color={C.fat} />
                {r.perServing.fibre ? <Macro label="Fibre" g={r.perServing.fibre} color={C.fibre} /> : null}
                {r.perServing.sugar ? <Macro label="Sugar" g={r.perServing.sugar} color={C.ink3} /> : null}
              </View>
            </View>
            {r.kcalFromMacros ? <Text style={T.tiny}>Calories weren’t published, so they’re worked out from carbs, protein and fat.</Text> : null}
            {!r.servingGrams ? <Text style={T.tiny}>No weight is published for this serving, so you’ll log it by servings (half a portion is 0.5).</Text> : null}
            <Sources r={r} />
            <SearchSuggestions html={r.searchHtml} />
            <Button label="Use these values" icon="check" onPress={() => onUse(r)} />
            <Button label="Check or change them first" kind="ghost" icon="pencil-outline" onPress={() => onEdit(r)} />
            <Text style={T.tiny}>Found by AI (Gemini) with Google Search. AI can misread a page, so compare with the brand’s menu if something looks off.</Text>
          </>
        ) : null}

        {r && !r.found ? (
          <>
            <Notice tone="warn" icon="magnify-close">{`Couldn’t find published nutrition values for “${query}”. Many restaurants don’t publish them.`}</Notice>
            <Sources r={r} />
            <SearchSuggestions html={r.searchHtml} />
            <Button label="Photograph or type the values" icon="pencil-outline" onPress={onManual} />
            <Button label="Get an AI estimate instead" kind="ghost" icon="creation" onPress={onEstimate} />
          </>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

function Macro({ label, g, color }: { label: string; g: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: color }} />
      <Text style={[T.small, { flex: 1 }]}>{label}</Text>
      <Text style={[T.small, { fontFamily: F.bold, color: C.ink }]}>{fmt(g)} g</Text>
    </View>
  );
}

/** The pages the answer came from; they open in the browser. */
function Sources({ r }: { r: WebFind }) {
  if (!r.sources.length && !r.from) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text style={T.label}>{r.from ? `Source: ${r.from}` : 'Sources'}</Text>
      {r.sources.map((s) => (
        <Pressable key={s.uri} onPress={() => Linking.openURL(s.uri).catch(() => {})} style={styles.source} accessibilityRole="link">
          <Icon name="open-in-new" size={16} color={C.brand} />
          <Text style={[T.small, { color: C.brand, fontFamily: F.semi, flex: 1 }]} numberOfLines={1}>
            {s.title}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Google Search suggestions, which Google requires apps to show with answers grounded in Google
 * Search. They come as ready-made HTML; tapping one opens Google in the browser.
 */
function SearchSuggestions({ html }: { html: string | null }) {
  const [height, setHeight] = useState(60);
  if (!html) return null;
  const page = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:transparent">${html}<script>function h(){window.ReactNativeWebView.postMessage(String(document.body.scrollHeight))}window.addEventListener('load',h);setTimeout(h,300);</script></body></html>`;
  return (
    <View style={{ height, borderRadius: R.md, overflow: 'hidden' }}>
      <WebView
        source={{ html: page }}
        originWhitelist={['*']}
        style={{ backgroundColor: 'transparent' }}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        onMessage={(e) => {
          const v = Number(e.nativeEvent.data);
          if (v > 10 && v < 400) setHeight(Math.ceil(v));
        }}
        onShouldStartLoadWithRequest={(req) => {
          if (/^https?:/.test(req.url)) {
            Linking.openURL(req.url).catch(() => {});
            return false;
          }
          return true;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  busy: { alignItems: 'center', gap: 12, paddingVertical: 24, paddingHorizontal: 12 },
  values: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: C.card, borderRadius: R.lg, padding: 14, borderWidth: 1, borderColor: C.line },
  source: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
});
