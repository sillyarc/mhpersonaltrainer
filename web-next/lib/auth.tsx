'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
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
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './firebaseClient';
import type { AuthState, User, UserRole } from './types/user';
import { firestoreService } from './services/firestoreService';
import { notifyUserLoginSecurityAlert } from './services/notificationCenter';
import { normalizeEmailInput } from './utils/email';
import { fetchInvitePersonalCapacity } from './services/inviteService';

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
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

const resolveRole = (user: User | null): UserRole | null => {
  if (!user) return null;
  if (user.admin && isAdminEmail(user.email)) return 'admin';
  if (user.academyAccount) return 'academy';
  if (user.professorAccount) return 'professor';
  return 'aluno';
};

const mapUserData = (uid: string, data: Record<string, any>): User => ({
  uid,
  email: data.email || '',
  displayName: data.display_name || '',
  photoUrl: data.photo_url,
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

  const setUserState = useCallback((user: User | null) => {
    setState({
      user,
      isAuthenticated: Boolean(user),
      isLoading: false,
      role: resolveRole(user),
    });
  }, []);

  const refreshUser = useCallback(async () => {
    const current = auth.currentUser;
    if (!current?.uid) return;
    const userData = await fetchUserDoc(current.uid);
    if (userData) {
      setUserState(userData);
    }
  }, [setUserState]);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!mounted) return;
      if (!firebaseUser) {
        setUserState(null);
        return;
      }

      try {
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
          setUserState(nextUser);
          await updateDoc(doc(db, 'users', firebaseUser.uid), updates);
        } else {
          await ensureUserDocument(firebaseUser);
          const refreshed = await fetchUserDoc(firebaseUser.uid);
          if (!mounted) return;
          setUserState(refreshed);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setUserState(null);
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
      .catch(() => {
        // Redirect flow errors are handled by auth state listener.
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [setUserState]);

  const login = useCallback(async (email: string, password: string) => {
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
      return { success: false, error: getAuthErrorMessage(error.code) };
    }
  }, [refreshUser]);

  const loginAsPersonal = useCallback(async (email: string, password: string) => {
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
      return { success: false, error: getAuthErrorMessage(error.code) };
    }
  }, [setUserState]);

  const loginWithGoogle = useCallback(async () => {
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
      return { success: false, error: getAuthErrorMessage(error.code) };
    }
  }, [refreshUser]);

  const loginWithApple = useCallback(async () => {
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
      return { success: false, error: getAuthErrorMessage(error.code) };
    }
  }, [refreshUser]);

  const register = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
      additionalData?: Partial<User>
    ) => {
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
        const message = error?.code ? getAuthErrorMessage(error.code) : error?.message;
        return { success: false, error: message || 'Ocorreu um erro. Tente novamente.' };
      }
    },
    [refreshUser]
  );

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
      setUserState(null);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [setUserState]);

  const resetPassword = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, normalizeEmailInput(email));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: getAuthErrorMessage(error.code) };
    }
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      login,
      loginAsPersonal,
      loginWithGoogle,
      loginWithApple,
      register,
      logout,
      resetPassword,
      refreshUser,
    }),
    [state, login, loginAsPersonal, loginWithGoogle, loginWithApple, register, logout, resetPassword, refreshUser]
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
