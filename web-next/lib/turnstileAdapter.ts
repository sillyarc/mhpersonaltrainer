import { createHash, randomUUID } from 'crypto';
import type { TurnstileResult } from '@/lib/checkinTypes';

type OpenTurnstileInput = {
  studentId: string;
  entryId: string;
};

export interface TurnstileAdapter {
  open(input: OpenTurnstileInput): Promise<TurnstileResult>;
}

class MockTurnstileAdapter implements TurnstileAdapter {
  async open(input: OpenTurnstileInput): Promise<TurnstileResult> {
    // Em producao, use TURNSTILE_API_KEY somente no backend e chame o controlador da catraca.
    const fingerprint = createHash('md5').update(`${input.studentId}-${input.entryId}`).digest();
    const opened = fingerprint[0] % 10 !== 0; // Aproximadamente 90% de sucesso.

    return {
      opened,
      reason: opened ? 'Catraca liberada com sucesso.' : 'Controlador da catraca indisponivel.',
      providerRequestId: randomUUID(),
      openedAt: new Date().toISOString(),
    };
  }
}

let turnstileAdapterSingleton: TurnstileAdapter | null = null;

export function getTurnstileAdapter(): TurnstileAdapter {
  if (!turnstileAdapterSingleton) {
    // Substitua por adapter real via SDK HTTP/TCP da catraca.
    turnstileAdapterSingleton = new MockTurnstileAdapter();
  }
  return turnstileAdapterSingleton;
}
