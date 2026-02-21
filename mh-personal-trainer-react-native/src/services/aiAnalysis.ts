const FUNCTIONS_BASE_URL =
  process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_URL ||
  'https://southamerica-east1-profissions-2746d.cloudfunctions.net';

export interface AnalysisResult {
  postura?: string;
  descricaoPostura?: string;
  metricas?: string;
  textoDetalhado?: string;
}

interface QueryResult<T> {
  data: T | null;
  error: string | null;
}

export async function analyzePostureImage(
  imageUrl: string
): Promise<QueryResult<AnalysisResult>> {
  try {
    const body = new URLSearchParams({ imageUrl });
    const response = await fetch(`${FUNCTIONS_BASE_URL}/avaliarPostural`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = await response.json();
    if (!response.ok) {
      const message = data?.error || data?.message || 'Falha na analise';
      throw new Error(message);
    }

    return {
      data: {
        postura: data?.avaliacao?.postura,
        descricaoPostura: data?.avaliacao?.descricaoPostura,
        metricas: data?.avaliacao?.algumasMetricas,
        textoDetalhado: data?.avaliacao?.textoDetalhado,
      },
      error: null,
    };
  } catch (error: any) {
    return { data: null, error: error.message || 'Erro ao analisar imagem' };
  }
}
