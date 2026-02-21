import PageShell from '@/components/PageShell';

export default function AiFeedbackPage() {
  return (
    <PageShell
      title="Feedback com IA"
      description="Resumos automaticos e recomendacoes para alunos."
      breadcrumbs={[{ label: 'MH Assistente', href: '/ai' }]}
    >
      <div className="card">
        <h3>Gerar feedback</h3>
        <p className="subtle" style={{ marginTop: 8 }}>
          Baseado no treino e progresso da semana.
        </p>
        <button className="button" style={{ marginTop: 16 }}>Gerar feedback</button>
      </div>
    </PageShell>
  );
}
