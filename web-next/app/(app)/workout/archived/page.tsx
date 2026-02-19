'use client';

import { useEffect, useState } from 'react';
import PageShell from '@/components/PageShell';
import UserScopePicker from '@/components/data/UserScopePicker';
import DataTable from '@/components/data/DataTable';
import { useUserScope, formatDate } from '@/lib/firestoreHooks';
import { fetchUserWorkouts } from '@/lib/services/workouts';

export default function ArchivedWorkoutsPage() {
  const { userId } = useUserScope();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!userId) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const result = await fetchUserWorkouts(userId, true);
      if (!active) return;
      setRows(result.data || []);
      setLoading(false);
    };

    load();
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <PageShell
      title="Treinos arquivados"
      description="Historico completo de treinos antigos e ciclos."
      breadcrumbs={[{ label: 'Treinos', href: '/workouts' }]}
    >
      <UserScopePicker />
      <div className="card">
        <h3>Treinos finalizados</h3>
        {loading ? (
          <p className="subtle" style={{ marginTop: 8 }}>
            Carregando treinos...
          </p>
        ) : (
          <DataTable
            rows={rows}
            columns={[
              { key: 'nomeDoTreino', label: 'Treino' },
              { key: 'updatedAt', label: 'Atualizado em', render: (row) => formatDate(row.updatedAt) },
            ]}
            emptyMessage="Nenhum treino arquivado."
          />
        )}
      </div>
    </PageShell>
  );
}
