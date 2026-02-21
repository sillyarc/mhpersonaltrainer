import * as FileSystem from 'expo-file-system';

const videoCache = new Map<string, string>();

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString();
}

function getFileExtension(url: string) {
  const clean = url.split('?')[0];
  const parts = clean.split('.');
  if (parts.length < 2) return 'mp4';
  const ext = parts.pop() || 'mp4';
  return ext.toLowerCase();
}

async function ensureVideoCacheDir() {
  const baseDir = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}videos/` : null;
  if (!baseDir) return null;
  const info = await FileSystem.getInfoAsync(baseDir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
  }
  return baseDir;
}

export async function getCachedVideoUri(url: string): Promise<string | null> {
  if (!url) return null;
  if (videoCache.has(url)) return videoCache.get(url) || null;
  const baseDir = await ensureVideoCacheDir();
  if (!baseDir) return null;
  const extension = getFileExtension(url);
  const fileName = `${hashString(url)}.${extension}`;
  const fileUri = `${baseDir}${fileName}`;
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) {
    await FileSystem.downloadAsync(url, fileUri);
  }
  videoCache.set(url, fileUri);
  return fileUri;
}
