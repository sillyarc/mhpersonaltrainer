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

export async function fetchAvailableExercises(category?: string): Promise<QueryResult<any[]>> {
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
        videoUrl: data.videoUrl,
        videoUrl1080: data.videoUrl1080,
        videoUrl720: data.videoUrl720,
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
      return { data: null, error: 'Exercício não encontrado' };
    }
    const data = snapshot.data();
    const exercise: Exercise = {
      id: snapshot.id,
      nomeDoTreino: data.treinosNoLIst || data.nomeDoTreino || 'Exercicio',
      colecao: data.colecao || 'geral',
      videoUrl: data.videoUrl,
      videoUrl1080: data.videoUrl1080,
      videoUrl720: data.videoUrl720,
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
      treino: doc.data().treino || [],
      seriesRep: doc.data().seriesRep || [],
      repeticoes: doc.data().repeticoes || [],
      carga: doc.data().carga || [],
      intervalo: doc.data().intervalo || [],
      videoUrls: doc.data().videoUrls || [],
      arquivos: doc.data().arquivos === true || doc.data().arquivos === 'true',
      diasDaSemana: doc.data().diasDaSemana || [],
      lastCompletedAt: doc.data().lastCompletedAt?.toDate?.() || (doc.data().lastCompletedAt ? new Date(doc.data().lastCompletedAt) : undefined),
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
        treino: doc.data().treino || [],
        seriesRep: doc.data().seriesRep || [],
        repeticoes: doc.data().repeticoes || [],
        carga: doc.data().carga || [],
        intervalo: doc.data().intervalo || [],
        videoUrls: doc.data().videoUrls || [],
        arquivos: doc.data().arquivos === true || doc.data().arquivos === 'true',
        diasDaSemana: doc.data().diasDaSemana || [],
        lastCompletedAt: doc.data().lastCompletedAt?.toDate?.() || (doc.data().lastCompletedAt ? new Date(doc.data().lastCompletedAt) : undefined),
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
      return { data: null, error: 'Treino não encontrado' };
    }
    const data = snapshot.data();
    const workout: UserWorkout = {
      id: snapshot.id,
      nomeDoTreino: data.nomeDoTreino || 'Treino',
      obsInstrucao: data.obsInstrucao,
      treino: data.treino || [],
      seriesRep: data.seriesRep || [],
      repeticoes: data.repeticoes || [],
      carga: data.carga || [],
      intervalo: data.intervalo || [],
      videoUrls: data.videoUrls || [],
      arquivos: data.arquivos === true || data.arquivos === 'true',
      diasDaSemana: data.diasDaSemana || [],
      lastCompletedAt: data.lastCompletedAt?.toDate?.() || (data.lastCompletedAt ? new Date(data.lastCompletedAt) : undefined),
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
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    if (workout.data) {
      payload.data = coerceTimestamp(workout.data);
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
    const payload: any = {
      ...updates,
      updatedAt: Timestamp.now(),
    };
    if (updates.data) {
      payload.data = coerceTimestamp(updates.data);
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
        items,
        treinos: items.map((item) => item.nome),
        treino: data.treino || items[0]?.nome || undefined,
        aquecimento: data.aquecimento,
        voltaacalma: data.voltaacalma,
        observacoes: data.observacoes,
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
    const payload: any = {
      ...workout,
      items,
      treinos,
      treino: workout.treino || treinos[0] || '',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    if (workout.data) {
      payload.data = coerceTimestamp(workout.data);
    }
    const docRef = await addDoc(ref, payload);
    return {
      data: {
        id: docRef.id,
        ...workout,
        items,
        treinos,
        treino: payload.treino,
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
      return { data: null, error: 'Treino aer?bico n?o encontrado.' };
    }
    const data = snapshot.data();
    const items = normalizeAerobicItems(data);
    const treinos = items.map((item) => item.nome);
    return {
      data: {
        id: snapshot.id,
        items,
        treinos,
        treino: typeof data.treino === 'string' ? data.treino : treinos[0] || '',
        aquecimento: data.aquecimento,
        voltaacalma: data.voltaacalma,
        observacoes: data.observacoes,
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
    const payload: any = {
      ...updates,
      ...(items.length ? { items, treinos, treino: updates.treino || treinos?.[0] || '' } : {}),
      updatedAt: Timestamp.now(),
    };
    if (updates.data) {
      payload.data = coerceTimestamp(updates.data);
    }
    await updateDoc(ref, payload);
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}
