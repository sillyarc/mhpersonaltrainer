import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMarketingMetadata } from '@/lib/seo';
import MobileAwareLink from '@/components/MobileAwareLink';

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Termos de uso | MH Personal Trainer',
  description: 'Regras de uso, responsabilidades e condicoes dos servicos da plataforma MH Personal Trainer.',
  path: '/terms',
  keywords: [
    'termos de uso',
    'contrato software fitness',
    'regras da plataforma'
  ],
});
const termsHighlights = [
  {
    title: 'Uso justo',
    text: 'Regras claras para manter o ambiente seguro para alunos, personais e academias.',
  },
  {
    title: 'Conta protegida',
    text: 'Voce e responsavel por manter seus dados atualizados e sua senha segura.',
  },
  {
    title: 'Planos transparentes',
    text: 'Valores e cobrancas seguem as condicoes exibidas no momento da contratacao.',
  },
];

const termsEssentials = [
  {
    title: 'Uso da plataforma',
    points: [
      'Ferramentas para treinos, agenda e comunicacao',
      'Uso pessoal e profissional dentro do contrato',
    ],
  },
  {
    title: 'Conta e acesso',
    points: [
      'Dados corretos e atualizados',
      'Nao compartilhe seu acesso com terceiros',
    ],
  },
  {
    title: 'Responsabilidades',
    points: [
      'Uso etico e respeitoso',
      'Nao enviar conteudos ilegais ou ofensivos',
    ],
  },
  {
    title: 'Pagamentos e planos',
    points: [
      'Cobrancas conforme plano contratado',
      'Cancelamentos seguem o ciclo vigente',
    ],
  },
];

const termsRules = [
  {
    title: 'Condutas proibidas',
    points: [
      'Tentar acessar contas de terceiros',
      'Copiar ou distribuir o sistema sem autorizacao',
      'Usar a plataforma para fins ilegais',
    ],
  },
  {
    title: 'Servicos e disponibilidade',
    points: [
      'Podemos evoluir recursos para melhorar o produto',
      'Manutencoes podem ocorrer com aviso previo',
      'Alguns recursos dependem de terceiros',
    ],
  },
  {
    title: 'Limitacao de responsabilidade',
    points: [
      'Nao oferecemos aconselhamento medico',
      'Resultados variam conforme o uso',
      'Recomendamos acompanhamento profissional',
    ],
  },
];

const termsUpdates = [
  {
    title: 'Cancelamento',
    points: [
      'Voce pode solicitar cancelamento a qualquer momento',
      'Acesso permanece ate o fim do ciclo vigente',
    ],
  },
  {
    title: 'Atualizacoes',
    points: [
      'Termos podem ser atualizados',
      'A versao vigente estara sempre publicada',
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="marketing-page legal-page">
      <section className="legal-hero">
        <div className="container legal-hero-grid">
          <div className="legal-hero-copy">
            <span className="legal-eyebrow">Termos de uso</span>
            <h1>Regras claras para proteger sua operacao.</h1>
            <p className="legal-lead">
              Termos diretos para garantir um uso seguro e eficiente do MH Personal Trainer.
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
              <p>Ao usar a plataforma, voce concorda com os termos abaixo.</p>
            </div>
            <div className="legal-hero-card legal-hero-card--accent">
              <span className="legal-card-kicker">Compromissos</span>
              <ul className="legal-list">
                <li>Uso correto e respeitoso da plataforma.</li>
                <li>Transparencia nos planos e cobrancas.</li>
                <li>Suporte para qualquer duvida.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-section legal-section">
        <div className="container">
          <div className="legal-section-head">
            <span>Resumo rapido</span>
            <h2>O essencial para usar o app com seguranca.</h2>
            <p>Termos organizados para leitura rapida.</p>
          </div>
          <div className="legal-summary-grid">
            {termsHighlights.map((item) => (
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
            <span>Regras principais</span>
            <h2>Como a plataforma deve ser usada.</h2>
            <p>Diretrizes simples para alunos, personais e academias.</p>
          </div>
          <div className="legal-card-grid">
            {termsEssentials.map((item) => (
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
              <span>Condutas e responsabilidades</span>
              <h2>Para manter o ambiente seguro.</h2>
              <p>Evite riscos e garanta uma boa experiencia.</p>
            </div>
            <div className="legal-card-stack">
              {termsRules.map((item) => (
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
              <span>Cancelamento e atualizacoes</span>
              <h2>Transparencia em toda a jornada.</h2>
              <p>Voce mantem controle sobre plano e uso.</p>
            </div>
            <div className="legal-card-stack">
              {termsUpdates.map((item) => (
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
            <span className="marketing-eyebrow">Duvidas?</span>
            <h2>Fale com nosso suporte</h2>
            <p>Equipe pronta para ajudar em qualquer etapa.</p>
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


