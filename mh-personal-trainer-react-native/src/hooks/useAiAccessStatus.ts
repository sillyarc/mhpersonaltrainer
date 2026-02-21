import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuthStore } from '../store/authStore';
import { getFirebaseDb } from '../services/firebase';
import { FREE_DAILY_AI_CREDITS, isPremiumUserRecord } from '../services/ai';

type AiUsageDoc = {
  dateKey?: string;
  usedToday?: number;
  dailyLimit?: number;
};

const currentDateKey = () => new Date().toISOString().slice(0, 10);

export function useAiAccessStatus() {
  const { user } = useAuthStore();
  const [usage, setUsage] = useState<AiUsageDoc | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setUsage(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const db = getFirebaseDb();
    const usageRef = doc(db, 'users', user.uid, 'usage', 'aiCredits');
    const unsubscribe = onSnapshot(
      usageRef,
      (snapshot) => {
        setUsage(snapshot.exists() ? (snapshot.data() as AiUsageDoc) : null);
        setLoading(false);
      },
      () => {
        setUsage(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  return useMemo(() => {
    const premium = isPremiumUserRecord((user || {}) as Record<string, any>);
    const docLimit = Number(usage?.dailyLimit || 0);
    const dailyLimit =
      Number.isFinite(docLimit) && docLimit > 0 ? Math.floor(docLimit) : FREE_DAILY_AI_CREDITS;
    const usedRaw = usage?.dateKey === currentDateKey() ? Number(usage?.usedToday || 0) : 0;
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
  }, [loading, usage?.dailyLimit, usage?.dateKey, usage?.usedToday, user]);
}
