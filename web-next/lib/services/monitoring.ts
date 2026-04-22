'use client';

import type { FirebasePerformance, PerformanceTrace } from 'firebase/performance';
import type { User, UserRole } from '../types/user';
import { getFirebaseApp } from './firebase';

type MonitoringAttributeValue = string | number | boolean | null | undefined;
type MonitoringAttributes = Record<string, MonitoringAttributeValue>;

export type WebMonitoringTraceHandle = {
  putAttribute: (attribute: string, value: MonitoringAttributeValue) => void;
  incrementMetric: (metricName: string, incrementBy?: number) => void;
  stop: () => Promise<void>;
};

type MonitoringContextUser = Pick<User, 'uid' | 'displayName' | 'email'> | null | undefined;

const NOOP_TRACE: WebMonitoringTraceHandle = {
  putAttribute: () => {},
  incrementMetric: () => {},
  stop: async () => {},
};

let performancePromise: Promise<FirebasePerformance | null> | null = null;
let monitoringContext: {
  userId: string | null;
  role: UserRole | null;
  displayName: string | null;
} = {
  userId: null,
  role: null,
  displayName: null,
};

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

const applyTraceAttributes = (trace: PerformanceTrace, attributes?: MonitoringAttributes) => {
  Object.entries(attributes || {}).slice(0, 5).forEach(([key, value]) => {
    const normalizedKey = sanitizeKey(key, 32);
    const normalizedValue = sanitizeValue(value, 100);
    if (!normalizedKey || !normalizedValue) {
      return;
    }
    trace.putAttribute(normalizedKey, normalizedValue);
  });
};

const getPerformanceInstance = async (): Promise<FirebasePerformance | null> => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!performancePromise) {
    performancePromise = (async () => {
      try {
        const { getPerformance, initializePerformance } = await import('firebase/performance');
        const app = getFirebaseApp();

        try {
          return initializePerformance(app, {
            dataCollectionEnabled: true,
            instrumentationEnabled: true,
          });
        } catch {
          return getPerformance(app);
        }
      } catch {
        return null;
      }
    })();
  }

  return performancePromise;
};

export function setWebMonitoringContext(user?: MonitoringContextUser, role?: UserRole | null) {
  monitoringContext = {
    userId: user?.uid || null,
    role: role ?? null,
    displayName: user?.displayName || user?.email || null,
  };
}

export function clearWebMonitoringContext() {
  monitoringContext = {
    userId: null,
    role: null,
    displayName: null,
  };
}

export function logWebMonitoringError(
  area: string,
  error: unknown,
  attributes?: MonitoringAttributes
) {
  console.error(`[monitoring:${sanitizeKey(area, 60)}]`, {
    error,
    attributes,
    monitoringContext,
  });
}

export async function startWebMonitoringTrace(
  traceName: string,
  attributes?: MonitoringAttributes
): Promise<WebMonitoringTraceHandle> {
  const performance = await getPerformanceInstance();
  if (!performance) {
    return NOOP_TRACE;
  }

  try {
    const { trace } = await import('firebase/performance');
    const perfTrace = trace(performance, sanitizeKey(traceName, 100));
    await perfTrace.start();
    applyTraceAttributes(perfTrace, attributes);

    return {
      putAttribute: (attribute, value) => {
        const normalizedKey = sanitizeKey(attribute, 32);
        const normalizedValue = sanitizeValue(value, 100);
        if (!normalizedKey || !normalizedValue) {
          return;
        }
        perfTrace.putAttribute(normalizedKey, normalizedValue);
      },
      incrementMetric: (metricName, incrementBy = 1) => {
        const normalizedMetric = sanitizeKey(metricName, 32);
        if (!normalizedMetric) {
          return;
        }
        perfTrace.incrementMetric(normalizedMetric, incrementBy);
      },
      stop: async () => {
        try {
          await perfTrace.stop();
        } catch {
          // Avoid blocking user journeys on telemetry delivery.
        }
      },
    };
  } catch {
    return NOOP_TRACE;
  }
}
