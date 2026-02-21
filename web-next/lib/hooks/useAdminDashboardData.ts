'use client';

import { useCallback, useEffect, useState } from 'react';
import { firestoreService, type AdminOverview } from '@/lib/services/firestoreService';
import { useAuth } from '@/lib/auth';

interface AdminDashboardData {
  overview: AdminOverview | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAdminDashboardData(enabled = true): AdminDashboardData {
  const { user, role } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    if (!enabled || !user?.uid || role !== 'admin') {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await firestoreService.getAdminOverview();
      setOverview(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados do admin.');
    } finally {
      setLoading(false);
    }
  }, [enabled, user?.uid, role]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  return {
    overview,
    loading,
    error,
    refresh: fetchOverview,
  };
}
