import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { parseDateString } from '../utils/date';
import {
  AerobicWorkout,
  AerobicWorkoutItem,
  Exercise,
  UserWorkout,
  Workout,
  WorkoutExercise,
  WorkoutProgress,
  ExerciseProgress,
} from '../types/workout';

interface QueryResult<T> {
  data: T | null;
  error: string | null;
}

const coerceDate = (value: any): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (value.toDate) return value.toDate();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const parsedString = parseDateString(value);
    if (parsedString) return parsedString;
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const coerceTimestamp = (value?: Date): Timestamp | undefined =>
  value ? Timestamp.fromDate(value) : undefined;

const coerceStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
};

const stripUndefinedDeep = (value: any): any => {
  if (value === undefined) return undefined;
  if (value instanceof Date || value instanceof Timestamp) return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    const next: Record<string, any> = {};
    Object.entries(value).forEach(([key, item]) => {
      const sanitized = stripUndefinedDeep(item);
      if (sanitized !== undefined) {
        next[key] = sanitized;
      }
    });
    return next;
  }
  return value;
};

const normalizeRemoteUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
};

const isGifLikeUrl = (url: string) =>
  /\.gif($|[?#])/i.test(url) ||
  /[?&](?:format|fm)=gif/i.test(url) ||
  /\/gif\//i.test(url) ||
  /(giphy|tenor)\./i.test(url);

const isHypertrofiaUrl = (url: string) => /hipertrofia\.org/i.test(url);

const resolveGifUrlFromRecord = (data: Record<string, any>): string | undefined => {
  const candidates = [
    data.gifUrl,
    data.gifURL,
    data.gif_url,
    data.gif,
    data.linkGif,
    data.hypertrofiaGifUrl,
    data.fotoDoTreino,
    data.thumbnail,
    data.image,
    data.imagem,
  ];

  for (const candidate of candidates) {
    const url = normalizeRemoteUrl(candidate);
    if (!url) continue;
    if (isGifLikeUrl(url) || isHypertrofiaUrl(url)) return url;
  }

  return undefined;
};

export async function fetchWorkouts(userId: string): Promise<QueryResult<Workout[]>> {
  try {
    const workoutsRef = collection(db, 'treinos');
    const q = query(
      workoutsRef,
      where('uid', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    
    const workouts: Workout[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
    })) as Workout[];
    
    return { data: workouts, error: null };
  } catch (error: any) {
    try {
      const workoutsRef = collection(db, 'treinos');
      const q = query(workoutsRef, where('uid', '==', userId));
      const snapshot = await getDocs(q);
      const workouts: Workout[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
      })) as Workout[];
      workouts.sort((a, b) => {
        const aTime = a.createdAt?.getTime?.() || 0;
        const bTime = b.createdAt?.getTime?.() || 0;
        return bTime - aTime;
      });
      return { data: workouts, error: null };
    } catch (fallbackError: any) {
      return { data: null, error: fallbackError.message || error.message };
    }
  }
}

export async function fetchWorkoutById(workoutId: string): Promise<QueryResult<Workout>> {
  try {
    const docRef = doc(db, 'treinos', workoutId);
    const snapshot = await getDoc(docRef);
    
    if (!snapshot.exists()) {
      return { data: null, error: 'Workout not found' };
    }
    
    const workout: Workout = {
      id: snapshot.id,
      ...snapshot.data(),
      createdAt: snapshot.data().createdAt?.toDate(),
      updatedAt: snapshot.data().updatedAt?.toDate(),
    } as Workout;
    
    return { data: workout, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function createWorkout(
  workout: Omit<Workout, 'id' | 'createdAt' | 'updatedAt'>
): Promise<QueryResult<Workout>> {
  try {
    const workoutsRef = collection(db, 'treinos');
    const docRef = await addDoc(workoutsRef, {
      ...workout,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    
    const newWorkout: Workout = {
      id: docRef.id,
      ...workout,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    return { data: newWorkout, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function updateWorkout(
  workoutId: string,
  updates: Partial<Workout>
): Promise<QueryResult<void>> {
  try {
    const docRef = doc(db, 'treinos', workoutId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    });
    
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function deleteWorkout(workoutId: string): Promise<QueryResult<void>> {
  try {
    const docRef = doc(db, 'treinos', workoutId);
    await deleteDoc(docRef);
    
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function fetchWorkoutExercises(workoutId: string): Promise<QueryResult<WorkoutExercise[]>> {
  try {
    const exercisesRef = collection(db, 'treinos', workoutId, 'exercicios');
    const snapshot = await getDocs(exercisesRef);
    
    const exercises: WorkoutExercise[] = snapshot.docs.map(doc => ({
      exerciseId: doc.id,
      ...doc.data(),
    })) as WorkoutExercise[];
    
    return { data: exercises, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function addExerciseToWorkout(
  workoutId: string,
  exercise: WorkoutExercise
): Promise<QueryResult<WorkoutExercise>> {
  try {
    const exercisesRef = collection(db, 'treinos', workoutId, 'exercicios');
    const docRef = await addDoc(exercisesRef, exercise);
    
    return { 
      data: { ...exercise, exerciseId: docRef.id }, 
      error: null 
    };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function removeExerciseFromWorkout(
  workoutId: string,
  exerciseId: string
): Promise<QueryResult<void>> {
  try {
    const docRef = doc(db, 'treinos', workoutId, 'exercicios', exerciseId);
    await deleteDoc(docRef);
    
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function saveWorkoutProgress(
  progress: Omit<WorkoutProgress, 'id'>
): Promise<QueryResult<WorkoutProgress>> {
  try {
    const progressRef = collection(db, 'workout_logs');
    const docRef = await addDoc(progressRef, {
      ...progress,
      date: Timestamp.fromDate(progress.date),
    });
    
    return { 
      data: { id: docRef.id, ...progress }, 
      error: null 
    };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function fetchWorkoutProgress(
  userId: string,
  workoutId?: string
): Promise<QueryResult<WorkoutProgress[]>> {
  try {
    const progressRef = collection(db, 'workout_logs');
    let q = query(progressRef, where('userId', '==', userId), orderBy('date', 'desc'));
    
    if (workoutId) {
      q = query(
        progressRef,
        where('userId', '==', userId),
        where('workoutId', '==', workoutId),
        orderBy('date', 'desc')
      );
    }
    
    const snapshot = await getDocs(q);
    
    const progress: WorkoutProgress[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate(),
    })) as WorkoutProgress[];
    
    return { data: progress, error: null };
  } catch (error: any) {
    try {
      const progressRef = collection(db, 'workout_logs');
      let q = query(progressRef, where('userId', '==', userId));

      if (workoutId) {
        q = query(progressRef, where('userId', '==', userId), where('workoutId', '==', workoutId));
      }

      const snapshot = await getDocs(q);
      const progress: WorkoutProgress[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate(),
      })) as WorkoutProgress[];
      progress.sort((a, b) => {
        const aTime = a.date?.getTime?.() || 0;
        const bTime = b.date?.getTime?.() || 0;
        return bTime - aTime;
      });
      return { data: progress, error: null };
    } catch (fallbackError: any) {
      return { data: null, error: fallbackError.message || error.message };
    }
  }
}

export async function fetchAvailableExercises(category?: string): Promise<QueryResult<Exercise[]>> {
  try {
    const exercisesRef = collection(db, 'treinors');
    let q = query(exercisesRef);
    
    if (category) {
      q = query(exercisesRef, where('colecao', '==', category));
    }
    
    const snapshot = await getDocs(q);
    
    const exercises = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        nomeDoTreino: data.treinosNoLIst || data.nomeDoTreino || 'Exercicio',
        colecao: data.colecao || 'geral',
        videoUrl: normalizeRemoteUrl(data.videoUrl),
        videoUrl1080: normalizeRemoteUrl(data.videoUrl1080),
        videoUrl720: normalizeRemoteUrl(data.videoUrl720),
        gifUrl: resolveGifUrlFromRecord(data),
        fotoDoTreino: data.fotoDoTreino,
        seriesRep: data.seriesRep,
        carga: data.carga,
        intervalo: data.intervalo,
        adicionados: data.Adicionados,
      } as Exercise;
    });

    return { data: exercises, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function fetchExerciseById(exerciseId: string): Promise<QueryResult<Exercise>> {
  try {
    const ref = doc(db, 'treinors', exerciseId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return { data: null, error: 'Exerc\u00edcio n\u00e3o encontrado' };
    }
    const data = snapshot.data();
    const exercise: Exercise = {
      id: snapshot.id,
      nomeDoTreino: data.treinosNoLIst || data.nomeDoTreino || 'Exercicio',
      colecao: data.colecao || 'geral',
      videoUrl: normalizeRemoteUrl(data.videoUrl),
      videoUrl1080: normalizeRemoteUrl(data.videoUrl1080),
      videoUrl720: normalizeRemoteUrl(data.videoUrl720),
      gifUrl: resolveGifUrlFromRecord(data),
      fotoDoTreino: data.fotoDoTreino,
      seriesRep: data.seriesRep,
      carga: data.carga,
      intervalo: data.intervalo,
      adicionados: data.Adicionados,
    };
    return { data: exercise, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function fetchUserWorkouts(
  userId: string,
  archived = false
): Promise<QueryResult<UserWorkout[]>> {
  try {
    const workoutsRef = collection(db, 'users', userId, 'createTreinos');
    const q = query(
      workoutsRef,
      orderBy('nomeDoTreino', 'desc')
    );
    const snapshot = await getDocs(q);
    const workouts: UserWorkout[] = snapshot.docs.map(doc => ({
      id: doc.id,
      nomeDoTreino: doc.data().nomeDoTreino || 'Treino',
      obsInstrucao: doc.data().obsInstrucao,
      personalId: typeof doc.data().personalId === 'string' ? doc.data().personalId : undefined,
      treino: doc.data().treino || [],
      seriesRep: doc.data().seriesRep || [],
      repeticoes: doc.data().repeticoes || [],
      carga: doc.data().carga || [],
      intervalo: doc.data().intervalo || [],
      videoUrls: doc.data().videoUrls || [],
      arquivos: doc.data().arquivos === true || doc.data().arquivos === 'true',
      diasDaSemana: doc.data().diasDaSemana || [],
      lastCompletedAt: doc.data().lastCompletedAt?.toDate?.() || (doc.data().lastCompletedAt ? new Date(doc.data().lastCompletedAt) : undefined),
      lastSessionAt: doc.data().lastSessionAt?.toDate?.() || (doc.data().lastSessionAt ? new Date(doc.data().lastSessionAt) : undefined),
      lastSessionStatus: doc.data().lastSessionStatus,
      lastSessionRemainingExercises: Number(doc.data().lastSessionRemainingExercises || 0),
      lastSessionSkippedExerciseIds: coerceStringArray(doc.data().lastSessionSkippedExerciseIds),
      data: coerceDate(doc.data().data),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
    }));
    const filtered = workouts.filter((workout) =>
      archived ? workout.arquivos === true : workout.arquivos !== true
    );
    return { data: filtered, error: null };
  } catch (error: any) {
    try {
      const workoutsRef = collection(db, 'users', userId, 'createTreinos');
      const q = query(workoutsRef);
      const snapshot = await getDocs(q);
      const workouts: UserWorkout[] = snapshot.docs.map(doc => ({
        id: doc.id,
        nomeDoTreino: doc.data().nomeDoTreino || 'Treino',
        obsInstrucao: doc.data().obsInstrucao,
        personalId: typeof doc.data().personalId === 'string' ? doc.data().personalId : undefined,
        treino: doc.data().treino || [],
        seriesRep: doc.data().seriesRep || [],
        repeticoes: doc.data().repeticoes || [],
        carga: doc.data().carga || [],
        intervalo: doc.data().intervalo || [],
        videoUrls: doc.data().videoUrls || [],
        arquivos: doc.data().arquivos === true || doc.data().arquivos === 'true',
        diasDaSemana: doc.data().diasDaSemana || [],
        lastCompletedAt: doc.data().lastCompletedAt?.toDate?.() || (doc.data().lastCompletedAt ? new Date(doc.data().lastCompletedAt) : undefined),
        lastSessionAt: doc.data().lastSessionAt?.toDate?.() || (doc.data().lastSessionAt ? new Date(doc.data().lastSessionAt) : undefined),
        lastSessionStatus: doc.data().lastSessionStatus,
        lastSessionRemainingExercises: Number(doc.data().lastSessionRemainingExercises || 0),
        lastSessionSkippedExerciseIds: coerceStringArray(doc.data().lastSessionSkippedExerciseIds),
        data: coerceDate(doc.data().data),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
      }));
      const filtered = workouts.filter((workout) =>
        archived ? workout.arquivos === true : workout.arquivos !== true
      );
      filtered.sort((a, b) => {
        const aName = (a.nomeDoTreino || '').toLowerCase();
        const bName = (b.nomeDoTreino || '').toLowerCase();
        return bName.localeCompare(aName);
      });
      return { data: filtered, error: null };
    } catch (fallbackError: any) {
      return { data: null, error: fallbackError.message || error.message };
    }
  }
}

export async function fetchUserWorkoutById(
  userId: string,
  workoutId: string
): Promise<QueryResult<UserWorkout>> {
  try {
    const ref = doc(db, 'users', userId, 'createTreinos', workoutId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return { data: null, error: 'Treino n\u00e3o encontrado' };
    }
    const data = snapshot.data();
    const workout: UserWorkout = {
      id: snapshot.id,
      nomeDoTreino: data.nomeDoTreino || 'Treino',
      obsInstrucao: data.obsInstrucao,
      personalId: typeof data.personalId === 'string' ? data.personalId : undefined,
      treino: data.treino || [],
      seriesRep: data.seriesRep || [],
      repeticoes: data.repeticoes || [],
      carga: data.carga || [],
      intervalo: data.intervalo || [],
      videoUrls: data.videoUrls || [],
      arquivos: data.arquivos === true || data.arquivos === 'true',
      diasDaSemana: data.diasDaSemana || [],
      lastCompletedAt: data.lastCompletedAt?.toDate?.() || (data.lastCompletedAt ? new Date(data.lastCompletedAt) : undefined),
      lastSessionAt: data.lastSessionAt?.toDate?.() || (data.lastSessionAt ? new Date(data.lastSessionAt) : undefined),
      lastSessionStatus: data.lastSessionStatus,
      lastSessionRemainingExercises: Number(data.lastSessionRemainingExercises || 0),
      lastSessionSkippedExerciseIds: coerceStringArray(data.lastSessionSkippedExerciseIds),
      data: coerceDate(data.data),
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate(),
    };
    return { data: workout, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function createUserWorkout(
  userId: string,
  workout: Omit<UserWorkout, 'id'>
): Promise<QueryResult<UserWorkout>> {
  try {
    const workoutsRef = collection(db, 'users', userId, 'createTreinos');
    const payload: any = {
      ...workout,
      ...(workout.personalId ? { personalId: workout.personalId } : {}),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    if (workout.data) {
      payload.data = coerceTimestamp(workout.data);
    }
    if (workout.lastCompletedAt) {
      payload.lastCompletedAt = Timestamp.fromDate(workout.lastCompletedAt);
    }
    if (workout.lastSessionAt) {
      payload.lastSessionAt = Timestamp.fromDate(workout.lastSessionAt);
    }
    const docRef = await addDoc(workoutsRef, payload);

    return {
      data: { id: docRef.id, ...workout, createdAt: new Date(), updatedAt: new Date() },
      error: null,
    };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function updateUserWorkout(
  userId: string,
  workoutId: string,
  updates: Partial<UserWorkout>
): Promise<QueryResult<void>> {
  try {
    const ref = doc(db, 'users', userId, 'createTreinos', workoutId);
    const payload: any = stripUndefinedDeep({
      ...updates,
      updatedAt: Timestamp.now(),
    });
    if (updates.data) {
      payload.data = coerceTimestamp(updates.data);
    }
    if (updates.lastCompletedAt) {
      payload.lastCompletedAt = Timestamp.fromDate(updates.lastCompletedAt);
    }
    if (updates.lastSessionAt) {
      payload.lastSessionAt = Timestamp.fromDate(updates.lastSessionAt);
    }
    await updateDoc(ref, payload);
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function archiveUserWorkout(
  userId: string,
  workoutId: string,
  archived: boolean
): Promise<QueryResult<void>> {
  return updateUserWorkout(userId, workoutId, { arquivos: archived });
}


const normalizeAerobicItems = (data: any): AerobicWorkoutItem[] => {
  const items = Array.isArray(data?.items) ? data.items : null;
  if (items) {
    return items
      .map((item: any) => ({
        nome: String(item?.nome || item?.treino || '').trim(),
        series: item?.series !== undefined ? Number(item.series) : undefined,
        repeticoes: item?.repeticoes !== undefined ? Number(item.repeticoes) : undefined,
        carga: item?.carga !== undefined ? Number(item.carga) : undefined,
      }))
      .filter((item: AerobicWorkoutItem) => item.nome);
  }
  const treinos = Array.isArray(data?.treinos)
    ? data.treinos
    : Array.isArray(data?.treino)
    ? data.treino
    : data?.treino
    ? String(data.treino)
        .split('\n')
        .map((item: string) => item.trim())
        .filter(Boolean)
    : [];
  return treinos.map((nome: string) => ({ nome }));
};


export async function fetchAerobicWorkouts(
  userId: string
): Promise<QueryResult<AerobicWorkout[]>> {
  try {
    const ref = collection(db, 'users', userId, 'treinoaerobico');
    const snapshot = await getDocs(ref);
    const workouts: AerobicWorkout[] = snapshot.docs.map(doc => {
      const data = doc.data();
      const items = normalizeAerobicItems(data);
      return {
        id: doc.id,
        personalId: typeof data.personalId === 'string' ? data.personalId : undefined,
        items,
        treinos: items.map((item) => item.nome),
        treino: data.treino || items[0]?.nome || undefined,
        aquecimento: data.aquecimento,
        voltaacalma: data.voltaacalma,
        observacoes: data.observacoes,
        lastCompletedAt:
          data.lastCompletedAt?.toDate?.() ||
          (data.lastCompletedAt ? new Date(data.lastCompletedAt) : undefined),
        data: coerceDate(data.data),
        createdAt: data.createdAt?.toDate?.(),
        updatedAt: data.updatedAt?.toDate?.(),
      };
    });
    return { data: workouts, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}


export async function createAerobicWorkout(
  userId: string,
  workout: Omit<AerobicWorkout, 'id'>
): Promise<QueryResult<AerobicWorkout>> {
  try {
    const ref = collection(db, 'users', userId, 'treinoaerobico');
    const items = workout.items || (workout.treinos || []).map((nome) => ({ nome }));
    const treinos = items.map((item) => item.nome);
    const payload: any = stripUndefinedDeep({
      ...workout,
      personalId: workout.personalId || undefined,
      items,
      treinos,
      treino: workout.treino || treinos[0] || '',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    if (workout.data) {
      payload.data = coerceTimestamp(workout.data);
    }
    if (workout.lastCompletedAt) {
      payload.lastCompletedAt = Timestamp.fromDate(workout.lastCompletedAt);
    }
    const docRef = await addDoc(ref, payload);
    return {
      data: {
        id: docRef.id,
        ...workout,
        items,
        treinos,
        treino: payload.treino,
        lastCompletedAt: workout.lastCompletedAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      error: null,
    };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}


export async function fetchAerobicWorkoutById(
  userId: string,
  workoutId: string
): Promise<QueryResult<AerobicWorkout>> {
  try {
    const ref = doc(db, 'users', userId, 'treinoaerobico', workoutId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return { data: null, error: 'Treino aer\u00f3bico n\u00e3o encontrado.' };
    }
    const data = snapshot.data();
    const items = normalizeAerobicItems(data);
    const treinos = items.map((item) => item.nome);
    return {
      data: {
        id: snapshot.id,
        personalId: typeof data.personalId === 'string' ? data.personalId : undefined,
        items,
        treinos,
        treino: typeof data.treino === 'string' ? data.treino : treinos[0] || '',
        aquecimento: data.aquecimento,
        voltaacalma: data.voltaacalma,
        observacoes: data.observacoes,
        lastCompletedAt:
          data.lastCompletedAt?.toDate?.() ||
          (data.lastCompletedAt ? new Date(data.lastCompletedAt) : undefined),
        data: coerceDate(data.data),
        createdAt: data.createdAt?.toDate?.(),
        updatedAt: data.updatedAt?.toDate?.(),
      },
      error: null,
    };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}


export async function updateAerobicWorkout(
  userId: string,
  workoutId: string,
  updates: Partial<AerobicWorkout>
): Promise<QueryResult<void>> {
  try {
    const ref = doc(db, 'users', userId, 'treinoaerobico', workoutId);
    const items = updates.items || (updates.treinos || []).map((nome) => ({ nome }));
    const treinos = items.length ? items.map((item) => item.nome) : updates.treinos;
    const payload: any = stripUndefinedDeep({
      ...updates,
      ...(items.length ? { items, treinos, treino: updates.treino || treinos?.[0] || '' } : {}),
      updatedAt: Timestamp.now(),
    });
    if (updates.data) {
      payload.data = coerceTimestamp(updates.data);
    }
    if (updates.lastCompletedAt) {
      payload.lastCompletedAt = Timestamp.fromDate(updates.lastCompletedAt);
    }
    await updateDoc(ref, payload);
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}
