import PageShell from '@/components/PageShell';
import Link from 'next/link';

export default function PersonalPage() {
  return (
    <PageShell
      title="Area do personal"
      description="Resumo, perfil e configuracoes do personal."
      breadcrumbs={[{ label: 'Painel', href: '/app' }]}
    >
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Link href="/personal/summary" className="card">
          <h3>Resumo</h3>
          <p className="subtle" style={{ marginTop: 8 }}>Indicadores e alunos.</p>
        </Link>
        <Link href="/personal/profile" className="card">
          <h3>Perfil publico</h3>
          <p className="subtle" style={{ marginTop: 8 }}>Como alunos veem voce.</p>
        </Link>
        <Link href="/personal/change-code" className="card">
          <h3>Codigo do personal</h3>
          <p className="subtle" style={{ marginTop: 8 }}>Atualize seu codigo.</p>
        </Link>
      </div>
    </PageShell>
  );
}
