import PageShell from '@/components/PageShell';

export default function AiGptHomePage() {
  return (
    <PageShell
      title="Chat GPT - Inicio"
      description="Atalhos rapidos e treinos populares do assistente."
      breadcrumbs={[{ label: 'MH Assistente', href: '/ai' }]}
    >
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="card">
          <h3>Treinos populares</h3>
          <p className="subtle" style={{ marginTop: 8 }}>Hipertrofia, emagrecimento, resistencia.</p>
        </div>
        <div className="card">
          <h3>Assistente rapido</h3>
          <p className="subtle" style={{ marginTop: 8 }}>Sugestoes baseadas em perfil do aluno.</p>
        </div>
      </div>
    </PageShell>
  );
}
