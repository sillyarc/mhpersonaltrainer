import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { StudentEvolutionInsights } from './ai';

interface QueryResult<T> {
  data: T | null;
  error: string | null;
}

export interface StoredWorkoutInsights {
  id: string;
  userId: string;
  workoutId: string;
  version: string;
  source: 'openrouter' | 'cached';
  generatedAt?: Date;
  updatedAt?: Date;
  data: StudentEvolutionInsights;
  context?: string;
  statsSnapshot?: Record<string, any>;
  evaluationSnapshot?: Record<string, any>;
}

const buildDocId = (workoutId: string) => `workout_${workoutId}`;

export async function getWorkoutInsights(
  userId: string,
  workoutId: string
): Promise<QueryResult<StoredWorkoutInsights>> {
  try {
    if (!userId || !workoutId) return { data: null, error: null };
    const ref = doc(db, 'users', userId, 'insights', buildDocId(workoutId));
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return { data: null, error: null };
    }
    const data = snapshot.data();
    return {
      data: {
        id: snapshot.id,
        userId,
        workoutId,
        version: data.version || '',
        source: data.source === 'openrouter' ? 'openrouter' : 'cached',
        generatedAt: data.generatedAt?.toDate?.() || data.generatedAt || undefined,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || undefined,
        data: data.data as StudentEvolutionInsights,
        context: data.context,
        statsSnapshot: data.statsSnapshot,
        evaluationSnapshot: data.evaluationSnapshot,
      },
      error: null,
    };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function saveWorkoutInsights(params: {
  userId: string;
  workoutId: string;
  version: string;
  source: 'openrouter' | 'cached';
  data: StudentEvolutionInsights;
  context?: string;
  statsSnapshot?: Record<string, any>;
  evaluationSnapshot?: Record<string, any>;
}): Promise<QueryResult<void>> {
  try {
    if (!params.userId || !params.workoutId) return { data: null, error: 'Missing ids' };
    const ref = doc(db, 'users', params.userId, 'insights', buildDocId(params.workoutId));
    await setDoc(
      ref,
      {
        userId: params.userId,
        workoutId: params.workoutId,
        version: params.version,
        source: params.source,
        data: params.data,
        context: params.context,
        statsSnapshot: params.statsSnapshot,
        evaluationSnapshot: params.evaluationSnapshot,
        updatedAt: serverTimestamp(),
        generatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}
