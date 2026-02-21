import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  increment,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebaseClient';
import type { AssistantSuggestionTile } from './ai';

export interface AssistantSuggestionsContext {
  studentGoal?: string;
  evaluationType?: string;
  studentLabel?: string;
}

export interface AssistantSuggestionsCache {
  quickPrompts: string[];
  tiles: AssistantSuggestionTile[];
  updatedAt: Date | null;
  context?: AssistantSuggestionsContext;
  source?: string;
}

export interface AssistantUsageItem {
  text: string;
  count: number;
  lastUsedAt: Date | null;
}

const getAssistantDocRef = (userId: string) =>
  doc(db, 'users', userId, 'aiAssistant', 'assistant');

const hashPrompt = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const toDate = (value: any) =>
  typeof value?.toDate === 'function' ? value.toDate() : value instanceof Date ? value : null;

export async function recordAssistantUsage(userId: string, prompt: string): Promise<void> {
  const trimmed = prompt.trim();
  if (!userId || !trimmed) return;
  const key = hashPrompt(trimmed);
  const ref = getAssistantDocRef(userId);
  await setDoc(
    ref,
    {
      updatedAt: serverTimestamp(),
      [`usage.${key}.text`]: trimmed,
      [`usage.${key}.count`]: increment(1),
      [`usage.${key}.updatedAt`]: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getAssistantUsage(
  userId: string,
  limit = 8
): Promise<AssistantUsageItem[]> {
  if (!userId) return [];
  const ref = getAssistantDocRef(userId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return [];
  const data = snapshot.data() as DocumentData;
  const usage = data?.usage || {};
  const items = Object.values(usage)
    .map((item: any) => ({
      text: String(item?.text || '').trim(),
      count: Number(item?.count || 0),
      lastUsedAt: toDate(item?.updatedAt),
    }))
    .filter((item: AssistantUsageItem) => item.text);

  return items
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const dateA = a.lastUsedAt?.getTime() || 0;
      const dateB = b.lastUsedAt?.getTime() || 0;
      return dateB - dateA;
    })
    .slice(0, limit);
}

export async function getCachedAssistantSuggestions(
  userId: string
): Promise<AssistantSuggestionsCache | null> {
  if (!userId) return null;
  const ref = getAssistantDocRef(userId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as DocumentData;
  const suggestions = data?.suggestions || {};
  const quickPrompts = Array.isArray(suggestions.quickPrompts)
    ? suggestions.quickPrompts.map((item: any) => String(item || '').trim()).filter(Boolean)
    : [];
  const tiles = Array.isArray(suggestions.tiles)
    ? suggestions.tiles
        .map((item: any) => ({
          title: String(item?.title || '').trim(),
          description: String(item?.description || '').trim(),
          prompt: String(item?.prompt || '').trim(),
        }))
        .filter((item: AssistantSuggestionTile) => item.title && item.prompt)
    : [];

  return {
    quickPrompts,
    tiles,
    updatedAt: toDate(data?.suggestionsUpdatedAt),
    context: data?.suggestionsContext || undefined,
    source: data?.suggestionsSource || undefined,
  };
}

export async function saveAssistantSuggestions(
  userId: string,
  cache: Omit<AssistantSuggestionsCache, 'updatedAt'>
): Promise<void> {
  if (!userId) return;
  const ref = getAssistantDocRef(userId);
  const context = cache.context
    ? {
        ...(cache.context.studentGoal ? { studentGoal: cache.context.studentGoal } : {}),
        ...(cache.context.evaluationType ? { evaluationType: cache.context.evaluationType } : {}),
        ...(cache.context.studentLabel ? { studentLabel: cache.context.studentLabel } : {}),
      }
    : null;
  await setDoc(
    ref,
    {
      suggestions: {
        quickPrompts: cache.quickPrompts || [],
        tiles: cache.tiles || [],
      },
      suggestionsUpdatedAt: serverTimestamp(),
      suggestionsContext: context && Object.keys(context).length ? context : null,
      suggestionsSource: cache.source || 'openrouter',
    },
    { merge: true }
  );
}
