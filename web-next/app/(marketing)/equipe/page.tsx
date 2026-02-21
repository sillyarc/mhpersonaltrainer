import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMarketingMetadata } from '@/lib/seo';
import MobileAwareLink from '@/components/MobileAwareLink';

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Equipe MH Personal Trainer',
  description: 'Conheca a equipe por tras do MH Personal Trainer e o foco em produto, suporte e resultado.',
  path: '/equipe',
  keywords: [
    'equipe mh personal trainer',
    'time fitness tech',
    'suporte personal trainer'
  ],
});
const team = [
  {
    name: 'Marina H.',
    role: 'Head de Produto',
    bio: 'Traduz a rotina do personal em fluxos simples e claros.',
  },
  {
    name: 'Lucas M.',
    role: 'Tech Lead',
    bio: 'Integra web e mobile com foco em performance.',
  },
  {
    name: 'Rafael D.',
    role: 'Coach de Performance',
    bio: 'Ajusta treinos, metas e indicadores de resultado.',
  },
  {
    name: 'Aline P.',
    role: 'CX e Suporte',
    bio: 'Onboarding, suporte humano e acompanhamento diario.',
  },
];

const values = [
  {
    title: 'Clareza',
    text: 'Interfaces que ajudam o aluno a treinar e o personal a acompanhar.',
  },
  {
    title: 'Resultado',
    text: 'Tudo o que medimos vira decisao para o personal e para a academia.',
  },
  {
    title: 'Parceria',
    text: 'Acompanhamos cada etapa da implantacao e evolucao do sistema.',
  },
];

export default function EquipePage() {
  return (
    <div className="marketing-page">
      <section className="marketing-hero marketing-hero--compact">
        <div className="container marketing-hero-grid">
          <div className="marketing-hero-copy">
            <span className="marketing-eyebrow">Nossa equipe</span>
            <h1>Gente que entende a rotina de alunos, personais e academias.</h1>
            <p className="marketing-lead">
              Time multidisciplinar focado em produto, tecnologia e suporte. Nosso objetivo e tornar o treino mais
              simples, previsivel e escalavel.
            </p>
            <div className="marketing-cta-row">
              <MobileAwareLink href="/register" mobilePath="/register" className="marketing-button">
                Criar conta
              </MobileAwareLink>
              <Link href="/beneficios" className="marketing-button ghost">
                Ver beneficios
              </Link>
            </div>
          </div>
          <div className="marketing-hero-panel">
            <div className="marketing-hero-panel-card">
              <span className="marketing-panel-title">Suporte humano</span>
              <p>Onboarding guiado, respostas rapidas e acompanhamento continuo.</p>
            </div>
            <div className="marketing-hero-panel-card">
              <span className="marketing-panel-title">Produto evolutivo</span>
              <p>Atualizacoes constantes em web, Android e iOS.</p>
            </div>
            <div className="marketing-hero-panel-card">
              <span className="marketing-panel-title">Resultados claros</span>
              <p>Indicadores que ajudam academia e personal a decidir.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="container">
          <div className="marketing-section-head">
            <span className="marketing-eyebrow">Nosso jeito de trabalhar</span>
            <h2>Valores que orientam cada entrega</h2>
            <p>O que fazemos e sempre pensado para reduzir atrito na operacao.</p>
          </div>
          <div className="marketing-feature-grid">
            {values.map((value) => (
              <div key={value.title} className="marketing-feature-card">
                <h3>{value.title}</h3>
                <p>{value.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section marketing-surface">
        <div className="container">
          <div className="marketing-section-head">
            <span className="marketing-eyebrow">Equipe dedicada</span>
            <h2>Especialistas em produto, treino e experiencia digital</h2>
            <p>Um time enxuto e focado em resultados reais para nossos clientes.</p>
          </div>
          <div className="marketing-team-grid">
            {team.map((member) => (
              <div key={member.name} className="marketing-team-card">
                <span className="marketing-team-role">{member.role}</span>
                <h3>{member.name}</h3>
                <p>{member.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-cta">
        <div className="container marketing-cta-inner">
          <div>
            <span className="marketing-eyebrow">Vamos conversar</span>
            <h2>Pronto para levar o MH para sua operacao?</h2>
            <p>Crie sua conta e tenha a equipe ao seu lado desde o primeiro dia.</p>
          </div>
          <div className="marketing-cta-row">
            <MobileAwareLink href="/register" mobilePath="/register" className="marketing-button">
              Criar conta
            </MobileAwareLink>
            <MobileAwareLink href="/login" mobilePath="/login" className="marketing-button ghost">
              Entrar
            </MobileAwareLink>
          </div>
        </div>
      </section>
    </div>
  );
}


