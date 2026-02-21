import { EvaluationType } from '../types/evaluation';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './firebase';

const stripWrappingQuotes = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const startsWithSingle = trimmed.startsWith("'");
    const endsWithSingle = trimmed.endsWith("'");
    const startsWithDouble = trimmed.startsWith('"');
    const endsWithDouble = trimmed.endsWith('"');
    if ((startsWithSingle && endsWithSingle) || (startsWithDouble && endsWithDouble)) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
};

const getOpenRouterApiUrl = () =>
  stripWrappingQuotes(process.env.EXPO_PUBLIC_OPENROUTER_API_URL || '') || 'https://openrouter.ai/api/v1';

const getOpenRouterApiKey = () =>
  stripWrappingQuotes(process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '');

const getOpenRouterModel = () =>
  stripWrappingQuotes(process.env.EXPO_PUBLIC_OPENROUTER_MODEL || '') || 'openrouter/free';
export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);
const DEFAULT_FREE_DAILY_AI_CREDITS = 8;
const parsedDailyCredits = Number(process.env.EXPO_PUBLIC_AI_DAILY_FREE_CREDITS || '');
export const FREE_DAILY_AI_CREDITS =
  Number.isFinite(parsedDailyCredits) && parsedDailyCredits > 0
    ? Math.floor(parsedDailyCredits)
    : DEFAULT_FREE_DAILY_AI_CREDITS;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface AIWorkoutResponse {
  type: 'treino';
  nomeDaRotina: string;
  objetivoDaRotina: string;
  treino: string[];
}

interface AITextResponse {
  type: 'resposta';
  resposta: string;
}

type AIResponse = AIWorkoutResponse | AITextResponse;

type AiCreditLease = {
  uid: string;
  units: number;
  dateKey: string;
  consumed: boolean;
  premium: boolean;
  remaining: number | null;
};

export interface ExerciseInsights {
  resumo: string;
  beneficios: string[];
  musculos: string[];
  dica: string;
  erroComum: string;
  nivel: string;
  metricas: {
    cardio: number;
    forca: number;
    mobilidade: number;
    resistencia: number;
  };
}

export interface EvaluationInsightMetric {
  label: string;
  value: number;
}

export interface EvaluationAIInsights {
  resumo: string;
  destaques: string[];
  alertas: string[];
  proximosPassos: string[];
  graficos: EvaluationInsightMetric[];
}

export interface StudentEvolutionInsights {
  resumo: string;
  destaques: string[];
  alertas: string[];
  proximosPassos: string[];
  graficos: EvaluationInsightMetric[];
  pizza: EvaluationInsightMetric[];
}

function getHeaders(): Record<string, string> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured');
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://mhpersonal.app',
    'X-Title': 'MH Personal',
  };
}

function extractFirstJsonObject(text: string): any | null {
  if (!text || typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const maybe = text.slice(start, end + 1);
  try {
    return JSON.parse(maybe);
  } catch (_) {
    return null;
  }
}

const toBool = (value: any) => value === true || value === 'true' || value === 1;
const normalizeStatus = (value: any) => String(value || '').trim().toLowerCase();
const currentDateKey = () => new Date().toISOString().slice(0, 10);
const aiCreditLocks = new Map<string, Promise<void>>();

export const isPremiumUserRecord = (data: Record<string, any>) => {
  if (!data) return false;
  if (toBool(data.assinatura)) return true;
  if (toBool(data.planoChatGPT)) return true;
  const statusCandidates = [
    data.stripeSubscriptionStatus,
    data.subscriptionStatus,
    data.statusAssinatura,
    data.assinaturaStatus,
  ];
  return statusCandidates.some((status) => ACTIVE_SUBSCRIPTION_STATUSES.has(normalizeStatus(status)));
};

const quotaLimitError = () =>
  new Error(
    `Limite diario de IA atingido. Voce recebe ${FREE_DAILY_AI_CREDITS} creditos por dia no plano gratuito. Assine o Premium para uso ilimitado.`
  );

async function withAiCreditLock<T>(uid: string, handler: () => Promise<T>): Promise<T> {
  const previous = aiCreditLocks.get(uid) || Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  const next = previous.finally(() => gate);
  aiCreditLocks.set(uid, next);

  await previous.catch(() => undefined);
  try {
    return await handler();
  } finally {
    if (release) {
      release();
    }
    if (aiCreditLocks.get(uid) === next) {
      aiCreditLocks.delete(uid);
    }
  }
}

async function reserveAiCredit(units = 1): Promise<AiCreditLease> {
  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Faca login para usar os recursos de IA.');
  }

  const safeUnits = Math.max(1, Math.floor(units));
  const dateKey = currentDateKey();
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

  // Load premium status outside the transaction so unrelated user doc writes
  // do not invalidate the credit transaction.
  const userSnap = await getDoc(userRef);
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
    return result;
  }

  return withAiCreditLock(uid, async () => {
    const usageSnap = await getDoc(usageRef);
    const usageData = usageSnap.data() || {};
    const usedToday = usageData.dateKey === dateKey ? Number(usageData.usedToday || 0) : 0;
    const nextUsed = usedToday + safeUnits;

    if (nextUsed > FREE_DAILY_AI_CREDITS) {
      throw quotaLimitError();
    }

    await setDoc(
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
    return result;
  });
}

async function refundAiCredit(lease: AiCreditLease | null | undefined): Promise<void> {
  if (!lease?.consumed || !lease.uid || lease.units <= 0) return;
  const db = getFirebaseDb();
  const usageRef = doc(db, 'users', lease.uid, 'usage', 'aiCredits');

  await withAiCreditLock(lease.uid, async () => {
    const usageSnap = await getDoc(usageRef);
    if (!usageSnap.exists()) return;
    const usageData = usageSnap.data() || {};
    if (usageData.dateKey !== lease.dateKey) return;

    const usedToday = Number(usageData.usedToday || 0);
    const nextUsed = Math.max(0, usedToday - lease.units);
    await setDoc(
      usageRef,
      {
        usedToday: nextUsed,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

async function chatCompletions({
  messages,
  model = getOpenRouterModel(),
  maxTokens,
  temperature,
  responseFormat,
}: {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: string };
}): Promise<OpenRouterResponse> {
  const creditLease = await reserveAiCredit(1);
  try {
    const response = await fetch(`${getOpenRouterApiUrl()}/chat/completions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        model,
        messages,
        ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
        ...(typeof temperature === 'number' ? { temperature } : {}),
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const message = data?.error?.message || data?.message || `OpenRouter request failed (${response.status})`;
      throw new Error(message);
    }

    return data;
  } catch (error) {
    await refundAiCredit(creditLease).catch(() => undefined);
    throw error;
  }
}

export async function generateText(prompt: string): Promise<string> {
  const data = await chatCompletions({
    messages: [
      {
        role: 'system',
        content: [
          'Você é o MH Personal Trainer.',
          'Responda apenas sobre saúde, academia, treino, avaliação física e hábitos saudáveis.',
          'Se o pedido for fora desses temas, recuse e sugira falar sobre treinos ou saúde.',
        ].join('\n'),
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
  });
  
  return data?.choices?.[0]?.message?.content ?? '';
}

export async function chatWithAI(
  userMessage: string,
  conversationHistory: ChatMessage[] = []
): Promise<{ text: string; workout?: AIWorkoutResponse }> {
  const systemPrompt = [
    'Você é o MH Personal Trainer, um assistente especializado em treinos e fitness.',
    'Responda sempre em português brasileiro.',
    'Assuntos permitidos: saúde, academia, treino, nutrição básica, avaliação física e hábitos saudáveis.',
    'Se o usuário perguntar algo fora desses temas, responda com JSON type="resposta" recusando de forma educada e convide a falar sobre treinos ou saúde.',
    'Se o usuario pedir um treino/rotina/ficha (ex.: "me monta um treino", "rotina de musculacao", "plano de treino"), retorne um JSON com type="treino" e inclua:',
    '- nomeDaRotina (string curta)',
    '- objetivoDaRotina (string curta)',
    '- treino (lista de strings, 6 a 12 itens, formato: "Exercicio - series x repeticoes - descanso")',
    'Caso contrário, retorne JSON com type="resposta" e inclua "resposta" (string).',
    'Responda APENAS com JSON válido.',
  ].join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  const data = await chatCompletions({
    messages,
    temperature: 0.6,
    responseFormat: { type: 'json_object' },
  });

  const raw = data?.choices?.[0]?.message?.content ?? '';
  const parsed = extractFirstJsonObject(raw) as AIResponse | null;

  if (parsed && parsed.type === 'treino' && 'treino' in parsed) {
    return {
      text: `Aqui está seu treino: ${parsed.nomeDaRotina}`,
      workout: {
        type: 'treino',
        nomeDaRotina: parsed.nomeDaRotina || 'Treino sugerido',
        objetivoDaRotina: parsed.objetivoDaRotina || '',
        treino: Array.isArray(parsed.treino) ? parsed.treino : [],
      },
    };
  }

  const resposta = 
    (parsed && parsed.type === 'resposta' && 'resposta' in parsed && parsed.resposta) ||
    (parsed && 'resposta' in parsed && parsed.resposta) ||
    raw;

  return { text: typeof resposta === 'string' ? resposta : raw };
}

export async function generateWorkout(params: {
  objetivo: string;
  nivel: string;
  equipamentos?: string;
  tempoDisponivel?: string;
}): Promise<AIWorkoutResponse> {
  const prompt = [
    `Crie um treino de musculação com as seguintes características:`,
    `- Objetivo: ${params.objetivo}`,
    `- Nível: ${params.nivel}`,
    params.equipamentos ? `- Equipamentos disponíveis: ${params.equipamentos}` : '',
    params.tempoDisponivel ? `- Tempo disponível: ${params.tempoDisponivel}` : '',
    '',
    'Retorne APENAS um JSON com:',
    '- nomeDaRotina (string curta)',
    '- objetivoDaRotina (string curta)',
    '- treino (lista de 6-12 exercícios, formato: "Exercício - séries x repetições - descanso")',
  ].filter(Boolean).join('\n');

  const data = await chatCompletions({
    messages: [
      {
        role: 'system',
        content: 'Você é um personal trainer especializado. Responda apenas com JSON válido.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    responseFormat: { type: 'json_object' },
  });

  const raw = data?.choices?.[0]?.message?.content ?? '';
  const parsed = extractFirstJsonObject(raw);

  if (!parsed) {
    throw new Error('Falha ao gerar treino');
  }

  return {
    type: 'treino',
    nomeDaRotina: parsed.nomeDaRotina || 'Treino personalizado',
    objetivoDaRotina: parsed.objetivoDaRotina || params.objetivo,
    treino: Array.isArray(parsed.treino) ? parsed.treino : [],
  };
}

export async function generateExerciseInsights(params: {
  nome: string;
  categoria?: string;
}): Promise<ExerciseInsights> {
  const prompt = [
    `Crie informações para o exercício "${params.nome}".`,
    `Categoria: ${params.categoria || 'geral'}.`,
    'Responda em JSON com os campos:',
    '- resumo (string curta)',
    '- beneficios (array de 3 a 5 itens)',
    '- musculos (array de 3 a 5 itens)',
    '- dica (string curta)',
    '- erroComum (string curta)',
    '- nivel (iniciante, intermediario ou avancado)',
    '- metricas (objeto com cardio, forca, mobilidade, resistencia em 0-100)',
    'Responda apenas com JSON valido.',
  ].join('\n');

  const data = await chatCompletions({
    messages: [
      {
        role: 'system',
        content: [
          'Você é um personal trainer especializado em treino e saúde.',
          'Responda apenas sobre exercícios e fitness.',
        ].join('\n'),
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.6,
    responseFormat: { type: 'json_object' },
  });

  const raw = data?.choices?.[0]?.message?.content ?? '';
  const parsed = extractFirstJsonObject(raw) || {};
  const toArray = (value: any) => (Array.isArray(value) ? value.filter(Boolean) : []);
  const toNumber = (value: any) => Number(value) || 0;

  return {
    resumo: parsed.resumo || '',
    beneficios: toArray(parsed.beneficios),
    musculos: toArray(parsed.musculos),
    dica: parsed.dica || '',
    erroComum: parsed.erroComum || '',
    nivel: parsed.nivel || 'intermediario',
    metricas: {
      cardio: toNumber(parsed.metricas?.cardio),
      forca: toNumber(parsed.metricas?.forca),
      mobilidade: toNumber(parsed.metricas?.mobilidade),
      resistencia: toNumber(parsed.metricas?.resistencia),
    },
  };
}

const clampMetric = (value: any) => {
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(100, num));
};

const normalizeEvaluationInsights = (raw: any): EvaluationAIInsights => {
  const toArray = (value: any) => (Array.isArray(value) ? value.filter(Boolean) : []);
  const graf = Array.isArray(raw?.graficos) ? raw.graficos : [];
  const graficos = graf
    .map((item: any) => ({
      label: String(item?.label || item?.nome || item?.titulo || '').trim(),
      value: clampMetric(item?.value ?? item?.valor ?? item?.pontuacao ?? 0),
    }))
    .filter((item: EvaluationInsightMetric) => item.label)
    .slice(0, 4);

  return {
    resumo: raw?.resumo || '',
    destaques: toArray(raw?.destaques).slice(0, 4),
    alertas: toArray(raw?.alertas).slice(0, 3),
    proximosPassos: toArray(raw?.proximosPassos).slice(0, 4),
    graficos,
  };
};

export async function generateEvaluationInsights(params: {
  type: EvaluationType;
  context: string;
}): Promise<EvaluationAIInsights> {
  const typeHints: Record<EvaluationType, string> = {
    online:
      'Considere IMC, medidas e fotos. Foque em tendências gerais e orientações simples. Crie gráficos de saúde geral, composição e consistência.',
    fisica:
      'Considere composicao corporal e resultados de testes. Fale de performance, forca e resistencia. Crie graficos de composicao, forca, mobilidade e resistencia.',
    personalizada:
      'Interprete respostas e gere percentuais de perfil (ex.: adesão, motivação, hábitos). Use gráficos de perfil em 0-100.',
    postural:
      'Considere analise postural e fotos. Diga pontos de atencao e ajustes de postura. Crie graficos de alinhamento, simetria e mobilidade.',
  };

  const prompt = [
    `Tipo de avaliação: ${params.type}.`,
    typeHints[params.type],
    '',
    'Dados estruturados:',
    params.context,
    '',
    'Retorne APENAS JSON valido com:',
    '- resumo (string curta)',
    '- destaques (array 2-4 itens)',
    '- alertas (array 0-3 itens)',
    '- proximosPassos (array 2-4 itens)',
    '- graficos (array 3-4 itens com { label, value } em 0-100)',
  ].join('\n');

  const data = await chatCompletions({
    messages: [
      {
        role: 'system',
        content: [
          'Voce e um personal trainer e analista de avaliacoes.',
          'Responda sempre em português brasileiro.',
          'Evite diagnosticos medicos e use tom educativo.',
          'Responda apenas com JSON valido.',
        ].join('\n'),
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.5,
    responseFormat: { type: 'json_object' },
  });

  const raw = data?.choices?.[0]?.message?.content ?? '';
  const parsed = extractFirstJsonObject(raw) || {};
  return normalizeEvaluationInsights(parsed);
}

const normalizePieSegments = (raw: any) => {
  const items = Array.isArray(raw) ? raw : [];
  return items
    .map((item: any) => ({
      label: String(item?.label || item?.nome || item?.titulo || '').trim(),
      value: clampMetric(item?.value ?? item?.valor ?? item?.pontuacao ?? 0),
    }))
    .filter((item: EvaluationInsightMetric) => item.label)
    .slice(0, 4);
};

export async function generateStudentEvolutionInsights(params: {
  context: string;
}): Promise<StudentEvolutionInsights> {
  const prompt = [
    'Voce vai analisar a evolucao completa de um aluno (avaliacoes online, fisica, postural e personalizada).',
    'Use os dados para resumir progresso, pontos de atencao e proximos passos.',
    '',
    'Dados estruturados:',
    params.context,
    '',
    'Retorne APENAS JSON valido com:',
    '- resumo (string curta)',
    '- destaques (array 3-5 itens)',
    '- alertas (array 0-3 itens)',
    '- proximosPassos (array 3-5 itens)',
    '- graficos (array 3-5 itens com { label, value } em 0-100)',
    '- pizza (array 2-4 itens com { label, value } em 0-100)',
  ].join('\n');

  const data = await chatCompletions({
    messages: [
      {
        role: 'system',
        content: [
          'Voce e um personal trainer e analista de evolucao fisica.',
          'Responda sempre em portugues brasileiro.',
          'Evite diagnosticos medicos e use tom educativo.',
          'Responda apenas com JSON valido.',
        ].join('\n'),
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.5,
    responseFormat: { type: 'json_object' },
  });

  const raw = data?.choices?.[0]?.message?.content ?? '';
  const parsed = extractFirstJsonObject(raw) || {};
  const normalized = normalizeEvaluationInsights(parsed);
  return {
    ...normalized,
    pizza: normalizePieSegments(parsed?.pizza),
  };
}
