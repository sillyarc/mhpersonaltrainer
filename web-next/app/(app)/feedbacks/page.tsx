'use client';

import { useEffect, useState } from 'react';
import PageShell from '@/components/PageShell';
import DataTable from '@/components/data/DataTable';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/firestoreHooks';
import { fetchFeedbacksByPersonalCode, fetchFeedbacksByUser } from '@/lib/services/feedback';

export default function FeedbacksPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const isPersonal = Boolean(user.professorAccount);
      const result = isPersonal && user.codigoPersonal
        ? await fetchFeedbacksByPersonalCode(user.codigoPersonal)
        : await fetchFeedbacksByUser(user.uid);
      if (!active) return;
      setRows(result.data || []);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [user?.uid, user?.professorAccount, user?.codigoPersonal]);

  return (
    <PageShell
      title="Feedbacks"
      description="Acompanhe feedbacks enviados por alunos."
      breadcrumbs={[{ label: 'Painel', href: '/app' }]}
    >
      <div className="card">
        {loading ? (
          <p className="subtle">Carregando feedbacks...</p>
        ) : (
          <DataTable
            rows={rows}
            columns={[
              { key: 'yourName', label: 'Aluno' },
              { key: 'nomeDoTreino', label: 'Treino' },
              { key: 'estrela', label: 'Nota' },
              { key: 'horaDeTermino', label: 'Data', render: (row) => formatDate(row.horaDeTermino) },
              { key: 'comentarioDoAluno', label: 'Comentario' },
            ]}
            emptyMessage="Nenhum feedback encontrado."
          />
        )}
      </div>
    </PageShell>
  );
}
