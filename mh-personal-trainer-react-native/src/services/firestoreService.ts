import { 
  addDoc,
  arrayRemove,
  collection,
  collectionGroup,
  deleteField,
  doc, 
  getDoc, 
  getDocs, 
  getCountFromServer,
  onSnapshot,
  query, 
  where, 
  orderBy, 
  limit,
  updateDoc,
  serverTimestamp,
  DocumentReference
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { User } from '../types/user';
import { fetchEvaluations } from './evaluations';
import { isPremiumUserRecord } from './ai';

export interface Treino {
  id: string;
  nome: string;
  tipo: string;
  duracao?: string;
  exercicios?: number;
  concluido: boolean;
  categoria?: string;
  dataCriacao?: Date;
  diasDaSemana?: string[];
  lastCompletedAt?: Date;
}

export interface Aluno {
  id: string;
  uid: string;
  nome: string;
  email: string;
  photoUrl?: string;
  personalPhotoUrl?: string;
  ultimoTreino?: Date;
  status: 'ativo' | 'inativo' | 'pendente';
  treinosConcluidos: number;
  alunoDesde?: Date;
}

export interface Avaliacao {
  id: string;
  tipo: string;
  data: Date;
  peso?: number;
  altura?: number;
  gorduraCorporal?: number;
  imc?: number;
  observacoes?: string;
}

export interface PersonalAccount {
  id: string;
  codigoPersonal: string;
  especialidade?: string;
  biografia?: string;
  totalAlunos: number;
  alunosAtivos: number;
}

export interface DashboardStats {
  totalTreinos: number;
  treinosConcluidos: number;
  sequenciaAtual: number;
  taxaConclusao: number;
  totalAlunos?: number;
  alunosAtivos?: number;
  treinosHoje?: number;
}

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'personal' | 'aluno';
  createdAt?: Date;
}

export interface AdminOverview {
  totalUsers: number;
  totalAdmins: number;
  totalPersonals: number;
  totalAlunos: number;
  recentUsers: AdminUserSummary[];
}

export interface PersonalProfile {
  id: string;
  uid: string;
  displayName: string;
  photoUrl?: string;
  bio?: string;
  especializacao?: string;
  codigoPersonal?: number;
  phoneNumber?: string;
  cref?: string;
  instagram?: string;
  linkedin?: string;
  stripeAtivo?: boolean;
  stripeAccountId?: string;
  cidade?: string;
  estado?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  servicos?: Array<{
    servicos: string;
    descricao?: string;
    valor?: number;
  }>;
  horarioAtendimento?: {
    inicioSegSex?: Date;
    terminioSegSex?: Date;
    inicioSab?: Date;
    terminioSab?: Date;
    inicioDom?: Date;
    terminioDom?: Date;
  };
}

export const FREE_PERSONAL_STUDENTS_LIMIT = 4;

export interface PersonalStudentCapacity {
  allowed: boolean;
  premium: boolean;
  limit: number | null;
  currentStudents: number;
  remainingSlots: number | null;
  personalId: string | null;
  personalName: string;
  reason?: 'personal_not_found' | 'free_plan_limit_reached';
}

interface UpdateStudentStatusOptions {
  actorRole?: 'personal' | 'admin';
  personalId?: string;
  personalName?: string;
}

const toBool = (value: any) => value === true || value === 'true' || value === 1;

const normalizePersonalCode = (code?: string | number | null) => {
  if (code === null || code === undefined) {
    return { numeric: null as number | null, string: null as string | null };
  }
  const raw = String(code).trim();
  const numeric = raw.length ? Number(raw) : NaN;
  return {
    numeric: Number.isNaN(numeric) ? null : numeric,
    string: raw.length ? raw : null,
  };
};

const normalizeServicos = (value: any) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      servicos: item?.servicos || item?.nome || '',
      descricao: item?.descricao,
      valor: typeof item?.valor === 'number' ? item.valor : item?.preco,
    }))
    .filter((item) => item.servicos);
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

async function getUserDocument(uid: string): Promise<User | null> {
  try {
    const db = getFirebaseDb();
    const userDoc = await getDoc(doc(db, 'users', uid));
    
    if (!userDoc.exists()) {
      return null;
    }
    
    const data = userDoc.data();
    return {
      uid,
      email: data.email || '',
      displayName: data.display_name || '',
      photoUrl: data.photo_url,
      personalPhotoUrl: data.personal_photo_url || data.personalPhotoUrl,
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
      codigoPersonal: data.codigoPersonal,
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
      servicos: normalizeServicos(data.servicos).map((service) => ({
        nome: service.servicos,
        descricao: service.descricao,
        preco: service.valor,
      })),
      horarioAtendimento: normalizeHorario(data.horarioAtendimento),
      alunos: data.alunos?.map((ref: DocumentReference) => ref.id) || [],
      treinos: data.treinos || [],
      rotinaDeTreino: data.rotinaDeTreino || [],
    };
  } catch (error) {
    console.error('Error fetching user document:', error);
    return null;
  }
}

async function getTreinosDoAluno(uid: string): Promise<Treino[]> {
  try {
    const db = getFirebaseDb();
    const treinosRef = collection(db, 'users', uid, 'createTreinos');

    let treinosSnapshot;
    try {
      const treinosQuery = query(treinosRef, orderBy('dataCriacao', 'desc'), limit(10));
      treinosSnapshot = await getDocs(treinosQuery);
    } catch (error) {
      const fallbackQuery = query(treinosRef, limit(10));
      treinosSnapshot = await getDocs(fallbackQuery);
    }

    const treinos: Treino[] = [];

    treinosSnapshot.forEach((doc) => {
      const data = doc.data();
      const treinoList = Array.isArray(data.treino) ? data.treino : data.exercicios;
      treinos.push({
        id: doc.id,
        nome: data.nomeDoTreino || data.nomeDotreino || data.nome || 'Treino',
        tipo: data.tipoTreino || data.categoria || 'Musculacao',
        duracao: data.duracao || '45 min',
        exercicios: treinoList?.length || 0,
        concluido: data.concluido || false,
        categoria: data.categoria,
        dataCriacao: data.dataCriacao?.toDate?.() || data.createdAt?.toDate?.(),
        diasDaSemana: data.diasDaSemana || [],
        lastCompletedAt: data.lastCompletedAt?.toDate?.() || (data.lastCompletedAt ? new Date(data.lastCompletedAt) : undefined),
      });
    });

    return treinos;
  } catch (error) {
    console.error('Error fetching treinos:', error);
    return [];
  }
}

async function getCodigoPersonal(uid: string): Promise<string | null> {
  try {
    const db = getFirebaseDb();
    const normalizeCode = (value: any) => {
      const { numeric, string } = normalizePersonalCode(value);
      if (string) return string;
      if (numeric !== null) return String(numeric);
      return null;
    };

    const userSnap = await getDoc(doc(db, 'users', uid));
    const userCode = userSnap.exists()
      ? normalizeCode(userSnap.data().codigoPersonal)
      : null;

    const personalAccountRef = collection(db, 'users', uid, 'personalAccount');
    const personalSnapshot = await getDocs(personalAccountRef);
    if (!personalSnapshot.empty) {
      const personalCode = normalizeCode(personalSnapshot.docs[0].data().codigoPersonal);
      if (personalCode) {
        return personalCode;
      }
    }

    const professorAccountRef = collection(db, 'professorAccount');
    const professorSnapshot = await getDocs(
      query(professorAccountRef, where('uid', '==', uid), limit(1))
    );
    if (!professorSnapshot.empty) {
      const professorCode = normalizeCode(professorSnapshot.docs[0].data().codigoPersonal);
      if (professorCode) {
        return professorCode;
      }
    }

    return userCode;
  } catch (error) {
    console.error('Error fetching codigo personal:', error);
    return null;
  }
}

async function getAlunosDoPersonal(uid: string): Promise<Aluno[]> {
  try {
    const db = getFirebaseDb();
    
    const codigoPersonal = await getCodigoPersonal(uid);
    
    if (!codigoPersonal) {
      return [];
    }

    const { numeric, string } = normalizePersonalCode(codigoPersonal);
    if ((numeric === null || numeric <= 0) && (!string || string === '0')) {
      return [];
    }
    const codeVariants = new Set<number | string>();
    if (numeric !== null) {
      codeVariants.add(numeric);
    }
    if (string) {
      codeVariants.add(string);
    }

    const usersRef = collection(db, 'users');

    const alunosMap = new Map<string, Aluno>();
    const addAluno = (docSnap: any) => {
      const data = docSnap.data();
      if (docSnap.id === uid) return;
      alunosMap.set(docSnap.id, {
        id: docSnap.id,
        uid: docSnap.id,
        nome: data.display_name || 'Aluno',
        email: data.email || '',
        photoUrl: data.photo_url,
        personalPhotoUrl: data.personal_photo_url || data.personalPhotoUrl,
        ultimoTreino: data.last_active_time?.toDate(),
        status: toBool(data.acessoSuspenso) ? 'inativo' : 'ativo',
        treinosConcluidos: data.treinosConcluidos || 0,
        alunoDesde: data.alunoDesde?.toDate(),
      });
    };

    if (codeVariants.size > 0) {
      const snapshots = await Promise.all(
        Array.from(codeVariants).map((value) =>
          getDocs(query(usersRef, where('codigoPersonal', '==', value), limit(50)))
        )
      );
      snapshots.forEach((snap) => {
        snap.forEach(addAluno);
      });
    }

    const userDoc = await getDoc(doc(db, 'users', uid));
    const refIds: string[] = [];
    const appendRefs = (refs: any[]) => {
      refs.forEach((ref) => {
        if (!ref) return;
        if (typeof ref === 'string') {
          refIds.push(ref);
        } else if (typeof ref.id === 'string') {
          refIds.push(ref.id);
        }
      });
    };
    if (userDoc.exists()) {
      const data = userDoc.data();
      if (Array.isArray(data.alunos)) {
        appendRefs(data.alunos);
      }
    }

    const personalAccountRef = collection(db, 'users', uid, 'personalAccount');
    const personalSnapshot = await getDocs(personalAccountRef);
    personalSnapshot.forEach((docItem) => {
      const data = docItem.data();
      if (Array.isArray(data.userList)) {
        appendRefs(data.userList);
      }
    });

    const professorAccountRef = collection(db, 'professorAccount');
    const professorSnapshot = await getDocs(
      query(professorAccountRef, where('uid', '==', uid), limit(1))
    );
    professorSnapshot.forEach((docItem) => {
      const data = docItem.data();
      if (Array.isArray(data.userList)) {
        appendRefs(data.userList);
      }
    });

    if (refIds.length > 0) {
      const uniqueRefs = Array.from(new Set(refIds));
      const refDocs = await Promise.all(
        uniqueRefs.map((refId) => getDoc(doc(db, 'users', refId)))
      );
      refDocs.forEach((docSnap) => {
        if (docSnap.exists()) {
          addAluno(docSnap);
        }
      });
    }

    return Array.from(alunosMap.values());
  } catch (error) {
    console.error('Error fetching alunos:', error);
    return [];
  }
}

async function listenToAlunosDoPersonal(
  uid: string,
  callback: (alunos: Aluno[]) => void,
  onError?: (error: unknown) => void
): Promise<() => void> {
  const db = getFirebaseDb();
  const codigoPersonal = await getCodigoPersonal(uid);

  if (!codigoPersonal) {
    callback([]);
    return () => {};
  }

  const { numeric, string } = normalizePersonalCode(codigoPersonal);
  if ((numeric === null || numeric <= 0) && (!string || string === '0')) {
    callback([]);
    return () => {};
  }

  const codeVariants = new Set<number | string>();
  if (numeric !== null) {
    codeVariants.add(numeric);
  }
  if (string) {
    codeVariants.add(string);
  }

  if (!codeVariants.size) {
    callback([]);
    return () => {};
  }

  let isReloading = false;
  let needsReload = false;

  const handleError = (error: unknown) => {
    console.error('Erro ao escutar alunos:', error);
    onError?.(error);
  };

  const reload = async () => {
    if (isReloading) {
      needsReload = true;
      return;
    }
    isReloading = true;
    try {
      const alunos = await getAlunosDoPersonal(uid);
      callback(alunos);
    } catch (error) {
      handleError(error);
    } finally {
      isReloading = false;
      if (needsReload) {
        needsReload = false;
        void reload();
      }
    }
  };

  const triggerReload = () => {
    void reload();
  };

  triggerReload();

  const unsubscribers: Array<() => void> = [];
  const usersRef = collection(db, 'users');

  codeVariants.forEach((value) => {
    const q = query(usersRef, where('codigoPersonal', '==', value), limit(50));
    unsubscribers.push(
      onSnapshot(q, triggerReload, handleError)
    );
  });

  unsubscribers.push(
    onSnapshot(doc(db, 'users', uid), triggerReload, handleError)
  );
  unsubscribers.push(
    onSnapshot(collection(db, 'users', uid, 'personalAccount'), triggerReload, handleError)
  );
  unsubscribers.push(
    onSnapshot(
      query(collection(db, 'professorAccount'), where('uid', '==', uid), limit(1)),
      triggerReload,
      handleError
    )
  );

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}

async function getAvaliacoesDoAluno(uid: string): Promise<Avaliacao[]> {
  try {
    const result = await fetchEvaluations(uid);
    if (result.error || !result.data) {
      return [];
    }
    return result.data.slice(0, 5).map((evaluation) => ({
      id: evaluation.id,
      tipo: evaluation.type,
      data: evaluation.date,
      peso: 'peso' in evaluation ? evaluation.peso : undefined,
      altura: 'altura' in evaluation ? evaluation.altura : undefined,
      gorduraCorporal:
        'composicaoCorporal' in evaluation
          ? evaluation.composicaoCorporal?.percentualGordura
          : undefined,
      imc: 'imc' in evaluation ? evaluation.imc : undefined,
      observacoes: 'observacoes' in evaluation ? evaluation.observacoes : undefined,
    }));
  } catch (error) {
    console.error('Error fetching avaliacoes:', error);
    return [];
  }
}
async function getPersonalAccount(uid: string): Promise<PersonalAccount | null> {
  try {
    const db = getFirebaseDb();
    
    const personalAccountRef = collection(db, 'users', uid, 'personalAccount');
    const personalSnapshot = await getDocs(personalAccountRef);
    if (!personalSnapshot.empty) {
      const doc = personalSnapshot.docs[0];
      const data = doc.data();
      return {
        id: doc.id,
        codigoPersonal: data.codigoPersonal || '',
        especialidade: data.especialidade,
        biografia: data.biografia,
        totalAlunos: data.totalAlunos || 0,
        alunosAtivos: data.alunosAtivos || 0,
      };
    }

    const professorAccountRef = collection(db, 'professorAccount');
    const professorSnapshot = await getDocs(
      query(professorAccountRef, where('uid', '==', uid), limit(1))
    );
    if (!professorSnapshot.empty) {
      const doc = professorSnapshot.docs[0];
      const data = doc.data();
      return {
        id: doc.id,
        codigoPersonal: data.codigoPersonal || '',
        especialidade: data.especialidade,
        biografia: data.bio || data.biografia,
        totalAlunos: data.totalAlunos || 0,
        alunosAtivos: data.alunosAtivos || 0,
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching personal account:', error);
    return null;
  }
}

async function getPersonalProfileByCode(code: number | string): Promise<PersonalProfile | null> {
  try {
    const db = getFirebaseDb();
    const { numeric, string } = normalizePersonalCode(code);
    if ((numeric === null || numeric <= 0) && (!string || string === '0')) return null;
    const codeVariants = new Set<number | string>();
    if (numeric !== null) codeVariants.add(numeric);
    if (string) codeVariants.add(string);

    const usersRef = collection(db, 'users');
    for (const value of codeVariants) {
      const usersSnapshot = await getDocs(
        query(usersRef, where('codigoPersonal', '==', value))
      );

      for (const docSnap of usersSnapshot.docs) {
        const data = docSnap.data();
        if (!toBool(data.professorAccount)) continue;
          return {
            id: docSnap.id,
            uid: docSnap.id,
            displayName: data.display_name || data.displayName || 'Personal',
            photoUrl: data.photo_url,
            bio: data.bio,
            especializacao: data.especializacao,
            codigoPersonal: data.codigoPersonal,
            phoneNumber: data.phone_number,
            cref: data.cref,
            instagram: data.instagram,
            linkedin: data.linkedin,
            stripeAtivo: toBool(data.stripeAtivo),
            stripeAccountId: data.stripeAccountId,
            cidade: data.cidade || data.city || data.cidadeAtual,
            estado: data.estado || data.uf || data.state,
            location: data.location || (data.latitude && data.longitude ? { latitude: data.latitude, longitude: data.longitude } : undefined),
            servicos: normalizeServicos(data.servicos),
            horarioAtendimento: normalizeHorario(data.horarioAtendimento),
          };
      }
    }

    const professorRef = collection(db, 'professorAccount');
    for (const value of codeVariants) {
      const professorSnapshot = await getDocs(
        query(professorRef, where('codigoPersonal', '==', value), limit(1))
      );
      if (!professorSnapshot.empty) {
        const profDoc = professorSnapshot.docs[0];
        const profData = profDoc.data();
        const uid = profData.uid || profDoc.id;
        const userDoc = uid ? await getDoc(doc(db, 'users', uid)) : null;
        if (userDoc?.exists()) {
          const data = userDoc.data();
            return {
              id: userDoc.id,
              uid: userDoc.id,
              displayName: data.display_name || 'Personal',
              photoUrl: data.photo_url,
              bio: data.bio || profData.bio,
              especializacao: data.especializacao || profData.especializacao,
              codigoPersonal: profData.codigoPersonal || data.codigoPersonal,
            phoneNumber: data.phone_number || profData.phone_number,
            cref: data.cref || profData.cref,
            instagram: data.instagram || profData.instagram,
            linkedin: data.linkedin || profData.linkedin,
            stripeAtivo: toBool(data.stripeAtivo),
            stripeAccountId: data.stripeAccountId,
            cidade: data.cidade || data.city || data.cidadeAtual || profData.cidade || profData.city,
            estado: data.estado || data.uf || data.state || profData.estado || profData.uf,
            location: data.location || (data.latitude && data.longitude ? { latitude: data.latitude, longitude: data.longitude } : undefined),
            servicos: normalizeServicos(data.servicos || profData.servicos),
            horarioAtendimento: normalizeHorario(data.horarioAtendimento || profData.horarioAtendimento),
          };
          }
          return {
            id: uid,
            uid,
            displayName: profData.display_name || 'Personal',
            photoUrl: profData.photo_url,
            bio: profData.bio,
            especializacao: profData.especializacao,
            codigoPersonal: profData.codigoPersonal,
          phoneNumber: profData.phone_number,
          cref: profData.cref,
          instagram: profData.instagram,
          linkedin: profData.linkedin,
          stripeAtivo: toBool(profData.stripeAtivo),
          stripeAccountId: profData.stripeAccountId,
          cidade: profData.cidade || profData.city,
          estado: profData.estado || profData.uf,
          location: profData.location || (profData.latitude && profData.longitude ? { latitude: profData.latitude, longitude: profData.longitude } : undefined),
          servicos: normalizeServicos(profData.servicos),
          horarioAtendimento: normalizeHorario(profData.horarioAtendimento),
        };
      }
      }

    const personalGroup = collectionGroup(db, 'personalAccount');
    for (const value of codeVariants) {
      const personalSnapshot = await getDocs(
        query(personalGroup, where('codigoPersonal', '==', value), limit(1))
      );
      if (!personalSnapshot.empty) {
        const accountDoc = personalSnapshot.docs[0];
        const data = accountDoc.data();
        const parent = accountDoc.ref.parent.parent;
        const uid = parent?.id || data.uid || accountDoc.id;
        return {
          id: uid,
          uid,
          displayName: data.display_name || 'Personal',
          photoUrl: data.photo_url,
          bio: data.bio || data.biografia,
          especializacao: data.especializacao,
          codigoPersonal: data.codigoPersonal,
          phoneNumber: data.phone_number,
          cref: data.cref,
          instagram: data.instagram,
          linkedin: data.linkedin,
          stripeAtivo: toBool(data.stripeAtivo),
          stripeAccountId: data.stripeAccountId,
          cidade: data.cidade || data.city,
          estado: data.estado || data.uf,
          location: data.location || (data.latitude && data.longitude ? { latitude: data.latitude, longitude: data.longitude } : undefined),
          horarioAtendimento: normalizeHorario(data.horarioAtendimento),
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching personal profile:', error);
    return null;
  }
}

async function getPersonalStudentCapacityByCode(
  code: number | string,
  options?: { excludeUserId?: string }
): Promise<PersonalStudentCapacity> {
  try {
    const db = getFirebaseDb();
    const profile = await getPersonalProfileByCode(code);
    if (!profile?.uid) {
      return {
        allowed: false,
        premium: false,
        limit: FREE_PERSONAL_STUDENTS_LIMIT,
        currentStudents: 0,
        remainingSlots: 0,
        personalId: null,
        personalName: 'Personal',
        reason: 'personal_not_found',
      };
    }

    const personalDoc = await getDoc(doc(db, 'users', profile.uid));
    const personalData = personalDoc.exists() ? personalDoc.data() : {};
    const premium = isPremiumUserRecord((personalData || {}) as Record<string, any>);

    const { numeric, string } = normalizePersonalCode(code);
    const codeVariants = new Set<number | string>();
    if (numeric !== null) codeVariants.add(numeric);
    if (string) codeVariants.add(string);

    const usersRef = collection(db, 'users');
    const students = new Set<string>();
    const snapshots = await Promise.all(
      Array.from(codeVariants).map((value) =>
        getDocs(query(usersRef, where('codigoPersonal', '==', value), limit(200)))
      )
    );
    snapshots.forEach((snapshot) => {
      snapshot.forEach((docSnap) => {
        const id = docSnap.id;
        if (id === profile.uid) return;
        if (options?.excludeUserId && id === options.excludeUserId) return;
        students.add(id);
      });
    });

    const currentStudents = students.size;
    if (premium) {
      return {
        allowed: true,
        premium: true,
        limit: null,
        currentStudents,
        remainingSlots: null,
        personalId: profile.uid,
        personalName: profile.displayName || 'Personal',
      };
    }

    const remainingSlots = Math.max(0, FREE_PERSONAL_STUDENTS_LIMIT - currentStudents);
    const allowed = currentStudents < FREE_PERSONAL_STUDENTS_LIMIT;
    return {
      allowed,
      premium: false,
      limit: FREE_PERSONAL_STUDENTS_LIMIT,
      currentStudents,
      remainingSlots,
      personalId: profile.uid,
      personalName: profile.displayName || 'Personal',
      reason: allowed ? undefined : 'free_plan_limit_reached',
    };
  } catch (error) {
    console.error('Error checking personal student capacity:', error);
    return {
      allowed: false,
      premium: false,
      limit: FREE_PERSONAL_STUDENTS_LIMIT,
      currentStudents: 0,
      remainingSlots: 0,
      personalId: null,
      personalName: 'Personal',
      reason: 'personal_not_found',
    };
  }
}

async function fetchPersonals(limitCount = 50): Promise<PersonalProfile[]> {
  try {
    const db = getFirebaseDb();
    const usersRef = collection(db, 'users');
    const snapshots = await Promise.all([
      getDocs(query(usersRef, where('professorAccount', '==', true), limit(limitCount))),
      getDocs(query(usersRef, where('professorAccount', '==', 'true'), limit(limitCount))),
    ]);

    const merged = new Map<string, PersonalProfile>();
    snapshots.forEach((snap) => {
      snap.docs.forEach((docItem) => {
        const data = docItem.data();
        merged.set(docItem.id, {
          id: docItem.id,
          uid: docItem.id,
          displayName: data.display_name || 'Personal',
          photoUrl: data.photo_url,
          bio: data.bio,
          especializacao: data.especializacao,
          codigoPersonal: data.codigoPersonal,
          phoneNumber: data.phone_number,
          cref: data.cref,
          instagram: data.instagram,
          linkedin: data.linkedin,
          stripeAtivo: toBool(data.stripeAtivo),
          stripeAccountId: data.stripeAccountId,
          cidade: data.cidade || data.city || data.cidadeAtual,
          estado: data.estado || data.uf || data.state,
          location: data.location || (data.latitude && data.longitude ? { latitude: data.latitude, longitude: data.longitude } : undefined),
          servicos: normalizeServicos(data.servicos),
          horarioAtendimento: normalizeHorario(data.horarioAtendimento),
        });
      });
    });

    return Array.from(merged.values());
  } catch (error) {
    console.error('Error fetching personals:', error);
    return [];
  }
}

async function getDashboardStatsForAluno(uid: string, treinos: Treino[]): Promise<DashboardStats> {
  const concluidos = treinos.filter(t => t.concluido).length;
  const taxa = treinos.length > 0 ? Math.round((concluidos / treinos.length) * 100) : 0;
  
  let sequenciaAtual = 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  
  const treinosOrdenados = [...treinos].sort((a, b) => {
    const dateA = a.dataCriacao?.getTime() || 0;
    const dateB = b.dataCriacao?.getTime() || 0;
    return dateB - dateA;
  });
  
  for (const treino of treinosOrdenados) {
    if (treino.concluido) {
      sequenciaAtual++;
    } else {
      break;
    }
  }
  
  return {
    totalTreinos: treinos.length,
    treinosConcluidos: concluidos,
    sequenciaAtual,
    taxaConclusao: taxa,
  };
}

async function getDashboardStatsForPersonal(uid: string, alunos: Aluno[]): Promise<DashboardStats> {
  const alunosAtivos = alunos.filter(a => a.status === 'ativo').length;
  
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  
  let treinosHoje = 0;
  for (const aluno of alunos) {
    if (aluno.ultimoTreino) {
      const dataTreino = new Date(aluno.ultimoTreino);
      dataTreino.setHours(0, 0, 0, 0);
      if (dataTreino.getTime() === hoje.getTime()) {
        treinosHoje++;
      }
    }
  }
  
  return {
    totalTreinos: 0,
    treinosConcluidos: 0,
    sequenciaAtual: 0,
    taxaConclusao: 0,
    totalAlunos: alunos.length,
    alunosAtivos,
    treinosHoje,
  };
}

async function updateLastActiveTime(uid: string): Promise<void> {
  try {
    const db = getFirebaseDb();
    await updateDoc(doc(db, 'users', uid), {
      last_active_time: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating last active time:', error);
  }
}

async function unlinkStudentFromPersonal(personalId: string, studentId: string): Promise<void> {
  const db = getFirebaseDb();
  const [codigoPersonal, studentSnap] = await Promise.all([
    getCodigoPersonal(personalId),
    getDoc(doc(db, 'users', studentId)),
  ]);

  if (studentSnap.exists()) {
    const data = studentSnap.data();
    const updates: Record<string, any> = {};
    if (codigoPersonal && data.codigoPersonal && String(data.codigoPersonal) === String(codigoPersonal)) {
      updates.codigoPersonal = deleteField();
      updates.personalVinculadoEm = deleteField();
      updates.nameDoSeuPersonal = deleteField();
    }
    if (Object.keys(updates).length) {
      await updateDoc(doc(db, 'users', studentId), updates);
    }
  }

  const studentRef = doc(db, 'users', studentId);
  await updateDoc(doc(db, 'users', personalId), {
    alunos: arrayRemove(studentId, studentRef),
  });

  const personalAccountRef = collection(db, 'users', personalId, 'personalAccount');
  const personalSnapshot = await getDocs(personalAccountRef);
  await Promise.all(
    personalSnapshot.docs.map((docItem) =>
      updateDoc(docItem.ref, { userList: arrayRemove(studentId, studentRef) })
    )
  );

  const professorAccountRef = collection(db, 'professorAccount');
  const professorSnapshot = await getDocs(
    query(professorAccountRef, where('uid', '==', personalId), limit(1))
  );
  await Promise.all(
    professorSnapshot.docs.map((docItem) =>
      updateDoc(docItem.ref, { userList: arrayRemove(studentId, studentRef) })
    )
  );
}

async function notifyStudentUnlinkedFromPersonal(uid: string, personalName?: string): Promise<void> {
  const db = getFirebaseDb();
  const cleanPersonalName = personalName?.trim();
  await addDoc(collection(db, 'notificacao'), {
    titulo: 'Vinculo com personal removido',
    descricao: cleanPersonalName
      ? `${cleanPersonalName} desativou sua vinculacao. Seu perfil agora esta sem personal.`
      : 'Seu personal desativou sua vinculacao. Seu perfil agora esta sem personal.',
    tipo: 'Sistema',
    para: uid,
    paraTodos: false,
    data: serverTimestamp(),
  });
}

async function updateStudentStatus(
  uid: string,
  active: boolean,
  options?: UpdateStudentStatusOptions
): Promise<void> {
  try {
    const db = getFirebaseDb();
    const isPersonalDeactivation =
      !active && options?.actorRole === 'personal' && !!options.personalId;

    if (isPersonalDeactivation) {
      await unlinkStudentFromPersonal(options.personalId as string, uid);
      await notifyStudentUnlinkedFromPersonal(uid, options?.personalName);
    }

    await updateDoc(doc(db, 'users', uid), {
      acessoSuspenso: !active,
    });
  } catch (error) {
    console.error('Error updating student status:', error);
    throw error;
  }
}

export const firestoreService = {
  getUserDocument,
  getTreinosDoAluno,
  getAlunosDoPersonal,
  listenToAlunosDoPersonal,
  getAvaliacoesDoAluno,
  getPersonalAccount,
  getPersonalProfileByCode,
  fetchPersonals,
  getDashboardStatsForAluno,
  getDashboardStatsForPersonal,
  getCodigoPersonal,
  getPersonalStudentCapacityByCode,
  updateLastActiveTime,
  updateStudentStatus,
  getAdminOverview,
};

async function getAdminOverview(): Promise<AdminOverview> {
  const db = getFirebaseDb();
  const usersRef = collection(db, 'users');

  const getCount = async (q: ReturnType<typeof query> | typeof usersRef) => {
    try {
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count || 0;
    } catch (error) {
      const fallback = await getDocs(q as any);
      return fallback.size;
    }
  };

  const [totalUsers, totalAdmins, totalPersonals] = await Promise.all([
    getCount(usersRef),
    getCount(query(usersRef, where('admin', '==', true))),
    getCount(query(usersRef, where('professorAccount', '==', true))),
  ]);

  const totalAlunos = Math.max(0, totalUsers - totalAdmins - totalPersonals);

  const recentQuery = query(usersRef, orderBy('created_time', 'desc'), limit(10));
  const recentSnapshot = await getDocs(recentQuery);
  const recentUsers: AdminUserSummary[] = recentSnapshot.docs.map((doc) => {
    const data = doc.data();
    const role = data.admin ? 'admin' : data.professorAccount ? 'personal' : 'aluno';
    return {
      id: doc.id,
      name: data.display_name || 'Usuario',
      email: data.email || '',
      role,
      createdAt: data.created_time?.toDate(),
    };
  });

  return {
    totalUsers,
    totalAdmins,
    totalPersonals,
    totalAlunos,
    recentUsers,
  };
}
