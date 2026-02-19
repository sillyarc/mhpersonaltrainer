'use client';

import { useEffect, useState } from 'react';
import PageShell from '@/components/PageShell';
import UserScopePicker from '@/components/data/UserScopePicker';
import DataTable from '@/components/data/DataTable';
import { useUserScope, formatDate } from '@/lib/firestoreHooks';
import { fetchAerobicWorkouts } from '@/lib/services/workouts';

export default function AerobicoPage() {
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
      const result = await fetchAerobicWorkouts(userId);
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
      title="Treino aerobico"
      description="Planos aerobicos para resistencia e condicionamento."
      breadcrumbs={[{ label: 'Treinos', href: '/workouts' }]}
    >
      <UserScopePicker />
      <div className="card">
        <h3>Rotinas aerobicas</h3>
        {loading ? (
          <p className="subtle" style={{ marginTop: 8 }}>
            Carregando treinos...
          </p>
        ) : (
          <DataTable
            rows={rows}
            columns={[
              { key: 'treino', label: 'Treino' },
              { key: 'createdAt', label: 'Criado em', render: (row) => formatDate(row.createdAt) },
              { key: 'updatedAt', label: 'Atualizado', render: (row) => formatDate(row.updatedAt) },
            ]}
            emptyMessage="Nenhum treino aerobico encontrado."
          />
        )}
      </div>
    </PageShell>
  );
}
