'use client';

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
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(buildKey(exerciseId));
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
  if (typeof window === 'undefined') return;
  const payload = JSON.stringify(insights);
  window.localStorage.setItem(buildKey(exerciseId), payload);
}
