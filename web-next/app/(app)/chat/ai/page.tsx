import PageShell from '@/components/PageShell';
import AiAccessStatus from '@/components/AiAccessStatus';

export default function ChatAiPage() {
  return (
    <PageShell
      title="Chat IA"
      description="Converse com o assistente para gerar treinos e respostas."
      breadcrumbs={[{ label: 'Chat', href: '/chat' }]}
    >
      <div className="card">
        <AiAccessStatus compact showManageLink={false} />
        <p className="subtle">Interface de chat com IA aparece aqui.</p>
      </div>
    </PageShell>
  );
}
