import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase';

export interface WorkoutPartyLocation {
  latitude: number;
  longitude: number;
}

export interface WorkoutPartyPresencePayload {
  userId: string;
  workoutId: string;
  workoutName: string;
  userName: string;
  photoUrl?: string;
  role?: string;
  startedAtMs: number;
  elapsedSeconds: number;
  totalCargaKg: number;
  completedSets: number;
  isPaused: boolean;
  isActive: boolean;
  location?: WorkoutPartyLocation;
}

export interface WorkoutPartyPresence {
  userId: string;
  workoutId: string;
  workoutName: string;
  userName: string;
  photoUrl?: string;
  role?: string;
  startedAtMs: number;
  elapsedSeconds: number;
  totalCargaKg: number;
  completedSets: number;
  isPaused: boolean;
  isActive: boolean;
  score: number;
  location?: WorkoutPartyLocation;
  lastSeenAtMs: number;
  distanceMeters?: number;
}

const PARTY_COLLECTION = 'workout_party_presence';
const EARTH_RADIUS_METERS = 6371000;

const toMillis = (value: any): number => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'number') return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const clampNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const computeWorkoutPartyScore = (
  elapsedSeconds: number,
  totalCargaKg: number,
  completedSets: number
) => {
  const elapsedPenalty = Math.max(0, elapsedSeconds) * 0.12;
  const cargaPoints = Math.max(0, totalCargaKg) * 8;
  const setPoints = Math.max(0, completedSets) * 20;
  return Math.max(0, Math.round(cargaPoints + setPoints - elapsedPenalty));
};

export const distanceBetweenMeters = (
  a?: WorkoutPartyLocation,
  b?: WorkoutPartyLocation
) => {
  if (!a || !b) return undefined;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const deltaLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const deltaLon = ((b.longitude - a.longitude) * Math.PI) / 180;

  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_METERS * c;
};

export const upsertWorkoutPartyPresence = async (
  payload: WorkoutPartyPresencePayload
) => {
  const db = getFirebaseDb();
  const ref = doc(db, PARTY_COLLECTION, payload.userId);
  const score = computeWorkoutPartyScore(
    payload.elapsedSeconds,
    payload.totalCargaKg,
    payload.completedSets
  );

  await setDoc(
    ref,
    {
      userId: payload.userId,
      workoutId: payload.workoutId,
      workoutName: payload.workoutName,
      userName: payload.userName,
      photoUrl: payload.photoUrl || null,
      role: payload.role || null,
      startedAt: Timestamp.fromMillis(payload.startedAtMs),
      elapsedSeconds: Math.max(0, Math.floor(payload.elapsedSeconds)),
      totalCargaKg: Math.max(0, Number(payload.totalCargaKg || 0)),
      completedSets: Math.max(0, Math.floor(payload.completedSets || 0)),
      isPaused: !!payload.isPaused,
      isActive: !!payload.isActive,
      score,
      lastSeenAt: Timestamp.now(),
      location: payload.location || null,
    },
    { merge: true }
  );
};

export const leaveWorkoutPartyPresence = async (userId?: string | null) => {
  if (!userId) return;
  const db = getFirebaseDb();
  const ref = doc(db, PARTY_COLLECTION, userId);
  await deleteDoc(ref);
};

export const watchWorkoutPartyPresence = (
  workoutId: string,
  onUpdate: (items: WorkoutPartyPresence[]) => void,
  onError?: (error: Error) => void
) => {
  const db = getFirebaseDb();
  const ref = collection(db, PARTY_COLLECTION);
  const q = query(
    ref,
    where('workoutId', '==', workoutId),
    where('isActive', '==', true)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((item) => {
        const data: any = item.data();
        return {
          userId: String(data.userId || item.id),
          workoutId: String(data.workoutId || ''),
          workoutName: String(data.workoutName || ''),
          userName: String(data.userName || 'Aluno'),
          photoUrl: data.photoUrl || undefined,
          role: data.role || undefined,
          startedAtMs: toMillis(data.startedAt),
          elapsedSeconds: clampNumber(data.elapsedSeconds, 0),
          totalCargaKg: clampNumber(data.totalCargaKg, 0),
          completedSets: clampNumber(data.completedSets, 0),
          isPaused: !!data.isPaused,
          isActive: !!data.isActive,
          score: clampNumber(data.score, 0),
          location:
            data?.location &&
            Number.isFinite(Number(data.location.latitude)) &&
            Number.isFinite(Number(data.location.longitude))
              ? {
                  latitude: Number(data.location.latitude),
                  longitude: Number(data.location.longitude),
                }
              : undefined,
          lastSeenAtMs: toMillis(data.lastSeenAt),
        } as WorkoutPartyPresence;
      });
      onUpdate(items);
    },
    (error) => {
      if (onError) {
        onError(error as Error);
      }
    }
  );
};

export const rankWorkoutPartyPresence = (
  participants: WorkoutPartyPresence[],
  options: {
    myUserId: string;
    myLocation?: WorkoutPartyLocation;
    maxDistanceMeters?: number;
    staleAfterSeconds?: number;
  }
) => {
  const now = Date.now();
  const staleLimitMs = (options.staleAfterSeconds ?? 90) * 1000;
  const maxDistance = options.maxDistanceMeters ?? 400;

  const filtered = participants
    .map((item) => {
      const distance = distanceBetweenMeters(options.myLocation, item.location);
      return { ...item, distanceMeters: distance };
    })
    .filter((item) => {
      if (!item.isActive) return false;
      if (now - item.lastSeenAtMs > staleLimitMs) return false;
      if (item.userId === options.myUserId) return true;
      if (item.distanceMeters === undefined) return true;
      return item.distanceMeters <= maxDistance;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.totalCargaKg !== a.totalCargaKg) return b.totalCargaKg - a.totalCargaKg;
      if (b.completedSets !== a.completedSets) return b.completedSets - a.completedSets;
      if (a.elapsedSeconds !== b.elapsedSeconds) return a.elapsedSeconds - b.elapsedSeconds;
      return a.userName.localeCompare(b.userName);
    });

  const myPosition =
    filtered.findIndex((item) => item.userId === options.myUserId) + 1 || null;

  return {
    participants: filtered,
    myPosition,
  };
};

