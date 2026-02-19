import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { buildMarketingMetadata } from '@/lib/seo';

import appPreviewAlt from '@/assets/Design-sem-nome-49-scaled.webp';
import personalPreview from '@/assets/3[1].jpg';
import studentPreview from '@/assets/4[1].jpg';

import styles from './page.module.css';

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Sistema para academia com gestao de equipe e alunos',
  description: 'Gestao de academia com painel em tempo real para alunos, personais, check-ins, comunicacao e financeiro.',
  path: '/academia',
  keywords: [
    'sistema para academia',
    'software academia',
    'gestao de academia',
    'check-in academia',
    'painel academia'
  ],
});
const kpis = [
  { value: '360deg', label: 'Visao da operacao' },
  { value: 'Tempo real', label: 'Presenca, equipe e caixa' },
  { value: '1 ecossistema', label: 'Academia, personal e aluno' },
];

const features = [
  {
    title: 'Gestao de alunos e carteira ativa',
    text: 'Acompanhe base ativa, risco de evasao, historico e progresso por aluno sem planilhas paralelas.',
  },
  {
    title: 'Controle de personais e produtividade',
    text: 'Visualize carga de atendimento por profissional, distribuicao de alunos e consistencia de entrega.',
  },
  {
    title: 'Check-in e frequencia inteligente',
    text: 'Monitore movimento da academia e identifique quedas de presenca para agir no momento certo.',
  },
  {
    title: 'Financeiro completo da unidade',
    text: 'Centralize planos, cobrancas, repasses, inadimplencia e previsao para decisao com seguranca.',
  },
  {
    title: 'Comunicacao e relacionamento',
    text: 'Envie avisos por contexto e mantenha alunos e equipe alinhados com menos ruido operacional.',
  },
  {
    title: 'Indicadores para decisao executiva',
    text: 'Transforme dados da rotina em prioridades claras para crescimento, retencao e performance.',
  },
];

const operations = [
  {
    step: '01',
    title: 'Ative o painel da academia',
    text: 'Configure conta administrativa e estrutura da unidade.',
  },
  {
    step: '02',
    title: 'Organize equipe e alunos',
    text: 'Vincule personais, distribua carteiras e padronize o atendimento.',
  },
  {
    step: '03',
    title: 'Escale com dados',
    text: 'Ajuste operacao com indicadores de presenca, produtividade e financeiro.',
  },
];

const showcases = [
  {
    title: 'Painel de comando da academia',
    text: 'Visao executiva para operar a unidade com controle diario.',
    image: appPreviewAlt,
    alt: 'Painel de gestao da academia',
    tag: 'Academia',
  },
  {
    title: 'Rotina integrada do personal',
    text: 'A equipe trabalha no mesmo fluxo e voce acompanha tudo no painel.',
    image: personalPreview,
    alt: 'Tela operacional para personal',
    tag: 'Equipe',
  },
  {
    title: 'Jornada conectada do aluno',
    text: 'Aluno acompanha treino e progresso enquanto a academia mede adesao.',
    image: studentPreview,
    alt: 'Tela do app do aluno',
    tag: 'Aluno',
  },
];

export default function AcademiaPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={`container ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <span className={styles.kicker}>Plataforma para academias</span>
            <h1>Operacao de academia com identidade, controle e crescimento.</h1>
            <p>
              Uma estrutura profissional para gerenciar alunos, personais, check-ins, financeiro e relacionamento em um
              unico sistema.
            </p>
            <div className={styles.actions}>
              <Link href="/register-academy" className={styles.primaryBtn}>
                Criar conta da academia
              </Link>
              <Link href="/academy-login" className={styles.secondaryBtn}>
                Entrar no painel
              </Link>
            </div>
            <div className={styles.kpiGrid}>
              {kpis.map((kpi) => (
                <article key={kpi.label} className={styles.kpiCard}>
                  <strong>{kpi.value}</strong>
                  <span>{kpi.label}</span>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.heroMedia}>
            <div className={styles.mainShot}>
              <Image src={appPreviewAlt} alt="Painel principal da academia" fill priority sizes="(max-width: 980px) 92vw, 520px" />
              <span>Comando da academia</span>
            </div>
            <div className={styles.sideShots}>
              <div className={styles.sideShot}>
                <Image src={personalPreview} alt="Fluxo do personal integrado" fill sizes="(max-width: 980px) 92vw, 240px" />
                <span>Equipe</span>
              </div>
              <div className={styles.sideShot}>
                <Image src={studentPreview} alt="Aplicativo do aluno" fill sizes="(max-width: 980px) 92vw, 240px" />
                <span>Aluno</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>Funcionalidades da academia</span>
            <h2>O que voce ganha no dia a dia da operacao</h2>
          </div>
          <div className={styles.featureGrid}>
            {features.map((feature) => (
              <article key={feature.title} className={styles.featureCard}>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.sectionAlt}>
        <div className="container">
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>Fluxo operacional</span>
            <h2>Implementacao simples para entrar em producao rapido</h2>
          </div>
          <div className={styles.stepsGrid}>
            {operations.map((item) => (
              <article key={item.step} className={styles.stepCard}>
                <span>{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>Ecossistema integrado</span>
            <h2>Academia, personal e aluno no mesmo padrao</h2>
          </div>
          <div className={styles.showcaseGrid}>
            {showcases.map((item) => (
              <article key={item.title} className={styles.showcaseCard}>
                <div className={styles.showcaseMedia}>
                  <Image src={item.image} alt={item.alt} fill sizes="(max-width: 980px) 92vw, 360px" />
                  <span>{item.tag}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.cta}>
        <div className={`container ${styles.ctaInner}`}>
          <div>
            <span className={styles.kicker}>Pronto para escalar a unidade?</span>
            <h2>Leve sua academia para uma operacao mais profissional.</h2>
            <p>Ative o painel e centralize gestao, equipe e resultados com mais clareza.</p>
          </div>
          <div className={styles.actions}>
            <Link href="/register-academy" className={styles.primaryBtn}>
              Criar conta
            </Link>
            <Link href="/academy-login" className={styles.secondaryBtn}>
              Entrar
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}


