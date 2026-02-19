import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMarketingMetadata } from '@/lib/seo';
import MobileAwareLink from '@/components/MobileAwareLink';

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Politica de privacidade | MH Personal Trainer',
  description: 'Transparencia sobre coleta, uso e protecao de dados na plataforma MH Personal Trainer.',
  path: '/privacy',
  keywords: [
    'politica de privacidade',
    'lgpd personal trainer',
    'dados pessoais fitness'
  ],
});
const privacyHighlights = [
  {
    title: 'Dados essenciais',
    text: 'Coletamos apenas o necessario para operar treinos, agenda e comunicacao.',
  },
  {
    title: 'Controle por perfil',
    text: 'Personal e academia veem apenas o que precisam para acompanhar o aluno.',
  },
  {
    title: 'Seguranca ativa',
    text: 'Monitoramento, camadas de protecao e boas praticas em toda a plataforma.',
  },
];

const privacyCollection = [
  {
    title: 'Cadastro e perfil',
    points: ['Nome, email e foto de perfil', 'Dados basicos para autenticar o acesso'],
  },
  {
    title: 'Treinos e avaliacoes',
    points: ['Rotinas, metas e historico', 'Registros de avaliacao e progresso'],
  },
  {
    title: 'Agenda e comunicacao',
    points: ['Agendamentos e presencas', 'Mensagens e notificacoes enviadas'],
  },
  {
    title: 'Financeiro e planos',
    points: ['Informacoes de plano e cobrancas', 'Dados de pagamento quando aplicavel'],
  },
];

const privacyUsage = [
  {
    title: 'Operacao do sistema',
    points: ['Autenticar usuarios', 'Entregar treinos e agendas', 'Manter notificacoes'],
  },
  {
    title: 'Melhoria continua',
    points: ['Relatorios de uso', 'Correcao de falhas', 'Novas funcoes com base em feedback'],
  },
  {
    title: 'Seguranca',
    points: ['Deteccao de acessos suspeitos', 'Prevencao de abuso', 'Auditoria de contas'],
  },
];

const privacyControls = [
  {
    title: 'Seus direitos',
    points: ['Solicitar acesso aos dados', 'Corrigir informacoes', 'Excluir a conta quando desejar'],
  },
  {
    title: 'Compartilhamento',
    points: ['Nao vendemos seus dados', 'Compartilhamos apenas com servicos essenciais', 'Somente com base legal'],
  },
  {
    title: 'Retencao',
    points: ['Guardamos dados enquanto sua conta estiver ativa', 'Retemos o minimo exigido por lei'],
  },
];

export default function PrivacyPage() {
  return (
    <div className="marketing-page legal-page">
      <section className="legal-hero">
        <div className="container legal-hero-grid">
          <div className="legal-hero-copy">
            <span className="legal-eyebrow">Politica de privacidade</span>
            <h1>Dados protegidos, controle na sua mao.</h1>
            <p className="legal-lead">
              Transparencia total sobre o que coletamos, como usamos e quais sao seus direitos.
            </p>
            <div className="legal-hero-actions">
              <MobileAwareLink href="/register" mobilePath="/register" className="marketing-button">
                Criar conta
              </MobileAwareLink>
              <Link href="/help" className="marketing-button ghost">
                Central de ajuda
              </Link>
            </div>
          </div>
          <div className="legal-hero-panels">
            <div className="legal-hero-card">
              <span className="legal-card-kicker">Ultima atualizacao</span>
              <strong>Janeiro 2026</strong>
              <p>Qualquer mudanca na politica fica registrada nesta pagina.</p>
            </div>
            <div className="legal-hero-card legal-hero-card--accent">
              <span className="legal-card-kicker">Compromissos</span>
              <ul className="legal-list">
                <li>Dados usados apenas para operacao do app.</li>
                <li>Controle claro para aluno, personal e academia.</li>
                <li>Canal aberto para solicitar ajustes.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-section legal-section">
        <div className="container">
          <div className="legal-section-head">
            <span>Resumo rapido</span>
            <h2>Privacidade sem letras miudas.</h2>
            <p>O essencial para entender como lidamos com dados.</p>
          </div>
          <div className="legal-summary-grid">
            {privacyHighlights.map((item) => (
              <div key={item.title} className="legal-summary-card">
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section marketing-surface legal-section">
        <div className="container">
          <div className="legal-section-head">
            <span>O que coletamos</span>
            <h2>Dados essenciais para operar o sistema.</h2>
            <p>Coletamos o minimo necessario para entregar o servico.</p>
          </div>
          <div className="legal-card-grid">
            {privacyCollection.map((item) => (
              <div key={item.title} className="legal-card">
                <h3>{item.title}</h3>
                <ul className="legal-list">
                  {item.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section legal-section">
        <div className="container legal-duo-grid">
          <div>
            <div className="legal-section-head">
              <span>Como usamos</span>
              <h2>Finalidades claras e objetivas.</h2>
              <p>Usamos dados para operacao, melhoria e seguranca.</p>
            </div>
            <div className="legal-card-stack">
              {privacyUsage.map((item) => (
                <div key={item.title} className="legal-card">
                  <h3>{item.title}</h3>
                  <ul className="legal-list">
                    {item.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="legal-section-head">
              <span>Direitos e controle</span>
              <h2>Voce decide sobre seus dados.</h2>
              <p>Transparencia e atendimento a qualquer solicitacao.</p>
            </div>
            <div className="legal-card-stack">
              {privacyControls.map((item) => (
                <div key={item.title} className="legal-card">
                  <h3>{item.title}</h3>
                  <ul className="legal-list">
                    {item.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-cta legal-cta">
        <div className="container marketing-cta-inner">
          <div>
            <span className="marketing-eyebrow">Contato</span>
            <h2>Precisa de ajuda sobre privacidade?</h2>
            <p>Fale com a nossa equipe em contato@mhpersonal.com.</p>
          </div>
          <div className="marketing-cta-row">
            <Link href="/help" className="marketing-button">
              Central de ajuda
            </Link>
            <Link href="/support/ticket" className="marketing-button ghost">
              Abrir ticket
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}


