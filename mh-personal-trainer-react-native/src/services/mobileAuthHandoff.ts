import Constants from 'expo-constants';

type MobileAuthExtraConfig = {
  consumeUrl?: string;
};

type ExpoExtra = {
  mobileAuth?: MobileAuthExtraConfig;
};

type ConsumeMobileAuthHandoffResult = {
  customToken: string;
  inviteCode?: string | number | null;
  invitePersonalName?: string | null;
};

const expoExtra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;
const mobileAuthExtra = expoExtra.mobileAuth ?? {};

const MOBILE_AUTH_CONSUME_URL =
  (process.env.EXPO_PUBLIC_MOBILE_AUTH_CONSUME_URL || '').trim() ||
  (mobileAuthExtra.consumeUrl || '').trim() ||
  'https://mhpersonaltrainer.com.br/api/mobile-auth/consume';

export async function consumeMobileAuthHandoff(
  handoff: string
): Promise<ConsumeMobileAuthHandoffResult> {
  const response = await fetch(MOBILE_AUTH_CONSUME_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ handoff }),
  });

  const data = await response
    .json()
    .catch(() => ({ error: 'Falha ao concluir o login no app.' }));

  if (!response.ok) {
    throw new Error(data?.error || 'Falha ao concluir o login no app.');
  }

  if (!data?.customToken) {
    throw new Error('Token de acesso ao app nao foi retornado.');
  }

  return data as ConsumeMobileAuthHandoffResult;
}
