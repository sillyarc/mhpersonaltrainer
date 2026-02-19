'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, deleteField, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import { db, storage } from '@/lib/firebaseClient';
import { fetchAppointments } from '@/lib/services/scheduling';
import { firestoreService, type Aluno, type PersonalProfile } from '@/lib/services/firestoreService';
import type { Appointment } from '@/lib/types/scheduling';
import {
  fetchStripeConnectStatus,
  submitStripeConnectOnboarding,
  type StripeConnectStatus,
} from '@/lib/services/payments';
import { getStorageErrorMessage } from '@/lib/services/firebaseErrors';

type ServiceFormItem = {
  nome: string;
  descricao: string;
  preco: string;
};

type HorarioForm = {
  segSexInicio: string;
  segSexFim: string;
  sabInicio: string;
  sabFim: string;
  domInicio: string;
  domFim: string;
};

type AgendaFitFormState = {
  bio: string;
  especializacao: string;
  cep: string;
  cidade: string;
  estado: string;
  servicos: ServiceFormItem[];
  horario: HorarioForm;
};

type RecebimentosFormState = {
  email: string;
  firstName: string;
  lastName: string;
  cpf: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  addressLine1: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  phone: string;
  productDescription: string;
  routingNumber: string;
  accountNumber: string;
  documentFront: string;
  documentBack: string;
};

type PaymentRow = {
  id: string;
  valorDaCombranca?: number;
  valor?: number;
  Pago?: boolean;
  pago?: boolean;
  stripeStatus?: string;
  status?: string;
  createdAt?: any;
  data?: any;
};

type BalanceSummary = {
  pending: number;
  paid: number;
  total: number;
  lastPaymentAt: Date | null;
};

const emptyService = (): ServiceFormItem => ({
  nome: '',
  descricao: '',
  preco: '',
});

const emptyForm: AgendaFitFormState = {
  bio: '',
  especializacao: '',
  cep: '',
  cidade: '',
  estado: '',
  servicos: [emptyService()],
  horario: {
    segSexInicio: '',
    segSexFim: '',
    sabInicio: '',
    sabFim: '',
    domInicio: '',
    domFim: '',
  },
};

const emptyRecebimentosForm: RecebimentosFormState = {
  email: '',
  firstName: '',
  lastName: '',
  cpf: '',
  dobDay: '',
  dobMonth: '',
  dobYear: '',
  addressLine1: '',
  addressCity: '',
  addressState: '',
  addressPostalCode: '',
  phone: '',
  productDescription: '',
  routingNumber: '',
  accountNumber: '',
  documentFront: '',
  documentBack: '',
};

const asDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toTimeValue = (value: any): string => {
  const date = asDate(value);
  if (!date) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const timeToDate = (value: string): Date | undefined => {
  if (!value || !value.includes(':')) return undefined;
  const [hourText, minuteText] = value.split(':');
  const hours = Number(hourText);
  const minutes = Number(minuteText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
  return new Date(2000, 0, 1, hours, minutes, 0, 0);
};

const toCurrencyLabel = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'A combinar';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatMoney = (value?: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const toRangeLabel = (start?: any, end?: any) => {
  const startTime = toTimeValue(start);
  const endTime = toTimeValue(end);
  if (!startTime || !endTime) return 'Nao informado';
  return `${startTime} - ${endTime}`;
};

const normalizeText = (value?: string | null) => String(value || '').trim().toLowerCase();
const truthy = (value: any) => value === true || value === 'true' || value === 1;

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDateKey = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

const toDateParam = (value: Date) => toDateKey(value);

const toWeekDay = (value: Date) =>
  value.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');

const toDayMonth = (value: Date) =>
  value.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const getStatusLabel = (status?: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'confirmado') return 'Confirmado';
  if (normalized === 'concluido') return 'Concluido';
  if (normalized === 'cancelado') return 'Cancelado';
  if (normalized === 'reagendado') return 'Reagendado';
  if (normalized === 'em_andamento') return 'Em andamento';
  return 'Agendado';
};

const normalizeCodeVariants = (code?: string | number | null) => {
  if (code === undefined || code === null) return [] as Array<string | number>;
  const raw = String(code).trim();
  if (!raw) return [] as Array<string | number>;
  const variants = new Set<string | number>();
  variants.add(raw);
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) variants.add(numeric);
  return Array.from(variants);
};

const chunk = <T,>(items: T[], size: number) => {
  if (!items.length || size <= 0) return [] as T[][];
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
};

const BRAZIL_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

const normalizeCep = (value: string) => value.replace(/\D/g, '').slice(0, 8);

const normalizeConnectError = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'Nao foi possivel conectar ao servico de recebimentos.';
  }
  if (normalized.includes('permission') || normalized.includes('unauthorized')) {
    return 'Sem permissao para acessar o servico de recebimentos.';
  }
  if (normalized.includes('stripe') || normalized.includes('api url')) {
    return 'Servico de recebimentos nao configurado.';
  }
  return message;
};

const sanitizeFileName = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80);

const isPaymentPaid = (payment: PaymentRow) => {
  const normalized = String(payment.status ?? payment.stripeStatus ?? '').toLowerCase();
  return (
    payment.Pago === true ||
    payment.pago === true ||
    normalized === 'paid' ||
    normalized === 'pago' ||
    normalized === 'succeeded'
  );
};

const getPersonalLocationLabel = (personal: PersonalProfile) =>
  [personal.cidade, personal.estado].filter(Boolean).join(' - ');

const getSpecializationLabel = (value: PersonalProfile['especializacao']) =>
  Array.isArray(value) ? value.filter(Boolean).join(', ') : value || 'Nao informado';

const getServiceNames = (personal: PersonalProfile) =>
  (personal.servicos || []).map((service) => service.servicos).filter(Boolean);

const getMapLink = (personal: PersonalProfile) => {
  if (personal.location?.latitude && personal.location?.longitude) {
    return `https://www.google.com/maps?q=${personal.location.latitude},${personal.location.longitude}`;
  }
  const label = getPersonalLocationLabel(personal);
  if (!label) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
};

const getPersonalScore = (personal: PersonalProfile) => {
  const services = personal.servicos?.length || 0;
  const hasLocation = getPersonalLocationLabel(personal) ? 1 : 0;
  const hasSchedule = personal.horarioAtendimento ? 1 : 0;
  const hasBio = personal.bio ? 1 : 0;
  const specializationCount = getSpecializationLabel(personal.especializacao)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean).length;
  return services * 5 + hasLocation * 3 + hasSchedule * 2 + hasBio * 2 + specializationCount;
};

export default function MhAgendaFitPage() {
  const { user, role, refreshUser } = useAuth();
  const isPersonal = role === 'professor' || role === 'personal';

  const [personals, setPersonals] = useState<PersonalProfile[]>([]);
  const [studentCountByCode, setStudentCountByCode] = useState<Record<string, number>>({});
  const [loadingPersonals, setLoadingPersonals] = useState(true);
  const [listError, setListError] = useState('');

  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [recebimentosOpen, setRecebimentosOpen] = useState(false);

  const [form, setForm] = useState<AgendaFitFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cityOptionsForForm, setCityOptionsForForm] = useState<string[]>([]);
  const [cepMessage, setCepMessage] = useState('');
  const [myStudents, setMyStudents] = useState<Aluno[]>([]);
  const [loadingMyStudents, setLoadingMyStudents] = useState(false);
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [loadingMyAppointments, setLoadingMyAppointments] = useState(false);
  const [balanceSummary, setBalanceSummary] = useState<BalanceSummary>({
    pending: 0,
    paid: 0,
    total: 0,
    lastPaymentAt: null,
  });
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [connectStatus, setConnectStatus] = useState<StripeConnectStatus | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectMessage, setConnectMessage] = useState('');
  const [connectSubmitting, setConnectSubmitting] = useState(false);
  const [connectFormMessage, setConnectFormMessage] = useState('');
  const [connectRedirectUrl, setConnectRedirectUrl] = useState('');
  const [connectForm, setConnectForm] = useState<RecebimentosFormState>(emptyRecebimentosForm);
  const [documentFrontFile, setDocumentFrontFile] = useState<File | null>(null);
  const [documentBackFile, setDocumentBackFile] = useState<File | null>(null);
  const [uploadingFrontDocument, setUploadingFrontDocument] = useState(false);
  const [uploadingBackDocument, setUploadingBackDocument] = useState(false);

  const connectReady = useMemo(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_URL || '';
    const functionsUrl =
      process.env.NEXT_PUBLIC_STRIPE_FUNCTIONS_URL || process.env.EXPO_PUBLIC_STRIPE_FUNCTIONS_URL || '';
    return Boolean(functionsUrl) || (Boolean(apiUrl) && !apiUrl.includes('api.stripe.com'));
  }, []);

  useEffect(() => {
    if (!isPersonal || !user) return;
    const userServices =
      user.servicos?.length
        ? user.servicos.map((service) => ({
            nome: service.nome || '',
            descricao: service.descricao || '',
            preco: typeof service.preco === 'number' ? String(service.preco) : '',
          }))
        : [emptyService()];

    const especializacao = Array.isArray(user.especializacao)
      ? user.especializacao.join(', ')
      : user.especializacao || '';

    setForm({
      bio: user.bio || '',
      especializacao,
      cep: typeof (user as any).cep === 'string' ? normalizeCep((user as any).cep) : '',
      cidade: user.cidade || '',
      estado: user.estado || '',
      servicos: userServices,
      horario: {
        segSexInicio: toTimeValue(user.horarioAtendimento?.inicioSegSex),
        segSexFim: toTimeValue(user.horarioAtendimento?.terminioSegSex),
        sabInicio: toTimeValue(user.horarioAtendimento?.inicioSab),
        sabFim: toTimeValue(user.horarioAtendimento?.terminioSab),
        domInicio: toTimeValue(user.horarioAtendimento?.inicioDom),
        domFim: toTimeValue(user.horarioAtendimento?.terminioDom),
      },
    });

    setConnectForm((previous) => {
      const next = { ...previous };
      let changed = false;
      if (!next.email && user.email) {
        next.email = user.email;
        changed = true;
      }
      const displayName = String(user.displayName || '').trim();
      if (displayName && (!next.firstName || !next.lastName)) {
        const parts = displayName.split(/\s+/);
        if (!next.firstName && parts[0]) {
          next.firstName = parts[0];
          changed = true;
        }
        if (!next.lastName && parts.length > 1) {
          next.lastName = parts.slice(1).join(' ');
          changed = true;
        }
      }
      if (!next.addressCity && user.cidade) {
        next.addressCity = user.cidade;
        changed = true;
      }
      if (!next.addressState && user.estado) {
        next.addressState = String(user.estado).toUpperCase();
        changed = true;
      }
      const cep = typeof (user as any).cep === 'string' ? normalizeCep((user as any).cep) : '';
      if (!next.addressPostalCode && cep) {
        next.addressPostalCode = cep;
        changed = true;
      }
      const existingFront = String((user as any).stripeDocumentFrontUrl || '').trim();
      const existingBack = String((user as any).stripeDocumentBackUrl || '').trim();
      if (!next.documentFront && existingFront) {
        next.documentFront = existingFront;
        changed = true;
      }
      if (!next.documentBack && existingBack) {
        next.documentBack = existingBack;
        changed = true;
      }
      if (!next.productDescription) {
        next.productDescription = 'Atendimento presencial e online para treinos personalizados.';
        changed = true;
      }
      return changed ? next : previous;
    });
  }, [isPersonal, user]);

  useEffect(() => {
    if (!editOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [editOpen]);

  useEffect(() => {
    if (!recebimentosOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRecebimentosOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [recebimentosOpen]);

  useEffect(() => {
    let active = true;

    const loadStudentsCountByCode = async (profiles: PersonalProfile[]) => {
      const codeMap = new Map<string, Set<string>>();
      const allVariants = profiles
        .flatMap((item) => normalizeCodeVariants(item.codigoPersonal))
        .filter((value) => String(value).trim() !== '');

      const numericVariants = Array.from(
        new Set(allVariants.filter((value) => typeof value === 'number') as number[])
      );
      const stringVariants = Array.from(
        new Set(
          allVariants
            .filter((value) => typeof value === 'string')
            .map((value) => String(value).trim())
            .filter(Boolean)
        )
      );

      if (!numericVariants.length && !stringVariants.length) {
        return {} as Record<string, number>;
      }

      const usersRef = collection(db, 'users');
      const snapshots = await Promise.all([
        ...chunk(numericVariants, 10).map((group) =>
          getDocs(query(usersRef, where('codigoPersonal', 'in', group)))
        ),
        ...chunk(stringVariants, 10).map((group) =>
          getDocs(query(usersRef, where('codigoPersonal', 'in', group)))
        ),
      ]);

      snapshots.forEach((snapshot) => {
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (truthy(data.professorAccount) || truthy(data.admin) || truthy(data.academyAccount)) return;
          const code = data.codigoPersonal;
          if (code === null || code === undefined) return;
          const key = String(code).trim();
          if (!key) return;
          if (!codeMap.has(key)) {
            codeMap.set(key, new Set<string>());
          }
          codeMap.get(key)!.add(docSnap.id);
        });
      });

      const normalized: Record<string, number> = {};
      codeMap.forEach((ids, key) => {
        normalized[key] = ids.size;
      });
      return normalized;
    };

    const loadPersonals = async () => {
      setLoadingPersonals(true);
      setListError('');
      const data = await firestoreService.fetchPersonals(120);
      if (!active) return;
      const sorted = [...data].sort((a, b) => {
        const serviceDiff = (b.servicos?.length || 0) - (a.servicos?.length || 0);
        if (serviceDiff !== 0) return serviceDiff;
        return a.displayName.localeCompare(b.displayName, 'pt-BR');
      });
      setPersonals(sorted);
      const counts = await loadStudentsCountByCode(sorted);
      if (!active) return;
      setStudentCountByCode(counts);
      setLoadingPersonals(false);
    };

    loadPersonals().catch((error) => {
      if (!active) return;
      setLoadingPersonals(false);
      setListError(error?.message || 'Nao foi possivel carregar os personais.');
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadBalance = async (code?: number | string) => {
      const variants = normalizeCodeVariants(code);
      if (!variants.length) {
        return {
          pending: 0,
          paid: 0,
          total: 0,
          lastPaymentAt: null,
        } as BalanceSummary;
      }

      const paymentSnapshots = await Promise.all(
        variants.map((variant) =>
          getDocs(query(collectionGroup(db, 'pagamentos'), where('personalCode', '==', variant)))
        )
      );

      const seen = new Set<string>();
      let pending = 0;
      let paid = 0;
      let total = 0;
      let lastPaymentAt: Date | null = null;

      paymentSnapshots.forEach((snapshot) => {
        snapshot.forEach((docSnap) => {
          const key = docSnap.ref.path;
          if (seen.has(key)) return;
          seen.add(key);
          const data = { id: docSnap.id, ...(docSnap.data() as Record<string, any>) } as PaymentRow;
          const amount = Number(data.valorDaCombranca ?? data.valor ?? 0);
          if (Number.isFinite(amount) && amount > 0) {
            if (isPaymentPaid(data)) paid += amount;
            else pending += amount;
          }
          total += 1;
          const paymentDate = toDate(data.createdAt || data.data);
          if (paymentDate && (!lastPaymentAt || paymentDate > lastPaymentAt)) {
            lastPaymentAt = paymentDate;
          }
        });
      });

      return {
        pending,
        paid,
        total,
        lastPaymentAt,
      } as BalanceSummary;
    };

    const loadPersonalHub = async () => {
      if (!isPersonal || !user?.uid) {
        setMyStudents([]);
        setMyAppointments([]);
        setBalanceSummary({ pending: 0, paid: 0, total: 0, lastPaymentAt: null });
        return;
      }

      setLoadingMyStudents(true);
      setLoadingMyAppointments(true);
      setLoadingBalance(true);
      try {
        const [students, appointmentsResult, balance] = await Promise.all([
          firestoreService.getAlunosDoPersonal(user.uid),
          fetchAppointments(user.uid, true),
          loadBalance(user.codigoPersonal),
        ]);
        if (!active) return;
        setMyStudents(students);
        const appointments = (appointmentsResult.data || []).sort((a, b) => a.data.getTime() - b.data.getTime());
        setMyAppointments(appointments);
        setBalanceSummary(balance);
      } catch {
        if (!active) return;
        setMyStudents([]);
        setMyAppointments([]);
      } finally {
        if (!active) return;
        setLoadingMyStudents(false);
        setLoadingMyAppointments(false);
        setLoadingBalance(false);
      }
    };

    loadPersonalHub();
    return () => {
      active = false;
    };
  }, [isPersonal, user?.uid, user?.codigoPersonal]);

  useEffect(() => {
    let active = true;
    if (!isPersonal || !user?.uid || !connectReady) {
      if (active) {
        setConnectStatus(null);
        setConnectMessage(connectReady ? '' : 'Servico de recebimentos nao configurado.');
      }
      return () => {
        active = false;
      };
    }

    setConnectLoading(true);
    fetchStripeConnectStatus(user.uid, user.stripeAccountId)
      .then((result) => {
        if (!active) return;
        if (result.data) {
          setConnectStatus(result.data);
          if (result.data.accountId && result.data.accountId !== user.stripeAccountId) {
            void updateDoc(doc(db, 'users', user.uid), {
              stripeAccountId: result.data.accountId,
            });
          }
          setConnectMessage('');
        } else if (result.error) {
          setConnectMessage(normalizeConnectError(result.error));
        }
      })
      .catch((error: any) => {
        if (!active) return;
        setConnectMessage(normalizeConnectError(String(error?.message || 'Erro ao consultar status.')));
      })
      .finally(() => {
        if (!active) return;
        setConnectLoading(false);
      });

    return () => {
      active = false;
    };
  }, [connectReady, isPersonal, user?.stripeAccountId, user?.uid]);

  const cityOptions = useMemo(() => {
    const values = personals.map(getPersonalLocationLabel).filter(Boolean);
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [personals]);

  const serviceOptions = useMemo(() => {
    const names = personals.flatMap(getServiceNames);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [personals]);

  const filteredPersonals = useMemo(() => {
    const term = normalizeText(search);
    return personals.filter((personal) => {
      const locationLabel = getPersonalLocationLabel(personal);
      const specialLabel = getSpecializationLabel(personal.especializacao);
      const allServiceNames = getServiceNames(personal).join(' ');
      const matchSearch =
        !term ||
        normalizeText(personal.displayName).includes(term) ||
        normalizeText(personal.bio).includes(term) ||
        normalizeText(specialLabel).includes(term) ||
        normalizeText(locationLabel).includes(term) ||
        normalizeText(allServiceNames).includes(term);

      if (!matchSearch) return false;
      if (cityFilter && locationLabel !== cityFilter) return false;
      if (serviceFilter && !getServiceNames(personal).includes(serviceFilter)) return false;
      return true;
    });
  }, [personals, search, cityFilter, serviceFilter]);

  const getStudentsCountForPersonal = (personal: PersonalProfile) => {
    const variants = normalizeCodeVariants(personal.codigoPersonal);
    let count = 0;
    variants.forEach((variant) => {
      const key = String(variant).trim();
      if (!key) return;
      const current = studentCountByCode[key] || 0;
      if (current > count) count = current;
    });
    return count;
  };

  const spotlightPersonals = useMemo(
    () =>
      [...filteredPersonals]
        .sort((a, b) => {
          const studentDiff = getStudentsCountForPersonal(b) - getStudentsCountForPersonal(a);
          if (studentDiff !== 0) return studentDiff;
          return getPersonalScore(b) - getPersonalScore(a);
        })
        .slice(0, 3),
    [filteredPersonals, studentCountByCode]
  );

  const myProfile = useMemo(() => {
    if (!isPersonal || !user?.uid) return null;
    const fromList = personals.find((item) => item.uid === user.uid);
    if (fromList) return fromList;
    return {
      id: user.uid,
      uid: user.uid,
      displayName: user.displayName || 'Personal',
      photoUrl: user.photoUrl,
      bio: user.bio,
      especializacao: user.especializacao,
      codigoPersonal: user.codigoPersonal,
      cidade: user.cidade,
      estado: user.estado,
      location: user.location,
      servicos:
        user.servicos?.map((service) => ({
          servicos: service.nome || '',
          descricao: service.descricao,
          valor: typeof service.preco === 'number' ? service.preco : undefined,
        })) || [],
      horarioAtendimento: user.horarioAtendimento,
    } as PersonalProfile;
  }, [isPersonal, personals, user]);

  const appointmentCountByDate = useMemo(() => {
    const map: Record<string, number> = {};
    myAppointments.forEach((item) => {
      const key = toDateKey(item.data);
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [myAppointments]);

  const nextSevenDays = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const current = new Date(base);
      current.setDate(base.getDate() + index);
      return current;
    });
  }, []);

  const upcomingAppointments = useMemo(() => {
    const now = new Date();
    return myAppointments.filter((item) => item.data >= now).slice(0, 5);
  }, [myAppointments]);

  const activeStudentsCount = useMemo(
    () => myStudents.filter((student) => student.status === 'ativo').length,
    [myStudents]
  );

  const loadCitiesByState = async (stateCode: string, preferredCity?: string) => {
    const normalizedState = String(stateCode || '').trim().toUpperCase();
    if (!normalizedState) {
      setCityOptionsForForm([]);
      return;
    }

    const buildResult = (cities: string[]) => {
      const set = new Set(cities.map((city) => city.trim()).filter(Boolean));
      const preferred = String(preferredCity || '').trim();
      if (preferred) set.add(preferred);
      const list = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      setCityOptionsForForm(list);
    };

    try {
      const response = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${normalizedState}/municipios`
      );
      if (!response.ok) throw new Error('Falha ao carregar cidades');
      const payload = (await response.json()) as Array<{ nome?: string }>;
      buildResult(payload.map((item) => item.nome || ''));
    } catch {
      const fallback = personals
        .filter((item) => String(item.estado || '').trim().toUpperCase() === normalizedState)
        .map((item) => item.cidade || '')
        .filter(Boolean);
      buildResult(fallback);
    }
  };

  useEffect(() => {
    if (!form.estado) {
      setCityOptionsForForm([]);
      return;
    }
    loadCitiesByState(form.estado, form.cidade);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.estado, personals]);

  const citySelectOptions = useMemo(() => {
    const set = new Set(cityOptionsForForm);
    const current = form.cidade.trim();
    if (current) set.add(current);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [cityOptionsForForm, form.cidade]);

  const updateService = (index: number, key: keyof ServiceFormItem, value: string) => {
    setForm((previous) => ({
      ...previous,
      servicos: previous.servicos.map((service, currentIndex) =>
        currentIndex === index ? { ...service, [key]: value } : service
      ),
    }));
  };

  const addServiceField = () => {
    setForm((previous) => ({
      ...previous,
      servicos: [...previous.servicos, emptyService()],
    }));
  };

  const removeServiceField = (index: number) => {
    setForm((previous) => {
      const next = previous.servicos.filter((_, currentIndex) => currentIndex !== index);
      return {
        ...previous,
        servicos: next.length ? next : [emptyService()],
      };
    });
  };

  const lookupCep = async () => {
    const cep = normalizeCep(form.cep);
    if (cep.length !== 8) {
      setCepMessage('CEP invalido. Informe os 8 digitos.');
      setForm((previous) => ({ ...previous, cep }));
      return;
    }

    setCepLoading(true);
    setCepMessage('');
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) throw new Error('Erro ao consultar CEP');
      const payload = (await response.json()) as {
        erro?: boolean;
        uf?: string;
        localidade?: string;
      };
      if (payload.erro || !payload.uf || !payload.localidade) {
        setCepMessage('CEP nao encontrado. Confira e tente novamente.');
        return;
      }

      const stateCode = String(payload.uf).trim().toUpperCase();
      const cityName = String(payload.localidade).trim();
      setForm((previous) => ({
        ...previous,
        cep,
        estado: stateCode,
        cidade: cityName,
      }));
      await loadCitiesByState(stateCode, cityName);
      setCepMessage(`CEP validado: ${cityName} - ${stateCode}`);
    } catch {
      setCepMessage('Nao foi possivel validar o CEP agora.');
    } finally {
      setCepLoading(false);
    }
  };

  const handleSavePersonalShowcase = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.uid) return;
    const normalizedCep = normalizeCep(form.cep);
    if (normalizedCep && normalizedCep.length !== 8) {
      setSaveMessage('CEP invalido. Use 8 digitos.');
      return;
    }

    setSaving(true);
    setSaveMessage('');
    try {
      const parsedServices = form.servicos
        .map((service) => {
          const nome = service.nome.trim();
          const descricao = service.descricao.trim();
          const priceText = service.preco.trim().replace(',', '.');
          const parsedPrice = Number(priceText);
          const hasPrice = priceText.length > 0 && Number.isFinite(parsedPrice);
          if (!nome) return null;
          return {
            servicos: nome,
            nome,
            descricao,
            ...(hasPrice ? { valor: parsedPrice, preco: parsedPrice } : {}),
          };
        })
        .filter(Boolean);

      const horarioPayload = {
        ...(timeToDate(form.horario.segSexInicio) ? { inicioSegSex: timeToDate(form.horario.segSexInicio) } : {}),
        ...(timeToDate(form.horario.segSexFim) ? { terminioSegSex: timeToDate(form.horario.segSexFim) } : {}),
        ...(timeToDate(form.horario.sabInicio) ? { inicioSab: timeToDate(form.horario.sabInicio) } : {}),
        ...(timeToDate(form.horario.sabFim) ? { terminioSab: timeToDate(form.horario.sabFim) } : {}),
        ...(timeToDate(form.horario.domInicio) ? { inicioDom: timeToDate(form.horario.domInicio) } : {}),
        ...(timeToDate(form.horario.domFim) ? { terminioDom: timeToDate(form.horario.domFim) } : {}),
      };

      const payload: Record<string, any> = {
        bio: form.bio.trim(),
        especializacao: form.especializacao
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .join(', '),
        cep: normalizedCep,
        cidade: form.cidade.trim(),
        estado: form.estado.trim(),
        servicos: parsedServices,
      };

      if (Object.keys(horarioPayload).length) {
        payload.horarioAtendimento = horarioPayload;
      } else {
        payload.horarioAtendimento = deleteField();
      }

      payload.location = deleteField();
      payload.latitude = deleteField();
      payload.longitude = deleteField();

      await updateDoc(doc(db, 'users', user.uid), payload);
      await refreshUser();
      const list = await firestoreService.fetchPersonals(120);
      setPersonals(list);
      setSaveMessage('Vitrine atualizada com sucesso. Agora os alunos ja veem essas informacoes.');
      setEditOpen(false);
    } catch (error: any) {
      setSaveMessage(error?.message || 'Nao foi possivel salvar sua vitrine.');
    } finally {
      setSaving(false);
    }
  };

  const handleConnectFormChange =
    (field: keyof RecebimentosFormState) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setConnectForm((previous) => ({ ...previous, [field]: value }));
    };

  const uploadDocumentToStorage = async (
    userId: string,
    file: File,
    type: 'front' | 'back'
  ) => {
    const safeName = sanitizeFileName(file.name || `${type}.jpg`) || `${type}.jpg`;
    const timestamp = Date.now();
    const path = `users/${userId}/recebimentos/${type}-${timestamp}-${safeName}`;
    const storageRef = ref(storage, path);
    const upload = await uploadBytes(storageRef, file, {
      contentType: file.type || 'application/octet-stream',
    });
    return getDownloadURL(upload.ref);
  };

  const refreshConnectStatus = async () => {
    if (!user?.uid) return;
    setConnectMessage('');
    setConnectLoading(true);
    try {
      const result = await fetchStripeConnectStatus(user.uid, user.stripeAccountId);
      if (result.data) {
        setConnectStatus(result.data);
        if (result.data.accountId && result.data.accountId !== user.stripeAccountId) {
          await updateDoc(doc(db, 'users', user.uid), {
            stripeAccountId: result.data.accountId,
          });
          await refreshUser();
        }
      }
      if (result.error) {
        setConnectMessage(normalizeConnectError(result.error));
      } else {
        setConnectMessage('');
      }
    } catch (error: any) {
      setConnectMessage(normalizeConnectError(String(error?.message || 'Erro ao consultar status.')));
    } finally {
      setConnectLoading(false);
    }
  };

  const handleSubmitConnectForm = async () => {
    setConnectFormMessage('');
    setConnectRedirectUrl('');

    if (!connectReady) {
      setConnectFormMessage('Servico de recebimentos nao configurado.');
      return;
    }
    if (!user?.uid) {
      setConnectFormMessage('Conta nao encontrada.');
      return;
    }

    const requiredFields: Array<[keyof RecebimentosFormState, string]> = [
      ['email', 'email'],
      ['firstName', 'nome'],
      ['lastName', 'sobrenome'],
      ['cpf', 'cpf'],
      ['dobDay', 'dia de nascimento'],
      ['dobMonth', 'mes de nascimento'],
      ['dobYear', 'ano de nascimento'],
      ['addressLine1', 'endereco'],
      ['addressCity', 'cidade'],
      ['addressState', 'estado'],
      ['addressPostalCode', 'cep'],
      ['phone', 'telefone'],
      ['productDescription', 'descricao do servico'],
      ['routingNumber', 'agencia'],
      ['accountNumber', 'conta'],
    ];
    const missing = requiredFields.find(([key]) => !connectForm[key]?.trim());
    if (missing) {
      setConnectFormMessage(`Preencha ${missing[1]}.`);
      return;
    }
    if (!connectForm.documentFront.trim() && !documentFrontFile) {
      setConnectFormMessage('Envie o documento da frente.');
      return;
    }
    if (!connectForm.documentBack.trim() && !documentBackFile) {
      setConnectFormMessage('Envie o documento do verso.');
      return;
    }

    const day = Number(connectForm.dobDay);
    const month = Number(connectForm.dobMonth);
    const year = Number(connectForm.dobYear);
    if (Number.isNaN(day) || day < 1 || day > 31) {
      setConnectFormMessage('Dia de nascimento invalido.');
      return;
    }
    if (Number.isNaN(month) || month < 1 || month > 12) {
      setConnectFormMessage('Mes de nascimento invalido.');
      return;
    }
    if (Number.isNaN(year) || year < 1900) {
      setConnectFormMessage('Ano de nascimento invalido.');
      return;
    }

    setConnectSubmitting(true);
    try {
      let documentFrontUrl = connectForm.documentFront.trim();
      let documentBackUrl = connectForm.documentBack.trim();

      if (documentFrontFile) {
        setUploadingFrontDocument(true);
        documentFrontUrl = await uploadDocumentToStorage(user.uid, documentFrontFile, 'front');
      }
      if (documentBackFile) {
        setUploadingBackDocument(true);
        documentBackUrl = await uploadDocumentToStorage(user.uid, documentBackFile, 'back');
      }

      setConnectForm((previous) => ({
        ...previous,
        documentFront: documentFrontUrl,
        documentBack: documentBackUrl,
      }));

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const returnUrl = origin ? `${origin}/mh-agenda-fit` : undefined;
      const result = await submitStripeConnectOnboarding({
        ...connectForm,
        documentFront: documentFrontUrl,
        documentBack: documentBackUrl,
        userId: user.uid,
        accountId: user.stripeAccountId,
        returnUrl,
        refreshUrl: returnUrl,
      });
      if (result.error || !result.data?.success) {
        throw new Error(result.error || 'Erro ao enviar questionario.');
      }

      const userPayload: Record<string, any> = {
        stripeDocumentFrontUrl: documentFrontUrl,
        stripeDocumentBackUrl: documentBackUrl,
      };

      if (result.data.accountId && result.data.accountId !== user.stripeAccountId) {
        userPayload.stripeAccountId = result.data.accountId;
      }
      await updateDoc(doc(db, 'users', user.uid), userPayload);
      setDocumentFrontFile(null);
      setDocumentBackFile(null);

      if (result.data.url) {
        setConnectRedirectUrl(result.data.url);
      }
      setConnectFormMessage('Questionario enviado. Complete as etapas para liberar recebimentos.');
      await refreshConnectStatus();
    } catch (error: any) {
      const fallback = normalizeConnectError(String(error?.message || 'Erro ao enviar questionario.'));
      setConnectFormMessage(getStorageErrorMessage(error, fallback));
    } finally {
      setUploadingFrontDocument(false);
      setUploadingBackDocument(false);
      setConnectSubmitting(false);
    }
  };

  const personalizationCount = personals.filter((personal) => (personal.servicos || []).length > 0).length;
  const locationCount = personals.filter((personal) => Boolean(getPersonalLocationLabel(personal))).length;
  const spotlightCount = Math.min(spotlightPersonals.length, 3);
  const hasActiveFilters = Boolean(search || cityFilter || serviceFilter);
  const todayAppointments = appointmentCountByDate[toDateKey(new Date())] || 0;
  const myStudentCount = myProfile ? getStudentsCountForPersonal(myProfile) : 0;
  const connectActive =
    Boolean(connectStatus?.chargesEnabled) && Boolean(connectStatus?.payoutsEnabled);
  const connectDeadline = useMemo(() => {
    if (!connectStatus?.requirements?.currentDeadline) return null;
    return new Date(connectStatus.requirements.currentDeadline * 1000);
  }, [connectStatus?.requirements?.currentDeadline]);

  return (
    <PageShell
      title="MH Agenda Fit"
      description="Marketplace interno para alunos encontrarem e agendarem com personais."
      breadcrumbs={[{ label: 'Painel', href: '/app' }]}
    >
      <section className="agenda-fit-page">
        <div className="agenda-fit-hero card">
          <div className="agenda-fit-hero-main">
            <p className="portal-pill">Top 3 em destaque</p>
            <h2>Sua vitrine precisa vender atendimento, nao so aparecer</h2>
            <p className="subtle">
              Mostre servicos, valores e disponibilidade de forma clara para aumentar pedidos de
              avaliacao, consulta e treino.
            </p>
            <div className="agenda-fit-hero-actions">
              <Link href="/schedule" className="button sm">
                Abrir agenda
              </Link>
              {isPersonal ? (
                <button type="button" className="button secondary sm" onClick={() => setEditOpen(true)}>
                  Editar minha vitrine
                </button>
              ) : (
                <Link href="/chat" className="button secondary sm">
                  Falar com personal
                </Link>
              )}
            </div>
          </div>
          <div className="agenda-fit-hero-stats">
            <div>
              <span>Destaque atual</span>
              <strong>{spotlightCount}</strong>
            </div>
            <div>
              <span>Com servicos</span>
              <strong>{personalizationCount}</strong>
            </div>
            <div>
              <span>Com localizacao</span>
              <strong>{locationCount}</strong>
            </div>
          </div>
        </div>

        {isPersonal && (
          <>
            <section className="agenda-fit-personal-hub">
              <article className="agenda-fit-profile-preview card">
                <div className="agenda-fit-profile-head">
                  <div className="agenda-fit-avatar lg">
                    {myProfile?.photoUrl ? (
                      <img src={myProfile.photoUrl} alt={myProfile.displayName} />
                    ) : (
                      <span>{(myProfile?.displayName || user?.displayName || 'P').trim().charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <p className="portal-pill">Meu perfil no MH Agenda Fit</p>
                    <h3>{myProfile?.displayName || user?.displayName || 'Personal'}</h3>
                    <p className="subtle">{myProfile?.bio || 'Atualize sua bio para gerar mais pedidos de atendimento.'}</p>
                  </div>
                </div>
                <div className="agenda-fit-profile-meta">
                  <span>Codigo {myProfile?.codigoPersonal ? String(myProfile.codigoPersonal) : '--'}</span>
                  <span>{getPersonalLocationLabel(myProfile || ({} as PersonalProfile)) || 'Localizacao nao informada'}</span>
                  <span>{myStudentCount} alunos vinculados</span>
                </div>
                <div className="agenda-fit-service-tags">
                  {(myProfile?.servicos || []).length ? (
                    myProfile!.servicos!.slice(0, 3).map((service, index) => (
                      <div key={`my-service-${index}`} className="agenda-fit-service-tag">
                        <strong>{service.servicos}</strong>
                        <span>{toCurrencyLabel(service.valor)}</span>
                        {service.descricao ? <p>{service.descricao}</p> : null}
                      </div>
                    ))
                  ) : (
                    <p className="subtle">Voce ainda nao cadastrou servicos.</p>
                  )}
                </div>
                <div className="agenda-fit-card-actions">
                  <button type="button" className="button sm" onClick={() => setEditOpen(true)}>
                    Editar perfil
                  </button>
                  <Link href="/personal/profile" className="button secondary sm">
                    Ver perfil publico
                  </Link>
                </div>
              </article>

              <div className="agenda-fit-overview-grid">
                <article className="agenda-fit-overview-card card">
                  <span>Saldo recebido</span>
                  <strong>{loadingBalance ? '...' : formatMoney(balanceSummary.paid)}</strong>
                  <small>{balanceSummary.total} cobrancas no Agenda Fit</small>
                </article>
                <article className="agenda-fit-overview-card card">
                  <span>Pendente</span>
                  <strong>{loadingBalance ? '...' : formatMoney(balanceSummary.pending)}</strong>
                  <small>Ultimo registro {balanceSummary.lastPaymentAt ? toDayMonth(balanceSummary.lastPaymentAt) : '--'}</small>
                </article>
                <article className="agenda-fit-overview-card card">
                  <span>Alunos</span>
                  <strong>{loadingMyStudents ? '...' : myStudents.length}</strong>
                  <small>{activeStudentsCount} ativos</small>
                </article>
                <article className="agenda-fit-overview-card card">
                  <span>Agenda de hoje</span>
                  <strong>{loadingMyAppointments ? '...' : todayAppointments}</strong>
                  <small>
                    <Link href="/schedule">Abrir aba Agenda</Link>
                  </small>
                </article>
              </div>

              <article className="agenda-fit-payments-panel card">
                <div className="agenda-fit-panel-head">
                  <div>
                    <h4>Recebimentos no app</h4>
                    <p className="subtle">Valide sua conta para liberar cobrancas e repasses.</p>
                  </div>
                  <span className={`agenda-fit-connect-pill ${connectActive ? 'is-active' : 'is-pending'}`}>
                    {connectLoading ? 'Verificando' : connectActive ? 'Ativo' : 'Pendente'}
                  </span>
                </div>

                <div className="agenda-fit-connect-grid">
                  <div className="agenda-fit-connect-line">
                    <span>Conta vinculada</span>
                    <strong>{connectStatus?.accountId ? 'Configurada' : 'Nao informada'}</strong>
                  </div>
                  <div className="agenda-fit-connect-line">
                    <span>Prazos de ajuste</span>
                    <strong>
                      {connectDeadline
                        ? new Intl.DateTimeFormat('pt-BR').format(connectDeadline)
                        : 'Sem prazo'}
                    </strong>
                  </div>
                  <div className="agenda-fit-connect-line">
                    <span>Itens pendentes</span>
                    <strong>{connectStatus?.requirements?.disabledReason ? 'Revisar dados' : 'Sem bloqueios'}</strong>
                  </div>
                </div>

                <div className="agenda-fit-card-actions">
                  <button type="button" className="button sm" onClick={() => setRecebimentosOpen(true)}>
                    Abrir questionario
                  </button>
                  <button
                    type="button"
                    className="button secondary sm"
                    onClick={refreshConnectStatus}
                    disabled={connectLoading || !connectReady}
                  >
                    Verificar status
                  </button>
                </div>
                {connectMessage ? <p className="subtle">{connectMessage}</p> : null}
              </article>

              <article className="agenda-fit-calendar-panel card">
                <div className="agenda-fit-panel-head">
                  <div>
                    <h4>Calendario da agenda</h4>
                    <p className="subtle">Resumo da semana e proximos atendimentos.</p>
                  </div>
                  <Link href="/schedule" className="button secondary sm">
                    Ver agenda completa
                  </Link>
                </div>

                <div className="agenda-fit-day-strip">
                  {nextSevenDays.map((day) => {
                    const key = toDateKey(day);
                    const count = appointmentCountByDate[key] || 0;
                    return (
                      <Link key={key} href={`/schedule?date=${toDateParam(day)}`} className="agenda-fit-day-pill">
                        <span>{toWeekDay(day)}</span>
                        <strong>{toDayMonth(day)}</strong>
                        <small>{count} agendamentos</small>
                      </Link>
                    );
                  })}
                </div>

                <div className="agenda-fit-upcoming-list">
                  {loadingMyAppointments ? (
                    <p className="subtle">Carregando agenda...</p>
                  ) : upcomingAppointments.length ? (
                    upcomingAppointments.map((appointment) => (
                      <Link key={appointment.id} href={`/schedule?date=${toDateParam(appointment.data)}`} className="agenda-fit-upcoming-item">
                        <div>
                          <strong>{appointment.servico || 'Atendimento'}</strong>
                          <span>{appointment.alunoNome || 'Aluno'}</span>
                        </div>
                        <div>
                          <strong>{toDayMonth(appointment.data)} {appointment.horaInicio || ''}</strong>
                          <span>{getStatusLabel(appointment.status)}</span>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <p className="subtle">Sem proximos atendimentos na agenda.</p>
                  )}
                </div>
              </article>

              <article className="agenda-fit-students-panel card">
                <div className="agenda-fit-panel-head">
                  <div>
                    <h4>Seus alunos</h4>
                    <p className="subtle">Visual rapido dos alunos vinculados ao seu codigo.</p>
                  </div>
                  <Link href="/students" className="button secondary sm">
                    Ver todos
                  </Link>
                </div>
                <div className="agenda-fit-students-list">
                  {loadingMyStudents ? (
                    <p className="subtle">Carregando alunos...</p>
                  ) : myStudents.length ? (
                    myStudents.slice(0, 8).map((student) => (
                      <Link key={student.id} href={`/students/${student.id}`} className="agenda-fit-student-item">
                        <div className="agenda-fit-avatar sm">
                          {student.photoUrl ? (
                            <img src={student.photoUrl} alt={student.nome} />
                          ) : (
                            <span>{student.nome.trim().charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <strong>{student.nome}</strong>
                          <span>{student.email || 'Sem email'}</span>
                        </div>
                        <em className={`students-status is-${student.status}`}>{student.status}</em>
                      </Link>
                    ))
                  ) : (
                    <p className="subtle">Nenhum aluno vinculado ainda.</p>
                  )}
                </div>
              </article>
            </section>

            <div
              className={`agenda-fit-sheet ${editOpen ? 'is-open' : ''}`}
              aria-hidden={!editOpen}
              onClick={() => setEditOpen(false)}
            >
              <div className="agenda-fit-sheet-backdrop" />
              <div className="agenda-fit-sheet-panel" onClick={(event) => event.stopPropagation()}>
                <div className="agenda-fit-sheet-handle" />
                <form className="agenda-fit-editor" onSubmit={handleSavePersonalShowcase}>
                  <div className="agenda-fit-editor-head">
                    <div>
                      <h3>Editar vitrine no MH Agenda Fit</h3>
                      <p className="subtle">Atualize perfil, servicos e horarios.</p>
                    </div>
                    <button type="button" className="button secondary sm" onClick={() => setEditOpen(false)}>
                      Fechar
                    </button>
                  </div>

                  <div className="agenda-fit-editor-layout">
                    <div className="agenda-fit-editor-primary">
                      <div className="agenda-fit-form-grid">
                        <label>
                          Bio comercial
                          <textarea
                            value={form.bio}
                            onChange={(event) =>
                              setForm((previous) => ({ ...previous, bio: event.target.value }))
                            }
                            placeholder="Ex: Especialista em emagrecimento e retorno ao esporte."
                            rows={3}
                          />
                        </label>
                        <label>
                          Especializacoes (separadas por virgula)
                          <input
                            className="agenda-fit-specialization-input"
                            type="text"
                            value={form.especializacao}
                            onChange={(event) =>
                              setForm((previous) => ({ ...previous, especializacao: event.target.value }))
                            }
                            placeholder="Emagrecimento, Hipertrofia, Reabilitacao"
                          />
                        </label>

                        <div className="agenda-fit-address-grid agenda-fit-field-span-2">
                          <label className="agenda-fit-cep-field">
                            CEP
                            <div className="agenda-fit-cep-inline">
                              <input
                                type="text"
                                value={form.cep}
                                onChange={(event) => {
                                  const value = normalizeCep(event.target.value);
                                  setForm((previous) => ({ ...previous, cep: value }));
                                  setCepMessage('');
                                }}
                                placeholder="00000000"
                              />
                              <button
                                type="button"
                                className="button secondary sm agenda-fit-cep-button"
                                onClick={lookupCep}
                                disabled={cepLoading}
                              >
                                {cepLoading ? 'Validando...' : 'Validar'}
                              </button>
                            </div>
                            {cepMessage ? <small className="agenda-fit-cep-message">{cepMessage}</small> : null}
                          </label>

                          <label>
                            Estado
                            <select
                              value={form.estado}
                              onChange={(event) => {
                                const value = String(event.target.value || '').toUpperCase();
                                setForm((previous) => ({
                                  ...previous,
                                  estado: value,
                                  cidade: value === previous.estado ? previous.cidade : '',
                                }));
                                setCepMessage('');
                              }}
                            >
                              <option value="">Selecione</option>
                              {BRAZIL_STATES.map((stateCode) => (
                                <option key={stateCode} value={stateCode}>
                                  {stateCode}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            Cidade
                            <select
                              value={form.cidade}
                              onChange={(event) =>
                                setForm((previous) => ({ ...previous, cidade: event.target.value }))
                              }
                              disabled={!form.estado}
                            >
                              <option value="">{form.estado ? 'Selecione' : 'Selecione o estado'}</option>
                              {citySelectOptions.map((city) => (
                                <option key={city} value={city}>
                                  {city}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>

                      <div className="agenda-fit-services">
                        <div className="agenda-fit-services-head">
                          <h4>Servicos, valores e descricao</h4>
                          <button type="button" className="button secondary sm" onClick={addServiceField}>
                            Adicionar servico
                          </button>
                        </div>

                        <div className="agenda-fit-service-list">
                          {form.servicos.map((service, index) => (
                            <div key={`service-${index}`} className="agenda-fit-service-item">
                              <label>
                                Servico
                                <input
                                  type="text"
                                  value={service.nome}
                                  onChange={(event) => updateService(index, 'nome', event.target.value)}
                                  placeholder="Avaliacao fisica completa"
                                />
                              </label>
                              <label>
                                Valor (R$)
                                <input
                                  type="text"
                                  value={service.preco}
                                  onChange={(event) => updateService(index, 'preco', event.target.value)}
                                  placeholder="120"
                                />
                              </label>
                              <label className="agenda-fit-service-description">
                                Descricao
                                <input
                                  type="text"
                                  value={service.descricao}
                                  onChange={(event) => updateService(index, 'descricao', event.target.value)}
                                  placeholder="Inclui anamnese + composicao corporal + plano inicial."
                                />
                              </label>
                              <button
                                type="button"
                                className="button secondary sm"
                                onClick={() => removeServiceField(index)}
                              >
                                Remover
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="agenda-fit-editor-aside">
                      <div className="agenda-fit-hours">
                        <h4>Horarios de atendimento</h4>
                        <div className="agenda-fit-hours-grid">
                          <label>
                            Seg-Sex inicio
                            <input
                              type="time"
                              value={form.horario.segSexInicio}
                              onChange={(event) =>
                                setForm((previous) => ({
                                  ...previous,
                                  horario: { ...previous.horario, segSexInicio: event.target.value },
                                }))
                              }
                            />
                          </label>
                          <label>
                            Seg-Sex fim
                            <input
                              type="time"
                              value={form.horario.segSexFim}
                              onChange={(event) =>
                                setForm((previous) => ({
                                  ...previous,
                                  horario: { ...previous.horario, segSexFim: event.target.value },
                                }))
                              }
                            />
                          </label>
                          <label>
                            Sabado inicio
                            <input
                              type="time"
                              value={form.horario.sabInicio}
                              onChange={(event) =>
                                setForm((previous) => ({
                                  ...previous,
                                  horario: { ...previous.horario, sabInicio: event.target.value },
                                }))
                              }
                            />
                          </label>
                          <label>
                            Sabado fim
                            <input
                              type="time"
                              value={form.horario.sabFim}
                              onChange={(event) =>
                                setForm((previous) => ({
                                  ...previous,
                                  horario: { ...previous.horario, sabFim: event.target.value },
                                }))
                              }
                            />
                          </label>
                          <label>
                            Domingo inicio
                            <input
                              type="time"
                              value={form.horario.domInicio}
                              onChange={(event) =>
                                setForm((previous) => ({
                                  ...previous,
                                  horario: { ...previous.horario, domInicio: event.target.value },
                                }))
                              }
                            />
                          </label>
                          <label>
                            Domingo fim
                            <input
                              type="time"
                              value={form.horario.domFim}
                              onChange={(event) =>
                                setForm((previous) => ({
                                  ...previous,
                                  horario: { ...previous.horario, domFim: event.target.value },
                                }))
                              }
                            />
                          </label>
                        </div>
                      </div>

                      <div className="agenda-fit-tip-card">
                        <strong>Dica de conversao</strong>
                        <p>
                          Perfis com localizacao, servicos com preco e agenda preenchida convertem
                          melhor no MH Agenda Fit.
                        </p>
                      </div>
                    </div>
                  </div>

                  {saveMessage && (
                    <p className={`subscription-alert ${saveMessage.includes('sucesso') ? '' : 'is-error'}`}>
                      {saveMessage}
                    </p>
                  )}

                  <div className="agenda-fit-form-actions">
                    <button type="submit" className="button" disabled={saving}>
                      {saving ? 'Salvando vitrine...' : 'Salvar vitrine'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {recebimentosOpen && (
              <div className="billing-sheet">
                <button
                  type="button"
                  className="billing-sheet-overlay"
                  onClick={() => setRecebimentosOpen(false)}
                  aria-label="Fechar"
                />
                <div className="billing-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="recebimentos-title">
                  <div className="billing-sheet-header">
                    <div>
                      <h3 id="recebimentos-title">Questionario de recebimentos</h3>
                      <p className="subtle">Preencha os dados para ativar cobrancas e repasses.</p>
                    </div>
                    <button
                      type="button"
                      className="billing-sheet-close"
                      onClick={() => setRecebimentosOpen(false)}
                    >
                      Fechar
                    </button>
                  </div>

                  <div className="billing-sheet-body academy-form">
                    <div className="billing-sheet-section">
                      <h4>Dados pessoais</h4>
                      <div className="academy-form-row">
                        <label>
                          <span>Nome</span>
                          <input
                            type="text"
                            value={connectForm.firstName}
                            placeholder="Lucas"
                            onChange={handleConnectFormChange('firstName')}
                          />
                        </label>
                        <label>
                          <span>Sobrenome</span>
                          <input
                            type="text"
                            value={connectForm.lastName}
                            placeholder="Silva"
                            onChange={handleConnectFormChange('lastName')}
                          />
                        </label>
                      </div>
                      <div className="academy-form-row">
                        <label>
                          <span>Email</span>
                          <input
                            type="email"
                            value={connectForm.email}
                            placeholder="contato@email.com"
                            onChange={handleConnectFormChange('email')}
                          />
                        </label>
                        <label>
                          <span>Telefone</span>
                          <input
                            type="text"
                            value={connectForm.phone}
                            placeholder="11 99999-0000"
                            onChange={handleConnectFormChange('phone')}
                          />
                        </label>
                      </div>
                      <div className="academy-form-row">
                        <label>
                          <span>CPF</span>
                          <input
                            type="text"
                            value={connectForm.cpf}
                            placeholder="00000000000"
                            onChange={handleConnectFormChange('cpf')}
                          />
                        </label>
                        <label>
                          <span>Dia</span>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={connectForm.dobDay}
                            placeholder="10"
                            onChange={handleConnectFormChange('dobDay')}
                          />
                        </label>
                        <label>
                          <span>Mes</span>
                          <input
                            type="number"
                            min="1"
                            max="12"
                            value={connectForm.dobMonth}
                            placeholder="08"
                            onChange={handleConnectFormChange('dobMonth')}
                          />
                        </label>
                        <label>
                          <span>Ano</span>
                          <input
                            type="number"
                            min="1900"
                            max="2100"
                            value={connectForm.dobYear}
                            placeholder="1992"
                            onChange={handleConnectFormChange('dobYear')}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="billing-sheet-section">
                      <h4>Endereco</h4>
                      <div className="academy-form-row">
                        <label>
                          <span>Rua e numero</span>
                          <input
                            type="text"
                            value={connectForm.addressLine1}
                            placeholder="Rua Exemplo, 120"
                            onChange={handleConnectFormChange('addressLine1')}
                          />
                        </label>
                        <label>
                          <span>Cidade</span>
                          <input
                            type="text"
                            value={connectForm.addressCity}
                            placeholder="Sao Paulo"
                            onChange={handleConnectFormChange('addressCity')}
                          />
                        </label>
                      </div>
                      <div className="academy-form-row">
                        <label>
                          <span>Estado (UF)</span>
                          <input
                            type="text"
                            value={connectForm.addressState}
                            placeholder="SP"
                            onChange={handleConnectFormChange('addressState')}
                          />
                        </label>
                        <label>
                          <span>CEP</span>
                          <input
                            type="text"
                            value={connectForm.addressPostalCode}
                            placeholder="00000000"
                            onChange={handleConnectFormChange('addressPostalCode')}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="billing-sheet-section">
                      <h4>Dados bancarios</h4>
                      <div className="academy-form-row">
                        <label>
                          <span>Agencia</span>
                          <input
                            type="text"
                            value={connectForm.routingNumber}
                            placeholder="0001"
                            onChange={handleConnectFormChange('routingNumber')}
                          />
                        </label>
                        <label>
                          <span>Conta</span>
                          <input
                            type="text"
                            value={connectForm.accountNumber}
                            placeholder="12345-6"
                            onChange={handleConnectFormChange('accountNumber')}
                          />
                        </label>
                      </div>
                      <label>
                        <span>Descricao do servico</span>
                        <input
                          type="text"
                          value={connectForm.productDescription}
                          placeholder="Planos de treino e acompanhamento"
                          onChange={handleConnectFormChange('productDescription')}
                        />
                      </label>
                    </div>

                    <div className="billing-sheet-section">
                      <h4>Documentos obrigatorios</h4>
                      <div className="academy-form-row">
                        <label className="billing-document-upload">
                          <span>Frente do documento</span>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(event) => {
                              const nextFile = event.target.files?.[0] || null;
                              setDocumentFrontFile(nextFile);
                              if (nextFile) {
                                setConnectForm((previous) => ({ ...previous, documentFront: '' }));
                              }
                            }}
                          />
                          {documentFrontFile ? (
                            <small>Selecionado: {documentFrontFile.name}</small>
                          ) : connectForm.documentFront ? (
                            <small>
                              Arquivo enviado.{' '}
                              <a href={connectForm.documentFront} target="_blank" rel="noreferrer">
                                Ver arquivo
                              </a>
                            </small>
                          ) : (
                            <small>Envie imagem ou PDF da frente.</small>
                          )}
                        </label>
                        <label className="billing-document-upload">
                          <span>Verso do documento</span>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(event) => {
                              const nextFile = event.target.files?.[0] || null;
                              setDocumentBackFile(nextFile);
                              if (nextFile) {
                                setConnectForm((previous) => ({ ...previous, documentBack: '' }));
                              }
                            }}
                          />
                          {documentBackFile ? (
                            <small>Selecionado: {documentBackFile.name}</small>
                          ) : connectForm.documentBack ? (
                            <small>
                              Arquivo enviado.{' '}
                              <a href={connectForm.documentBack} target="_blank" rel="noreferrer">
                                Ver arquivo
                              </a>
                            </small>
                          ) : (
                            <small>Envie imagem ou PDF do verso.</small>
                          )}
                        </label>
                      </div>
                    </div>

                    <div className="billing-sheet-actions">
                      <button
                        type="button"
                        className="button"
                        onClick={handleSubmitConnectForm}
                        disabled={connectSubmitting || uploadingFrontDocument || uploadingBackDocument}
                      >
                        {connectSubmitting || uploadingFrontDocument || uploadingBackDocument
                          ? 'Enviando...'
                          : 'Enviar questionario'}
                      </button>
                      {connectRedirectUrl && (
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => window.open(connectRedirectUrl, '_blank', 'noopener,noreferrer')}
                        >
                          Continuar cadastro
                        </button>
                      )}
                    </div>
                    {connectFormMessage && <span className="billing-note">{connectFormMessage}</span>}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <section className="agenda-fit-discovery">
          <div className="agenda-fit-discovery-head">
            <div>
              <h3>Top 3 por quantidade de alunos</h3>
              <p className="subtle">
                Ranking principal baseado em alunos vinculados e, em caso de empate, perfil mais
                completo.
              </p>
            </div>
            <Link href="/schedule" className="button secondary sm">
              Abrir agenda
            </Link>
          </div>

          <div className="agenda-fit-summary-bar">
            <span>{filteredPersonals.length} personais encontrados pelos filtros</span>
            <strong>{spotlightCount} no top agora</strong>
            {hasActiveFilters ? <span>Filtros ativos</span> : <span>Sem filtros aplicados</span>}
          </div>

          <div className="agenda-fit-filters card">
            <label>
              Buscar por nome, especialidade ou servico
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ex: hipertrofia, avaliacao fisica, Sao Paulo"
              />
            </label>
            <label>
              Cidade
              <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
                <option value="">Todas</option>
                {cityOptions.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Servico
              <select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}>
                <option value="">Todos</option>
                {serviceOptions.map((service) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {listError && <p className="subscription-alert is-error">{listError}</p>}
          {loadingPersonals ? (
            <div className="card">
              <p className="subtle">Carregando personais...</p>
            </div>
          ) : spotlightPersonals.length ? (
            <div className="agenda-fit-ranking-list">
              {spotlightPersonals.map((personal, index) => {
                const studentsCount = getStudentsCountForPersonal(personal);
                const code = personal.codigoPersonal;
                const profileHref = code ? `/personal/profile?code=${String(code)}` : '/personal/profile';
                const locationLabel = getPersonalLocationLabel(personal);
                const firstService = personal.servicos?.[0]?.servicos || '';
                return (
                  <Link
                    key={personal.id}
                    href={profileHref}
                    className={`agenda-fit-ranking-item rank-${index + 1}`}
                  >
                    <span className={`agenda-fit-rank rank-${index + 1}`}>Top {index + 1}</span>
                    <div className="agenda-fit-avatar sm">
                      {personal.photoUrl ? (
                        <img src={personal.photoUrl} alt={personal.displayName} />
                      ) : (
                        <span>{personal.displayName.trim().charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="agenda-fit-ranking-info">
                      <strong>{personal.displayName}</strong>
                      <span>
                        {locationLabel || 'Localizacao nao informada'}
                        {firstService ? ` | ${firstService}` : ''}
                      </span>
                    </div>
                    <div className="agenda-fit-ranking-meta">
                      <span className="agenda-fit-ranking-count">{studentsCount} alunos</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="card">
              <p className="subtle">
                Nenhum personal encontrado com esses filtros. Ajuste os campos para montar o top 3.
              </p>
            </div>
          )}
        </section>
      </section>
    </PageShell>
  );
}
