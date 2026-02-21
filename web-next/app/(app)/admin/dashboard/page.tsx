'use client';

import PageShell from '@/components/PageShell';
import AdminGate from '@/components/AdminGate';
import { useAdminDashboardData } from '@/lib/hooks/useAdminDashboardData';

export default function AdminDashboardPage() {
  const { overview, error } = useAdminDashboardData(true);

  return (
    <PageShell
      title="Admin dashboard"
      description="Visao geral de usuarios, alunos e receitas."
      breadcrumbs={[{ label: 'Admin', href: '/admin' }]}
    >
      <AdminGate>
        {error && <p style={{ color: '#c0392b' }}>{error}</p>}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div className="card">
            <h3>Usuarios</h3>
            <p className="subtle" style={{ marginTop: 8 }}>{overview?.totalUsers ?? 0}</p>
          </div>
          <div className="card">
            <h3>Personals</h3>
            <p className="subtle" style={{ marginTop: 8 }}>{overview?.totalPersonals ?? 0}</p>
          </div>
          <div className="card">
            <h3>Admins</h3>
            <p className="subtle" style={{ marginTop: 8 }}>{overview?.totalAdmins ?? 0}</p>
          </div>
          <div className="card">
            <h3>Alunos</h3>
            <p className="subtle" style={{ marginTop: 8 }}>{overview?.totalAlunos ?? 0}</p>
          </div>
        </div>
      </AdminGate>
    </PageShell>
  );
}
