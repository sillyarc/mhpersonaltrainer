import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { firestoreService } from './firestoreService';
import { notifyPersonalStudentLinkedByCode } from './notificationCenter';

const normalizeInviteCode = (value?: string | number | null) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.trunc(numeric);
};

const normalizeCodeVariants = (value?: string | number | null) => {
  const numeric = normalizeInviteCode(value);
  if (numeric === null) return [];
  return [numeric, String(numeric)];
};

const hasSameCode = (left?: string | number | null, right?: string | number | null) => {
  const leftVariants = new Set(normalizeCodeVariants(left).map((item) => String(item)));
  if (!leftVariants.size) return false;
  return normalizeCodeVariants(right).some((item) => leftVariants.has(String(item)));
};

const getCapacityErrorMessage = (reason?: 'personal_not_found' | 'free_plan_limit_reached') => {
  if (reason === 'personal_not_found') {
    return 'Codigo do personal nao encontrado.';
  }
  return 'Esse personal atingiu o limite de 4 alunos no plano gratuito. Peca para ele assinar o Premium para liberar alunos ilimitados.';
};

export function readInviteCodeParam(value?: string | string[] | null): string {
  if (Array.isArray(value)) {
    return String(value[0] || '').trim();
  }
  return String(value || '').trim();
}

export function buildInviteDeepLink(code: string): string {
  const normalized = readInviteCodeParam(code);
  if (!normalized) {
    return 'mhpersonaltrainer://invite';
  }
  return `mhpersonaltrainer://invite?code=${encodeURIComponent(normalized)}`;
}

export async function applyInviteCodeToStudent(params: {
  uid: string;
  code: string | number;
  displayName?: string;
  email?: string;
  currentCode?: string | number | null;
  professorAccount?: boolean;
  admin?: boolean;
}) {
  const normalizedCode = normalizeInviteCode(params.code);
  if (normalizedCode === null) {
    return { success: false as const, error: 'Codigo do convite invalido.' };
  }

  if (params.professorAccount || params.admin) {
    return { success: false as const, error: 'Este convite e exclusivo para alunos.' };
  }

  const profile = await firestoreService.getPersonalProfileByCode(normalizedCode);
  if (!profile?.uid) {
    return { success: false as const, error: 'Codigo do personal nao encontrado.' };
  }

  const alreadyLinked = hasSameCode(params.currentCode, profile.codigoPersonal ?? normalizedCode);
  if (!alreadyLinked) {
    const capacity = await firestoreService.getPersonalStudentCapacityByCode(normalizedCode, {
      excludeUserId: params.uid,
    });
    if (!capacity.allowed) {
      return {
        success: false as const,
        error: getCapacityErrorMessage(capacity.reason),
      };
    }
  }

  const db = getFirebaseDb();
  const nextCode = profile.codigoPersonal ?? normalizedCode;
  await updateDoc(doc(db, 'users', params.uid), {
    codigoPersonal: nextCode,
    nameDoSeuPersonal: profile.displayName || 'Personal',
    personalVinculadoEm: serverTimestamp(),
  });

  if (!alreadyLinked) {
    void notifyPersonalStudentLinkedByCode({
      personalCode: nextCode,
      studentId: params.uid,
      studentName: params.displayName || 'Aluno',
      studentEmail: params.email || '',
      source: 'profile_update',
    });
  }

  return {
    success: true as const,
    alreadyLinked,
    personalName: profile.displayName || 'Personal',
    personalCode: nextCode,
  };
}
