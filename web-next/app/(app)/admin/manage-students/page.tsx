'use client';

import PageShell from '@/components/PageShell';
import AdminGate from '@/components/AdminGate';

export default function AdminManageStudentsPage() {
  return (
    <PageShell
      title="Gerenciar alunos"
      description="Aprovacao e configuracao de novos alunos."
      breadcrumbs={[{ label: 'Admin', href: '/admin' }]}
    >
      <AdminGate>
        <div className="card">
          <form style={{ display: 'grid', gap: 12 }}>
            <label>
              Nome do aluno
              <input type="text" placeholder="Nome completo" style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }} />
            </label>
            <label>
              Plano
              <select style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}>
                <option>Essencial</option>
                <option>Premium</option>
              </select>
            </label>
            <button className="button" type="submit">Aprovar aluno</button>
          </form>
        </div>
      </AdminGate>
    </PageShell>
  );
}
