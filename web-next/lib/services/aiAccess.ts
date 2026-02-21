import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebaseClient';

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);
const DEFAULT_FREE_DAILY_CREDITS = 20;

const parsedLimit = Number(process.env.NEXT_PUBLIC_AI_DAILY_FREE_CREDITS || '');
export const FREE_DAILY_AI_CREDITS =
  Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : DEFAULT_FREE_DAILY_CREDITS;

type AiCreditLease = {
  uid: string;
  units: number;
  dateKey: string;
  consumed: boolean;
  premium: boolean;
  remaining: number | null;
};

const toBool = (value: any) => value === true || value === 'true' || value === 1;

export const normalizeSubscriptionStatus = (value: any) => String(value || '').trim().toLowerCase();

const getCurrentDateKey = () => new Date().toISOString().slice(0, 10);

export const isPremiumUserRecord = (data: Record<string, any>) => {
  if (!data) return false;
  if (toBool(data.admin) || String(data.role || '').trim().toLowerCase() === 'admin') return true;
  if (toBool(data.assinatura)) return true;
  if (toBool(data.planoChatGPT)) return true;
  const statusCandidates = [
    data.stripeSubscriptionStatus,
    data.subscriptionStatus,
    data.statusAssinatura,
    data.assinaturaStatus,
  ];
  return statusCandidates.some((status) =>
    ACTIVE_SUBSCRIPTION_STATUSES.has(normalizeSubscriptionStatus(status))
  );
};

const quotaLimitError = () =>
  new Error(
    `Limite diario de IA atingido. Voce recebe ${FREE_DAILY_AI_CREDITS} creditos por dia no plano gratuito. Assine o Premium para uso ilimitado.`
  );

export async function reserveAiCredit(units = 1): Promise<AiCreditLease> {
  if (!auth.currentUser?.uid) {
    throw new Error('Faca login para usar os recursos de IA.');
  }
  const uid = auth.currentUser.uid;
  const safeUnits = Math.max(1, Math.floor(units));
  const dateKey = getCurrentDateKey();
  const userRef = doc(db, 'users', uid);
  const usageRef = doc(db, 'users', uid, 'usage', 'aiCredits');

  let result: AiCreditLease = {
    uid,
    units: safeUnits,
    dateKey,
    consumed: false,
    premium: false,
    remaining: null,
  };

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) {
      throw new Error('Conta nao encontrada para validar acesso a IA.');
    }

    const userData = userSnap.data() || {};
    if (isPremiumUserRecord(userData)) {
      result = {
        uid,
        units: safeUnits,
        dateKey,
        consumed: false,
        premium: true,
        remaining: null,
      };
      return;
    }

    const usageSnap = await transaction.get(usageRef);
    const usageData = usageSnap.data() || {};
    const isSameDay = usageData.dateKey === dateKey;
    const usedToday = isSameDay ? Number(usageData.usedToday || 0) : 0;
    const nextUsed = usedToday + safeUnits;

    if (nextUsed > FREE_DAILY_AI_CREDITS) {
      throw quotaLimitError();
    }

    transaction.set(
      usageRef,
      {
        dateKey,
        usedToday: nextUsed,
        dailyLimit: FREE_DAILY_AI_CREDITS,
        updatedAt: serverTimestamp(),
        lastConsumedAt: serverTimestamp(),
      },
      { merge: true }
    );

    result = {
      uid,
      units: safeUnits,
      dateKey,
      consumed: true,
      premium: false,
      remaining: Math.max(0, FREE_DAILY_AI_CREDITS - nextUsed),
    };
  });

  return result;
}

export async function refundAiCredit(lease: AiCreditLease | null | undefined): Promise<void> {
  if (!lease?.consumed || !lease.uid || lease.units <= 0) return;
  const usageRef = doc(db, 'users', lease.uid, 'usage', 'aiCredits');

  await runTransaction(db, async (transaction) => {
    const usageSnap = await transaction.get(usageRef);
    if (!usageSnap.exists()) return;

    const usageData = usageSnap.data() || {};
    if (usageData.dateKey !== lease.dateKey) return;

    const usedToday = Number(usageData.usedToday || 0);
    const nextUsed = Math.max(0, usedToday - lease.units);
    transaction.set(
      usageRef,
      {
        usedToday: nextUsed,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}
