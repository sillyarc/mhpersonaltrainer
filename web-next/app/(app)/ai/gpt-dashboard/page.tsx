import PageShell from '@/components/PageShell';

export default function AiGptDashboardPage() {
  return (
    <PageShell
      title="GPT Dashboard"
      description="Indicadores de uso da IA no app."
      breadcrumbs={[{ label: 'MH Assistente', href: '/ai' }]}
    >
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="card">
          <h3>Respostas geradas</h3>
          <p className="subtle" style={{ marginTop: 8 }}>238 esta semana</p>
        </div>
        <div className="card">
          <h3>Treinos gerados</h3>
          <p className="subtle" style={{ marginTop: 8 }}>32 treinos</p>
        </div>
        <div className="card">
          <h3>Feedbacks automaticos</h3>
          <p className="subtle" style={{ marginTop: 8 }}>64 feedbacks</p>
        </div>
      </div>
    </PageShell>
  );
}
