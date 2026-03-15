import { Exercise } from '../types/workout';

export type ExerciseNameLookup = Map<string, Exercise[]>;

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const normalizeBaseName = (value: string) => normalizeText(value.split(' - ')[0] || value);

const pushLookupValue = (
  lookup: ExerciseNameLookup,
  key: string,
  exercise: Exercise
) => {
  if (!key) return;
  const current = lookup.get(key);
  if (current) {
    current.push(exercise);
    return;
  }
  lookup.set(key, [exercise]);
};

const resolveVideoUrl = (exercise?: Exercise) =>
  exercise?.videoUrl1080 || exercise?.videoUrl720 || exercise?.videoUrl || '';

const resolveGifUrl = (exercise?: Exercise) => {
  if (!exercise) return '';
  const candidates = [exercise.gifUrl, exercise.fotoDoTreino];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value) continue;
    if (isGifMediaUrl(value) || /hipertrofia\.org/i.test(value)) {
      return value;
    }
  }
  return '';
};

export const isGifMediaUrl = (url?: string | null) => {
  const value = String(url || '').trim().toLowerCase();
  if (!value) return false;
  return (
    value.includes('.gif') ||
    value.includes('format=gif') ||
    value.includes('/gif/') ||
    value.includes('giphy.') ||
    value.includes('tenor.')
  );
};

export type ExerciseMediaKind = 'video' | 'gif' | 'none';

export interface ResolvedExerciseMedia {
  kind: ExerciseMediaKind;
  url?: string;
  videoUrl?: string;
  gifUrl?: string;
}

const resolveVideoQuality = (exercise: Exercise) => {
  if (exercise.videoUrl1080) return 3;
  if (exercise.videoUrl720) return 2;
  if (exercise.videoUrl) return 1;
  return 0;
};

const resolveAddedScore = (exercise: Exercise) => {
  const numeric = Number(exercise.adicionados);
  return Number.isFinite(numeric) ? numeric : 0;
};

const pickBestExercise = (
  candidates: Exercise[],
  rawName: string
): Exercise | undefined => {
  if (!candidates.length) return undefined;
  const normalizedRaw = normalizeText(rawName);
  const normalizedBase = normalizeBaseName(rawName);

  return [...candidates].sort((a, b) => {
    const nameA = normalizeText(a.nomeDoTreino || '');
    const nameB = normalizeText(b.nomeDoTreino || '');
    const baseA = normalizeBaseName(a.nomeDoTreino || '');
    const baseB = normalizeBaseName(b.nomeDoTreino || '');

    const exactNameA = nameA === normalizedRaw ? 1 : 0;
    const exactNameB = nameB === normalizedRaw ? 1 : 0;
    if (exactNameA !== exactNameB) return exactNameB - exactNameA;

    const exactBaseA = baseA === normalizedBase ? 1 : 0;
    const exactBaseB = baseB === normalizedBase ? 1 : 0;
    if (exactBaseA !== exactBaseB) return exactBaseB - exactBaseA;

    const qualityA = resolveVideoQuality(a);
    const qualityB = resolveVideoQuality(b);
    if (qualityA !== qualityB) return qualityB - qualityA;

    const addedA = resolveAddedScore(a);
    const addedB = resolveAddedScore(b);
    if (addedA !== addedB) return addedB - addedA;

    const distanceA = Math.abs(baseA.length - normalizedBase.length);
    const distanceB = Math.abs(baseB.length - normalizedBase.length);
    if (distanceA !== distanceB) return distanceA - distanceB;

    return (a.id || '').localeCompare(b.id || '');
  })[0];
};

export const buildExerciseNameLookup = (exercises: Exercise[]): ExerciseNameLookup => {
  const lookup: ExerciseNameLookup = new Map();
  exercises.forEach((exercise) => {
    const rawName = String(exercise.nomeDoTreino || '').trim();
    if (!rawName) return;
    const normalized = normalizeText(rawName);
    const normalizedBase = normalizeBaseName(rawName);
    pushLookupValue(lookup, normalized, exercise);
    if (normalizedBase && normalizedBase !== normalized) {
      pushLookupValue(lookup, normalizedBase, exercise);
    }
  });
  return lookup;
};

export const resolveExerciseByName = (
  rawName: string,
  lookup: ExerciseNameLookup
): Exercise | undefined => {
  const normalizedRaw = normalizeText(rawName || '');
  const normalizedBase = normalizeBaseName(rawName || '');
  const keys = [normalizedBase, normalizedRaw].filter(Boolean);

  for (const key of keys) {
    const matches = lookup.get(key) || [];
    if (!matches.length) continue;
    const selected = pickBestExercise(matches, rawName);
    if (selected) return selected;
  }

  return undefined;
};

export const resolveExerciseMediaFromExercise = (
  exercise?: Exercise | null,
  preferred: 'video' | 'gif' = 'video'
): ResolvedExerciseMedia => {
  const videoUrl = resolveVideoUrl(exercise || undefined) || undefined;
  const gifUrl = resolveGifUrl(exercise || undefined) || undefined;

  if (preferred === 'gif' && gifUrl) {
    return { kind: 'gif', url: gifUrl, videoUrl, gifUrl };
  }
  if (preferred === 'video' && videoUrl) {
    return { kind: 'video', url: videoUrl, videoUrl, gifUrl };
  }
  if (videoUrl) {
    return { kind: 'video', url: videoUrl, videoUrl, gifUrl };
  }
  if (gifUrl) {
    return { kind: 'gif', url: gifUrl, videoUrl, gifUrl };
  }
  return { kind: 'none', videoUrl, gifUrl };
};

export const resolveExerciseMediaByName = (
  rawName: string,
  storedUrl: string,
  lookup: ExerciseNameLookup
): ResolvedExerciseMedia => {
  const selected = resolveExerciseByName(rawName, lookup);
  const preferredFromStorage = isGifMediaUrl(storedUrl) ? 'gif' : 'video';
  const selectedMedia = resolveExerciseMediaFromExercise(selected, preferredFromStorage);
  const fallback = (storedUrl || '').trim();

  if (fallback) {
    if (isGifMediaUrl(fallback)) {
      const nextGif = selectedMedia.gifUrl || fallback;
      return {
        kind: 'gif',
        url: nextGif,
        videoUrl: selectedMedia.videoUrl,
        gifUrl: nextGif,
      };
    }

    const nextVideo = selectedMedia.videoUrl || fallback;
    return {
      kind: 'video',
      url: nextVideo,
      videoUrl: nextVideo,
      gifUrl: selectedMedia.gifUrl,
    };
  }

  return selectedMedia;
};

export const resolveExerciseVideoUrlByName = (
  rawName: string,
  storedUrl: string,
  lookup: ExerciseNameLookup
): string | undefined => {
  return resolveExerciseMediaByName(rawName, storedUrl, lookup).url;
};
