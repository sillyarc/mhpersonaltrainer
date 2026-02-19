export type MetricValue = number | string | null | undefined;

const numericTextPattern = /^\d+(?:[.,]\d+)?$/;

const normalizeNumericText = (value: string) => value.replace(',', '.');

export const parseMetricInput = (
  value: string,
  fallback: number | string
): number | string => {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const normalized = normalizeNumericText(trimmed);
  if (numericTextPattern.test(normalized)) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return trimmed;
};

export const coerceMetricValue = (
  value: unknown,
  fallback: number | string
): number | string => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string') {
    return parseMetricInput(value, fallback);
  }
  return fallback;
};

export const formatMetricText = (value: MetricValue): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  return value.trim();
};

export const formatMetricWithSuffix = (value: MetricValue, suffix: string): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (value <= 0) return '';
    return `${value}${suffix}`;
  }
  return value.trim();
};

export const toNumericMetric = (value: MetricValue, fallback: number): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const normalized = normalizeNumericText(trimmed);
    if (numericTextPattern.test(normalized)) {
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    const match = normalized.match(/[\d.]+/);
    if (match) {
      const parsed = Number(match[0]);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
  }
  return fallback;
};
