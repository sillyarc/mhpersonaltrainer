'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import PageShell from '@/components/PageShell';
import AdminGate from '@/components/AdminGate';

export default function AdminStudentDetailPage({ params }: { params: { id: string } }) {
  const pathname = usePathname();
  const studentId = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    return last && last !== 'student' ? last : params.id;
  }, [pathname, params.id]);
  return (
    <PageShell
      title={`Aluno ${studentId}`}
      description="Perfil do aluno no painel admin."
      breadcrumbs={[{ label: 'Admin', href: '/admin' }]}
    >
      <AdminGate>
        <div className="card">
          <p className="subtle">Status, historico e configuracoes do aluno ficam aqui.</p>
        </div>
      </AdminGate>
    </PageShell>
  );
}
