'use client';

import { useEffect, useRef } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAuth } from '@/lib/auth';

type ErrorPayload = {
  type: 'error' | 'unhandledrejection';
  message: string;
  name?: string;
  code?: string;
  stack?: string;
  source?: string;
  url?: string;
  line?: number;
  column?: number;
  userId?: string;
  role?: string | null;
  userAgent?: string;
  createdAt?: unknown;
};

const MAX_MESSAGE_LENGTH = 420;
const MAX_STACK_LENGTH = 1400;
const DEDUPE_WINDOW_MS = 30000;

const trimValue = (value: string, max: number) => {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
};

const safeString = (value: unknown, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch (error) {
    return fallback;
  }
};

const normalizeError = (value: unknown) => {
  if (value instanceof Error) {
    return {
      message: value.message || 'Erro desconhecido',
      name: value.name,
      stack: value.stack,
      code: (value as { code?: string }).code,
    };
  }

  if (typeof value === 'string') {
    return { message: value };
  }

  if (value && typeof value === 'object') {
    const record = value as { message?: unknown; name?: unknown; code?: unknown };
    return {
      message: safeString(record.message || value, 'Erro desconhecido'),
      name: safeString(record.name || ''),
      code: safeString(record.code || ''),
    };
  }

  return { message: safeString(value, 'Erro desconhecido') };
};

export default function AppErrorReporter() {
  const { user, role } = useAuth();
  const lastErrorRef = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    const logError = async (payload: ErrorPayload) => {
      const key = `${payload.type}-${payload.message}-${payload.code || ''}-${payload.source || ''}`;
      const now = Date.now();
      const last = lastErrorRef.current;
      if (last && last.key === key && now - last.at < DEDUPE_WINDOW_MS) {
        return;
      }
      lastErrorRef.current = { key, at: now };
      try {
        await addDoc(collection(db, 'appErrors'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn('Falha ao registrar erro do app.', error);
      }
    };

    const originalConsoleError = console.error.bind(console);
    const handleConsoleError = (...args: unknown[]) => {
      originalConsoleError(...args);
      const errorCandidate =
        args.find((arg) => arg instanceof Error) ||
        args.find(
          (arg) =>
            arg &&
            typeof arg === 'object' &&
            'message' in (arg as { message?: unknown })
        );
      const fallbackMessage = args.map((arg) => safeString(arg)).join(' ');
      const normalized = normalizeError(errorCandidate || fallbackMessage);
      void logError({
        type: 'error',
        message: trimValue(normalized.message, MAX_MESSAGE_LENGTH),
        name: normalized.name,
        code: normalized.code,
        stack: normalized.stack ? trimValue(normalized.stack, MAX_STACK_LENGTH) : undefined,
        source: 'console',
        url: window.location.href,
        userId: user?.uid,
        role,
        userAgent: navigator.userAgent,
      });
    };

    const handleError = (event: ErrorEvent) => {
      const normalized = normalizeError(event.error || event.message);
      void logError({
        type: 'error',
        message: trimValue(normalized.message, MAX_MESSAGE_LENGTH),
        name: normalized.name,
        code: normalized.code,
        stack: normalized.stack ? trimValue(normalized.stack, MAX_STACK_LENGTH) : undefined,
        source: event.filename,
        url: window.location.href,
        line: event.lineno,
        column: event.colno,
        userId: user?.uid,
        role,
        userAgent: navigator.userAgent,
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const normalized = normalizeError(event.reason);
      void logError({
        type: 'unhandledrejection',
        message: trimValue(normalized.message, MAX_MESSAGE_LENGTH),
        name: normalized.name,
        code: normalized.code,
        stack: normalized.stack ? trimValue(normalized.stack, MAX_STACK_LENGTH) : undefined,
        source: 'promise',
        url: window.location.href,
        userId: user?.uid,
        role,
        userAgent: navigator.userAgent,
      });
    };

    console.error = handleConsoleError as typeof console.error;
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      console.error = originalConsoleError;
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [role, user?.uid]);

  return null;
}
