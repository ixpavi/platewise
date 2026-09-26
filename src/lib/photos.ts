// Android / iOS: copy meal photos out of the picker's temporary cache into the app's document
// folder, which the system doesn't clear. Photos stay on the phone (they aren't uploaded).
import { Directory, File, Paths } from 'expo-file-system';

const dir = () => new Directory(Paths.document, 'meal-photos');

export async function keepPhoto(uri: string): Promise<string> {
  try {
    const d = dir();
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    const ext = (uri.split('?')[0].match(/\.(jpe?g|png|webp|heic)$/i)?.[1] ?? 'jpg').toLowerCase();
    const dest = new File(d, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
    await new File(uri).copy(dest);
    return dest.uri;
  } catch {
    // If the copy fails (storage full, odd URI) keep the original so logging still works.
    return uri;
  }
}

export function deletePhoto(uri: string) {
  try {
    if (!uri.includes('meal-photos')) return;
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Ignore: the photo may already be gone.
  }
}
