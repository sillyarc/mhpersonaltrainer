import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { parseDateString } from '../utils/date';
import {
  PhysicalEvaluation,
  OnlineEvaluation,
  PersonalizedEvaluation,
  PosturalEvaluation,
  PhysicalTestEvaluation,
  EvaluationType,
  EvaluationStatus,
  Circumferences,
  BodyComposition,
  SkinFolds,
  SkinfoldProtocolId,
  SkinfoldMaturacao,
  SkinfoldEtnia,
  EvaluationAnswer,
  EvaluationQuestion,
  PosturePhotos,
  PostureAnalysis,
  PhysicalTest,
  TestResult,
} from '../types/evaluation';

interface QueryResult<T> {
  data: T | null;
  error: string | null;
}

const COLLECTION_MAP: Record<EvaluationType, string> = {
  online: 'avaliacaoOnline',
  personalizada: 'avaliacaoPersonalizada',
  postural: 'avaliacaoPostural',
  fisica: 'avaliacoesFisicas',
};

const LEGACY_COLLECTION_MAP: Record<EvaluationType, string> = {
  online: 'avaliacao_online',
  personalizada: 'avaliacao_personalizada',
  postural: 'avaliacao_postural',
  fisica: 'avaliacoes_fisicas',
};

type SkinfoldKey = keyof SkinFolds;

export const SKINFOLD_PROTOCOL_OPTIONS: { id: SkinfoldProtocolId; label: string }[] = [
  { id: 'faulkner_1968_4', label: 'Faulkner 1968 - 4 dobras' },
  { id: 'pollock_1984_7', label: 'Pollock 1984 - 7 dobras' },
  { id: 'pollock_1984_3', label: 'Pollock 1984 - 3 dobras' },
  { id: 'siri_brozek_4', label: 'Siri e Brozek - 4 dobras' },
  { id: 'yuhasz_6', label: 'Yuhasz - 6 dobras' },
  { id: 'petroski_1995_4', label: 'Petroski 1995 - 4 dobras' },
  { id: 'guedes_1994_3', label: 'Guedes 1994 - 3 dobras' },
  { id: 'guedes_2_criancas', label: 'Guedes - 2 dobras (criancas/adolescentes)' },
  { id: 'penrose_cote_2', label: 'Penrose/Nelson/Fisher 1985 + Cote/Wilmore - 2 medidas' },
  { id: 'weltman_obesos_2', label: 'Weltman et al. - obesos - 2 medidas' },
];

const SKINFOLD_PROTOCOL_CONFIG: Record<
  SkinfoldProtocolId,
  {
    label: string;
    requiresAge?: boolean;
    requiresSex?: boolean;
    getDobras: (sexo?: 'masculino' | 'feminino') => SkinfoldKey[];
  }
> = {
  faulkner_1968_4: {
    label: 'Faulkner 1968 - 4 dobras',
    getDobras: () => ['triceps', 'subescapular', 'suprailiacas', 'abdominal'],
  },
  pollock_1984_7: {
    label: 'Pollock 1984 - 7 dobras',
    requiresAge: true,
    requiresSex: true,
    getDobras: () => [
      'triceps',
      'subescapular',
      'suprailiacas',
      'abdominal',
      'peitoral',
      'coxaMedial',
      'axilarMedia',
    ],
  },
  pollock_1984_3: {
    label: 'Pollock 1984 - 3 dobras',
    requiresAge: true,
    requiresSex: true,
    getDobras: (sexo) =>
      sexo === 'feminino'
        ? ['triceps', 'suprailiacas', 'coxaMedial']
        : ['peitoral', 'abdominal', 'coxaMedial'],
  },
  siri_brozek_4: {
    label: 'Siri e Brozek - 4 dobras',
    requiresAge: true,
    requiresSex: true,
    getDobras: () => ['triceps', 'biceps', 'subescapular', 'suprailiacas'],
  },
  yuhasz_6: {
    label: 'Yuhasz - 6 dobras',
    requiresSex: true,
    getDobras: () => ['triceps', 'peitoral', 'subescapular', 'suprailiacas', 'abdominal', 'coxaMedial'],
  },
  petroski_1995_4: {
    label: 'Petroski 1995 - 4 dobras',
    requiresAge: true,
    requiresSex: true,
    getDobras: (sexo) =>
      sexo === 'feminino'
        ? ['axilarMedia', 'suprailiacas', 'coxaMedial', 'panturrilhaMedial']
        : ['subescapular', 'triceps', 'suprailiacas', 'panturrilhaMedial'],
  },
  guedes_1994_3: {
    label: 'Guedes 1994 - 3 dobras',
    requiresSex: true,
    getDobras: (sexo) =>
      sexo === 'feminino'
        ? ['subescapular', 'suprailiacas', 'coxaMedial']
        : ['triceps', 'suprailiacas', 'abdominal'],
  },
  guedes_2_criancas: {
    label: 'Guedes - 2 dobras (criancas/adolescentes)',
    requiresSex: true,
    getDobras: () => ['triceps', 'subescapular'],
  },
  penrose_cote_2: {
    label: 'Penrose/Nelson/Fisher 1985 + Cote/Wilmore - 2 medidas',
    requiresSex: true,
    getDobras: () => [],
  },
  weltman_obesos_2: {
    label: 'Weltman et al. - obesos - 2 medidas',
    requiresSex: true,
    getDobras: () => [],
  },
};

export const getSkinfoldProtocolLabel = (id?: SkinfoldProtocolId | null): string => {
  if (!id) return 'Dobras cutaneas';
  return SKINFOLD_PROTOCOL_CONFIG[id]?.label || id;
};

export const getSkinfoldProtocolDobras = (
  id: SkinfoldProtocolId,
  sexo?: 'masculino' | 'feminino'
): SkinfoldKey[] => {
  return SKINFOLD_PROTOCOL_CONFIG[id]?.getDobras(sexo) || [];
};

const SKINFOLD_MATURACAO_VALUES = new Set(['prepuber', 'puber', 'pospuber']);
const SKINFOLD_ETNIA_VALUES = new Set(['branco', 'negro', 'outro']);

const isSkinfoldProtocolId = (value: unknown): value is SkinfoldProtocolId =>
  typeof value === 'string' && value in SKINFOLD_PROTOCOL_CONFIG;

const isSkinfoldMaturacao = (value: unknown): value is SkinfoldMaturacao =>
  typeof value === 'string' && SKINFOLD_MATURACAO_VALUES.has(value);

const isSkinfoldEtnia = (value: unknown): value is SkinfoldEtnia =>
  typeof value === 'string' && SKINFOLD_ETNIA_VALUES.has(value);

const toNumber = (value: any): number | undefined => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.');
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
};

const coerceDate = (value: any): Date | null => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const parsedString = parseDateString(value);
    return parsedString || null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolveDate = (data: DocumentData): Date =>
  coerceDate(data.data) ||
  coerceDate(data.dataDaAvaliacao) ||
  coerceDate(data.date) ||
  coerceDate(data.createdAt) ||
  coerceDate(data.dateForAvaliacaoPostural) ||
  coerceDate(data.dataAvaliacao) ||
  new Date();

const resolveStatus = (data: DocumentData): EvaluationStatus => {
  if (data.status) {
    const normalized = String(data.status).toLowerCase().replace(/\s+/g, '_');
    if (
      normalized === 'pendente' ||
      normalized === 'agendada' ||
      normalized === 'em_andamento' ||
      normalized === 'concluida' ||
      normalized === 'cancelada' ||
      normalized === 'nao_realizada'
    ) {
      return normalized as EvaluationStatus;
    }
  }
  if (data.naoRealizada === true || data.nao_realizada === true) {
    return 'nao_realizada';
  }
  if (data.terminou === true || data.feita === true || data.concluida === true) {
    return 'concluida';
  }
  return 'concluida';
};

const resolveUserId = (data: DocumentData, fallback?: string): string =>
  String(data.uid || data.userId || fallback || '');

const resolvePersonalId = (data: DocumentData): string | undefined => {
  const candidate = data.personalId || data.professorId || data.personal || data.uidPersonal;
  return candidate ? String(candidate) : undefined;
};

const mapOnlineData = (
  base: PhysicalEvaluation,
  data: DocumentData
): OnlineEvaluation => {
  const peso = toNumber(data.peso);
  const altura = toNumber(data.estatura) ?? toNumber(data.altura);
  const imc = data.imc ? toNumber(data.imc) : peso && altura ? calculateIMC(peso, altura) : undefined;

  const circunferencias: Circumferences = {
    pescoco: toNumber(data.pescoco),
    ombro: toNumber(data.ombro),
    torax: toNumber(data.torax) ?? toNumber(data.peitoral),
    cintura: toNumber(data.cintura),
    abdominal: toNumber(data.abdominal),
    quadril: toNumber(data.quadril),
    bracoDireito: toNumber(data.bracoDireito),
    bracoEsquerdo: toNumber(data.bracoEsquerdo),
    antebracoDireito: toNumber(data.antebracoDireito),
    antebracoEsquerdo: toNumber(data.antebracoEsquerdo),
    punhoDireito: toNumber(data.punhoDireito),
    punhoEsquerdo: toNumber(data.punhoEsquerdo),
    coxaDireita: toNumber(data.coxaDireita ?? data.coxaMedial),
    coxaEsquerda: toNumber(data.coxaEsquerda),
    panturrilhaDireita: toNumber(data.panturrilhaDireita),
    panturrilhaEsquerda: toNumber(data.panturrilhaEsquerda),
  };

  const fotos = {
    frente: data.fotoDeFrente || data.fotoFrente,
    costas: data.fotoDeCostas,
    ladoDireito: data.fotoDeLado || data.fotoLateral,
    ladoEsquerdo: data.fotoDeLadoEsquerdo,
  };

  return {
    ...(base as OnlineEvaluation),
    peso,
    altura,
    imc,
    circunferencias,
    fotos,
    observacoes: data.observacoes || data.obsInstrucao || data.obs || undefined,
    resultado: data.resultado || undefined,
  };
};

const mapPosturalData = (
  base: PhysicalEvaluation,
  data: DocumentData
): PosturalEvaluation => {
  const fotosPostura: PosturePhotos = {
    anterior: data.fotoFrontal,
    posterior: data.fotoPosterior,
    lateralDireita: data.fotoLateral,
    lateralEsquerda: data.fotoLateralEsquerda,
  };

  const observacoes = [
    data.obsFotoFrontal,
    data.obsFotoPosterior,
    data.obsFotoLateral,
  ]
    .filter(Boolean)
    .join('\n');

  const analise: PostureAnalysis | undefined = observacoes
    ? { observacoes }
    : undefined;

  return {
    ...(base as PosturalEvaluation),
    fotosPostura,
    analise,
    recomendacoes: Array.isArray(data.recomendacoes) ? data.recomendacoes : [],
  };
};

const mapPersonalizedData = (
  base: PhysicalEvaluation,
  data: DocumentData,
  perguntas: EvaluationQuestion[] = [],
  respostas: EvaluationAnswer[] = []
): PersonalizedEvaluation => {
  return {
    ...(base as PersonalizedEvaluation),
    perguntas,
    respostas,
    prazoResposta: coerceDate(data.prazoResposta) || coerceDate(data.dataLimite) || null,
    respondidoEm: coerceDate(data.respondidoEm) || undefined,
    confirmadoEm: coerceDate(data.confirmadoEm) || undefined,
    feedbackEnviado: data.feedbackEnviado === true,
    resultado: data.resultado || data.observacao || data.observacoes || '',
    recomendacoes: Array.isArray(data.recomendacoes) ? data.recomendacoes : [],
  };
};

const mapPhysicalData = (
  base: PhysicalEvaluation,
  data: DocumentData
): PhysicalTestEvaluation => {
  const peso = toNumber(data.peso) || 0;
  const altura = toNumber(data.estatura) || 0;
  const imc = peso && altura ? calculateIMC(peso, altura) : 0;
  const percentualGordura =
    toNumber(data.porcentualDeGordura) ??
    toNumber(data.percentualDeGordura) ??
    toNumber(data.percentualGorduraSiri) ??
    toNumber(data.percentualGorduraBrozek);
  const dobrasCutaneas: SkinFolds = {
    triceps: toNumber(data.tricipital),
    biceps: toNumber(data.bicipital ?? data.biceps),
    subescapular: toNumber(data.subescapular),
    suprailiacas: toNumber(data.supraIlaca),
    abdominal: toNumber(data.abdominalAntropometria),
    peitoral: toNumber(data.peitoralAntropometria),
    coxaMedial: toNumber(data.coxaAntropometria),
    axilarMedia: toNumber(data.axilarMdia),
    panturrilhaMedial: toNumber(
      data.panturrilhaMedial ?? data.panturrilhaMedialAntropometria ?? data.panturrilhaAntropometria
    ),
  };
  const hasDobras = Object.values(dobrasCutaneas).some((value) => typeof value === 'number' && value > 0);
  const circSource = data.circunferencias || {};
  const circunferencias: Circumferences = {
    pescoco: toNumber(circSource.pescoco ?? data.pescoco),
    ombro: toNumber(circSource.ombro ?? data.ombro),
    torax: toNumber(circSource.torax ?? data.torax ?? data.peitoral),
    cintura: toNumber(circSource.cintura ?? data.cintura),
    abdominal: toNumber(circSource.abdominal ?? data.abdominal),
    quadril: toNumber(circSource.quadril ?? data.quadril),
    bracoDireito: toNumber(circSource.bracoDireito ?? data.bracoDireito),
    bracoEsquerdo: toNumber(circSource.bracoEsquerdo ?? data.bracoEsquerdo),
    antebracoDireito: toNumber(circSource.antebracoDireito ?? data.antebracoDireito),
    antebracoEsquerdo: toNumber(circSource.antebracoEsquerdo ?? data.antebracoEsquerdo),
    coxaDireita: toNumber(circSource.coxaDireita ?? data.coxaDireita ?? data.coxaMedial),
    coxaEsquerda: toNumber(circSource.coxaEsquerda ?? data.coxaEsquerda),
    panturrilhaDireita: toNumber(circSource.panturrilhaDireita ?? data.panturrilhaDireita),
    panturrilhaEsquerda: toNumber(circSource.panturrilhaEsquerda ?? data.panturrilhaEsquerda),
    punhoDireito: toNumber(circSource.punhoDireito ?? data.punhoDireito),
    punhoEsquerdo: toNumber(circSource.punhoEsquerdo ?? data.punhoEsquerdo),
  };
  const hasCircunferencias = Object.values(circunferencias).some(
    (value) => typeof value === 'number' && value > 0
  );
  const massaGorda =
    typeof percentualGordura === 'number' && percentualGordura > 0 && peso > 0
      ? Number(((peso * percentualGordura) / 100).toFixed(2))
      : toNumber(data.massaGorda);
  const massaMagra =
    peso > 0 && typeof massaGorda === 'number'
      ? Number((peso - massaGorda).toFixed(2))
      : toNumber(data.massaMagra);
  const taxaMetabolicaBasal = toNumber(data.taxaMetabolicaBasal);
  const densidadeCorporal = toNumber(data.densidadeCorporal);
  const percentualGorduraSiri = toNumber(data.percentualGorduraSiri);
  const percentualGorduraBrozek = toNumber(data.percentualGorduraBrozek);
  const protocoloDobras = isSkinfoldProtocolId(data.protocoloDobras)
    ? data.protocoloDobras
    : undefined;
  const dobrasMaturacao = isSkinfoldMaturacao(data.dobrasMaturacao)
    ? data.dobrasMaturacao
    : undefined;
  const dobrasEtnia = isSkinfoldEtnia(data.dobrasEtnia) ? data.dobrasEtnia : undefined;
  const idade = toNumber(data.idade);
  const sexoRaw = typeof data.sexo === 'string' ? data.sexo.toLowerCase() : '';
  const sexo =
    sexoRaw.includes('fem')
      ? 'feminino'
      : sexoRaw.includes('masc') || sexoRaw.includes('homem')
      ? 'masculino'
      : undefined;

  const composicaoCorporal: BodyComposition | undefined = peso || altura || hasDobras
    ? {
        peso,
        altura,
        imc,
        percentualGordura: percentualGordura || undefined,
        massaMagra: typeof massaMagra === 'number' && massaMagra > 0 ? massaMagra : undefined,
        massaGorda: typeof massaGorda === 'number' && massaGorda > 0 ? massaGorda : undefined,
        taxaMetabolicaBasal: typeof taxaMetabolicaBasal === 'number' && taxaMetabolicaBasal > 0 ? taxaMetabolicaBasal : undefined,
        dobrasCutaneas: hasDobras ? dobrasCutaneas : undefined,
        densidadeCorporal: typeof densidadeCorporal === 'number' && densidadeCorporal > 0 ? densidadeCorporal : undefined,
        percentualGorduraSiri:
          typeof percentualGorduraSiri === 'number' && percentualGorduraSiri > 0 ? percentualGorduraSiri : undefined,
        percentualGorduraBrozek:
          typeof percentualGorduraBrozek === 'number' && percentualGorduraBrozek > 0 ? percentualGorduraBrozek : undefined,
        protocoloDobras,
        dobrasMaturacao,
        dobrasEtnia,
        circunferencias: hasCircunferencias ? circunferencias : undefined,
      }
    : undefined;

  return {
    ...(base as PhysicalTestEvaluation),
    composicaoCorporal,
    testes: Array.isArray(data.testes) ? data.testes : [],
    resultados: Array.isArray(data.resultados) ? data.resultados : [],
    sexo,
    idade: typeof idade === 'number' && idade > 0 ? idade : undefined,
  };
};

const mapEvaluationDoc = (
  type: EvaluationType,
  id: string,
  data: DocumentData,
  fallbackUserId?: string,
  perguntas?: EvaluationQuestion[],
  respostas?: EvaluationAnswer[]
): PhysicalEvaluation => {
  const base: PhysicalEvaluation = {
    id,
    type,
    userId: resolveUserId(data, fallbackUserId),
    personalId: resolvePersonalId(data),
    date: resolveDate(data),
    status: resolveStatus(data),
    createdAt: resolveDate(data),
    updatedAt: coerceDate(data.updatedAt) || undefined,
  };

  switch (type) {
    case 'online':
      return mapOnlineData(base, data);
    case 'postural':
      return mapPosturalData(base, data);
    case 'personalizada':
      return mapPersonalizedData(base, data, perguntas, respostas);
    case 'fisica':
      return mapPhysicalData(base, data);
    default:
      return base;
  }
};

const buildInlinePersonalizedQuestions = (
  evaluationId: string,
  data: DocumentData
): { perguntas: EvaluationQuestion[]; respostas: EvaluationAnswer[] } => {
  const rawQuestions = Array.isArray(data.perguntas)
    ? data.perguntas
    : Array.isArray(data.questions)
    ? data.questions
    : [];
  const perguntas: EvaluationQuestion[] = rawQuestions.map((item: any, index: number) => {
    const tipoValue = String(item?.tipo || item?.type || 'texto');
    const tipo =
      tipoValue === 'multipla_escolha' ||
      tipoValue === 'escala' ||
      tipoValue === 'sim_nao' ||
      tipoValue === 'texto'
        ? (tipoValue as EvaluationQuestion['tipo'])
        : 'texto';
    return {
      id: String(item?.id || item?.questionId || `${evaluationId}-${index}`),
      pergunta: String(item?.pergunta || item?.question || 'Pergunta'),
      tipo,
      opcoes: Array.isArray(item?.opcoes || item?.options) ? (item.opcoes || item.options) : [],
      obrigatoria: Boolean(item?.obrigatoria ?? item?.required),
    };
  });

  const rawAnswers = Array.isArray(data.respostas) ? data.respostas : [];
  const respostas: EvaluationAnswer[] = rawAnswers
    .map((item: any) => {
      if (!item) return null;
      const questionId = item.questionId || item.id;
      if (!questionId) return null;
      return {
        questionId: String(questionId),
        resposta: item.resposta,
      } as EvaluationAnswer;
    })
    .filter(Boolean) as EvaluationAnswer[];

  return { perguntas, respostas };
};

const resolvePersonalizedQuestionType = (data: DocumentData): EvaluationQuestion['tipo'] => {
  if (data.multiplaEscolha) return 'multipla_escolha';
  if (data.sim || data.nao) return 'sim_nao';
  if (data.numero) return 'escala';
  return 'texto';
};

const buildPersonalizedQuestionSignature = (question: {
  pergunta?: string;
  tipo?: EvaluationQuestion['tipo'];
  opcoes?: string[];
}): string => {
  const pergunta = String(question.pergunta || '').trim().toLowerCase();
  const tipo = String(question.tipo || 'texto');
  const opcoes = Array.isArray(question.opcoes) ? question.opcoes.map((item) => item.trim().toLowerCase()) : [];
  return `${pergunta}::${tipo}::${opcoes.join('|')}`;
};

const buildPersonalizedQuestionDocData = (
  evaluationId: string,
  question: EvaluationQuestion,
  index: number
) => ({
  questionId: question.id,
  uidDaAvaliacao: evaluationId,
  pergunta: question.pergunta,
  texto: question.tipo === 'texto',
  multiplaEscolha: question.tipo === 'multipla_escolha',
  numero: question.tipo === 'escala',
  sim: question.tipo === 'sim_nao',
  nao: false,
  obrigatoria: question.obrigatoria ?? false,
  ordem: index,
  respostasMultiplas: question.opcoes || [],
  respostaAluno: null,
  respostaCerta: null,
});

async function fetchPersonalizedQuestions(userId: string, evaluationId: string): Promise<{
  perguntas: EvaluationQuestion[];
  respostas: EvaluationAnswer[];
}> {
  try {
    const perguntasRef = collection(
      db,
      'users',
      userId,
      COLLECTION_MAP.personalizada,
      evaluationId,
      'perguntasDasAvaliacoesPersonalizadas'
    );
    const snapshot = await getDocs(perguntasRef);

    const perguntas: EvaluationQuestion[] = [];
    const respostas: EvaluationAnswer[] = [];

    const docs = snapshot.docs
      .map((docItem) => ({ docItem, data: docItem.data() }))
      .sort((a, b) => {
        const orderA = typeof a.data.ordem === 'number' ? a.data.ordem : Number.MAX_SAFE_INTEGER;
        const orderB = typeof b.data.ordem === 'number' ? b.data.ordem : Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });

    docs.forEach(({ docItem, data }) => {
      const tipo = resolvePersonalizedQuestionType(data);
      const questionId = String(data.questionId || docItem.id);

      perguntas.push({
        id: questionId,
        pergunta: data.pergunta || 'Pergunta',
        tipo,
        opcoes: Array.isArray(data.respostasMultiplas) ? data.respostasMultiplas : [],
        obrigatoria: Boolean(data.obrigatoria),
      });

      const respostaAluno = data.respostaAluno ?? data.respostaCerta;
      if (respostaAluno !== undefined && respostaAluno !== null && String(respostaAluno).length > 0) {
        respostas.push({
          questionId,
          resposta: respostaAluno,
        });
      }
    });

    return { perguntas, respostas };
  } catch (_) {
    return { perguntas: [], respostas: [] };
  }
}

async function fetchCollectionByUser(
  userId: string,
  type: EvaluationType
): Promise<PhysicalEvaluation[]> {
  const collectionName = COLLECTION_MAP[type];
  const ref = collection(db, 'users', userId, collectionName);
  const snapshot = await getDocs(ref);

  const evaluations: PhysicalEvaluation[] = [];

  for (const docItem of snapshot.docs) {
    if (type === 'personalizada') {
      const { perguntas, respostas } = await fetchPersonalizedQuestions(userId, docItem.id);
      const inline = buildInlinePersonalizedQuestions(docItem.id, docItem.data());
      evaluations.push(
        mapEvaluationDoc(
          type,
          docItem.id,
          docItem.data(),
          userId,
          perguntas.length ? perguntas : inline.perguntas,
          respostas.length ? respostas : inline.respostas
        )
      );
    } else {
      evaluations.push(mapEvaluationDoc(type, docItem.id, docItem.data(), userId));
    }
  }

  return evaluations;
}

const isPersonalizedOverdue = (evaluation: PhysicalEvaluation): boolean => {
  if (evaluation.type !== 'personalizada') return false;
  const personalized = evaluation as PersonalizedEvaluation;
  if (!personalized.prazoResposta) return false;
  if (personalized.status === 'concluida' || personalized.status === 'nao_realizada') return false;
  const answeredCount =
    personalized.respostas?.filter((resposta) => {
      if (resposta.resposta === undefined || resposta.resposta === null) return false;
      if (typeof resposta.resposta === 'string') {
        return resposta.resposta.trim().length > 0;
      }
      return true;
    }).length || 0;
  if (answeredCount > 0) return false;
  return personalized.prazoResposta.getTime() < Date.now();
};

const applyPersonalizedOverdueStatus = (evaluation: PhysicalEvaluation): PhysicalEvaluation => {
  if (!isPersonalizedOverdue(evaluation)) return evaluation;
  return {
    ...evaluation,
    status: 'nao_realizada',
  };
};

async function fetchLegacyCollectionByUser(
  userId: string,
  type: EvaluationType
): Promise<PhysicalEvaluation[]> {
  const legacyName = LEGACY_COLLECTION_MAP[type];
  const ref = collection(db, legacyName);

  const snapshots = await Promise.all([
    getDocs(query(ref, where('userId', '==', userId))),
    getDocs(query(ref, where('uid', '==', userId))),
  ]);

  const evaluations: PhysicalEvaluation[] = [];
  for (const snap of snapshots) {
    for (const docItem of snap.docs) {
      evaluations.push(mapEvaluationDoc(type, docItem.id, docItem.data(), userId));
    }
  }
  return evaluations;
}

export async function fetchEvaluations(
  userId: string,
  type?: EvaluationType
): Promise<QueryResult<PhysicalEvaluation[]>> {
  try {
    const evaluations: PhysicalEvaluation[] = [];
    const typesToFetch = type
      ? [type]
      : (['online', 'personalizada', 'postural', 'fisica'] as EvaluationType[]);

    for (const evalType of typesToFetch) {
      const [current, legacy] = await Promise.all([
        fetchCollectionByUser(userId, evalType),
        fetchLegacyCollectionByUser(userId, evalType),
      ]);
      evaluations.push(...current, ...legacy);
    }

    const unique = new Map<string, PhysicalEvaluation>();
    evaluations.forEach((item) => {
      unique.set(`${item.type}-${item.id}`, item);
    });

    const merged = Array.from(unique.values()).map(applyPersonalizedOverdueStatus);
    merged.sort((a, b) => b.date.getTime() - a.date.getTime());

    return { data: merged, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function fetchEvaluationsForStudents(
  studentIds: string[],
  type?: EvaluationType
): Promise<QueryResult<PhysicalEvaluation[]>> {
  try {
    if (!studentIds.length) return { data: [], error: null };
    const results = await Promise.all(studentIds.map((id) => fetchEvaluations(id, type)));
    const evaluations = results.flatMap((result) => result.data || []);
    evaluations.sort((a, b) => b.date.getTime() - a.date.getTime());
    return { data: evaluations, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function fetchEvaluationById(
  evaluationId: string,
  type: EvaluationType,
  userId?: string
): Promise<QueryResult<PhysicalEvaluation>> {
  try {
    const collectionName = COLLECTION_MAP[type];

    if (userId) {
      const docRef = doc(db, 'users', userId, collectionName, evaluationId);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        if (type === 'personalizada') {
          const { perguntas, respostas } = await fetchPersonalizedQuestions(userId, snapshot.id);
          const inline = buildInlinePersonalizedQuestions(snapshot.id, snapshot.data());
          return {
            data: applyPersonalizedOverdueStatus(
              mapEvaluationDoc(
                type,
                snapshot.id,
                snapshot.data(),
                userId,
                perguntas.length ? perguntas : inline.perguntas,
                respostas.length ? respostas : inline.respostas
              )
            ),
            error: null,
          };
        }
        return {
          data: applyPersonalizedOverdueStatus(
            mapEvaluationDoc(type, snapshot.id, snapshot.data(), userId)
          ),
          error: null,
        };
      }
    }

    const legacyName = LEGACY_COLLECTION_MAP[type];
    const docRef = doc(db, legacyName, evaluationId);
    const legacySnapshot = await getDoc(docRef);
    if (!legacySnapshot.exists()) {
      return { data: null, error: 'Avaliação não encontrada' };
    }

    return {
      data: applyPersonalizedOverdueStatus(
        mapEvaluationDoc(type, legacySnapshot.id, legacySnapshot.data(), userId)
      ),
      error: null,
    };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function createOnlineEvaluation(
  evaluation: Omit<OnlineEvaluation, 'id' | 'createdAt' | 'updatedAt'>
): Promise<QueryResult<OnlineEvaluation>> {
  try {
    const collectionName = COLLECTION_MAP.online;
    if (!evaluation.userId) {
      return { data: null, error: 'Usuário não identificado' };
    }

    const evalRef = collection(db, 'users', evaluation.userId, collectionName);
    const docRef = await addDoc(evalRef, {
      uid: evaluation.userId,
      ...(evaluation.personalId ? { personalId: evaluation.personalId } : {}),
      status: evaluation.status,
      peso: evaluation.peso,
      estatura: evaluation.altura,
      fotoDeFrente: evaluation.fotos?.frente || null,
      fotoDeCostas: evaluation.fotos?.costas || null,
      fotoDeLado: evaluation.fotos?.ladoDireito || evaluation.fotos?.ladoEsquerdo || null,
      cintura: evaluation.circunferencias?.cintura || null,
      quadril: evaluation.circunferencias?.quadril || null,
      peitoral: evaluation.circunferencias?.torax || null,
      data: Timestamp.fromDate(evaluation.date || new Date()),
      avalicaoOnline: true,
      avaliacaoPresencial: false,
      nomeDaAvaliacao: 'Avaliacao Online',
      observacoes: evaluation.observacoes || null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const newEvaluation: OnlineEvaluation = {
      ...evaluation,
      id: docRef.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return { data: newEvaluation, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function createPersonalizedEvaluation(
  evaluation: Omit<PersonalizedEvaluation, 'id' | 'createdAt' | 'updatedAt'>
): Promise<QueryResult<PersonalizedEvaluation>> {
  try {
    const collectionName = COLLECTION_MAP.personalizada;
    if (!evaluation.userId) {
      return { data: null, error: 'Usuário não identificado' };
    }

    const evalRef = collection(db, 'users', evaluation.userId, collectionName);
    const normalizedQuestions =
      evaluation.perguntas?.map((pergunta, index) => ({
        ...pergunta,
        id: String(pergunta.id || `q_${index}`),
      })) || [];
    const inlineQuestions = normalizedQuestions.map((pergunta) => ({
      id: pergunta.id,
      pergunta: pergunta.pergunta,
      tipo: pergunta.tipo,
      opcoes: pergunta.opcoes || [],
      obrigatoria: pergunta.obrigatoria ?? false,
    }));
    const docRef = await addDoc(evalRef, {
      uid: evaluation.userId,
      ...(evaluation.personalId ? { personalId: evaluation.personalId } : {}),
      nomeDaAvaliacao: 'Avaliacao personalizada',
      observacao: evaluation.resultado || '',
      categoriaDaAvaliacao: 'Personalizada',
      dataDaAvaliacao: Timestamp.fromDate(evaluation.date || new Date()),
      status: evaluation.status,
      terminou: false,
      perguntas: inlineQuestions || [],
      respostas: [],
      prazoResposta: evaluation.prazoResposta ? Timestamp.fromDate(evaluation.prazoResposta) : null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    if (normalizedQuestions.length) {
      const perguntasRef = collection(db, 'users', evaluation.userId, collectionName, docRef.id, 'perguntasDasAvaliacoesPersonalizadas');
      await Promise.all(
        normalizedQuestions.map((pergunta, index) =>
          setDoc(
            doc(perguntasRef, pergunta.id),
            buildPersonalizedQuestionDocData(docRef.id, pergunta, index)
          )
        )
      );
    }

    const newEvaluation: PersonalizedEvaluation = {
      ...evaluation,
      perguntas: normalizedQuestions,
      id: docRef.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return { data: newEvaluation, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function createPosturalEvaluation(
  evaluation: Omit<PosturalEvaluation, 'id' | 'createdAt' | 'updatedAt'>
): Promise<QueryResult<PosturalEvaluation>> {
  try {
    const collectionName = COLLECTION_MAP.postural;
    if (!evaluation.userId) {
      return { data: null, error: 'Usuário não identificado' };
    }

    const evalRef = collection(db, 'users', evaluation.userId, collectionName);
    const docRef = await addDoc(evalRef, {
      uid: evaluation.userId,
      ...(evaluation.personalId ? { personalId: evaluation.personalId } : {}),
      dateForAvaliacaoPostural: Timestamp.fromDate(evaluation.date || new Date()),
      status: evaluation.status,
      fotoFrontal: evaluation.fotosPostura?.anterior || null,
      fotoPosterior: evaluation.fotosPostura?.posterior || null,
      fotoLateral: evaluation.fotosPostura?.lateralDireita || evaluation.fotosPostura?.lateralEsquerda || null,
      obsFotoFrontal: evaluation.analise?.observacoes || null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const newEvaluation: PosturalEvaluation = {
      ...evaluation,
      id: docRef.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return { data: newEvaluation, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function createPhysicalTestEvaluation(
  evaluation: Omit<PhysicalTestEvaluation, 'id' | 'createdAt' | 'updatedAt'>
): Promise<QueryResult<PhysicalTestEvaluation>> {
  try {
    const collectionName = COLLECTION_MAP.fisica;
    if (!evaluation.userId) {
      return { data: null, error: 'Usuário não identificado' };
    }

    const evalRef = collection(db, 'users', evaluation.userId, collectionName);
    const docRef = await addDoc(evalRef, {
      uid: evaluation.userId,
      ...(evaluation.personalId ? { personalId: evaluation.personalId } : {}),
      status: evaluation.status,
      peso: evaluation.composicaoCorporal?.peso || null,
      estatura: evaluation.composicaoCorporal?.altura || null,
      porcentualDeGordura: evaluation.composicaoCorporal?.percentualGordura || null,
      massaMagra: evaluation.composicaoCorporal?.massaMagra || null,
      massaGorda: evaluation.composicaoCorporal?.massaGorda || null,
      taxaMetabolicaBasal: evaluation.composicaoCorporal?.taxaMetabolicaBasal || null,
      densidadeCorporal: evaluation.composicaoCorporal?.densidadeCorporal || null,
      percentualGorduraSiri: evaluation.composicaoCorporal?.percentualGorduraSiri || null,
      percentualGorduraBrozek: evaluation.composicaoCorporal?.percentualGorduraBrozek || null,
      protocoloDobras: evaluation.composicaoCorporal?.protocoloDobras || null,
      dobrasMaturacao: evaluation.composicaoCorporal?.dobrasMaturacao || null,
      dobrasEtnia: evaluation.composicaoCorporal?.dobrasEtnia || null,
      circunferencias: evaluation.composicaoCorporal?.circunferencias || null,
      tricipital: evaluation.composicaoCorporal?.dobrasCutaneas?.triceps || null,
      bicipital: evaluation.composicaoCorporal?.dobrasCutaneas?.biceps || null,
      subescapular: evaluation.composicaoCorporal?.dobrasCutaneas?.subescapular || null,
      supraIlaca: evaluation.composicaoCorporal?.dobrasCutaneas?.suprailiacas || null,
      abdominalAntropometria: evaluation.composicaoCorporal?.dobrasCutaneas?.abdominal || null,
      peitoralAntropometria: evaluation.composicaoCorporal?.dobrasCutaneas?.peitoral || null,
      coxaAntropometria: evaluation.composicaoCorporal?.dobrasCutaneas?.coxaMedial || null,
      axilarMdia: evaluation.composicaoCorporal?.dobrasCutaneas?.axilarMedia || null,
      panturrilhaMedial: evaluation.composicaoCorporal?.dobrasCutaneas?.panturrilhaMedial || null,
      sexo: evaluation.sexo || null,
      idade: evaluation.idade || null,
      dataDaAvaliacao: Timestamp.fromDate(evaluation.date || new Date()),
      observacoes: evaluation.composicaoCorporal ? 'Avaliacao fisica registrada.' : null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const newEvaluation: PhysicalTestEvaluation = {
      ...evaluation,
      id: docRef.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return { data: newEvaluation, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function submitPersonalizedAnswers(params: {
  evaluationId: string;
  userId: string;
  answers: EvaluationAnswer[];
}): Promise<QueryResult<void>> {
  try {
    const collectionName = COLLECTION_MAP.personalizada;
    if (!params.userId) {
      return { data: null, error: 'Usuario nao identificado' };
    }
    const respostasRef = collection(
      db,
      'users',
      params.userId,
      collectionName,
      params.evaluationId,
      'perguntasDasAvaliacoesPersonalizadas'
    );
    const respondedAt = Timestamp.now();
    const evalRef = doc(db, 'users', params.userId, collectionName, params.evaluationId);
    const evaluationSnapshot = await getDoc(evalRef);
    const inline = evaluationSnapshot.exists()
      ? buildInlinePersonalizedQuestions(params.evaluationId, evaluationSnapshot.data())
      : { perguntas: [], respostas: [] };
    const inlineById = new Map(
      inline.perguntas.map((question, index) => [question.id, { question, index }] as const)
    );
    const existingSnapshot = await getDocs(respostasRef);
    const docIdByQuestionId = new Map<string, string>();
    const docIdBySignature = new Map<string, string>();

    existingSnapshot.forEach((docItem) => {
      const data = docItem.data();
      const tipo = resolvePersonalizedQuestionType(data);
      const logicalQuestionId = String(data.questionId || docItem.id);
      docIdByQuestionId.set(docItem.id, docItem.id);
      docIdByQuestionId.set(logicalQuestionId, docItem.id);
      const signature = buildPersonalizedQuestionSignature({
        pergunta: data.pergunta,
        tipo,
        opcoes: Array.isArray(data.respostasMultiplas) ? data.respostasMultiplas : [],
      });
      if (signature && !docIdBySignature.has(signature)) {
        docIdBySignature.set(signature, docItem.id);
      }
    });

    await Promise.all(
      params.answers.map((answer, index) => {
        const inlineQuestion = inlineById.get(answer.questionId);
        const signature = inlineQuestion
          ? buildPersonalizedQuestionSignature(inlineQuestion.question)
          : '';
        const targetDocId =
          docIdByQuestionId.get(answer.questionId) ||
          (signature ? docIdBySignature.get(signature) : undefined) ||
          answer.questionId;
        const questionData = inlineQuestion
          ? buildPersonalizedQuestionDocData(
              params.evaluationId,
              inlineQuestion.question,
              inlineQuestion.index
            )
          : {
              questionId: answer.questionId,
              uidDaAvaliacao: params.evaluationId,
              ordem: index,
            };
        return setDoc(
          doc(respostasRef, targetDocId),
          {
            ...questionData,
            respostaAluno: answer.resposta,
            respondidoEm: respondedAt,
          },
          { merge: true }
        );
      })
    );
    await updateDoc(evalRef, {
      status: 'em_andamento',
      terminou: true,
      respostas: params.answers,
      respondidoEm: respondedAt,
      updatedAt: Timestamp.now(),
    });
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function confirmPersonalizedEvaluation(params: {
  evaluationId: string;
  userId: string;
}): Promise<QueryResult<void>> {
  try {
    const collectionName = COLLECTION_MAP.personalizada;
    if (!params.userId) {
      return { data: null, error: 'Usuario nao identificado' };
    }
    const evalRef = doc(db, 'users', params.userId, collectionName, params.evaluationId);
    await updateDoc(evalRef, {
      status: 'concluida',
      terminou: true,
      confirmadoEm: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function markPersonalizedEvaluationExpired(params: {
  evaluationId: string;
  userId: string;
}): Promise<QueryResult<void>> {
  try {
    const collectionName = COLLECTION_MAP.personalizada;
    if (!params.userId) {
      return { data: null, error: 'Usuario nao identificado' };
    }
    const evalRef = doc(db, 'users', params.userId, collectionName, params.evaluationId);
    await updateDoc(evalRef, {
      status: 'nao_realizada',
      naoRealizada: true,
      naoRealizadaEm: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function updateEvaluation(
  evaluationId: string,
  type: EvaluationType,
  updates: Partial<PhysicalEvaluation>,
  userId?: string
): Promise<QueryResult<void>> {
  try {
    const collectionName = COLLECTION_MAP[type];
    if (userId) {
      const docRef = doc(db, 'users', userId, collectionName, evaluationId);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: Timestamp.now(),
      });
      return { data: undefined, error: null };
    }

    const legacyName = LEGACY_COLLECTION_MAP[type];
    const legacyRef = doc(db, legacyName, evaluationId);
    await updateDoc(legacyRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    });

    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function deleteEvaluation(
  evaluationId: string,
  type: EvaluationType,
  userId?: string
): Promise<QueryResult<void>> {
  try {
    const collectionName = COLLECTION_MAP[type];
    if (userId) {
      const docRef = doc(db, 'users', userId, collectionName, evaluationId);
      await deleteDoc(docRef);
      return { data: undefined, error: null };
    }

    const legacyName = LEGACY_COLLECTION_MAP[type];
    const docRef = doc(db, legacyName, evaluationId);
    await deleteDoc(docRef);
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export function calculateIMC(peso: number, altura: number): number {
  if (!peso || !altura) return 0;
  const alturaMetros = altura / 100;
  return Number((peso / (alturaMetros * alturaMetros)).toFixed(2));
}

export function getIMCClassification(imc: number): { classification: string; color: string } {
  if (imc < 18.5) return { classification: 'Abaixo do peso', color: '#f0ad4e' };
  if (imc < 25) return { classification: 'Peso normal', color: '#5cb85c' };
  if (imc < 30) return { classification: 'Sobrepeso', color: '#f0ad4e' };
  if (imc < 35) return { classification: 'Obesidade Grau I', color: '#d9534f' };
  if (imc < 40) return { classification: 'Obesidade Grau II', color: '#d9534f' };
  return { classification: 'Obesidade Grau III', color: '#d9534f' };
}

export function calculateBodyComposition(
  peso: number,
  altura: number,
  idade: number,
  sexo: 'masculino' | 'feminino',
  circunferencias?: Circumferences
): BodyComposition {
  const imc = calculateIMC(peso, altura);

  let percentualGordura = 0;
  if (sexo === 'masculino') {
    percentualGordura = (1.20 * imc) + (0.23 * idade) - 16.2;
  } else {
    percentualGordura = (1.20 * imc) + (0.23 * idade) - 5.4;
  }
  percentualGordura = Math.max(0, Math.min(percentualGordura, 60));

  const massaGorda = (peso * percentualGordura) / 100;
  const massaMagra = peso - massaGorda;

  let taxaMetabolicaBasal = 0;
  if (sexo === 'masculino') {
    taxaMetabolicaBasal = 88.362 + (13.397 * peso) + (4.799 * altura) - (5.677 * idade);
  } else {
    taxaMetabolicaBasal = 447.593 + (9.247 * peso) + (3.098 * altura) - (4.330 * idade);
  }

  return {
    peso,
    altura,
    imc,
    percentualGordura: Number(percentualGordura.toFixed(2)),
    massaMagra: Number(massaMagra.toFixed(2)),
    massaGorda: Number(massaGorda.toFixed(2)),
    taxaMetabolicaBasal: Math.round(taxaMetabolicaBasal),
  };
}

const clampPercent = (value: number) => Math.max(0, Math.min(value, 60));

const roundValue = (value: number, digits: number) =>
  Number(value.toFixed(digits));

const sumDobras = (dobras: SkinFolds, keys: SkinfoldKey[]) => {
  const values = keys.map((key) => dobras[key]);
  if (values.some((value) => typeof value !== 'number' || value <= 0)) return null;
  return values.reduce((acc, value) => acc + (value || 0), 0);
};

const calculateSiriPercent = (densidade: number, sexo: 'masculino' | 'feminino') => {
  if (!densidade || densidade <= 0) return null;
  const constants = sexo === 'feminino' ? { a: 5.01, b: 4.57 } : { a: 4.95, b: 4.5 };
  const percentual = (constants.a / densidade - constants.b) * 100;
  return clampPercent(percentual);
};

const calculateBrozekPercent = (densidade: number) => {
  if (!densidade || densidade <= 0) return null;
  const percentual = (457 / densidade) - 414.2;
  return clampPercent(percentual);
};

export interface SkinfoldProtocolResult {
  protocolo: SkinfoldProtocolId;
  totalDobras?: number;
  densidadeCorporal?: number;
  percentualGordura?: number;
  percentualGorduraSiri?: number;
  percentualGorduraBrozek?: number;
}

export function calculateSkinfoldProtocol(params: {
  protocolo: SkinfoldProtocolId;
  dobras: SkinFolds;
  sexo?: 'masculino' | 'feminino';
  idade?: number;
  peso?: number;
  altura?: number;
  circunferencias?: Circumferences;
  maturacao?: SkinfoldMaturacao;
  etnia?: SkinfoldEtnia;
}): SkinfoldProtocolResult | null {
  const {
    protocolo,
    dobras,
    sexo,
    idade,
    peso,
    altura,
    circunferencias,
    maturacao,
    etnia,
  } = params;
  const config = SKINFOLD_PROTOCOL_CONFIG[protocolo];
  if (!config) return null;
  if (config.requiresSex && !sexo) return null;
  if (config.requiresAge && (!idade || idade <= 0)) return null;

  const dobrasKeys = getSkinfoldProtocolDobras(protocolo, sexo);
  const soma = dobrasKeys.length ? sumDobras(dobras, dobrasKeys) : null;
  const totalDobras = soma !== null ? roundValue(soma, 1) : undefined;

  switch (protocolo) {
    case 'faulkner_1968_4': {
      if (soma === null) return null;
      const percentual = clampPercent(0.153 * soma + 5.783);
      return {
        protocolo,
        totalDobras,
        percentualGordura: roundValue(percentual, 2),
      };
    }
    case 'pollock_1984_7': {
      if (!sexo || soma === null || !idade) return null;
      const soma2 = soma * soma;
      const densidade =
        sexo === 'masculino'
          ? 1.112 - 0.00043499 * soma + 0.00000055 * soma2 - 0.00028826 * idade
          : 1.097 - 0.00046971 * soma + 0.00000056 * soma2 - 0.00012828 * idade;
      const siri = calculateSiriPercent(densidade, sexo);
      if (!siri) return null;
      return {
        protocolo,
        totalDobras,
        densidadeCorporal: roundValue(densidade, 4),
        percentualGordura: roundValue(siri, 2),
        percentualGorduraSiri: roundValue(siri, 2),
      };
    }
    case 'pollock_1984_3': {
      if (!sexo || soma === null || !idade) return null;
      const soma2 = soma * soma;
      const densidade =
        sexo === 'masculino'
          ? 1.10938 - 0.0008267 * soma + 0.0000016 * soma2 - 0.0002574 * idade
          : 1.0994921 - 0.0009929 * soma + 0.0000023 * soma2 - 0.0001392 * idade;
      const siri = calculateSiriPercent(densidade, sexo);
      if (!siri) return null;
      return {
        protocolo,
        totalDobras,
        densidadeCorporal: roundValue(densidade, 4),
        percentualGordura: roundValue(siri, 2),
        percentualGorduraSiri: roundValue(siri, 2),
      };
    }
    case 'siri_brozek_4': {
      if (!sexo || soma === null || !idade) return null;
      const densidade =
        sexo === 'masculino'
          ? 1.1631 - 0.0632 * Math.log10(soma) + 0.000321 * idade
          : 1.1987 - 0.0747 * Math.log10(soma) + 0.000566 * idade;
      const siri = calculateSiriPercent(densidade, sexo);
      const brozek = calculateBrozekPercent(densidade);
      if (!siri || !brozek) return null;
      return {
        protocolo,
        totalDobras,
        densidadeCorporal: roundValue(densidade, 4),
        percentualGordura: roundValue(siri, 2),
        percentualGorduraSiri: roundValue(siri, 2),
        percentualGorduraBrozek: roundValue(brozek, 2),
      };
    }
    case 'yuhasz_6': {
      if (!sexo || soma === null) return null;
      const percentual =
        sexo === 'feminino'
          ? 4.56 + 0.143 * soma
          : 3.64 + 0.097 * soma;
      return {
        protocolo,
        totalDobras,
        percentualGordura: roundValue(clampPercent(percentual), 2),
      };
    }
    case 'petroski_1995_4': {
      if (!sexo || soma === null || !idade) return null;
      const densidade =
        sexo === 'feminino'
          ? 1.1954713 - 0.07513507 * Math.log10(soma) - 0.00041072 * idade
          : 1.10726863 - 0.00081201 * soma + 0.00000212 * soma * soma - 0.00041761 * idade;
      const siri = calculateSiriPercent(densidade, sexo);
      if (!siri) return null;
      return {
        protocolo,
        totalDobras,
        densidadeCorporal: roundValue(densidade, 4),
        percentualGordura: roundValue(siri, 2),
        percentualGorduraSiri: roundValue(siri, 2),
      };
    }
    case 'guedes_1994_3': {
      if (!sexo || soma === null) return null;
      const densidade =
        sexo === 'feminino'
          ? 1.16650 - 0.07063 * Math.log10(soma)
          : 1.17136 - 0.06706 * Math.log10(soma);
      const siri = calculateSiriPercent(densidade, sexo);
      if (!siri) return null;
      return {
        protocolo,
        totalDobras,
        densidadeCorporal: roundValue(densidade, 4),
        percentualGordura: roundValue(siri, 2),
        percentualGorduraSiri: roundValue(siri, 2),
      };
    }
    case 'guedes_2_criancas': {
      if (!sexo || soma === null) return null;
      let percentual: number | null = null;
      if (sexo === 'feminino') {
        percentual =
          soma <= 35
            ? 1.33 * soma - 0.013 * soma * soma - 2.4
            : 0.546 * soma + 9.7;
      } else if (soma > 35) {
        percentual = 0.783 * soma + 1.6;
      } else {
        if (!maturacao || !etnia) return null;
        const isNegro = etnia === 'negro';
        const constants: Record<SkinfoldMaturacao, number> = {
          prepuber: isNegro ? 3.2 : 1.7,
          puber: isNegro ? 5.2 : 3.4,
          pospuber: isNegro ? 6.8 : 5.5,
        };
        const c = constants[maturacao];
        percentual = 1.21 * soma - 0.008 * soma * soma - c;
      }
      if (percentual === null) return null;
      return {
        protocolo,
        totalDobras,
        percentualGordura: roundValue(clampPercent(percentual), 2),
      };
    }
    case 'penrose_cote_2': {
      if (sexo !== 'masculino') return null;
      if (!peso || peso <= 0) return null;
      const cintura = circunferencias?.cintura;
      const punho = circunferencias?.punhoDireito || circunferencias?.punhoEsquerdo;
      if (!cintura || !punho) return null;
      const massaMagra = 41.955 + 1.038786 * peso - 0.82816 * (cintura - punho);
      if (!massaMagra || massaMagra <= 0) return null;
      const percentual = clampPercent((1 - massaMagra / peso) * 100);
      return {
        protocolo,
        percentualGordura: roundValue(percentual, 2),
      };
    }
    case 'weltman_obesos_2': {
      if (!sexo) return null;
      if (!peso || peso <= 0) return null;
      const cintura = circunferencias?.cintura;
      if (!cintura || cintura <= 0) return null;
      if (sexo === 'feminino') {
        if (!altura || altura <= 0) return null;
        const percentual =
          0.11077 * cintura - 0.17666 * altura + 0.14354 * peso + 51.03301;
        return {
          protocolo,
          percentualGordura: roundValue(clampPercent(percentual), 2),
        };
      }
      const percentual = 0.31457 * cintura - 0.10969 * peso + 10.8336;
      return {
        protocolo,
        percentualGordura: roundValue(clampPercent(percentual), 2),
      };
    }
    default:
      return null;
  }
}

export function calculateSkinfoldBodyFat(
  dobras: SkinFolds,
  idade: number,
  sexo: 'masculino' | 'feminino'
): { totalDobras: number; densidadeCorporal: number; percentualGordura: number } | null {
  const result = calculateSkinfoldProtocol({
    protocolo: 'pollock_1984_7',
    dobras,
    idade,
    sexo,
  });
  if (!result?.densidadeCorporal || !result?.percentualGordura) return null;
  return {
    totalDobras: result.totalDobras || 0,
    densidadeCorporal: result.densidadeCorporal,
    percentualGordura: result.percentualGordura,
  };
}

export function calculateBodyCompositionFromSkinfolds(
  peso: number,
  altura: number,
  idade: number,
  sexo: 'masculino' | 'feminino',
  dobras: SkinFolds,
  options?: {
    protocolo?: SkinfoldProtocolId;
    circunferencias?: Circumferences;
    maturacao?: SkinfoldMaturacao;
    etnia?: SkinfoldEtnia;
  }
): BodyComposition | null {
  const protocolo = options?.protocolo ?? 'pollock_1984_7';
  const skinfold = calculateSkinfoldProtocol({
    protocolo,
    dobras,
    sexo,
    idade,
    peso,
    altura,
    circunferencias: options?.circunferencias,
    maturacao: options?.maturacao,
    etnia: options?.etnia,
  });
  if (!skinfold?.percentualGordura) return null;
  const imc = calculateIMC(peso, altura);
  const massaGorda = (peso * skinfold.percentualGordura) / 100;
  const massaMagra = peso - massaGorda;
  const taxaMetabolicaBasal =
    idade && idade > 0
      ? sexo === 'masculino'
        ? 88.362 + (13.397 * peso) + (4.799 * altura) - (5.677 * idade)
        : 447.593 + (9.247 * peso) + (3.098 * altura) - (4.330 * idade)
      : undefined;
  const siri = skinfold.percentualGorduraSiri ?? skinfold.percentualGordura;
  const brozek = skinfold.percentualGorduraBrozek;
  const hasDobras = Object.values(dobras).some(
    (value) => typeof value === 'number' && value > 0
  );

  return {
    peso,
    altura,
    imc,
    percentualGordura: roundValue(skinfold.percentualGordura, 2),
    percentualGorduraSiri: siri ? roundValue(siri, 2) : undefined,
    percentualGorduraBrozek: brozek ? roundValue(brozek, 2) : undefined,
    densidadeCorporal: skinfold.densidadeCorporal,
    massaMagra: Number(massaMagra.toFixed(2)),
    massaGorda: Number(massaGorda.toFixed(2)),
    taxaMetabolicaBasal: taxaMetabolicaBasal ? Math.round(taxaMetabolicaBasal) : undefined,
    dobrasCutaneas: hasDobras ? dobras : undefined,
    protocoloDobras: protocolo,
    dobrasMaturacao: options?.maturacao,
    dobrasEtnia: options?.etnia,
    circunferencias: options?.circunferencias,
  };
}

export function getEvaluationTypeLabel(type: EvaluationType): string {
  const labels: Record<EvaluationType, string> = {
    online: 'Online',
    personalizada: 'Personalizada',
    postural: 'Postural',
    fisica: 'Fisica',
  };
  return labels[type] || type;
}

export function getEvaluationStatusLabel(status: EvaluationStatus): string {
  const labels: Record<EvaluationStatus, string> = {
    pendente: 'Pendente',
    agendada: 'Agendada',
    em_andamento: 'Em Andamento',
    concluida: 'Concluida',
    cancelada: 'Cancelada',
    nao_realizada: 'Nao realizada',
  };
  return labels[status] || status;
}

export function getEvaluationStatusColor(status: EvaluationStatus): string {
  const colors: Record<EvaluationStatus, string> = {
    pendente: '#6c757d',
    agendada: '#5bc0de',
    em_andamento: '#4361ee',
    concluida: '#5cb85c',
    cancelada: '#d9534f',
    nao_realizada: '#f0ad4e',
  };
  return colors[status] || '#6c757d';
}
