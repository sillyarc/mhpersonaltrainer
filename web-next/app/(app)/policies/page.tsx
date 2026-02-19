import PageShell from '@/components/PageShell';

export default function PoliciesPage() {
  return (
    <PageShell
      title="Politicas"
      description="Termos adicionais e politicas gerais do app."
    >
      <div className="card">
        <p className="subtle">Resumo de politicas internas e condutas.</p>
      </div>
    </PageShell>
  );
}
