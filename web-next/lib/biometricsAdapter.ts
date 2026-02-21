import { createHash, randomBytes, randomUUID } from 'crypto';
import type { BiometricResult, Student } from '@/lib/checkinTypes';

type CreateSessionInput = {
  student: Student;
};

type CreateSessionOutput = {
  sessionId: string;
  uploadUrlOrToken: string;
  expiresAt: string;
};

type VerifySelfieInput = {
  student: Student;
  sessionId: string;
  selfieBuffer: Buffer;
  mimeType: string;
};

export interface BiometricsAdapter {
  createSession(input: CreateSessionInput): Promise<CreateSessionOutput>;
  verifySelfie(input: VerifySelfieInput): Promise<BiometricResult>;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const nowIso = () => new Date().toISOString();

const getThresholds = () => {
  const liveness = Number(process.env.BIOMETRIC_LIVENESS_THRESHOLD ?? '0.8');
  const match = Number(process.env.BIOMETRIC_MATCH_THRESHOLD ?? '0.82');
  return {
    liveness: clamp(Number.isFinite(liveness) ? liveness : 0.8, 0, 1),
    match: clamp(Number.isFinite(match) ? match : 0.82, 0, 1),
  };
};

class MockBiometricsAdapter implements BiometricsAdapter {
  private readonly providerName = 'mock-biometrics';

  async createSession(_input: CreateSessionInput): Promise<CreateSessionOutput> {
    // Em producao, use BIOMETRICS_PROVIDER_API_KEY somente no backend para obter
    // sessionId/token de sessao no provedor real.
    const sessionId = randomUUID();
    const uploadUrlOrToken = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    return { sessionId, uploadUrlOrToken, expiresAt };
  }

  async verifySelfie(input: VerifySelfieInput): Promise<BiometricResult> {
    const thresholds = getThresholds();
    if (!input.student.biometricEnrollmentId) {
      return {
        provider: this.providerName,
        providerSessionId: input.sessionId,
        livenessScore: 0,
        matchScore: 0,
        decision: 'rejected',
        reason: 'Aluno sem biometria cadastrada.',
        thresholds,
        analyzedAt: nowIso(),
      };
    }

    if (input.selfieBuffer.byteLength < 1_500) {
      return {
        provider: this.providerName,
        providerSessionId: input.sessionId,
        livenessScore: 0.3,
        matchScore: 0.25,
        decision: 'rejected',
        reason: 'Selfie invalida ou muito pequena.',
        thresholds,
        analyzedAt: nowIso(),
      };
    }

    // Gera scores reproduziveis para mock com base no arquivo e no aluno.
    const digest = createHash('sha256')
      .update(input.selfieBuffer)
      .update(input.student.id)
      .update(input.sessionId)
      .digest();

    const livenessScore = clamp(0.7 + digest[0] / 1024 + digest[7] / 2048, 0, 1);
    const matchScore = clamp(0.68 + digest[1] / 1024 + digest[9] / 2048, 0, 1);
    const approved = livenessScore >= thresholds.liveness && matchScore >= thresholds.match;

    return {
      provider: this.providerName,
      providerSessionId: input.sessionId,
      livenessScore,
      matchScore,
      decision: approved ? 'approved' : 'rejected',
      reason: approved
        ? 'Prova de vida e comparacao facial aprovadas.'
        : 'Falha na prova de vida ou baixa similaridade facial.',
      thresholds,
      analyzedAt: nowIso(),
    };
  }
}

let biometricsAdapterSingleton: BiometricsAdapter | null = null;

export function getBiometricsAdapter(): BiometricsAdapter {
  if (!biometricsAdapterSingleton) {
    // Substitua por um adapter real (AWS Rekognition, FaceTec, etc.) sem mudar as rotas.
    biometricsAdapterSingleton = new MockBiometricsAdapter();
  }
  return biometricsAdapterSingleton;
}
