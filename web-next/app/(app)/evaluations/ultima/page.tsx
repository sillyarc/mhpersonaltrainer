'use client';

import PageShell from '@/components/PageShell';
import UserScopePicker from '@/components/data/UserScopePicker';
import { firestoreHelpers, formatDate, useCollectionData, useUserScope } from '@/lib/firestoreHooks';
import { useMemo } from 'react';

interface UltimaRow {
  id: string;
  createdAt?: any;
  data?: any;
  status?: string;
  type?: string;
}

export default function UltimaAvaliacaoPage() {
  const { userId } = useUserScope();
  const query = useMemo(() => [firestoreHelpers.orderBy('createdAt', 'desc'), firestoreHelpers.limit(1)], []);
  const { data } = useCollectionData<UltimaRow>(['users', userId, 'avaliacaoPersonalizada'], query);
  const latest = data[0];

  return (
    <PageShell
      title="Ultima avaliacao"
      description="Resumo da ultima avaliacao registrada."
      breadcrumbs={[{ label: 'Avaliacoes', href: '/evaluations' }]}
    >
      <UserScopePicker />
      <div className="card">
        <h3>Resumo</h3>
        {userId && latest ? (
          <p className="subtle" style={{ marginTop: 8 }}>
            Ultima avaliacao em {formatDate(latest.createdAt ?? latest.data)}.
          </p>
        ) : (
          <p className="subtle" style={{ marginTop: 8 }}>
            Informe um UID para carregar a ultima avaliacao.
          </p>
        )}
        <div className="grid" style={{ marginTop: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="card">
            <p className="subtle">Peso</p>
            <strong>78kg</strong>
          </div>
          <div className="card">
            <p className="subtle">Gordura corporal</p>
            <strong>18%</strong>
          </div>
          <div className="card">
            <p className="subtle">Progresso</p>
            <strong>+2kg massa magra</strong>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
