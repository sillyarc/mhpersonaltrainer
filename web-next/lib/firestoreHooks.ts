'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  QueryConstraint,
  DocumentData,
} from 'firebase/firestore';
import { db } from './firebaseClient';
import { useAuth } from './auth';

export type FirestorePath = (string | undefined | null)[];

const buildPath = (segments: FirestorePath) => {
  if (segments.some((segment) => segment === '' || segment === undefined || segment === null)) {
    return [] as string[];
  }
  return segments.filter(Boolean) as string[];
};

export const formatDate = (value?: any) => {
  if (!value) return '-';
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') {
    return value.toDate().toLocaleDateString('pt-BR');
  }
  if (value instanceof Date) return value.toLocaleDateString('pt-BR');
  return String(value);
};

export const useCollectionData = <T extends DocumentData>(
  path: FirestorePath,
  constraints: QueryConstraint[] = []
) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const pathKey = useMemo(() => buildPath(path).join('/'), [path]);

  useEffect(() => {
    const segments = buildPath(path);
    if (!segments.length) {
      setData([]);
      setLoading(false);
      return;
    }

    const ref = collection(db, ...(segments as [string, ...string[]]));
    const q = constraints.length ? query(ref, ...constraints) : ref;

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as unknown as T[];
        setData(items);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [pathKey, constraints]);

  return { data, loading, error };
};

export const useCollectionCount = (path: FirestorePath, constraints: QueryConstraint[] = []) => {
  const { data, loading, error } = useCollectionData(path, constraints);
  return { count: data.length, loading, error };
};

export const useDocumentData = <T extends DocumentData>(path: FirestorePath) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const pathKey = useMemo(() => buildPath(path).join('/'), [path]);

  useEffect(() => {
    const segments = buildPath(path);
    if (segments.length < 2) {
      setData(null);
      setLoading(false);
      return;
    }

    const ref = doc(db, ...(segments as [string, ...string[]]));
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setData(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as unknown as T) : null);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [pathKey]);

  return { data, loading, error };
};

const DEFAULT_USER_ID_KEY = 'mh-web-user-id';

export const useUserScope = () => {
  const { user, role } = useAuth();
  const [userId, setUserId] = useState('');

  useEffect(() => {
    if (role === 'admin') {
      const stored = window.localStorage.getItem(DEFAULT_USER_ID_KEY);
      if (stored) {
        setUserId(stored);
        return;
      }
    }
    setUserId(user?.uid || '');
  }, [role, user?.uid]);

  const updateUserId = useCallback(
    (nextId: string) => {
      if (role !== 'admin') {
        setUserId(user?.uid || '');
        return;
      }
      setUserId(nextId);
      if (nextId) {
        window.localStorage.setItem(DEFAULT_USER_ID_KEY, nextId);
      } else {
        window.localStorage.removeItem(DEFAULT_USER_ID_KEY);
      }
    },
    [role, user?.uid]
  );

  return { userId, setUserId: updateUserId };
};

export const firestoreHelpers = {
  orderBy,
  limit,
  where,
};
