import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { User } from '../types/user';

type MonitoringAttributeValue = string | number | boolean | null | undefined;
type MonitoringAttributes = Record<string, MonitoringAttributeValue>;

type TraceLike = {
  putAttribute: (attribute: string, value: string) => void;
  incrementMetric: (metricName: string, incrementBy: number) => void;
  stop: () => Promise<null | void>;
};

export type MonitoringTraceHandle = {
  putAttribute: (attribute: string, value: MonitoringAttributeValue) => void;
  incrementMetric: (metricName: string, incrementBy?: number) => void;
  stop: () => Promise<void>;
};

type MonitoringUser = Pick<
  User,
  'uid' | 'email' | 'displayName' | 'admin' | 'professorAccount' | 'assinatura'
>;

const APP_VERSION =
  Constants.expoConfig?.version ||
  (Constants as any).manifest2?.extra?.expoClient?.version ||
  'unknown';

const NOOP_TRACE: MonitoringTraceHandle = {
  putAttribute: () => {},
  incrementMetric: () => {},
  stop: async () => {},
};

const isNativeMonitoringEnabled = () => Platform.OS !== 'web';

const sanitizeKey = (value: string, maxLength: number) => {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_./-]+/g, '_')
    .replace(/^_+/, '');
  return (normalized || 'metric').slice(0, maxLength);
};

const sanitizeValue = (value: MonitoringAttributeValue, maxLength = 100) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
};

const normalizeAttributes = (
  attributes?: MonitoringAttributes,
  limits?: { keyLength: number; valueLength: number; maxItems?: number }
) => {
  const maxItems = limits?.maxItems ?? Number.POSITIVE_INFINITY;
  return Object.entries(attributes || {}).reduce<Record<string, string>>((acc, [key, value]) => {
    if (Object.keys(acc).length >= maxItems) {
      return acc;
    }
    const normalizedKey = sanitizeKey(key, limits?.keyLength ?? 40);
    const normalizedValue = sanitizeValue(value, limits?.valueLength ?? 100);
    if (!normalizedKey || !normalizedValue) {
      return acc;
    }
    acc[normalizedKey] = normalizedValue;
    return acc;
  }, {});
};

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error('Unknown monitoring error');
  }
};

const resolveRole = (user?: MonitoringUser | null) => {
  if (!user) return 'guest';
  if (user.admin) return 'admin';
  if (user.professorAccount) return 'professor';
  return 'aluno';
};

const getCrashlyticsModule = () => {
  if (!isNativeMonitoringEnabled()) {
    return null;
  }

  try {
    return require('@react-native-firebase/crashlytics').default();
  } catch {
    return null;
  }
};

const getPerfModule = () => {
  if (!isNativeMonitoringEnabled()) {
    return null;
  }

  try {
    return require('@react-native-firebase/perf').default();
  } catch {
    return null;
  }
};

const applyTraceAttributes = (trace: TraceLike, attributes?: MonitoringAttributes) => {
  const normalized = normalizeAttributes(attributes, {
    keyLength: 32,
    valueLength: 100,
    maxItems: 5,
  });
  Object.entries(normalized).forEach(([key, value]) => {
    trace.putAttribute(key, value);
  });
};

export async function initializeMonitoringContext(user?: MonitoringUser | null): Promise<void> {
  const crashlytics = getCrashlyticsModule();
  const perf = getPerfModule();

  if (crashlytics) {
    try {
      await crashlytics.setCrashlyticsCollectionEnabled(true);
    } catch {
      // Keep app startup resilient even when native modules are still warming up.
    }

    const contextAttributes = normalizeAttributes(
      {
        platform: Platform.OS,
        app_version: APP_VERSION,
        role: resolveRole(user),
        premium: user?.assinatura ? 'true' : 'false',
      },
      { keyLength: 40, valueLength: 100, maxItems: 4 }
    );

    try {
      await crashlytics.setAttributes(contextAttributes);
      await crashlytics.setUserId(user?.uid || '');
      if (user?.email) {
        crashlytics.log(`monitoring-context:${sanitizeValue(user.email, 120)}`);
      }
    } catch {
      // Crashlytics context is best effort only.
    }
  }

  if (perf) {
    try {
      perf.dataCollectionEnabled = true;
    } catch {
      // Some native builds may not expose the flag immediately.
    }
  }
}

export async function clearMonitoringContext(): Promise<void> {
  const crashlytics = getCrashlyticsModule();
  if (!crashlytics) {
    return;
  }

  try {
    await crashlytics.setUserId('');
    await crashlytics.setAttributes({
      role: 'guest',
      premium: 'false',
      platform: Platform.OS,
      app_version: APP_VERSION,
    });
  } catch {
    // Ignore cleanup issues during logout/app teardown.
  }
}

export async function recordMonitoringError(
  error: unknown,
  options?: {
    area?: string;
    reason?: string;
    attributes?: MonitoringAttributes;
  }
): Promise<void> {
  const crashlytics = getCrashlyticsModule();
  if (!crashlytics) {
    return;
  }

  try {
    const normalizedAttributes = normalizeAttributes(options?.attributes, {
      keyLength: 40,
      valueLength: 100,
      maxItems: 5,
    });
    if (Object.keys(normalizedAttributes).length) {
      await crashlytics.setAttributes(normalizedAttributes);
    }
    if (options?.area) {
      crashlytics.log(`[${sanitizeValue(options.area, 60)}]`);
    }
    await crashlytics.recordError(normalizeError(error), options?.reason);
  } catch {
    // Ignore reporting failures to avoid cascading runtime issues.
  }
}

export async function startMonitoringTrace(
  traceName: string,
  attributes?: MonitoringAttributes
): Promise<MonitoringTraceHandle> {
  const perf = getPerfModule();
  if (!perf) {
    return NOOP_TRACE;
  }

  try {
    const trace = await perf.startTrace(sanitizeKey(traceName, 100));
    applyTraceAttributes(trace, attributes);

    return {
      putAttribute: (attribute, value) => {
        const normalizedKey = sanitizeKey(attribute, 32);
        const normalizedValue = sanitizeValue(value, 100);
        if (!normalizedKey || !normalizedValue) {
          return;
        }
        trace.putAttribute(normalizedKey, normalizedValue);
      },
      incrementMetric: (metricName, incrementBy = 1) => {
        const normalizedMetric = sanitizeKey(metricName, 32);
        if (!normalizedMetric) {
          return;
        }
        trace.incrementMetric(normalizedMetric, incrementBy);
      },
      stop: async () => {
        try {
          await trace.stop();
        } catch {
          // Performance traces should never block the product flow.
        }
      },
    };
  } catch {
    return NOOP_TRACE;
  }
}
