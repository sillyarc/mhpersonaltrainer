import { refundAiCredit, reserveAiCredit } from './aiAccess';

const OPENROUTER_API_URL =
  process.env.NEXT_PUBLIC_OPENROUTER_API_URL ||
  process.env.EXPO_PUBLIC_OPENROUTER_API_URL ||
  'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY =
  process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '';
const OPENROUTER_VISION_MODEL =
  process.env.NEXT_PUBLIC_OPENROUTER_VISION_MODEL ||
  process.env.EXPO_PUBLIC_OPENROUTER_VISION_MODEL ||
  'google/gemini-2.0-flash-exp:free';
const FALLBACK_VISION_MODELS = [
  OPENROUTER_VISION_MODEL,
  'google/gemini-2.0-flash-exp:free',
];

export interface AnalysisResult {
  postura?: string;
  descricaoPostura?: string;
  metricas?: string;
  textoDetalhado?: string;
}

export interface FaceVerificationResult {
  match: boolean;
  confidence: number;
  reason: string;
}

interface QueryResult<T> {
  data: T | null;
  error: string | null;
}

const getHeaders = () => {
  if (!OPENROUTER_API_KEY) {
    throw new Error('IA indisponivel no momento.');
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    'HTTP-Referer': 'https://mhpersonal.app',
    'X-Title': 'MH Personal',
  };
};

const extractFirstJsonObject = (text: string) => {
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
};

const normalizeAnalysisError = (message: string) => {
  const safe = message || 'Erro ao analisar imagem';
  const lower = safe.toLowerCase();
  if (
    lower.includes('generativelanguage') ||
    lower.includes('google generative') ||
    lower.includes('service_disabled') ||
    lower.includes('api has not been used')
  ) {
    return 'IA indisponivel no momento. Verifique a API do provedor de IA.';
  }
  if (lower.includes('permission') || lower.includes('unauthorized') || lower.includes('api key')) {
    return 'IA indisponivel no momento. Verifique as credenciais da API.';
  }
  return safe;
};

const normalizeConfidence = (value: any) => {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 0;
  const inRange = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(1, inRange));
};

export async function analyzePostureImage(
  imageUrl: string
): Promise<QueryResult<AnalysisResult>> {
  let creditLease: Awaited<ReturnType<typeof reserveAiCredit>> | null = null;
  try {
    creditLease = await reserveAiCredit(1);
    const prompt = [
      'Voce e um avaliador postural. Analise a imagem e responda em JSON.',
      'Retorne apenas JSON valido com os campos:',
      '- postura (string curta)',
      '- descricaoPostura (string curta)',
      '- metricas (string curta)',
      '- textoDetalhado (string com observacoes)',
    ].join('\n');

    const candidates = Array.from(new Set(FALLBACK_VISION_MODELS));
    let lastError = '';

    for (const model of candidates) {
      const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Analise a postura nesta imagem.' },
                { type: 'image_url', image_url: { url: imageUrl } },
              ],
            },
          ],
          temperature: 0.4,
          response_format: { type: 'json_object' },
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const raw = data?.choices?.[0]?.message?.content ?? '';
        const parsed = extractFirstJsonObject(raw) || {};
        return {
          data: {
            postura: parsed.postura || '',
            descricaoPostura: parsed.descricaoPostura || '',
            metricas: parsed.metricas || '',
            textoDetalhado: parsed.textoDetalhado || '',
          },
          error: null,
        };
      }

      const message = String(data?.error?.message || data?.message || '');
      lastError = message || `${response.status} ${response.statusText}`;
      const lower = message.toLowerCase();
      const shouldRetry =
        response.status === 404 ||
        lower.includes('no endpoints found') ||
        lower.includes('model not found');

      if (!shouldRetry) {
        throw new Error(lastError);
      }
    }

    throw new Error(lastError || 'IA indisponivel no momento.');
  } catch (error: any) {
    await refundAiCredit(creditLease).catch(() => undefined);
    return { data: null, error: normalizeAnalysisError(error.message || '') };
  }
}

export async function verifyCheckinFace(
  referenceImageUrl: string,
  checkinImageUrl: string
): Promise<QueryResult<FaceVerificationResult>> {
  if (!referenceImageUrl || !checkinImageUrl) {
    return {
      data: null,
      error: 'Envie as duas imagens para validar o rosto.',
    };
  }

  let creditLease: Awaited<ReturnType<typeof reserveAiCredit>> | null = null;
  try {
    creditLease = await reserveAiCredit(1);
    const prompt = [
      'Voce valida identidade facial em check-in de academia.',
      'Compare duas imagens e responda APENAS JSON valido com:',
      '- match (boolean)',
      '- confidence (numero de 0 a 1)',
      '- reason (string curta)',
      'Use match=true somente quando a semelhanca facial for clara.',
    ].join('\n');

    const candidates = Array.from(new Set(FALLBACK_VISION_MODELS));
    let lastError = '';

    for (const model of candidates) {
      const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Imagem 1 (referencia cadastrada).' },
                { type: 'image_url', image_url: { url: referenceImageUrl } },
                { type: 'text', text: 'Imagem 2 (captura de check-in).' },
                { type: 'image_url', image_url: { url: checkinImageUrl } },
                { type: 'text', text: 'As duas imagens sao da mesma pessoa?' },
              ],
            },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const raw = data?.choices?.[0]?.message?.content ?? '';
        const parsed = extractFirstJsonObject(raw) || {};
        const match = Boolean(
          parsed.match ?? parsed.isSamePerson ?? parsed.samePerson ?? parsed.valid
        );
        const confidence = normalizeConfidence(
          parsed.confidence ?? parsed.similarity ?? parsed.score ?? 0
        );
        const reason = String(
          parsed.reason || parsed.justification || parsed.observacao || ''
        ).trim();

        return {
          data: {
            match,
            confidence,
            reason: reason || (match ? 'Rosto compativel.' : 'Rosto nao compativel.'),
          },
          error: null,
        };
      }

      const message = String(data?.error?.message || data?.message || '');
      lastError = message || `${response.status} ${response.statusText}`;
      const lower = message.toLowerCase();
      const shouldRetry =
        response.status === 404 ||
        lower.includes('no endpoints found') ||
        lower.includes('model not found');

      if (!shouldRetry) {
        throw new Error(lastError);
      }
    }

    throw new Error(lastError || 'IA indisponivel no momento.');
  } catch (error: any) {
    await refundAiCredit(creditLease).catch(() => undefined);
    return { data: null, error: normalizeAnalysisError(error.message || '') };
  }
}

