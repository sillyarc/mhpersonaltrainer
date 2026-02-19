import { EvaluationType } from '../types/evaluation';
import { refundAiCredit, reserveAiCredit } from './aiAccess';

const OPENROUTER_API_URL =
  process.env.NEXT_PUBLIC_OPENROUTER_API_URL ||
  process.env.EXPO_PUBLIC_OPENROUTER_API_URL ||
  'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY =
  process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL =
  process.env.NEXT_PUBLIC_OPENROUTER_MODEL ||
  process.env.EXPO_PUBLIC_OPENROUTER_MODEL ||
  'liquid/lfm-2.5-1.2b-thinking:free';

const FALLBACK_MODELS = [
  'liquid/lfm-2.5-1.2b-thinking:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.2-3b-instruct:free',
];

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

interface AIEvaluationResponse {
  type: 'avaliacao';
  titulo: string;
  objetivo?: string;
  itens: string[];
}

interface AITextResponse {
  type: 'resposta';
  resposta: string;
}

type AIResponse = AIWorkoutResponse | AIEvaluationResponse | AITextResponse;

export interface AssistantSuggestionTile {
  title: string;
  description: string;
  prompt: string;
}

export interface AssistantSuggestions {
  quickPrompts: string[];
  tiles: AssistantSuggestionTile[];
}

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

export interface AcademyLinkSuggestion {
  studentName: string;
  personalName: string;
  personalCode?: string | number;
  reason: string;
}

function getHeaders(): Record<string, string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('IA indisponivel no momento.');
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
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

const stripCodeFences = (value: string) =>
  value
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .trim();

async function chatCompletions({
  messages,
  model = OPENROUTER_MODEL,
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
  const candidates = Array.from(new Set([model, ...FALLBACK_MODELS]));
  let lastError = '';

  try {
    for (const candidate of candidates) {
      const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          model: candidate,
          messages,
          ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
          ...(typeof temperature === 'number' ? { temperature } : {}),
          ...(responseFormat ? { response_format: responseFormat } : {}),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        return data;
      }

      const message = String(data?.error?.message || data?.message || '');
      lastError = message;
      const lower = message.toLowerCase();
      const shouldRetry =
        response.status === 404 ||
        lower.includes('no endpoints found') ||
        lower.includes('model not found');

      if (!shouldRetry) {
        throw new Error('IA indisponivel no momento.');
      }
    }

    if (lastError) {
      throw new Error('Modelo indisponivel no momento.');
    }
    throw new Error('IA indisponivel no momento.');
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

const stripListPrefix = (line: string) =>
  line.replace(/^[-*\u2022]\s*/, '').replace(/^\d+[.)]\s*/, '');

const stripMarkdown = (line: string) => line.replace(/[*_`]/g, '').trim();

const normalizeLine = (line: string) => stripMarkdown(stripListPrefix(line)).trim();

const isWorkoutFieldLine = (line: string) => {
  const cleaned = normalizeLine(line).toLowerCase();
  return (
    /^nome\s*da\s*rotina\b/.test(cleaned) ||
    /^nomedarotina\b/.test(cleaned) ||
    /^objetivo\s*da\s*rotina\b/.test(cleaned) ||
    /^objetivodarotina\b/.test(cleaned) ||
    /^objetivo\b/.test(cleaned) ||
    /^treino\b/.test(cleaned) ||
    /^exercicios?\b/.test(cleaned)
  );
};

const extractField = (lines: string[], patterns: RegExp[]) => {
  for (const line of lines) {
    const cleaned = normalizeLine(line);
    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
  }
  return '';
};

const extractItemLine = (line: string) => {
  if (isWorkoutFieldLine(line)) return '';
  const bulletMatch = line.match(/^[-*\u2022]\s*(.+)$/);
  if (bulletMatch?.[1]) {
    const cleaned = stripMarkdown(bulletMatch[1]).trim();
    return isWorkoutFieldLine(cleaned) ? '' : cleaned;
  }
  const orderedMatch = line.match(/^\d+[.)]\s*(.+)$/);
  if (orderedMatch?.[1]) {
    const cleaned = stripMarkdown(orderedMatch[1]).trim();
    return isWorkoutFieldLine(cleaned) ? '' : cleaned;
  }
  if (/ - /.test(line) && !isWorkoutFieldLine(line)) {
    return stripMarkdown(line).trim();
  }
  return '';
};

const parseWorkoutFromText = (text: string): AIWorkoutResponse | null => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const nomeDaRotina = extractField(lines, [
    /^nome\s*da\s*rotina\s*[:\-]\s*(.+)$/i,
    /^nomedarotina\s*[:\-]\s*(.+)$/i,
    /^rotina\s*[:\-]\s*(.+)$/i,
  ]);
  const objetivoDaRotina = extractField(lines, [
    /^objetivo\s*da\s*rotina\s*[:\-]\s*(.+)$/i,
    /^objetivodarotina\s*[:\-]\s*(.+)$/i,
    /^objetivo\s*[:\-]\s*(.+)$/i,
  ]);
  const treinoIndex = lines.findIndex((line) => /^treino\b/i.test(normalizeLine(line)));
  const treino: string[] = [];
  if (treinoIndex >= 0) {
    for (let i = treinoIndex + 1; i < lines.length; i += 1) {
      const item = extractItemLine(lines[i]);
      if (item) treino.push(item);
    }
  }
  if (!treino.length) {
    lines.forEach((line) => {
      const item = extractItemLine(line);
      if (item) treino.push(item);
    });
  }
  if (!treino.length) return null;
  return {
    type: 'treino',
    nomeDaRotina: nomeDaRotina || 'Treino sugerido',
    objetivoDaRotina: objetivoDaRotina || '',
    treino,
  };
};

const normalizeTreinoList = (value: any) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const items = lines.map(extractItemLine).filter(Boolean);
    if (items.length) return items;
    return lines
      .filter((line) => !isWorkoutFieldLine(line))
      .map((line) => normalizeLine(line))
      .filter(Boolean);
  }
  return [];
};

const parseEvaluationFromText = (text: string): AIEvaluationResponse | null => {
  const lower = text.toLowerCase();
  if (!/(avaliacao|avaliacoes|questionario|perguntas|teste)/.test(lower)) return null;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const titulo =
    extractField(lines, [/^avaliacao\s*[:\-]\s*(.+)$/i, /^tipo\s*de\s*avaliacao\s*[:\-]\s*(.+)$/i]) ||
    (lines.find((line) => /avaliacao/i.test(line)) || '').trim();
  const objetivo = extractField(lines, [/^objetivo\s*[:\-]\s*(.+)$/i]);
  const itens: string[] = [];
  const perguntasIndex = lines.findIndex((line) => /^(perguntas|questionario|itens)\b/i.test(line));
  if (perguntasIndex >= 0) {
    for (let i = perguntasIndex + 1; i < lines.length; i += 1) {
      const item = extractItemLine(lines[i]);
      if (item) itens.push(item);
    }
  }
  if (!itens.length) {
    lines.forEach((line) => {
      const item = extractItemLine(line);
      if (item) itens.push(item);
    });
  }
  if (!itens.length) return null;
  return {
    type: 'avaliacao',
    titulo: titulo || 'Avaliacao sugerida',
    objetivo: objetivo || undefined,
    itens,
  };
};

export async function chatWithAI(
  userMessage: string,
  conversationHistory: ChatMessage[] = []
): Promise<{ text: string; workout?: AIWorkoutResponse; evaluation?: AIEvaluationResponse }> {
  const systemPrompt = [
    'Voce e o MH Personal Trainer, um assistente especializado em treinos e fitness.',
    'Responda sempre em portugues brasileiro.',
    'Assuntos permitidos: saude, academia, treino, nutricao basica, avaliacao fisica e habitos saudaveis.',
    'Se o usuario perguntar algo fora desses temas, responda com JSON type="resposta" recusando de forma educada e convide a falar sobre treinos ou saude.',
    'Se o usuario pedir um treino/rotina/ficha (ex.: "me monta um treino", "rotina de musculacao", "plano de treino"), retorne um JSON com type="treino" e inclua:',
    '- nomeDaRotina (string curta)',
    '- objetivoDaRotina (string curta)',
    '- treino (lista de strings, 6 a 12 itens, formato: "Exercicio - series x repeticoes - descanso")',
    'Se o usuario pedir uma avaliacao/questionario/teste fisico, retorne um JSON com type="avaliacao" e inclua:',
    '- titulo (string curta)',
    '- objetivo (string curta)',
    '- itens (lista de strings com perguntas ou testes)',
    'Caso contrario, retorne JSON com type="resposta" e inclua "resposta" (string).',
    'Responda APENAS com JSON valido.',
  ].join('\\n');

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
  const sanitized = stripCodeFences(raw);
  const parsed =
    (extractFirstJsonObject(sanitized) as AIResponse | null) ||
    (extractFirstJsonObject(raw) as AIResponse | null);

  const treinoList = normalizeTreinoList((parsed as any)?.treino);
  const looksLikeWorkout =
    parsed &&
    (parsed.type === 'treino' ||
      treinoList.length > 0 ||
      Boolean((parsed as any).nomeDaRotina || (parsed as any).objetivoDaRotina));

  const looksLikeEvaluation =
    parsed &&
    (parsed.type === 'avaliacao' ||
      Array.isArray((parsed as any).itens) ||
      Array.isArray((parsed as any).perguntas) ||
      Boolean((parsed as any).titulo || (parsed as any).objetivo));

  if (parsed && looksLikeWorkout && treinoList.length > 0) {
    return {
      text: `Aqui esta seu treino: ${(parsed as any).nomeDaRotina || 'Treino sugerido'}`,
      workout: {
        type: 'treino',
        nomeDaRotina: (parsed as any).nomeDaRotina || 'Treino sugerido',
        objetivoDaRotina: (parsed as any).objetivoDaRotina || '',
        treino: treinoList,
      },
    };
  }

  if (parsed && looksLikeEvaluation) {
    const itens = Array.isArray((parsed as any).itens)
      ? (parsed as any).itens
      : Array.isArray((parsed as any).perguntas)
      ? (parsed as any).perguntas
      : [];
    return {
      text: `Aqui esta sua avaliacao: ${(parsed as any).titulo || 'Avaliacao sugerida'}`,
      evaluation: {
        type: 'avaliacao',
        titulo: (parsed as any).titulo || (parsed as any).nome || 'Avaliacao sugerida',
        objetivo: (parsed as any).objetivo || '',
        itens: Array.isArray(itens) ? itens.map((item: any) => String(item || '').trim()).filter(Boolean) : [],
      },
    };
  }

  const resposta =
    (parsed && parsed.type === 'resposta' && 'resposta' in parsed && (parsed as any).resposta) ||
    (parsed && 'resposta' in parsed && (parsed as any).resposta) ||
    sanitized ||
    raw;

  const fallbackText = typeof resposta === 'string' ? resposta : raw;
  const workoutFallback = parseWorkoutFromText(fallbackText || '');
  if (workoutFallback) {
    return {
      text: `Aqui esta seu treino: ${workoutFallback.nomeDaRotina || 'Treino sugerido'}`,
      workout: workoutFallback,
    };
  }
  const evaluationFallback = parseEvaluationFromText(fallbackText || '');
  if (evaluationFallback) {
    return {
      text: `Aqui esta sua avaliacao: ${evaluationFallback.titulo || 'Avaliacao sugerida'}`,
      evaluation: evaluationFallback,
    };
  }

  return { text: fallbackText };
}

const normalizeSuggestionTiles = (value: any): AssistantSuggestionTile[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      title: String(item?.title || item?.titulo || '').trim(),
      description: String(item?.description || item?.descricao || '').trim(),
      prompt: String(item?.prompt || item?.pergunta || '').trim(),
    }))
    .filter((item) => item.title && item.prompt);
};

export async function generateAssistantSuggestions(params: {
  usage: string[];
  studentGoal?: string;
  evaluationType?: string;
  studentLabel?: string;
}): Promise<AssistantSuggestions> {
  const usageList = (params.usage || []).filter(Boolean).slice(0, 10);
  const goal = params.studentGoal?.trim() || '';
  const studentLabel = params.studentLabel?.trim() || '';
  const evaluationType =
    params.evaluationType && params.evaluationType !== 'nenhuma'
      ? params.evaluationType
      : '';

  const prompt = [
    'Voce cria sugestoes de prompts para personal trainers.',
    'Baseie as sugestoes no historico mais usado, no objetivo atual e no tipo de avaliacao.',
    'Gere 4 quickPrompts curtos (ate 90 caracteres).',
    'Gere 3 tiles com title, description e prompt.',
    'Evite repetir frases identicas e use tom direto.',
    'Responda APENAS com JSON valido no formato:',
    '{ "quickPrompts": string[], "tiles": [{ "title": string, "description": string, "prompt": string }] }',
    '',
    usageList.length ? `Historico mais usado: ${usageList.join(' | ')}` : 'Historico mais usado: sem dados.',
    goal ? `Objetivo atual: ${goal}.` : 'Objetivo atual: nao informado.',
    studentLabel ? `Aluno atual: ${studentLabel}.` : 'Aluno atual: nao informado.',
    evaluationType ? `Tipo de avaliacao: ${evaluationType}.` : 'Tipo de avaliacao: nao definido.',
  ].join('\n');

  const data = await chatCompletions({
    messages: [
      {
        role: 'system',
        content: [
          'Voce e um personal trainer especialista em comunicacao com alunos.',
          'Responda sempre em portugues brasileiro.',
          'Responda apenas com JSON valido.',
        ].join('\n'),
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    responseFormat: { type: 'json_object' },
  });

  const raw = data?.choices?.[0]?.message?.content ?? '';
  const sanitized = stripCodeFences(raw);
  const parsed = extractFirstJsonObject(sanitized) || extractFirstJsonObject(raw) || {};
  const quickPrompts = Array.isArray(parsed.quickPrompts)
    ? parsed.quickPrompts
    : Array.isArray(parsed.quick_prompts)
    ? parsed.quick_prompts
    : [];
  const normalizedQuickPrompts = quickPrompts
    .map((item: any) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 4);
  const tiles = normalizeSuggestionTiles(parsed.tiles).slice(0, 3);

  if (!normalizedQuickPrompts.length && !tiles.length) {
    throw new Error('Nao foi possivel gerar sugestoes.');
  }

  return {
    quickPrompts: normalizedQuickPrompts,
    tiles,
  };
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

const normalizeAcademySuggestions = (raw: any): AcademyLinkSuggestion[] => {
  const list = Array.isArray(raw?.sugestoes) ? raw.sugestoes : Array.isArray(raw) ? raw : [];
  return list
    .map((item: any) => ({
      studentName: String(item?.studentName || item?.aluno || '').trim(),
      personalName: String(item?.personalName || item?.personal || '').trim(),
      personalCode: item?.personalCode ?? item?.codigoPersonal,
      reason: String(item?.reason || item?.motivo || '').trim(),
    }))
    .filter((item: AcademyLinkSuggestion) => item.studentName && item.personalName)
    .slice(0, 6);
};

export async function generateAcademyLinkSuggestions(params: {
  students: Array<{
    name: string;
    goal?: string;
    level?: string;
    lastActive?: string;
    evaluationSummary?: string;
  }>;
  personals: Array<{ name: string; code?: string | number; specialty?: string }>;
}): Promise<AcademyLinkSuggestion[]> {
  const studentLines = params.students.map((student) => {
    const chunks = [
      `Aluno: ${student.name}`,
      student.goal ? `Objetivo: ${student.goal}` : '',
      student.level ? `Nivel: ${student.level}` : '',
      student.lastActive ? `Ultima atividade: ${student.lastActive}` : '',
      student.evaluationSummary ? `Avaliacoes: ${student.evaluationSummary}` : '',
    ].filter(Boolean);
    return chunks.join(' | ');
  });

  const personalLines = params.personals.map((personal) => {
    const chunks = [
      `Personal: ${personal.name}`,
      personal.code ? `Codigo: ${personal.code}` : '',
      personal.specialty ? `Especialidade: ${personal.specialty}` : '',
    ].filter(Boolean);
    return chunks.join(' | ');
  });

  const prompt = [
    'Voce ajuda academias a vincular alunos a personais.',
    'Sugira combinacoes com base em objetivo, nivel, especialidade e avaliacao fisica.',
    'Retorne APENAS JSON valido no formato:',
    '{ "sugestoes": [{ "studentName": string, "personalName": string, "personalCode": string, "reason": string }] }',
    '',
    'Personais disponiveis:',
    personalLines.length ? personalLines.join('\n') : 'Sem dados.',
    '',
    'Alunos sem personal:',
    studentLines.length ? studentLines.join('\n') : 'Sem dados.',
  ].join('\n');

  const data = await chatCompletions({
    messages: [
      {
        role: 'system',
        content: [
          'Voce e um consultor de operacao de academias.',
          'Responda sempre em portugues brasileiro.',
          'Responda apenas com JSON valido.',
        ].join('\n'),
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.4,
    responseFormat: { type: 'json_object' },
  });

  const raw = data?.choices?.[0]?.message?.content ?? '';
  const sanitized = stripCodeFences(raw);
  const parsed = extractFirstJsonObject(sanitized) || extractFirstJsonObject(raw) || {};
  return normalizeAcademySuggestions(parsed);
}

