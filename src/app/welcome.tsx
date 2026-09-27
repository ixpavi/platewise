import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo } from '@/components/Logo';
import { Button, Icon, LightStatusBar } from '@/components/ui';
import { C, F, T } from '@/theme';

const SLIDES = [
  { icon: 'camera-iris', tint: C.citrus, title: 'Scan your food', body: 'Take or upload a photo of your food. Platewise identifies it and shows the calories and nutrition, in katoris, rotis and pieces, not just grams.' },
  { icon: 'chart-donut', tint: C.brand, title: 'Know your numbers', body: 'A daily calorie budget built from your body and goal, with carbs, protein, fat and fibre tracked for you.' },
  { icon: 'barcode-scan', tint: C.coach, title: 'Scan the packet', body: 'Point the camera at a barcode to get calories and nutrition for packaged food, from biscuits to namkeen.' },
];

export default function Welcome() {
  const { width } = useWindowDimensions();
  const w = Math.min(width, 520);
  const [index, setIndex] = useState(0);
  const [slotH, setSlotH] = useState(0);
  const list = useRef<FlatList>(null);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / w));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.brandDeep }}>
      <LightStatusBar />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingTop: 12 }}>
        <Logo size={30} ring="#fff" />
        <Text style={{ fontFamily: F.displayHeavy, fontSize: 22, color: '#fff', letterSpacing: -0.5 }}>platewise</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center' }} onLayout={(e) => setSlotH(Math.round(e.nativeEvent.layout.height))}>
        {slotH > 0 && <FlatList
          ref={list}
          data={SLIDES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          onScroll={onScroll}
          scrollEventThrottle={32}
          style={{ width: w, height: slotH }}
          getItemLayout={(_, i) => ({ length: w, offset: w * i, index: i })}
          keyExtractor={(s) => s.title}
          renderItem={({ item }) => (
            <View style={{ width: w, height: slotH, paddingHorizontal: 28, justifyContent: 'center' }}>
              <View style={[styles.art, { backgroundColor: item.tint }]}>
                <View style={styles.artRing} />
                <Icon name={item.icon} size={76} color={item.tint === C.citrus ? C.citrusInk : '#fff'} />
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </View>
          )}
        />}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
        {SLIDES.map((s, i) => (
          <View key={s.title} style={{ width: i === index ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: i === index ? C.citrus : 'rgba(255,255,255,0.3)' }} />
        ))}
      </View>
      <View style={{ paddingHorizontal: 22, paddingBottom: 18, gap: 10, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
        <Button label="Get started" kind="citrus" onPress={() => router.push({ pathname: '/auth', params: { mode: 'signup' } })} />
        <Button label="I already have an account" kind="textOnDark" style={{ minHeight: 44 }} onPress={() => router.push({ pathname: '/auth', params: { mode: 'login' } })} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  art: { width: 190, height: 190, borderRadius: 60, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 40, overflow: 'hidden' },
  artRing: { position: 'absolute', width: 260, height: 260, borderRadius: 130, borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)', right: -90, top: -90 },
  title: { ...T.h1, color: '#fff', fontSize: 32, textAlign: 'center' },
  body: { fontFamily: F.body, fontSize: 16, lineHeight: 23, color: 'rgba(255,255,255,0.78)', textAlign: 'center', marginTop: 12 },
});
