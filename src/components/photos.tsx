import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, RoundButton } from '@/components/ui';
import { C, F } from '@/theme';

/** A photo that quietly disappears if its file is missing (e.g. taken on another phone). */
export function Thumb({ uri, size = 64, onPress }: { uri: string; size?: number; onPress?: () => void }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel="Meal photo. Opens full screen" style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
      <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 14, backgroundColor: C.line2 }} onError={() => setBroken(true)} />
    </Pressable>
  );
}

export function PhotoStrip({ uris, onOpen }: { uris: string[]; onOpen: (uri: string) => void }) {
  if (!uris.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingBottom: 10 }}>
      {uris.map((u) => (
        <Thumb key={u} uri={u} onPress={() => onOpen(u)} />
      ))}
    </ScrollView>
  );
}

export function PhotoViewer({ uri, caption, onClose }: { uri: string | null; caption?: string; onClose: () => void }) {
  const [broken, setBroken] = useState(false);
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.viewer}>
        <View style={styles.bar}>
          <Text style={styles.caption} numberOfLines={2}>
            {caption ?? ''}
          </Text>
          <RoundButton icon="close" label="Close photo" bg="rgba(255,255,255,0.14)" color="#fff" onPress={onClose} />
        </View>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close photo">
          {uri && !broken ? (
            <Image source={{ uri }} style={{ flex: 1 }} resizeMode="contain" onError={() => setBroken(true)} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Icon name="image-off-outline" size={48} color="rgba(255,255,255,0.5)" />
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontFamily: F.medium }}>This photo is on another phone.</Text>
            </View>
          )}
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  caption: { flex: 1, color: '#fff', fontFamily: F.semi, fontSize: 15 },
});
