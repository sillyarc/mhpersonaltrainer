const INVISIBLE_EMAIL_CHARS = /[\u200B-\u200D\u2060\uFEFF]/g;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmailInput = (email?: string | null) => {
  const rawEmail = email || '';
  const normalizedEmail =
    typeof rawEmail.normalize === 'function' ? rawEmail.normalize('NFKC') : rawEmail;
  return normalizedEmail.replace(INVISIBLE_EMAIL_CHARS, '').trim();
};

export const isValidEmailInput = (email?: string | null) =>
  EMAIL_PATTERN.test(normalizeEmailInput(email));
