'use client';

import PageShell from '@/components/PageShell';
import AdminGate from '@/components/AdminGate';
import DataTable from '@/components/data/DataTable';
import { formatDate, useCollectionData } from '@/lib/firestoreHooks';

interface UserRow {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  createdTime?: any;
}

export default function AdminStudentsPage() {
  const { data } = useCollectionData<UserRow>(['users']);

  return (
    <PageShell
      title="Gerenciamento de alunos"
      description="Aprovacoes, status e historico dos alunos."
      breadcrumbs={[{ label: 'Admin', href: '/admin' }]}
    >
      <AdminGate>
        <div className="card">
          <DataTable
            rows={data}
            columns={[
              { key: 'displayName', label: 'Aluno' },
              { key: 'email', label: 'Email' },
              { key: 'role', label: 'Perfil' },
              { key: 'createdTime', label: 'Criado em', render: (row) => formatDate(row.createdTime) },
            ]}
            emptyMessage="Nenhum aluno encontrado."
          />
        </div>
      </AdminGate>
    </PageShell>
  );
}
