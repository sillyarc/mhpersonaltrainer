import { useEffect, useCallback } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where, serverTimestamp } from 'firebase/firestore';
import { initializeFirebase } from '../services/firebase';
import { firestoreService } from '../services/firestoreService';
import { notifyUserLoginSecurityAlert } from '../services/notificationCenter';
import { useAuthStore } from '../store/authStore';
import { User } from '../types/user';

const toBool = (value: any) => value === true || value === 'true' || value === 1;

const normalizePersonalCodeValue = (value: any): number | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === '0') return null;
  const numeric = Number(text);
  return Number.isNaN(numeric) ? null : numeric;
};

const resolvePersonalIdentity = async (
  db: any,
  uid: string,
  fallback?: { codigoPersonal?: string | number | null; professorAccount?: boolean | string | number | null }
): Promise<{
  code: number | null;
  isPersonal: boolean;
  shouldSyncCode: boolean;
  shouldSyncProfessorFlag: boolean;
}> => {
  const fallbackCode = normalizePersonalCodeValue(fallback?.codigoPersonal);
  const fallbackProfessorAccount = toBool(fallback?.professorAccount);
  let resolvedCode = fallbackCode;
  let resolvedProfessorAccount = fallbackProfessorAccount;

  try {
    const personalAccountRef = collection(db, 'users', uid, 'personalAccount');
    const personalSnapshot = await getDocs(query(personalAccountRef, limit(1)));
    if (!personalSnapshot.empty) {
      resolvedProfessorAccount = true;
      const personalCode = normalizePersonalCodeValue(
        personalSnapshot.docs[0].data().codigoPersonal
      );
      if (personalCode !== null) {
        resolvedCode = personalCode;
      }
    }

    const professorAccountRef = collection(db, 'professorAccount');
    const professorSnapshot = await getDocs(
      query(professorAccountRef, where('uid', '==', uid), limit(1))
    );
    if (!professorSnapshot.empty) {
      resolvedProfessorAccount = true;
      const professorCode = normalizePersonalCodeValue(
        professorSnapshot.docs[0].data().codigoPersonal
      );
      if (professorCode !== null) {
        resolvedCode = professorCode;
      }
    }
  } catch (error) {
    console.warn('Error resolving personal identity:', error);
  }

  return {
    code: resolvedCode,
    isPersonal: resolvedProfessorAccount,
    shouldSyncCode: resolvedCode !== null && resolvedCode !== fallbackCode,
    shouldSyncProfessorFlag: resolvedProfessorAccount !== fallbackProfessorAccount,
  };
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

const normalizeLinkedPersonalId = (value: any) => {
  const nestedId =
    typeof value?.personalAccount?.id === 'string' ? value.personalAccount.id.trim() : '';
  if (nestedId) return nestedId;

  const legacyId = typeof value?.personalAccountId === 'string' ? value.personalAccountId.trim() : '';
  return legacyId || undefined;
};

const normalizeUserReferenceIds = (value: any): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (typeof item?.id === 'string') return item.id.trim();
      return '';
    })
    .filter((item): item is string => item.length > 0);
};

const getPasswordResetSettings = () => {
  const directUrl = (process.env.EXPO_PUBLIC_PASSWORD_RESET_URL || '').trim();
  if (directUrl) {
    const resolvedUrl = /^https?:\/\//i.test(directUrl)
      ? directUrl
      : `https://${directUrl}`;
    return { url: resolvedUrl, handleCodeInApp: false };
  }

  const authDomain = (process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '').trim();
  if (!authDomain) {
    return undefined;
  }

  return { url: `https://${authDomain}`, handleCodeInApp: false };
};

const isContinueUriError = (code?: string) =>
  code === 'auth/invalid-continue-uri' ||
  code === 'auth/unauthorized-continue-uri' ||
  code === 'auth/missing-continue-uri';

export function useAuth() {
  const { user, isAuthenticated, isLoading, role, setUser, setLoading, logout: storeLogout } = useAuthStore();
  const { auth, db } = initializeFirebase();

  const fetchUserData = async (uid: string) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        const authUser = auth.currentUser;
        const resolvedPersonalIdentity = await resolvePersonalIdentity(db, uid, {
          codigoPersonal: data.codigoPersonal,
          professorAccount: data.professorAccount,
        });
        const resolvedPersonalCode =
          resolvedPersonalIdentity.code !== null
            ? resolvedPersonalIdentity.code
            : data.codigoPersonal;
        const resolvedEmail = String(data.email || authUser?.email || '').trim();
        const resolvedDisplayName = String(
          data.display_name ||
            authUser?.displayName ||
            (resolvedEmail ? resolvedEmail.split('@')[0] : '')
        ).trim();
        const resolvedPhotoUrl = String(data.photo_url || authUser?.photoURL || '').trim();

        if (
          resolvedPersonalIdentity.shouldSyncProfessorFlag ||
          resolvedPersonalIdentity.shouldSyncCode ||
          (!data.email && !!resolvedEmail) ||
          (!data.display_name && !!resolvedDisplayName) ||
          (!data.photo_url && !!resolvedPhotoUrl)
        ) {
          const syncPayload: Record<string, any> = {};
          if (resolvedPersonalIdentity.shouldSyncProfessorFlag) {
            syncPayload.professorAccount = resolvedPersonalIdentity.isPersonal;
          }
          if (
            resolvedPersonalIdentity.shouldSyncCode &&
            resolvedPersonalIdentity.code !== null
          ) {
            syncPayload.codigoPersonal = resolvedPersonalIdentity.code;
          }
          if (!data.email && resolvedEmail) {
            syncPayload.email = resolvedEmail;
          }
          if (!data.display_name && resolvedDisplayName) {
            syncPayload.display_name = resolvedDisplayName;
          }
          if (!data.photo_url && resolvedPhotoUrl) {
            syncPayload.photo_url = resolvedPhotoUrl;
          }
          if (Object.keys(syncPayload).length > 0) {
            try {
              await updateDoc(doc(db, 'users', uid), syncPayload);
            } catch (error) {
              console.warn('Error syncing personal identity:', error);
            }
          }
        }
        const userData: User = {
          uid,
          email: resolvedEmail,
          displayName: resolvedDisplayName,
          photoUrl: resolvedPhotoUrl || undefined,
          phoneNumber: data.phone_number,
          birthday: data.birthday,
          genero: data.genero,
          createdTime: data.created_time?.toDate() || new Date(),
          lastActiveTime: data.last_active_time?.toDate(),
          professorAccount: resolvedPersonalIdentity.isPersonal,
          admin: toBool(data.admin),
          assinatura: toBool(data.assinatura),
          tipoDeAssinatura: data.tipoDeAssinatura,
          planoChatGPT: toBool(data.planoChatGPT),
          acessoSuspenso: toBool(data.acessoSuspenso),
          codigoPersonal: resolvedPersonalCode,
          personalAccountId: normalizeLinkedPersonalId(data),
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
          alunoDesde: data.alunoDesde?.toDate(),
          metodoDePagamento: data.metodoDePagamento,
          chavePixDoPersonal: data.chavePixDoPersonal,
          cpfCnpj: data.cpfCnpj,
          customer: data.customer,
          subscribeId: data.subscribeId,
          stripeAtivo: data.stripeAtivo,
          stripeAccountId: data.stripeAccountId,
          stripePriceId: data.stripePriceId || data.priceId,
          stripeSubscriptionStatus:
            data.stripeSubscriptionStatus || data.subscriptionStatus || data.statusAssinatura,
          bio: data.bio,
          cref: data.cref,
          instagram: data.instagram,
          linkedin: data.linkedin,
          cidade: data.cidade || data.city || data.cidadeAtual,
          estado: data.estado || data.uf || data.state,
          location: data.location || (data.latitude && data.longitude ? { latitude: data.latitude, longitude: data.longitude } : undefined),
          especializacao: data.especializacao,
          servicos: normalizeServicos(data.servicos),
          horarioAtendimento: normalizeHorario(data.horarioAtendimento),
          alunos: normalizeUserReferenceIds(data.alunos),
          treinos: data.treinos || [],
          rotinaDeTreino: data.rotinaDeTreino || [],
        };
        setUser(userData);
        await updateDoc(doc(db, 'users', uid), {
          last_active_time: serverTimestamp(),
        });
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setUser(null);
    }
  };

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
        admin: false,
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
    if (Object.keys(updates).length > 0) {
      await updateDoc(userRef, updates);
    }
  };

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await fetchUserData(result.user.uid);
      void notifyUserLoginSecurityAlert({
        userId: result.user.uid,
        userName: result.user.displayName || result.user.email || email,
        loginMethod: 'email-senha',
      });
      return { success: true };
    } catch (error: any) {
      setLoading(false);
      return { 
        success: false, 
        error: getAuthErrorMessage(error.code) 
      };
    }
  }, []);

  const loginAsPersonal = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      
      if (!userDoc.exists()) {
        await signOut(auth);
        setLoading(false);
        return { 
          success: false, 
          error: 'Conta não encontrada. Cadastre-se primeiro.' 
        };
      }
      
      const userData = userDoc.data();
      if (!userData.professorAccount) {
        await signOut(auth);
        setLoading(false);
        return { 
          success: false, 
          error: 'Esta conta não é uma conta de Personal Trainer. Use o login normal.' 
        };
      }
      
      await fetchUserData(result.user.uid);
      void notifyUserLoginSecurityAlert({
        userId: result.user.uid,
        userName: result.user.displayName || result.user.email || email,
        loginMethod: 'email-senha',
      });
      return { success: true, isProfessor: true };
    } catch (error: any) {
      setLoading(false);
      return { 
        success: false, 
        error: getAuthErrorMessage(error.code) 
      };
    }
  }, []);

  const loginWithGoogle = useCallback(async (idToken?: string, accessToken?: string) => {
    setLoading(true);
    try {
      const credential = GoogleAuthProvider.credential(idToken || undefined, accessToken);
      const result = await signInWithCredential(auth, credential);
      await ensureUserDocument(result.user);
      await fetchUserData(result.user.uid);
      void notifyUserLoginSecurityAlert({
        userId: result.user.uid,
        userName: result.user.displayName || result.user.email || 'Usuario',
        loginMethod: 'google',
      });
      return { success: true };
    } catch (error: any) {
      setLoading(false);
      return { success: false, error: getAuthErrorMessage(error.code) };
    }
  }, []);

  const loginWithApple = useCallback(
    async (
      idToken: string,
      rawNonce: string,
      overrides?: { displayName?: string; email?: string }
    ) => {
      setLoading(true);
      try {
        const provider = new OAuthProvider('apple.com');
        const credential = provider.credential({
          idToken,
          rawNonce,
        });
        const result = await signInWithCredential(auth, credential);
        await ensureUserDocument(result.user, {
          displayName: overrides?.displayName,
          email: overrides?.email,
        });
        await fetchUserData(result.user.uid);
        void notifyUserLoginSecurityAlert({
          userId: result.user.uid,
          userName: result.user.displayName || result.user.email || overrides?.email || 'Usuario',
          loginMethod: 'apple',
        });
        return { success: true };
      } catch (error: any) {
        setLoading(false);
        return { success: false, error: getAuthErrorMessage(error.code) };
      }
    },
    []
  );

  const register = useCallback(async (
    email: string, 
    password: string, 
    displayName: string,
    additionalData?: Partial<User>
  ) => {
    setLoading(true);
    try {
      const payloadAdditional: Record<string, any> = { ...(additionalData || {}) };
      const isPersonalRegistration = toBool(payloadAdditional.professorAccount);
      delete payloadAdditional.professorAccount;
      const shouldCheckStudentCapacity = !isPersonalRegistration;
      const personalCodeCandidate = shouldCheckStudentCapacity
        ? normalizePersonalCodeValue(payloadAdditional.codigoPersonal)
        : null;
      if (personalCodeCandidate !== null) {
        const capacity = await firestoreService.getPersonalStudentCapacityByCode(personalCodeCandidate);
        if (!capacity.allowed) {
          setLoading(false);
          return {
            success: false,
            error:
              capacity.reason === 'personal_not_found'
                ? 'Código do personal não encontrado.'
                : 'Esse personal atingiu o limite de 4 alunos no plano gratuito. Peca para ele assinar o Premium para liberar alunos ilimitados.',
          };
        }
        if (!payloadAdditional.nameDoSeuPersonal && capacity.personalName) {
          payloadAdditional.nameDoSeuPersonal = capacity.personalName;
        }
        if (capacity.personalId) {
          payloadAdditional.personalAccount = { id: capacity.personalId };
          payloadAdditional.personalAccountId = capacity.personalId;
          payloadAdditional.personalVinculadoEm = serverTimestamp();
          if (!payloadAdditional.alunoDesde) {
            payloadAdditional.alunoDesde = serverTimestamp();
          }
        }
      }

      const result = await createUserWithEmailAndPassword(auth, email, password);
      const userData = {
        email,
        display_name: displayName,
        uid: result.user.uid,
        created_time: serverTimestamp(),
        last_active_time: serverTimestamp(),
        professorAccount: isPersonalRegistration,
        admin: false,
        assinatura: false,
        planoChatGPT: false,
        acessoSuspenso: false,
        ...payloadAdditional,
      };
      await setDoc(doc(db, 'users', result.user.uid), userData);
      await fetchUserData(result.user.uid);
      return { success: true };
    } catch (error: any) {
      setLoading(false);
      const message = error?.code ? getAuthErrorMessage(error.code) : error?.message;
      return { 
        success: false, 
        error: message || 'Ocorreu um erro. Tente novamente.' 
      };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
      storeLogout();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (!normalizedEmail) {
        return { success: false, error: 'Email obrigatorio.' };
      }

      const settings = getPasswordResetSettings();
      let methods: string[] | null = null;
      try {
        methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
      } catch (_) {
        methods = null;
      }
      if (methods && methods.length > 0 && !methods.includes('password')) {
        return {
          success: false,
          error: 'Esta conta usa login social. Entre com Google ou Apple.',
        };
      }

      if (settings) {
        try {
          await sendPasswordResetEmail(auth, normalizedEmail, settings);
          return { success: true };
        } catch (error: any) {
          if (isContinueUriError(error?.code)) {
            await sendPasswordResetEmail(auth, normalizedEmail);
            return { success: true };
          }
          return { success: false, error: getAuthErrorMessage(error.code) };
        }
      }

      await sendPasswordResetEmail(auth, normalizedEmail);
      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: getAuthErrorMessage(error.code) 
      };
    }
  }, []);

  return {
    user,
    isAuthenticated,
    isLoading,
    role,
    login,
    loginAsPersonal,
    loginWithGoogle,
    loginWithApple,
    register,
    logout,
    resetPassword,
    refreshUser: () => user?.uid && fetchUserData(user.uid),
  };
}

function getAuthErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'Este email já está em uso.',
    'auth/invalid-email': 'Email inválido.',
    'auth/operation-not-allowed': 'Operação não permitida.',
    'auth/weak-password': 'Senha muito fraca. Use pelo menos 6 caracteres.',
    'auth/user-disabled': 'Esta conta foi desativada.',
    'auth/user-not-found': 'Usuário não encontrado.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
    'auth/network-request-failed': 'Erro de conexão. Verifique sua internet.',
    'auth/invalid-continue-uri': 'URL de recuperacao invalida. Verifique o dominio no Firebase.',
    'auth/unauthorized-continue-uri': 'URL de recuperação não autorizada. Ajuste Authorized Domains no Firebase.',
    'auth/missing-continue-uri': 'URL de recuperacao ausente. Configure o dominio no Firebase.',
    'auth/invalid-api-key': 'API key do Firebase invalida.',
    'auth/app-not-authorized': 'Aplicativo não autorizado para Firebase Auth.',
  };
  return messages[code] || 'Ocorreu um erro. Tente novamente.';
}
