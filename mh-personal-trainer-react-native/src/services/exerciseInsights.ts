import AsyncStorage from '@react-native-async-storage/async-storage';
import { ExerciseInsights } from './ai';

const STORAGE_PREFIX = 'exercise_insights:';

function buildKey(exerciseId: string) {
  return `${STORAGE_PREFIX}${exerciseId}`;
}

export async function getExerciseInsights(
  exerciseId: string
): Promise<ExerciseInsights | null> {
  if (!exerciseId) return null;
  try {
    const raw = await AsyncStorage.getItem(buildKey(exerciseId));
    if (!raw) return null;
    return JSON.parse(raw) as ExerciseInsights;
  } catch {
    return null;
  }
}

export async function saveExerciseInsights(
  exerciseId: string,
  insights: ExerciseInsights
): Promise<void> {
  if (!exerciseId) return;
  const payload = JSON.stringify(insights);
  await AsyncStorage.setItem(buildKey(exerciseId), payload);
}
