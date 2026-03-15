import type { PersonalProfile, PersonalStudentCapacity } from './firestoreService';

const INVITE_PERSONAL_ENDPOINT =
  process.env.NEXT_PUBLIC_INVITE_PERSONAL_ENDPOINT ||
  process.env.EXPO_PUBLIC_INVITE_PERSONAL_ENDPOINT ||
  '/api/invite/personal';

function buildInvitePersonalUrl(code: string): string {
  const base = INVITE_PERSONAL_ENDPOINT.trim() || '/api/invite/personal';
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}code=${encodeURIComponent(code)}`;
}

type InvitePersonalLookup = {
  profile: PersonalProfile | null;
  capacity: PersonalStudentCapacity | null;
};

export async function fetchInvitePersonalLookup(code: string): Promise<InvitePersonalLookup> {
  const response = await fetch(buildInvitePersonalUrl(code), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (response.status === 404) {
    return { profile: null, capacity: null };
  }

  if (!response.ok) {
    let message = 'Falha ao validar o convite.';
    try {
      const data = await response.json();
      if (data?.error) {
        message = data.details ? `${data.error}: ${data.details}` : data.error;
      }
    } catch (_) {
      // Keep generic message when the response body is not JSON.
    }
    throw new Error(message);
  }

  const data = await response.json();
  return {
    profile: data?.profile || null,
    capacity: data?.capacity || null,
  };
}

export async function fetchInvitePersonalProfile(code: string): Promise<PersonalProfile | null> {
  const result = await fetchInvitePersonalLookup(code);
  return result.profile;
}

export async function fetchInvitePersonalCapacity(
  code: string
): Promise<PersonalStudentCapacity | null> {
  const result = await fetchInvitePersonalLookup(code);
  return result.capacity;
}
