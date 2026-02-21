import Link from 'next/link';
import PageShell from '@/components/PageShell';

export default function AiCalendarPage() {
  const weekSuggestions = [
    { time: 'Seg 07:00', title: 'Avaliacao inicial', detail: '2 alunos novos', tag: 'prioridade' },
    { time: 'Ter 18:30', title: 'Treino presencial', detail: 'Grupo de 3 alunos', tag: 'grupo' },
    { time: 'Qui 07:30', title: 'Consulta online', detail: 'Plano de treino', tag: 'online' },
    { time: 'Sex 19:00', title: 'Reavaliacao fisica', detail: 'Aluno recorrente', tag: 'avaliacao' },
  ];
  const focusBlocks = [
    { label: 'Janelas livres', value: '12 slots', detail: 'Distribuir entre Seg-Qua' },
    { label: 'Dias mais fortes', value: 'Ter / Sex', detail: 'Maior procura em horario noturno' },
    { label: 'Ajuste recomendado', value: 'Blocos de 45 min', detail: 'Melhor encaixe para grupos' },
  ];
  const reminders = [
    'Bloquear intervalo de almoco entre 12h e 14h.',
    'Separar 30 min para feedbacks dos alunos ativos.',
    'Confirmar presenca do grupo de sabado.',
  ];

  return (
    <PageShell
      title="Calendario IA"
      description="Sugestoes automaticas para sua agenda."
      breadcrumbs={[{ label: 'MH Assistente', href: '/ai' }]}
    >
      <section className="ai-page">
        <div className="ai-assistant-hero">
          <div>
            <h2>Agenda inteligente</h2>
            <p className="subtle">
              Sugestoes de agenda baseadas no volume de alunos e nas rotinas atuais.
            </p>
            <div className="ai-hero-actions">
              <Link href="/schedule" className="button">
                Abrir agenda
              </Link>
              <Link href="/mh-agenda-fit" className="button secondary">
                Agenda MH
              </Link>
              <span className="ai-tag">IA ativa</span>
            </div>
          </div>
          <div className="ai-hero-card">
            <p className="ai-hero-label">Resumo da semana</p>
            <div className="ai-summary-grid">
              <div>
                <strong>18</strong>
                <span>Sessoes previstas</span>
              </div>
              <div>
                <strong>5</strong>
                <span>Online</span>
              </div>
              <div>
                <strong>3</strong>
                <span>Reavaliacoes</span>
              </div>
            </div>
          </div>
        </div>

        <div className="ai-calendar-grid">
          <div className="card ai-calendar-main">
            <div className="ai-card-header">
              <div>
                <h3>Sugestoes da semana</h3>
                <p className="subtle">Eventos recomendados para otimizar a agenda.</p>
              </div>
              <span className="ai-tag">Auto</span>
            </div>
            <div className="ai-calendar-list">
              {weekSuggestions.map((item) => (
                <div key={`${item.time}-${item.title}`} className="ai-calendar-item">
                  <div>
                    <strong>{item.time}</strong>
                    <span>{item.title}</span>
                    <small>{item.detail}</small>
                  </div>
                  <span className={`ai-calendar-tag ${item.tag}`}>{item.tag}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ai-calendar-side">
            <div className="card ai-info-card">
              <h3>Insights de agenda</h3>
              <div className="ai-focus-grid">
                {focusBlocks.map((item) => (
                  <div key={item.label} className="ai-focus-item">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.detail}</small>
                  </div>
                ))}
              </div>
            </div>
            <div className="card ai-info-card">
              <h3>Lembretes</h3>
              <ul className="ai-checklist">
                {reminders.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
