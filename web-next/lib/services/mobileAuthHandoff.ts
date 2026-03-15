import { auth } from '../firebaseClient';

const MOBILE_AUTH_START_ENDPOINT =
  process.env.NEXT_PUBLIC_MOBILE_AUTH_START_ENDPOINT ||
  process.env.EXPO_PUBLIC_MOBILE_AUTH_START_ENDPOINT ||
  '/api/mobile-auth/start';

export type StartMobileAuthHandoffResult = {
  handoffId: string;
  expiresInSeconds: number;
  linkedInvite?: {
    codigoPersonal?: string | number | null;
    personalName?: string | null;
  } | null;
};

export function buildMobileAuthHandoffUrl(handoffId: string): string {
  return `mhpersonaltrainer://mobile-auth?handoff=${encodeURIComponent(handoffId)}`;
}

export async function startMobileAuthHandoff(options: {
  code?: string;
} = {}): Promise<StartMobileAuthHandoffResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Sessao web indisponivel. Faca login novamente.');
  }

  const idToken = await currentUser.getIdToken();
  const response = await fetch(MOBILE_AUTH_START_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    cache: 'no-store',
    body: JSON.stringify(options.code ? { code: options.code } : {}),
  });

  const data = await response
    .json()
    .catch(() => ({ error: 'Falha ao preparar o retorno para o app.' }));

  if (!response.ok) {
    throw new Error(data?.error || 'Falha ao preparar o retorno para o app.');
  }

  if (!data?.handoffId) {
    throw new Error('Nao foi possivel gerar o acesso ao app.');
  }

  return data as StartMobileAuthHandoffResult;
}
