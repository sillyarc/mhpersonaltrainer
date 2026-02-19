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

const resolvePersonalCode = async (
  db: any,
  uid: string,
  fallback?: string | number | null
): Promise<{ code: number | null; needsSync: boolean }> => {
  const fallbackCode = normalizePersonalCodeValue(fallback);
  try {
    const personalAccountRef = collection(db, 'users', uid, 'personalAccount');
    const personalSnapshot = await getDocs(query(personalAccountRef, limit(1)));
    if (!personalSnapshot.empty) {
      const personalCode = normalizePersonalCodeValue(
        personalSnapshot.docs[0].data().codigoPersonal
      );
      if (personalCode !== null) {
        return { code: personalCode, needsSync: personalCode !== fallbackCode };
      }
    }

    const professorAccountRef = collection(db, 'professorAccount');
    const professorSnapshot = await getDocs(
      query(professorAccountRef, where('uid', '==', uid), limit(1))
    );
    if (!professorSnapshot.empty) {
      const professorCode = normalizePersonalCodeValue(
        professorSnapshot.docs[0].data().codigoPersonal
      );
      if (professorCode !== null) {
        return { code: professorCode, needsSync: professorCode !== fallbackCode };
      }
    }
  } catch (error) {
    console.warn('Error resolving personal code:', error);
  }
  return { code: fallbackCode, needsSync: false };
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
        let resolvedPersonalCode = data.codigoPersonal;
        if (toBool(data.professorAccount)) {
          const resolved = await resolvePersonalCode(db, uid, data.codigoPersonal);
          if (resolved.code !== null) {
            resolvedPersonalCode = resolved.code;
          }
          if (resolved.needsSync && resolved.code !== null) {
            await updateDoc(doc(db, 'users', uid), {
              codigoPersonal: resolved.code,
            });
          }
        }
        const userData: User = {
          uid,
          email: data.email || '',
          displayName: data.display_name || '',
          photoUrl: data.photo_url,
          phoneNumber: data.phone_number,
          birthday: data.birthday,
          genero: data.genero,
          createdTime: data.created_time?.toDate() || new Date(),
          lastActiveTime: data.last_active_time?.toDate(),
          professorAccount: toBool(data.professorAccount),
          admin: toBool(data.admin),
          assinatura: toBool(data.assinatura),
          tipoDeAssinatura: data.tipoDeAssinatura,
          planoChatGPT: toBool(data.planoChatGPT),
          acessoSuspenso: toBool(data.acessoSuspenso),
          codigoPersonal: resolvedPersonalCode,
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
          alunoDesde: data.alunoDesde?.toDate(),
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
          location: data.location || (data.latitude && data.longitude ? { latitude: data.latitude, longitude: data.longitude } : undefined),
          especializacao: data.especializacao,
          servicos: normalizeServicos(data.servicos),
          horarioAtendimento: normalizeHorario(data.horarioAtendimento),
          alunos: data.alunos?.map((ref: any) => ref.id) || [],
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
      const payloadAdditional: Partial<User> = { ...(additionalData || {}) };
      const shouldCheckStudentCapacity = !toBool(payloadAdditional.professorAccount);
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
                ? 'Codigo do personal nao encontrado.'
                : 'Esse personal atingiu o limite de 4 alunos no plano gratuito. Peca para ele assinar o Premium para liberar alunos ilimitados.',
          };
        }
        if (!payloadAdditional.nameDoSeuPersonal && capacity.personalName) {
          payloadAdditional.nameDoSeuPersonal = capacity.personalName;
        }
      }

      const result = await createUserWithEmailAndPassword(auth, email, password);
      const userData = {
        email,
        display_name: displayName,
        uid: result.user.uid,
        created_time: serverTimestamp(),
        last_active_time: serverTimestamp(),
        professorAccount: false,
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
    'auth/unauthorized-continue-uri': 'URL de recuperacao nao autorizada. Ajuste Authorized Domains no Firebase.',
    'auth/missing-continue-uri': 'URL de recuperacao ausente. Configure o dominio no Firebase.',
    'auth/invalid-api-key': 'API key do Firebase invalida.',
    'auth/app-not-authorized': 'Aplicativo nao autorizado para Firebase Auth.',
  };
  return messages[code] || 'Ocorreu um erro. Tente novamente.';
}
