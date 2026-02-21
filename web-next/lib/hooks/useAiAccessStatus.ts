'use client';

import { useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { useDocumentData } from '@/lib/firestoreHooks';
import { FREE_DAILY_AI_CREDITS, isPremiumUserRecord } from '@/lib/services/aiAccess';

type AiUsageDoc = {
  dateKey?: string;
  usedToday?: number;
  dailyLimit?: number;
};

const getDateKey = () => new Date().toISOString().slice(0, 10);

export function useAiAccessStatus() {
  const { user } = useAuth();
  const usagePath = useMemo(() => ['users', user?.uid, 'usage', 'aiCredits'], [user?.uid]);
  const { data, loading } = useDocumentData<AiUsageDoc>(usagePath);

  return useMemo(() => {
    const currentDateKey = getDateKey();
    const premium = isPremiumUserRecord((user || {}) as Record<string, any>);

    const docLimit = Number(data?.dailyLimit || 0);
    const dailyLimit =
      Number.isFinite(docLimit) && docLimit > 0 ? Math.floor(docLimit) : FREE_DAILY_AI_CREDITS;

    const usedRaw = data?.dateKey === currentDateKey ? Number(data?.usedToday || 0) : 0;
    const usedToday = Number.isFinite(usedRaw) ? Math.max(0, Math.floor(usedRaw)) : 0;
    const remaining = premium ? null : Math.max(0, dailyLimit - usedToday);

    return {
      loading: Boolean(user?.uid) ? loading : false,
      hasUser: Boolean(user?.uid),
      premium,
      dailyLimit,
      usedToday,
      remaining,
      exhausted: !premium && (remaining ?? 0) <= 0,
    };
  }, [data?.dailyLimit, data?.dateKey, data?.usedToday, loading, user]);
}
