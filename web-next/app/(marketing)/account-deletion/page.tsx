import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMarketingMetadata } from '@/lib/seo';
import MobileAwareLink from '@/components/MobileAwareLink';

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Exclusao de conta | MH Personal Trainer',
  description: 'Saiba como excluir sua conta e como tratamos os dados apos a solicitacao de exclusao.',
  path: '/account-deletion',
  keywords: [
    'excluir conta',
    'remover conta personal trainer',
    'deletar cadastro'
  ],
});
const deletionHighlights = [
  {
    title: 'Exclusao dentro da conta',
    text: 'O processo e feito pelo proprio usuario depois de entrar na conta.',
  },
  {
    title: 'Sem ticket',
    text: 'Nao exigimos abertura de ticket para concluir a exclusao.',
  },
  {
    title: 'Controle total',
    text: 'A exclusao encerra o acesso e remove os dados pessoais vinculados.',
  },
];

const deletionSteps = [
  {
    title: 'Excluir na sua conta',
    points: [
      'Entre na sua conta pelo painel web ou app',
      'Acesse Perfil ou Configuracoes',
      'Selecione Deletar conta',
      'Confirme email e senha para validar a solicitacao',
    ],
  },
  {
    title: 'Recuperar acesso',
    points: [
      'Use Esqueci minha senha na tela de login',
      'Recupere o acesso para concluir a exclusao',
    ],
  },
  {
    title: 'Conta vinculada a equipe',
    points: [
      'Se voce faz parte de uma equipe, avise o responsavel',
      'O administrador pode remover o perfil vinculado',
    ],
  },
];

const deletionData = [
  {
    title: 'Dados removidos',
    points: [
      'Perfil e credenciais de acesso',
      'Treinos, metas e avaliacoes vinculadas',
      'Mensagens e notificacoes associadas',
      'Arquivos e midias carregadas pela conta',
    ],
  },
  {
    title: 'Retencao limitada',
    points: [
      'Registros financeiros exigidos por lei',
      'Logs de seguranca e auditoria por periodo limitado',
      'Backups tecnicos ate o ciclo de expiracao',
    ],
  },
];

const deletionTimeline = [
  {
    title: 'Prazos e status',
    points: [
      'Processamos pedidos em ate 30 dias',
      'Durante o prazo a conta pode ficar desativada',
      'Voce recebe confirmacao ao final do processo',
    ],
  },
  {
    title: 'Depois da exclusao',
    points: [
      'Nao e possivel reativar a conta excluida',
      'Para voltar, sera necessario criar nova conta',
    ],
  },
];

export default function AccountDeletionPage() {
  return (
    <div className="marketing-page legal-page">
      <section className="legal-hero">
        <div className="container legal-hero-grid">
          <div className="legal-hero-copy">
            <span className="legal-eyebrow">Politica de exclusao de conta</span>
            <h1>Exclusao clara, segura e sob controle do usuario.</h1>
            <p className="legal-lead">
              Saiba como excluir sua conta entrando no painel, quais dados sao removidos e como tratamos retencao legal.
            </p>
            <div className="legal-hero-actions">
              <MobileAwareLink href="/login" mobilePath="/login" className="marketing-button">
                Acessar conta
              </MobileAwareLink>
              <Link href="/forgot-password" className="marketing-button ghost">
                Recuperar senha
              </Link>
            </div>
          </div>
          <div className="legal-hero-panels">
            <div className="legal-hero-card">
              <span className="legal-card-kicker">Ultima atualizacao</span>
              <strong>Fevereiro 2026</strong>
              <p>Qualquer ajuste nesta politica sera publicado nesta pagina.</p>
            </div>
            <div className="legal-hero-card legal-hero-card--accent">
              <span className="legal-card-kicker">Compromissos</span>
              <ul className="legal-list">
                <li>Exclusao dentro da conta, sem ticket.</li>
                <li>Retencao minima apenas quando exigida.</li>
                <li>Processo claro e transparente.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-section legal-section">
        <div className="container">
          <div className="legal-section-head">
            <span>Resumo rapido</span>
            <h2>Exclusao de conta feita por voce.</h2>
            <p>Veja o essencial antes de iniciar o processo na sua conta.</p>
          </div>
          <div className="legal-summary-grid">
            {deletionHighlights.map((item) => (
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
            <span>Como excluir</span>
            <h2>Passos simples para remover sua conta entrando no painel.</h2>
            <p>O processo e feito diretamente na sua conta.</p>
          </div>
          <div className="legal-card-grid">
            {deletionSteps.map((item) => (
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
              <span>Dados e retencao</span>
              <h2>O que e removido e o que fica retido.</h2>
              <p>Retemos apenas o minimo necessario para cumprir obrigacoes legais.</p>
            </div>
            <div className="legal-card-stack">
              {deletionData.map((item) => (
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
              <span>Prazos</span>
              <h2>Tempo de processamento e confirmacao.</h2>
              <p>Transparencia em cada etapa da exclusao.</p>
            </div>
            <div className="legal-card-stack">
              {deletionTimeline.map((item) => (
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
            <span className="marketing-eyebrow">Acesso</span>
            <h2>Para excluir, entre na sua conta.</h2>
            <p>Se perdeu o acesso, recupere a senha e finalize a exclusao.</p>
          </div>
          <div className="marketing-cta-row">
            <MobileAwareLink href="/login" mobilePath="/login" className="marketing-button">
              Entrar
            </MobileAwareLink>
            <Link href="/forgot-password" className="marketing-button ghost">
              Recuperar senha
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}


