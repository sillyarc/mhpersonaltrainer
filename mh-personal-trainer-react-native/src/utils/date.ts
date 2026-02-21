import { format } from 'date-fns';

export const formatDateString = (date?: Date | null): string => {
  if (!date) return '';
  return format(date, 'dd/MM/yyyy');
};

export const getDateKey = (date?: Date | null): string => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseDateString = (value?: string | null): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parseFromParts = (day: number, month: number, year: number) => {
    if (!day || !month || !year) return null;
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
      return null;
    }
    return date;
  };

  const separator = trimmed.includes('/') ? '/' : trimmed.includes('-') ? '-' : null;
  if (!separator) return null;
  const parts = trimmed.split(separator);
  if (parts.length !== 3) return null;

  if (parts[0].length === 4) {
    return parseFromParts(Number(parts[2]), Number(parts[1]), Number(parts[0]));
  }
  return parseFromParts(Number(parts[0]), Number(parts[1]), Number(parts[2]));
};
