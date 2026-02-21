const STORAGE_ERROR_MESSAGES: Record<string, string> = {
  'storage/quota-exceeded':
    'Limite de armazenamento do Firebase excedido. Libere espaço no bucket ou faça upgrade do plano.',
  'storage/unauthorized': 'Você não tem permissão para enviar arquivos.',
  'storage/canceled': 'Envio cancelado.',
  'storage/retry-limit-exceeded': 'Não foi possível enviar agora. Tente novamente em instantes.',
  'storage/unknown': 'Erro inesperado ao enviar arquivo.',
};

const getFirebaseErrorCode = (error: unknown): string => {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string') {
    return code;
  }

  const message = (error as { message?: unknown }).message;
  if (typeof message === 'string') {
    const match = message.match(/storage\/[a-z0-9-]+/i);
    if (match) {
      return match[0];
    }
  }

  return '';
};

export const getStorageErrorMessage = (error: unknown, fallback: string) => {
  const code = getFirebaseErrorCode(error);
  if (!code) {
    return fallback;
  }
  return STORAGE_ERROR_MESSAGES[code] || fallback;
};
