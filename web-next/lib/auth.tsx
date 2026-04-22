'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  getRedirectResult,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './firebaseClient';
import type { AuthState, SupportedLanguage, User, UserRole } from './types/user';
import { firestoreService } from './services/firestoreService';
import { notifyUserLoginSecurityAlert } from './services/notificationCenter';
import { isPremiumUserRecord, normalizeSubscriptionStatus } from './services/aiAccess';
import { getSubscriptionStatus } from './services/payments';
import { normalizeEmailInput } from './utils/email';
import { fetchInvitePersonalCapacity } from './services/inviteService';
import {
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  readStoredLanguage,
  persistPreferredLanguage,
  syncPreferredLanguage,
} from './language';
import {
  clearWebMonitoringContext,
  logWebMonitoringError,
  setWebMonitoringContext,
  startWebMonitoringTrace,
  type WebMonitoringTraceHandle,
} from './services/monitoring';
import { attachWebPresence, detachWebPresence } from './services/presence';

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginAsPersonal: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  loginWithApple: () => Promise<{ success: boolean; error?: string }>;
  register: (
    email: string,
    password: string,
    displayName: string,
    additionalData?: Partial<User>
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<{ success: boolean; error?: string }>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  setPreferredLanguage: (language: SupportedLanguage) => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_SNAPSHOT_KEY = 'mh-auth-snapshot-v1';
const AUTH_RESOLVE_TIMEOUT_MS = 6000;

type StoredAuthSnapshot = {
  uid: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  createdTime?: string;
  lastActiveTime?: string;
  professorAccount?: boolean;
  admin?: boolean;
  academyAccount?: boolean;
  assinatura?: boolean;
  tipoDeAssinatura?: string;
  planoChatGPT?: boolean;
  acessoSuspenso?: boolean;
  codigoPersonal?: number;
  codigoAcademia?: number | string;
  language?: SupportedLanguage;
  role: UserRole | null;
};

const toBool = (value: any) => value === true || value === 'true' || value === 1;
const ADMIN_EMAIL_DOMAIN = 'admin.com';
const isAdminEmail = (email?: string | null) => {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@${ADMIN_EMAIL_DOMAIN}`);
};

const normalizeServicos = (value: any) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      nome: item?.nome || item?.servicos || '',
      descricao: item?.descricao || '',
      preco: typeof item?.valor === 'number' ? item.valor : item?.preco,
    }))
    .filter((item) => item.nome);
};

const normalizeHorario = (value: any) => {
  if (!value) return undefined;
  const toDate = (input: any) => {
    if (!input) return undefined;
    if (input.toDate) return input.toDate();
    if (input instanceof Date) return input;
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  };
  const horario = {
    inicioSegSex: toDate(value.inicioSegSex),
    terminioSegSex: toDate(value.terminioSegSex),
    inicioSab: toDate(value.inicioSab),
    terminioSab: toDate(value.terminioSab),
    inicioDom: toDate(value.inicioDom),
    terminioDom: toDate(value.terminioDom),
  };
  const hasAny = Object.values(horario).some(Boolean);
  return hasAny ? horario : undefined;
};

const isMissingCode = (value?: string | number | null) => {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  return text === '' || text === '0';
};

const normalizePersonalCodeValue = (value: any): number | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === '0') return null;
  const numeric = Number(text);
  return Number.isNaN(numeric) ? null : numeric;
};

const resolvePersonalCode = async (
  uid: string,
  fallback?: string | number | null
): Promise<{ code: number | null; needsSync: boolean }> => {
  const direct = normalizePersonalCodeValue(fallback);
  if (direct !== null) {
    return { code: direct, needsSync: false };
  }

  const personalAccountRef = collection(db, 'users', uid, 'personalAccount');
  const personalSnapshot = await getDocs(personalAccountRef);
  if (!personalSnapshot.empty) {
    const code = normalizePersonalCodeValue(personalSnapshot.docs[0].data().codigoPersonal);
    if (code !== null) {
      return { code, needsSync: true };
    }
  }

  const professorAccountRef = collection(db, 'professorAccount');
  const professorSnapshot = await getDocs(
    query(professorAccountRef, where('uid', '==', uid), limit(1))
  );
  if (!professorSnapshot.empty) {
    const code = normalizePersonalCodeValue(professorSnapshot.docs[0].data().codigoPersonal);
    if (code !== null) {
      return { code, needsSync: true };
    }
  }

  return { code: null, needsSync: false };
};

const generateNumericCode = (digits: number) => {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return Math.floor(min + Math.random() * (max - min + 1));
};

const isCodeInUse = async (field: 'codigoPersonal' | 'codigoAcademia', code: number) => {
  const usersRef = collection(db, 'users');
  const asText = String(code);
  const snapshots = await Promise.all([
    getDocs(query(usersRef, where(field, '==', code), limit(1))),
    getDocs(query(usersRef, where(field, '==', asText), limit(1))),
  ]);
  return snapshots.some((snapshot) => !snapshot.empty);
};

const generateUniqueCode = async (field: 'codigoPersonal' | 'codigoAcademia', digits: number) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateNumericCode(digits);
    if (!(await isCodeInUse(field, candidate))) {
      return candidate;
    }
  }
  const fallbackSeed = String(Date.now()).slice(-digits);
  const fallback = Number(fallbackSeed.padStart(digits, '1'));
  if (!(await isCodeInUse(field, fallback))) {
    return fallback;
  }
  return generateNumericCode(digits);
};

const mergeDerivedStripeSubscription = (user: User, subscription: any): User => {
  if (!subscription || subscription.status === 'not_found') return user;

  const subscriptionStatus = String(
    subscription.status || subscription.subscriptionStatus || ''
  ).trim();
  const normalizedStatus = normalizeSubscriptionStatus(subscriptionStatus);
  const hasStripePremium = ['active', 'trialing', 'past_due'].includes(normalizedStatus);
  const planName =
    subscription.planName ||
    subscription.plan?.nickname ||
    subscription.plan ||
    subscription.price?.nickname ||
    user.tipoDeAssinatura;

  if (
    !subscriptionStatus &&
    !subscription.subscriptionId &&
    !subscription.customerId &&
    !planName
  ) {
    return user;
  }

  return {
    ...user,
    assinatura: hasStripePremium,
    planoChatGPT: hasStripePremium,
    tipoDeAssinatura: planName,
    subscribeId: subscription.subscriptionId || user.subscribeId,
    customer: subscription.customerId || user.customer,
    stripeSubscriptionStatus: subscriptionStatus || user.stripeSubscriptionStatus,
    subscriptionStatus: subscriptionStatus || user.subscriptionStatus,
    statusAssinatura: subscriptionStatus || user.statusAssinatura,
    assinaturaStatus: subscriptionStatus || user.assinaturaStatus,
  };
};

const resolveRole = (user: User | null): UserRole | null => {
  if (!user) return null;
  if (user.admin && isAdminEmail(user.email)) return 'admin';
  if (user.academyAccount) return 'academy';
  if (user.professorAccount) return 'professor';
  return 'aluno';
};

const buildBootstrapUser = (firebaseUser: FirebaseUser, seed?: Partial<User> | null): User => ({
  uid: firebaseUser.uid,
  email: seed?.email || firebaseUser.email || '',
  displayName:
    seed?.displayName ||
    firebaseUser.displayName ||
    (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Usuario'),
  photoUrl: seed?.photoUrl || firebaseUser.photoURL || undefined,
  language: normalizeLanguage(seed?.language, readStoredLanguage() || DEFAULT_LANGUAGE),
  createdTime: seed?.createdTime || new Date(),
  lastActiveTime: seed?.lastActiveTime,
  professorAccount: Boolean(seed?.professorAccount),
  admin: Boolean(seed?.admin),
  academyAccount: Boolean(seed?.academyAccount),
  assinatura: Boolean(seed?.assinatura),
  tipoDeAssinatura: seed?.tipoDeAssinatura,
  planoChatGPT: Boolean(seed?.planoChatGPT),
  acessoSuspenso: Boolean(seed?.acessoSuspenso),
  codigoPersonal: seed?.codigoPersonal,
  codigoAcademia: seed?.codigoAcademia,
});

const persistAuthSnapshot = (user: User | null, role?: UserRole | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (!user) {
      window.localStorage.removeItem(AUTH_SNAPSHOT_KEY);
      return;
    }
    const snapshot: StoredAuthSnapshot = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoUrl: user.photoUrl,
      createdTime: user.createdTime?.toISOString?.(),
      lastActiveTime: user.lastActiveTime?.toISOString?.(),
      professorAccount: user.professorAccount,
      admin: user.admin,
      academyAccount: user.academyAccount,
      assinatura: user.assinatura,
      tipoDeAssinatura: user.tipoDeAssinatura,
      planoChatGPT: user.planoChatGPT,
      acessoSuspenso: user.acessoSuspenso,
      codigoPersonal: user.codigoPersonal,
      codigoAcademia: user.codigoAcademia,
      language: normalizeLanguage(user.language, readStoredLanguage() || DEFAULT_LANGUAGE),
      role: role !== undefined ? role : resolveRole(user),
    };
    window.localStorage.setItem(AUTH_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (error) {
    // Ignore local persistence issues and keep auth flow moving.
  }
};

const readAuthSnapshot = (uid?: string): { user: User; role: UserRole | null } | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_SNAPSHOT_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as StoredAuthSnapshot;
    if (!snapshot?.uid || (uid && snapshot.uid !== uid)) {
      return null;
    }
    return {
      user: {
        uid: snapshot.uid,
        email: snapshot.email || '',
        displayName: snapshot.displayName || '',
        photoUrl: snapshot.photoUrl,
        language: normalizeLanguage(snapshot.language, readStoredLanguage() || DEFAULT_LANGUAGE),
        createdTime: snapshot.createdTime ? new Date(snapshot.createdTime) : new Date(),
        lastActiveTime: snapshot.lastActiveTime ? new Date(snapshot.lastActiveTime) : undefined,
        professorAccount: Boolean(snapshot.professorAccount),
        admin: Boolean(snapshot.admin),
        academyAccount: Boolean(snapshot.academyAccount),
        assinatura: Boolean(snapshot.assinatura),
        tipoDeAssinatura: snapshot.tipoDeAssinatura,
        planoChatGPT: Boolean(snapshot.planoChatGPT),
        acessoSuspenso: Boolean(snapshot.acessoSuspenso),
        codigoPersonal: snapshot.codigoPersonal,
        codigoAcademia: snapshot.codigoAcademia,
      },
      role: snapshot.role ?? null,
    };
  } catch (error) {
    return null;
  }
};

const mapUserData = (uid: string, data: Record<string, any>): User => ({
  uid,
  email: data.email || '',
  displayName: data.display_name || '',
  photoUrl: data.photo_url,
  language: normalizeLanguage(data.language || data.locale || data.idioma, readStoredLanguage() || DEFAULT_LANGUAGE),
  phoneNumber: data.phone_number,
  birthday: data.birthday,
  genero: data.genero,
  createdTime: data.created_time?.toDate?.() || new Date(),
  lastActiveTime: data.last_active_time?.toDate?.(),
  professorAccount: toBool(data.professorAccount),
  admin: toBool(data.admin),
  academyAccount: toBool(data.academyAccount),
  assinatura: toBool(data.assinatura),
  tipoDeAssinatura: data.tipoDeAssinatura,
  planoChatGPT: toBool(data.planoChatGPT),
  acessoSuspenso: toBool(data.acessoSuspenso),
  codigoPersonal: data.codigoPersonal,
  codigoAcademia: data.codigoAcademia,
  personalAccountId: data.personalAccount?.id,
  nameDoSeuPersonal: data.nameDoSeuPersonal,
  objetivoNoApp: data.objetivoNoApp,
  experiencia: data.expericencia,
  equipamento: data.equipamento,
  tempoPorSessao: data.tempoPorSessao,
  diasDeTreino: data.diasDeTreino,
  limitacao: data.limitacao,
  peso: data.peso,
  altura: data.altura,
  nivelDeAtividade: data.nivelDeAtividade,
  alunoDesde: data.alunoDesde?.toDate?.(),
  metodoDePagamento: data.metodoDePagamento,
  chavePixDoPersonal: data.chavePixDoPersonal,
  cpfCnpj: data.cpfCnpj,
  customer: data.customer,
  subscribeId: data.subscribeId,
  stripeAtivo: data.stripeAtivo,
  stripeAccountId: data.stripeAccountId,
  bio: data.bio,
  cref: data.cref,
  instagram: data.instagram,
  linkedin: data.linkedin,
  cidade: data.cidade || data.city || data.cidadeAtual,
  estado: data.estado || data.uf || data.state,
  location:
    data.location ||
    (data.latitude && data.longitude
      ? { latitude: data.latitude, longitude: data.longitude }
      : undefined),
  especializacao: data.especializacao,
  servicos: normalizeServicos(data.servicos),
  horarioAtendimento: normalizeHorario(data.horarioAtendimento),
  alunos: data.alunos?.map((ref: any) => ref.id) || [],
  treinos: data.treinos || [],
  rotinaDeTreino: data.rotinaDeTreino || [],
});

const ensureUserDocument = async (
  firebaseUser: FirebaseUser,
  overrides?: { displayName?: string; email?: string; photoUrl?: string }
) => {
  const userRef = doc(db, 'users', firebaseUser.uid);
  const snapshot = await getDoc(userRef);
  const email = overrides?.email || firebaseUser.email || '';
  const displayName =
    overrides?.displayName ||
    firebaseUser.displayName ||
    (email ? email.split('@')[0] : '');
  const photoUrl = overrides?.photoUrl || firebaseUser.photoURL || '';

  if (!snapshot.exists()) {
    await setDoc(userRef, {
      uid: firebaseUser.uid,
      email,
      display_name: displayName,
      photo_url: photoUrl,
      language: readStoredLanguage() || DEFAULT_LANGUAGE,
      created_time: serverTimestamp(),
      last_active_time: serverTimestamp(),
      professorAccount: false,
      admin: isAdminEmail(email),
      academyAccount: false,
      assinatura: false,
      planoChatGPT: false,
      acessoSuspenso: false,
    });
    return;
  }

  const data = snapshot.data();
  const updates: Record<string, any> = {};
  if (!data?.display_name && displayName) updates.display_name = displayName;
  if (!data?.photo_url && photoUrl) updates.photo_url = photoUrl;
  if (!data?.email && email) updates.email = email;
  if (!data?.language) updates.language = readStoredLanguage() || DEFAULT_LANGUAGE;
  const shouldBeAdmin = isAdminEmail(email);
  if (shouldBeAdmin && !toBool(data?.admin)) updates.admin = true;
  if (!shouldBeAdmin && toBool(data?.admin)) updates.admin = false;
  if (Object.keys(updates).length > 0) {
    await updateDoc(userRef, updates);
  }
};

const fetchUserDoc = async (uid: string): Promise<User | null> => {
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (!userDoc.exists()) {
    return null;
  }
  const data = userDoc.data();
  let user = mapUserData(uid, data);
  if (user.professorAccount) {
    const resolved = await resolvePersonalCode(uid, data.codigoPersonal);
    if (resolved.code !== null) {
      user = { ...user, codigoPersonal: resolved.code };
      if (resolved.needsSync) {
        await updateDoc(doc(db, 'users', uid), { codigoPersonal: resolved.code });
      }
    }
  }
  return user;
};

const resolveStripeBackedUser = async (user: User | null): Promise<User | null> => {
  if (!user?.uid) return user;

  try {
    const result = await getSubscriptionStatus(user.uid, {
      email: user.email,
      subscriptionId: user.subscribeId,
      customerId: user.customer,
    });
    if (!result.data) return user;
    return mergeDerivedStripeSubscription(user, result.data);
  } catch {
    return user;
  }
};

const getAuthErrorMessage = (code: string): string => {
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'Este email ja esta em uso.',
    'auth/invalid-email': 'Email invalido.',
    'auth/operation-not-allowed': 'Operacao nao permitida.',
    'auth/weak-password': 'Senha muito fraca. Use pelo menos 6 caracteres.',
    'auth/user-disabled': 'Esta conta foi desativada.',
    'auth/user-not-found': 'Usuario nao encontrado.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
    'auth/network-request-failed': 'Erro de conexao. Verifique sua internet.',
    'auth/popup-closed-by-user': 'Janela de login foi fechada.',
    'auth/popup-blocked': 'Pop-up bloqueado pelo navegador.',
    'auth/requires-recent-login':
      'Por seguranca, entre novamente na conta antes de excluir o perfil.',
  };
  return messages[code] || 'Ocorreu um erro. Tente novamente.';
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    role: null,
  });
  const bootstrapTraceRef = useRef<WebMonitoringTraceHandle | null>(null);

  const setUserState = useCallback((user: User | null, options?: { roleOverride?: UserRole | null }) => {
    const normalizedUser = user
      ? {
          ...user,
          language: syncPreferredLanguage(user.language),
        }
      : user;
    const nextRole = normalizedUser
      ? options && 'roleOverride' in options
        ? options.roleOverride ?? null
        : resolveRole(normalizedUser)
      : null;
    if (!normalizedUser) {
      syncPreferredLanguage(readStoredLanguage() || DEFAULT_LANGUAGE);
    }
    persistAuthSnapshot(normalizedUser, nextRole);
    setState({
      user: normalizedUser,
      isAuthenticated: Boolean(normalizedUser),
      isLoading: false,
      role: nextRole,
    });
  }, []);

  const refreshUser = useCallback(async () => {
    const current = auth.currentUser;
    if (!current?.uid) return;
    const userData = await fetchUserDoc(current.uid);
    if (userData) {
      setUserState(await resolveStripeBackedUser(userData));
    }
  }, [setUserState]);

  useEffect(() => {
    let mounted = true;

    void startWebMonitoringTrace('web_auth_bootstrap', {
      surface: 'auth_provider',
    }).then((trace) => {
      if (!mounted) {
        void trace.stop();
        return;
      }
      bootstrapTraceRef.current = trace;
    });

    return () => {
      mounted = false;
      const trace = bootstrapTraceRef.current;
      bootstrapTraceRef.current = null;
      void trace?.stop();
      void detachWebPresence();
    };
  }, []);

  useEffect(() => {
    if (state.isLoading || !bootstrapTraceRef.current) {
      return;
    }

    const trace = bootstrapTraceRef.current;
    bootstrapTraceRef.current = null;
    trace.putAttribute('auth_state', state.user?.uid ? 'authenticated' : 'anonymous');
    trace.incrementMetric('auth_resolved', 1);
    void trace.stop();
  }, [state.isLoading, state.user?.uid]);

  useEffect(() => {
    if (!state.user?.uid) {
      clearWebMonitoringContext();
      void detachWebPresence();
      return;
    }

    setWebMonitoringContext(state.user, state.role);
    void attachWebPresence(state.user, state.role);
  }, [state.user?.uid, state.user?.displayName, state.user?.email, state.role]);

  useEffect(() => {
    let mounted = true;
    const resolveStuckLoading = () => {
      if (!mounted) return;
      const current = auth.currentUser;
      if (!current) {
        setUserState(null);
        return;
      }
      const cached = readAuthSnapshot(current.uid);
      const bootstrapUser = buildBootstrapUser(current, cached?.user);
      setUserState(bootstrapUser, { roleOverride: cached?.role ?? null });
    };
    const resolveTimer =
      typeof window !== 'undefined'
        ? window.setTimeout(resolveStuckLoading, AUTH_RESOLVE_TIMEOUT_MS)
        : null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const authStateTrace = await startWebMonitoringTrace('web_auth_state_change', {
        has_user: !!firebaseUser,
      });
      if (!mounted) {
        await authStateTrace.stop();
        return;
      }
      if (resolveTimer !== null) {
        window.clearTimeout(resolveTimer);
      }
      try {
        if (!firebaseUser) {
          setUserState(null);
          return;
        }

        const cached = readAuthSnapshot(firebaseUser.uid);
        const bootstrapUser = buildBootstrapUser(firebaseUser, cached?.user);
        setUserState(bootstrapUser, { roleOverride: cached?.role ?? null });

        const userData = await fetchUserDoc(firebaseUser.uid);
        if (!mounted) return;
        if (userData) {
          const shouldBeAdmin = isAdminEmail(userData.email);
          const updates: Record<string, any> = {
            last_active_time: serverTimestamp(),
          };
          let nextUser = userData;

          if (userData.professorAccount && isMissingCode(userData.codigoPersonal)) {
            const personalCode = await generateUniqueCode('codigoPersonal', 4);
            updates.codigoPersonal = personalCode;
            nextUser = { ...nextUser, codigoPersonal: personalCode };
          }

          if (shouldBeAdmin && !userData.admin) {
            updates.admin = true;
            nextUser = { ...nextUser, admin: true };
          } else if (!shouldBeAdmin && userData.admin) {
            updates.admin = false;
            nextUser = { ...nextUser, admin: false };
          }
          authStateTrace.putAttribute(
            'role',
            nextUser.admin
              ? 'admin'
              : nextUser.academyAccount
                ? 'academy'
                : nextUser.professorAccount
                  ? 'professor'
                  : 'aluno'
          );
          authStateTrace.incrementMetric('user_doc_loaded', 1);
          setUserState(nextUser);
          void resolveStripeBackedUser(nextUser).then((resolvedUser) => {
            if (!mounted || !resolvedUser) return;
            setUserState(resolvedUser);
          });
          await updateDoc(doc(db, 'users', firebaseUser.uid), updates);
        } else {
          await ensureUserDocument(firebaseUser);
          const refreshed = await fetchUserDoc(firebaseUser.uid);
          if (!mounted) return;
          if (refreshed) {
            setUserState(refreshed);
            void resolveStripeBackedUser(refreshed).then((resolvedUser) => {
              if (!mounted || !resolvedUser) return;
              setUserState(resolvedUser);
            });
          } else {
            setUserState(bootstrapUser, { roleOverride: cached?.role ?? null });
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        logWebMonitoringError('web_auth_state_change', error, {
          uid: firebaseUser?.uid || '',
        });
        if (firebaseUser) {
          const cached = readAuthSnapshot(firebaseUser.uid);
          const bootstrapUser = buildBootstrapUser(firebaseUser, cached?.user);
          setUserState(bootstrapUser, { roleOverride: cached?.role ?? null });
        } else {
          setUserState(null);
        }
      } finally {
        await authStateTrace.stop();
      }
    });

    getRedirectResult(auth)
      .then((result) => {
        if (!result?.user?.uid) return;
        const fallbackMethod =
          result.providerId ||
          result.user.providerData?.[0]?.providerId ||
          'social';
        void notifyUserLoginSecurityAlert({
          userId: result.user.uid,
          userName: result.user.displayName || result.user.email || 'Usuario',
          loginMethod: fallbackMethod,
        });
      })
      .catch((error) => {
        logWebMonitoringError('web_auth_redirect', error);
        // Redirect flow errors are handled by auth state listener.
      });

    return () => {
      mounted = false;
      if (resolveTimer !== null) {
        window.clearTimeout(resolveTimer);
      }
      unsubscribe();
    };
  }, [setUserState]);

  const login = useCallback(async (email: string, password: string) => {
    const trace = await startWebMonitoringTrace('web_login_email', {
      provider: 'password',
    });
    try {
      const normalizedEmail = normalizeEmailInput(email);
      const result = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const userData = await fetchUserDoc(result.user.uid);
      if (!userData) {
        await ensureUserDocument(result.user);
      }
      await refreshUser();
      void notifyUserLoginSecurityAlert({
        userId: result.user.uid,
        userName: userData?.displayName || result.user.displayName || normalizedEmail,
        loginMethod: 'email-senha',
      });
      return { success: true };
    } catch (error: any) {
      logWebMonitoringError('web_login_email', error, { provider: 'password' });
      return { success: false, error: getAuthErrorMessage(error.code) };
    } finally {
      await trace.stop();
    }
  }, [refreshUser]);

  const loginAsPersonal = useCallback(async (email: string, password: string) => {
    const trace = await startWebMonitoringTrace('web_login_personal', {
      provider: 'password',
    });
    try {
      const normalizedEmail = normalizeEmailInput(email);
      const result = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const userData = await fetchUserDoc(result.user.uid);
      if (!userData) {
        await signOut(auth);
        return { success: false, error: 'Conta nao encontrada. Cadastre-se primeiro.' };
      }
      if (!userData.professorAccount && !(userData.admin && isAdminEmail(userData.email))) {
        await signOut(auth);
        return { success: false, error: 'Esta conta nao e uma conta de Personal Trainer ou Admin.' };
      }
      setUserState(userData);
      void notifyUserLoginSecurityAlert({
        userId: result.user.uid,
        userName: userData.displayName || result.user.displayName || normalizedEmail,
        loginMethod: 'email-senha',
      });
      return { success: true };
    } catch (error: any) {
      logWebMonitoringError('web_login_personal', error, { provider: 'password' });
      return { success: false, error: getAuthErrorMessage(error.code) };
    } finally {
      await trace.stop();
    }
  }, [setUserState]);

  const loginWithGoogle = useCallback(async () => {
    const trace = await startWebMonitoringTrace('web_login_google', {
      provider: 'google',
    });
    try {
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
      } catch (error: any) {
        if (error?.code === 'auth/popup-blocked') {
          await signInWithRedirect(auth, provider);
          return { success: true };
        }
        throw error;
      }
      const current = auth.currentUser;
      if (current) {
        await ensureUserDocument(current);
        await refreshUser();
        void notifyUserLoginSecurityAlert({
          userId: current.uid,
          userName: current.displayName || current.email || 'Usuario',
          loginMethod: 'google',
        });
      }
      return { success: true };
    } catch (error: any) {
      logWebMonitoringError('web_login_google', error, { provider: 'google' });
      return { success: false, error: getAuthErrorMessage(error.code) };
    } finally {
      await trace.stop();
    }
  }, [refreshUser]);

  const loginWithApple = useCallback(async () => {
    const trace = await startWebMonitoringTrace('web_login_apple', {
      provider: 'apple',
    });
    try {
      const provider = new OAuthProvider('apple.com');
      try {
        await signInWithPopup(auth, provider);
      } catch (error: any) {
        if (error?.code === 'auth/popup-blocked') {
          await signInWithRedirect(auth, provider);
          return { success: true };
        }
        throw error;
      }
      const current = auth.currentUser;
      if (current) {
        await ensureUserDocument(current);
        await refreshUser();
        void notifyUserLoginSecurityAlert({
          userId: current.uid,
          userName: current.displayName || current.email || 'Usuario',
          loginMethod: 'apple',
        });
      }
      return { success: true };
    } catch (error: any) {
      logWebMonitoringError('web_login_apple', error, { provider: 'apple' });
      return { success: false, error: getAuthErrorMessage(error.code) };
    } finally {
      await trace.stop();
    }
  }, [refreshUser]);

  const register = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
      additionalData?: Partial<User>
    ) => {
      const trace = await startWebMonitoringTrace('web_register_account', {
        has_personal_flag: !!additionalData?.professorAccount,
      });
      try {
        const normalizedEmail = normalizeEmailInput(email);
        const payloadAdditional: Partial<User> = { ...(additionalData || {}) };
        const shouldCheckStudentCapacity = !toBool(payloadAdditional.professorAccount);
        const personalCodeCandidate = shouldCheckStudentCapacity
          ? normalizePersonalCodeValue(payloadAdditional.codigoPersonal)
          : null;
        if (personalCodeCandidate !== null) {
          const capacity =
            (await fetchInvitePersonalCapacity(String(personalCodeCandidate))) ||
            (await firestoreService.getPersonalStudentCapacityByCode(personalCodeCandidate));
          if (!capacity.allowed) {
            const message =
              capacity.reason === 'personal_not_found'
                ? 'Codigo do personal nao encontrado.'
                : 'Esse personal ja atingiu o limite de 4 alunos no plano gratuito. Peca para ele assinar o Premium para liberar alunos ilimitados.';
            return {
              success: false,
              error: message,
            };
          }
          if (!payloadAdditional.nameDoSeuPersonal && capacity.personalName) {
            payloadAdditional.nameDoSeuPersonal = capacity.personalName;
          }
        }

        const result = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        await setDoc(doc(db, 'users', result.user.uid), {
          email: normalizedEmail,
          display_name: displayName,
          uid: result.user.uid,
          language: readStoredLanguage() || DEFAULT_LANGUAGE,
          created_time: serverTimestamp(),
          last_active_time: serverTimestamp(),
          professorAccount: false,
          admin: isAdminEmail(normalizedEmail),
          assinatura: false,
          planoChatGPT: false,
          acessoSuspenso: false,
          ...payloadAdditional,
        });
        await refreshUser();
        return { success: true };
      } catch (error: any) {
        logWebMonitoringError('web_register_account', error, {
          has_personal_flag: !!additionalData?.professorAccount,
        });
        const message = error?.code ? getAuthErrorMessage(error.code) : error?.message;
        return { success: false, error: message || 'Ocorreu um erro. Tente novamente.' };
      } finally {
        await trace.stop();
      }
    },
    [refreshUser]
  );

  const logout = useCallback(async () => {
    const trace = await startWebMonitoringTrace('web_logout');
    try {
      await signOut(auth);
      setUserState(null);
      return { success: true };
    } catch (error: any) {
      logWebMonitoringError('web_logout', error);
      return { success: false, error: error.message };
    } finally {
      await trace.stop();
    }
  }, [setUserState]);

  const deleteAccount = useCallback(async () => {
    const trace = await startWebMonitoringTrace('web_delete_account');
    try {
      const current = auth.currentUser;
      if (!current?.uid) {
        return {
          success: false,
          error: 'Sua sessao expirou. Entre novamente para concluir a exclusao.',
        };
      }

      const uid = current.uid;
      const userRef = doc(db, 'users', uid);

      const cleanupUserData = async () => {
        const batch = writeBatch(db);
        batch.delete(userRef);

        for (const subcollection of ['academyPlans', 'personalAccount']) {
          try {
            const snapshot = await getDocs(collection(db, 'users', uid, subcollection));
            snapshot.docs.forEach((docSnap) => {
              batch.delete(docSnap.ref);
            });
          } catch (error) {
            console.warn(`Nao foi possivel limpar users/${uid}/${subcollection} antes da exclusao.`, error);
          }
        }

        try {
          const supportSnapshots = await Promise.all([
            getDocs(query(collection(db, 'supporte'), where('userId', '==', uid), limit(50))),
            getDocs(query(collection(db, 'supporte'), where('user', '==', userRef), limit(50))),
          ]);
          const seen = new Set<string>();
          supportSnapshots.forEach((snapshot) => {
            snapshot.docs.forEach((docSnap) => {
              if (seen.has(docSnap.ref.path)) return;
              seen.add(docSnap.ref.path);
              batch.delete(docSnap.ref);
            });
          });
        } catch (error) {
          console.warn('Nao foi possivel limpar tickets vinculados antes da exclusao.', error);
        }

        await batch.commit();
      };

      try {
        await cleanupUserData();
      } catch (error) {
        console.warn('A limpeza previa da conta falhou e sera concluida depois da exclusao.', error);
        try {
          await deleteDoc(userRef);
        } catch (deleteProfileError) {
          console.warn('Nao foi possivel remover o documento principal do usuario.', deleteProfileError);
        }
      }

      await deleteUser(current);
      setUserState(null);
      return { success: true };
    } catch (error: any) {
      logWebMonitoringError('web_delete_account', error);
      return {
        success: false,
        error: error?.code ? getAuthErrorMessage(error.code) : error?.message || 'Nao foi possivel excluir a conta.',
      };
    } finally {
      await trace.stop();
    }
  }, [setUserState]);

  const resetPassword = useCallback(async (email: string) => {
    const trace = await startWebMonitoringTrace('web_reset_password');
    try {
      await sendPasswordResetEmail(auth, normalizeEmailInput(email));
      return { success: true };
    } catch (error: any) {
      logWebMonitoringError('web_reset_password', error);
      return { success: false, error: getAuthErrorMessage(error.code) };
    } finally {
      await trace.stop();
    }
  }, []);

  const setPreferredLanguage = useCallback(
    async (language: SupportedLanguage) => {
      const current = auth.currentUser;
      const previousLanguage = state.user?.language || readStoredLanguage() || DEFAULT_LANGUAGE;
      const nextLanguage = persistPreferredLanguage(language);

      try {
        if (current?.uid) {
          await updateDoc(doc(db, 'users', current.uid), {
            language: nextLanguage,
          });
        }
        await refreshUser();
        return { success: true };
      } catch (error: any) {
        logWebMonitoringError('web_set_language', error, { language: nextLanguage });
        persistPreferredLanguage(previousLanguage);
        return {
          success: false,
          error: 'Nao foi possivel salvar o idioma agora. Tente novamente.',
        };
      }
    },
    [refreshUser, state.user?.language]
  );

  const value = useMemo(
    () => ({
      ...state,
      login,
      loginAsPersonal,
      loginWithGoogle,
      loginWithApple,
      register,
      logout,
      deleteAccount,
      resetPassword,
      setPreferredLanguage,
      refreshUser,
    }),
    [
      state,
      login,
      loginAsPersonal,
      loginWithGoogle,
      loginWithApple,
      register,
      logout,
      deleteAccount,
      resetPassword,
      setPreferredLanguage,
      refreshUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
