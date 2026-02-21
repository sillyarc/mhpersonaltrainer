import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { useAuth } from '@/lib/auth';
import { getFirebaseDb } from '@/lib/services/firebase';
import type { PaymentRecord } from '@/lib/types/finance';
import type { PersonalProfile } from '@/lib/services/firestoreService';

const toDate = (value?: any) => {
  if (!value) return undefined;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const normalizeCodeVariants = (code?: string | number | null) => {
  if (code === null || code === undefined) return { numeric: null as number | null, text: '' };
  const text = String(code).trim();
  const numeric = text.length ? Number(text) : NaN;
  return { numeric: Number.isNaN(numeric) ? null : numeric, text };
};

const toBool = (value: any) => value === true || value === 'true' || value === 1;

export type CheckinMethods = {
  photo: boolean;
  biometric: boolean;
  nfc: boolean;
};

const normalizeEnabledMethods = (value: any): CheckinMethods | null => {
  if (!Array.isArray(value)) return null;
  const normalized = new Set(
    value
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
  );
  return {
    photo: normalized.has('photo') || normalized.has('foto'),
    biometric: normalized.has('biometric') || normalized.has('biometria'),
    nfc: normalized.has('nfc'),
  };
};

const readBooleanField = (
  source: Record<string, any> | null | undefined,
  keys: string[]
): boolean | undefined => {
  if (!source || typeof source !== 'object') return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return toBool(source[key]);
    }
  }
  return undefined;
};

const resolveCheckinMethods = (data: Record<string, any>, fallback: CheckinMethods): CheckinMethods => {
  const objectSource =
    (data.checkinMethods && typeof data.checkinMethods === 'object' ? data.checkinMethods : null) ||
    (data.checkin_methods && typeof data.checkin_methods === 'object' ? data.checkin_methods : null) ||
    (data.checkinConfig?.methods && typeof data.checkinConfig.methods === 'object'
      ? data.checkinConfig.methods
      : null) ||
    (data.checkin_config?.methods && typeof data.checkin_config.methods === 'object'
      ? data.checkin_config.methods
      : null);

  const arraySource =
    normalizeEnabledMethods(data.checkinEnabledMethods) ||
    normalizeEnabledMethods(data.checkin_enabled_methods) ||
    normalizeEnabledMethods(data.checkinConfig?.enabledMethods) ||
    normalizeEnabledMethods(data.checkin_config?.enabled_methods);

  const photo =
    readBooleanField(objectSource, ['photo', 'foto', 'photoEnabled', 'enabledPhoto']) ??
    readBooleanField(data, ['checkinPhotoEnabled', 'photoCheckinEnabled']) ??
    (arraySource ? arraySource.photo : fallback.photo);

  const biometric =
    readBooleanField(objectSource, ['biometric', 'biometria', 'biometricEnabled', 'enabledBiometric']) ??
    readBooleanField(data, ['checkinBiometricEnabled', 'biometricCheckinEnabled']) ??
    (arraySource ? arraySource.biometric : fallback.biometric);

  const nfc =
    readBooleanField(objectSource, ['nfc', 'nfcEnabled', 'enabledNfc']) ??
    readBooleanField(data, ['checkinNfcEnabled', 'nfcCheckinEnabled']) ??
    (arraySource ? arraySource.nfc : fallback.nfc);

  return { photo, biometric, nfc };
};

const mapPaymentRecord = (docItem: any): PaymentRecord & { studentId?: string; paymentPath?: string } => {
  const data = docItem.data();
  const parent = docItem.ref?.parent?.parent;
  return {
    id: docItem.id,
    valorDaCombranca: data.valorDaCombranca ?? 0,
    todoDiaDoMes: data.todoDiaDoMes,
    descricao: data.descricao || 'Cobranca',
    pago: data.Pago ?? data.pago ?? false,
    repetirPMes: data.repetirPMes,
    diaDoPagamento: data.diaDoPagamento ?? data.todoDiaDoMes,
    datas: (data.datas || []).map((item: any) => (item?.toDate ? item.toDate() : new Date(item))),
    checkoutUrl: data.checkoutUrl || data.checkout_url,
    stripeSessionId: data.stripeSessionId || data.stripe_session_id,
    stripePaymentIntentId: data.stripePaymentIntentId || data.paymentIntentId,
    stripeStatus: data.stripeStatus || data.status,
    academyCode: data.academyCode ?? data.codigoAcademia,
    personalCode: data.personalCode ?? data.codigoPersonal,
    planName: data.planName ?? data.nomePlano,
    createdByAcademy: data.createdByAcademy ?? data.criadoPelaAcademia ?? false,
    academyId: data.academyId,
    studentId: parent?.id,
    paymentPath: docItem.ref?.path,
  };
};

export type AcademyStudent = {
  id: string;
  name: string;
  email: string;
  photoUrl?: string;
  status: 'ativo' | 'inativo';
  academyId?: string;
  codigoPersonal?: string | number;
  codigoAcademia?: string | number;
  vinculadoPorAcademia?: boolean;
  personalVinculadoEm?: Date;
  lastActive?: Date;
  createdAt?: Date;
  goal?: string;
  level?: string;
  biometricId?: string;
  nfcTagId?: string;
  checkinPhotoUrl?: string;
  checkinMethods?: CheckinMethods;
  personalName?: string;
};

export type AcademyPersonal = PersonalProfile & {
  email?: string;
  createdAt?: Date;
  lastActive?: Date;
  academyId?: string;
  biometricId?: string;
  nfcTagId?: string;
  checkinPhotoUrl?: string;
  checkinMethods?: CheckinMethods;
};

export type AcademyPlan = {
  id: string;
  nome: string;
  valor: number;
  ciclo: string;
  descricao?: string;
  ativo: boolean;
  createdAt?: Date;
};

export type AcademyInvoice = PaymentRecord & {
  studentId?: string;
  paymentPath?: string;
};

export function useAcademyData() {
  const { user, role } = useAuth();
  const [personals, setPersonals] = useState<AcademyPersonal[]>([]);
  const [students, setStudents] = useState<AcademyStudent[]>([]);
  const [plans, setPlans] = useState<AcademyPlan[]>([]);
  const [invoices, setInvoices] = useState<AcademyInvoice[]>([]);
  const [loadingAcademy, setLoadingAcademy] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [academyError, setAcademyError] = useState('');
  const [invoicesError, setInvoicesError] = useState('');

  const academyId = user?.uid ?? '';
  const academyCodeRaw = user?.codigoAcademia ?? '';
  const academyCode = academyCodeRaw ? String(academyCodeRaw) : '';

  const loadAcademy = useCallback(async () => {
    if (role !== 'academy') {
      setLoadingAcademy(false);
      return;
    }
    if (!academyId && !academyCodeRaw) {
      setAcademyError('Conta da academia nao encontrada.');
      setLoadingAcademy(false);
      return;
    }

    setLoadingAcademy(true);
    setAcademyError('');
    try {
      const db = getFirebaseDb();
      const requests: Array<Promise<any>> = [];

      if (academyId) {
        requests.push(
          getDocs(query(collection(db, 'users'), where('academyId', '==', academyId), limit(300)))
        );
      }

      const { numeric, text } = normalizeCodeVariants(academyCodeRaw);
      const legacyCodeVariants = new Set<string | number>();
      if (numeric !== null) legacyCodeVariants.add(numeric);
      if (text) legacyCodeVariants.add(text);
      legacyCodeVariants.forEach((value) => {
        requests.push(
          getDocs(query(collection(db, 'users'), where('codigoAcademia', '==', value), limit(300)))
        );
      });

      if (!requests.length) {
        setPersonals([]);
        setStudents([]);
        return;
      }

      const snapshots = await Promise.all(requests);

      const merged = new Map<string, any>();
      snapshots.forEach((snapshot) => {
        snapshot.forEach((docSnap: any) => {
          merged.set(docSnap.id, docSnap);
        });
      });

      const nextPersonals: AcademyPersonal[] = [];
      const nextStudents: AcademyStudent[] = [];

      merged.forEach((docSnap) => {
        const data = docSnap.data();
        const isPersonal = data.professorAccount === true || data.professorAccount === 'true';
        const isAcademyAccount = data.academyAccount === true || data.academyAccount === 'true';
        const isAdmin = data.admin === true || data.admin === 'true';
        const createdAt = toDate(data.created_time);
        const biometricId = data.biometricId || data.biometriaId || data.biometricsId;
        const nfcTagId = data.nfcTagId || data.nfcTag || data.cartaoNfc;
        const checkinPhotoUrl = data.checkinPhotoUrl || data.checkin_photo_url || data.fotoEntradaUrl;
        const checkinMethods = resolveCheckinMethods(data, {
          photo: Boolean(checkinPhotoUrl),
          biometric: Boolean(biometricId),
          nfc: Boolean(nfcTagId),
        });

        if (isPersonal) {
          nextPersonals.push({
            id: docSnap.id,
            uid: docSnap.id,
            displayName: data.display_name || 'Personal',
            email: data.email,
            photoUrl: data.photo_url,
            bio: data.bio,
            especializacao: data.especializacao,
            codigoPersonal: data.codigoPersonal,
            codigoAcademia: data.codigoAcademia,
            academyId: data.academyId,
            createdAt,
            lastActive: toDate(data.last_active_time),
            biometricId,
            nfcTagId,
            checkinPhotoUrl,
            checkinMethods,
          });
          return;
        }

        if (!isAcademyAccount && !isAdmin) {
          nextStudents.push({
            id: docSnap.id,
            name: data.display_name || 'Aluno',
            email: data.email || '',
            photoUrl: data.photo_url,
            status: data.acessoSuspenso ? 'inativo' : 'ativo',
            academyId: data.academyId,
            codigoPersonal: data.codigoPersonal,
            codigoAcademia: data.codigoAcademia,
            vinculadoPorAcademia: data.vinculadoPorAcademia === true || data.vinculadoPorAcademia === 'true',
            personalVinculadoEm: toDate(data.personalVinculadoEm),
            lastActive: toDate(data.last_active_time),
            createdAt,
            goal: data.objetivoNoApp,
            level: data.nivelDeAtividade,
            biometricId,
            nfcTagId,
            checkinPhotoUrl,
            checkinMethods,
            personalName: data.nameDoSeuPersonal || '',
          });
        }
      });

      nextPersonals.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
      nextStudents.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

      setPersonals(nextPersonals);
      setStudents(nextStudents);
    } catch (err: any) {
      setAcademyError(err.message || 'Erro ao carregar dados da academia.');
      setPersonals([]);
      setStudents([]);
    } finally {
      setLoadingAcademy(false);
    }
  }, [academyCodeRaw, academyId, role]);

  const loadPlans = useCallback(async () => {
    if (role !== 'academy' || !user?.uid) {
      setPlans([]);
      setLoadingPlans(false);
      return;
    }

    setLoadingPlans(true);
    try {
      const db = getFirebaseDb();
      const ref = collection(db, 'users', user.uid, 'academyPlans');
      const snapshot = await getDocs(ref);
      const items: AcademyPlan[] = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            nome: data.nome || 'Plano',
            valor: Number(data.valor || 0),
            ciclo: data.ciclo || 'Mensal',
            descricao: data.descricao,
            ativo: data.ativo !== false,
            createdAt: toDate(data.createdAt),
          };
        })
        .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
      setPlans(items);
    } catch (err) {
      setPlans([]);
    } finally {
      setLoadingPlans(false);
    }
  }, [role, user?.uid]);

  const loadInvoices = useCallback(async () => {
    if (role !== 'academy') {
      setInvoices([]);
      setLoadingInvoices(false);
      return;
    }

    setLoadingInvoices(true);
    setInvoicesError('');
    try {
      const db = getFirebaseDb();
      const ref = collectionGroup(db, 'pagamentos');
      const requests: Array<Promise<any>> = [];

      if (academyId) {
        requests.push(getDocs(query(ref, where('academyId', '==', academyId), limit(100))));
      }

      const { numeric, text } = normalizeCodeVariants(academyCodeRaw);
      const codeCandidates = new Set<string | number>();
      if (numeric !== null) codeCandidates.add(numeric);
      if (text) codeCandidates.add(text);
      codeCandidates.forEach((value) => {
        requests.push(getDocs(query(ref, where('academyCode', '==', value), limit(100))));
      });

      if (!requests.length) {
        setInvoices([]);
        return;
      }

      const snapshots = await Promise.all(requests);

      const merged = new Map<string, AcademyInvoice>();
      snapshots.forEach((snapshot) => {
        snapshot.docs.forEach((docSnap: any) => {
          const payment = mapPaymentRecord(docSnap);
          merged.set(docSnap.id, {
            ...payment,
            studentId: payment.studentId,
            paymentPath: payment.paymentPath,
          });
        });
      });

      const items = Array.from(merged.values());
      items.sort((a, b) => {
        const dateA = paymentDateForSort(a);
        const dateB = paymentDateForSort(b);
        return dateB - dateA;
      });
      setInvoices(items);
    } catch (err: any) {
      setInvoices([]);
      setInvoicesError(err.message || 'Erro ao carregar faturas.');
    } finally {
      setLoadingInvoices(false);
    }
  }, [academyCodeRaw, academyId, role]);

  useEffect(() => {
    loadAcademy();
  }, [loadAcademy]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const summary = useMemo(() => {
    const totalStudents = students.length;
    const registeredStudents = students.filter((student) => student.vinculadoPorAcademia).length;
    const externalStudents = totalStudents - registeredStudents;
    const totalPersonals = personals.length;
    const activeStudents = students.filter((student) => student.status === 'ativo').length;
    const unassignedStudents = students.filter((student) => !student.codigoPersonal).length;
    return {
      totalStudents,
      registeredStudents,
      externalStudents,
      totalPersonals,
      activeStudents,
      unassignedStudents,
    };
  }, [personals, students]);

  const academyStudents = useMemo(
    () => students.filter((student) => student.vinculadoPorAcademia),
    [students]
  );

  const externalStudents = useMemo(
    () => students.filter((student) => !student.vinculadoPorAcademia),
    [students]
  );

  return {
    academyCodeRaw,
    academyCode,
    personals,
    students,
    academyStudents,
    externalStudents,
    plans,
    invoices,
    summary,
    loadingAcademy,
    loadingPlans,
    loadingInvoices,
    academyError,
    invoicesError,
    reloadAcademy: loadAcademy,
    reloadPlans: loadPlans,
    reloadInvoices: loadInvoices,
  };
}

const paymentDateForSort = (payment: PaymentRecord) => {
  if (!payment.datas?.length) return 0;
  const last = payment.datas[payment.datas.length - 1];
  const date = last instanceof Date ? last : new Date(last);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};
