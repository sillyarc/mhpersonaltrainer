import PageShell from '@/components/PageShell';
import Link from 'next/link';
import AiInsightsPanel from '@/components/AiInsightsPanel';
export default function AiHubPage() {
  return (
    <PageShell
      title="MH Assistente"
      description="Central de recursos inteligentes para treinos, avaliacoes e agenda."
      actions={[{ label: 'Abrir assistente', href: '/ai/assistant' }]}
    >
      <section className="ai-panel">
        <div className="ai-hero">
          <div>
            <h2>Assistente MH</h2>
            <p className="subtle">
              Gere treinos, resumos e recomendacoes em segundos.
            </p>
            <form className="ai-hero-form" action="/ai/assistant" method="GET">
              <label htmlFor="ai-hero-prompt">Pergunta rapida</label>
              <div className="ai-hero-input-row">
                <input
                  id="ai-hero-prompt"
                  name="prompt"
                  type="text"
                  className="ai-hero-input"
                  placeholder="Digite sua pergunta"
                  required
                />
                <button className="button ai-hero-submit" type="submit">
                  Enviar
                </button>
              </div>
            </form>
            <div className="ai-hero-actions">
              <Link href="/ai/assistant" className="button">
                Iniciar conversa
                <span className="premium-inline-badge">Premium</span>
              </Link>
              <Link href="/ai/image-analysis" className="button secondary">
                Analise de imagem
                <span className="premium-inline-badge">Premium</span>
              </Link>
            </div>
          </div>
          <div className="ai-hero-card">
            <p className="ai-hero-label">Sugestoes rapidas</p>
            <ul className="ai-prompt-list">
              {[
                'Crie um treino ABC para hipertrofia.',
                'Monte uma rotina para emagrecimento.',
                'Resumo da avaliacao postural do aluno.',
                'Checklist de atendimento para hoje.',
              ].map((item) => (
                <li key={item}>
                  <Link href={`/ai/assistant?prompt=${encodeURIComponent(item)}`} className="ai-prompt-link">
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="ai-grid">
          <Link href="/ai/assistant" className="ai-card">
            <strong>Assistente IA</strong>
            <span>Converse e gere treinos.</span>
            <p className="ai-tag">IA ativa</p>
            <p className="ai-tag ai-tag-premium">Premium</p>
          </Link>
          <Link href="/ai/image-analysis" className="ai-card">
            <strong>Analise de imagem</strong>
            <span>Postura e tecnica com IA.</span>
            <p className="ai-tag">Beta</p>
            <p className="ai-tag ai-tag-premium">Premium</p>
          </Link>
          <Link href="/ai/calendar" className="ai-card">
            <strong>Calendario inteligente</strong>
            <span>Sugestoes de agenda.</span>
            <p className="ai-tag">Novo</p>
            <p className="ai-tag ai-tag-premium">Premium</p>
          </Link>
        </div>

        <AiInsightsPanel />
      </section>
    </PageShell>
  );
}
