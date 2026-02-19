import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

import DesktopExeLoginRedirect from '@/components/DesktopExeLoginRedirect';
import MobileAwareLink from '@/components/MobileAwareLink';
import { SITE_NAME, absoluteUrl, buildMarketingMetadata } from '@/lib/seo';
import personalShot from '@/assets/printsPersonal/Captura de tela 2026-01-28 080653.png';
import personalShotAlt from '@/assets/printsPersonal/Captura de tela 2026-01-28 080325.png';
import academyShot from '@/assets/Design-sem-nome-49-scaled.webp';
import studentShot from '@/assets/4[1].jpg';
import styles from './page.module.css';

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.mycompany.mfitfitnessapp';
const WINDOWS_APP = '/downloads/mh-personal-trainer-setup-8.9.42-111.exe';

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Plataforma fitness para aluno, personal e academia',
  description:
    'Treinos, agenda, avaliacao, chat e financeiro em um unico ecossistema. Use no web, Android e iOS.',
  path: '/',
  keywords: [
    'personal trainer',
    'app personal trainer',
    'software para academia',
    'treino com IA',
    'agenda de personal',
    'gestao de alunos',
  ],
});

const operationCards = [
  {
    title: 'Conversa com contexto',
    text: 'Mensagens, treinos e historico do aluno aparecem juntos para voce agir sem perder tempo.',
  },
  {
    title: 'Avaliacao com continuidade',
    text: 'Postural, fisica e personalizada no mesmo fluxo, com leitura clara da evolucao.',
  },
  {
    title: 'Agenda + financeiro no ciclo',
    text: 'Compromissos, cobrancas e status no mesmo painel para reduzir atraso e retrabalho.',
  },
] as const;

const assistantCards = [
  {
    title: 'Treinos com assistente',
    text: 'Monte rotinas e ajustes com sugestoes inteligentes para acelerar sua tomada de decisao.',
  },
  {
    title: 'Analise de imagem',
    text: 'Leitura postural com checklist visual para apoiar seu parecer tecnico e a conversa com aluno.',
  },
  {
    title: 'Resumo de evolucao',
    text: 'Transforme dados de treino e avaliacao em explicacoes objetivas para manter o aluno engajado.',
  },
  {
    title: 'Mensagens prontas',
    text: 'Gere textos para reengajar alunos, reforcar orientacoes e reduzir evasao.',
  },
  {
    title: 'Agenda inteligente',
    text: 'Priorize atendimentos e avaliacoes com recomendacoes alinhadas ao momento do aluno.',
  },
  {
    title: 'Biblioteca de prompts',
    text: 'Modelos prontos para treino, feedback e comunicacao, tudo dentro do seu painel.',
  },
] as const;

const personalPlans = [
  {
    name: 'Mensal',
    price: 'R$ 30,00/mes',
    note: 'Entrada rapida',
    highlight: true,
  },
  {
    name: 'Bimestral',
    price: 'R$ 54,00/bimestre',
    note: 'Melhor custo mensal',
    highlight: false,
  },
  {
    name: 'Semestral',
    price: 'R$ 150,00/6 meses',
    note: 'Operacao estavel',
    highlight: false,
  },
  {
    name: 'Anual',
    price: 'R$ 300,00/ano',
    note: 'Escala completa',
    highlight: false,
  },
] as const;

const profileCards = [
  {
    title: 'Aluno',
    subtitle: 'Treino guiado no bolso, com progresso visivel',
    channels: ['Android', 'Web mobile'],
    points: [
      'Treino diario com serie, carga e repeticao claras',
      'Check-in rapido para personal acompanhar execucao',
      'Chat direto para tirar duvida e receber ajuste',
    ],
    ctaLabel: 'Baixar no Android',
    ctaHref: PLAY_STORE,
    external: true,
  },
  {
    title: 'Personal',
    subtitle: 'Operacao profissional em qualquer tela',
    channels: ['Windows', 'Web instalavel', 'Web', 'Android', 'Web mobile'],
    points: [
      'Treinos, agenda e avaliacoes no mesmo painel',
      'Assistente inteligente para acelerar criacao e resposta',
      'Financeiro com cobranca, repasse e historico por aluno',
    ],
    ctaLabel: 'Criar conta do personal',
    ctaHref: '/register-personal',
    external: false,
  },
  {
    title: 'Academia',
    subtitle: 'Gestao da equipe e alunos com visao unica',
    channels: ['Windows', 'Web instalavel', 'Web', 'Android', 'Web mobile'],
    points: [
      'Distribuicao de carteira por personal em tempo real',
      'Recepcao, check-ins e status de acesso centralizados',
      'Financeiro e operacao da unidade no mesmo ecossistema',
    ],
    ctaLabel: 'Criar conta da academia',
    ctaHref: '/register-academy',
    external: false,
  },
] as const;

export default function MarketingHome() {
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/icon-512.png'),
    sameAs: [],
  };

  const softwareSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'HealthApplication',
    operatingSystem: 'Web, Android, iOS, Windows',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'BRL',
    },
    url: absoluteUrl('/'),
    image: absoluteUrl('/icon-512.png'),
    description:
      'Plataforma fitness com treinos, agenda, avaliacao, comunicacao e operacao para personal e academia.',
  };
  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <DesktopExeLoginRedirect />

      <section className={styles.hero}>
        <div className={`container ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <span className={styles.kicker}>Plataforma fitness com assistente inteligente</span>
            <h1>Aluno evolui, personal ganha escala e academia opera no controle.</h1>
            <p>
              Um ecossistema unico para treino, avaliacao, conversa, agenda e financeiro. Aluno no Android e web
              mobile. Personal e academia no Windows, web, Android e versao web instalavel como app. iOS em breve.
            </p>

            <div className={styles.heroActions}>
              <a href={PLAY_STORE} target="_blank" rel="noreferrer" className={styles.primaryBtn}>
                Baixar Android
              </a>
              <a href={WINDOWS_APP} download className={styles.secondaryBtn}>
                Baixar Windows
              </a>
              <MobileAwareLink href="/register" mobilePath="/register" className={styles.ghostBtn}>
                Criar conta
              </MobileAwareLink>
            </div>

            <div className={styles.heroPills}>
              <span>Treinos + avaliacoes + agenda + chat</span>
              <span>Assistente ativo no fluxo do personal</span>
              <span>Academia com visao de operacao e equipe</span>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <article className={styles.heroCard}>
              <Image src={personalShot} alt="Painel principal do personal em operacao" fill priority sizes="(max-width: 980px) 92vw, 560px" />
              <span>Painel do personal em atividade</span>
            </article>
            <div className={styles.heroMiniGrid}>
              <article className={styles.heroMiniCard}>
                <Image src={studentShot} alt="Aluno treinando no app mobile" fill sizes="(max-width: 980px) 92vw, 260px" />
                <span>Aluno no app</span>
              </article>
              <article className={styles.heroMiniCard}>
                <Image src={academyShot} alt="Painel da academia com operacao centralizada" fill sizes="(max-width: 980px) 92vw, 260px" />
                <span>Academia conectada</span>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.videoSection} id="demo">
        <div className={`container ${styles.sectionHead}`}>
          <span>Demo do app</span>
          <h2>Veja o ecossistema em acao com a experiencia real da plataforma.</h2>
          <p>
            Um preview direto da interface para mostrar como treino, conversa, avaliacao e acompanhamento ficam
            conectados no uso diario.
          </p>
        </div>

        <div className={`container ${styles.videoGrid}`}>
          <article className={styles.videoCard}>
            <div className={styles.previewImageWrap}>
              <Image
                src={personalShotAlt}
                alt="Preview do painel profissional do app"
                fill
                sizes="(max-width: 980px) 92vw, 860px"
                className={styles.previewImage}
              />
              <span className={styles.previewBadge}>Preview real do painel</span>
            </div>
          </article>

          <aside className={styles.videoSide}>
            <strong>O que voce enxerga no demo</strong>
            <ul>
              <li>Painel do personal com acoes rapidas e leitura clara de status.</li>
              <li>Fluxo do aluno com treino, check-in e troca de mensagens.</li>
              <li>Assistente inteligente apoiando plano, resumo e comunicacao.</li>
              <li>Visao da academia para operacao de equipe e carteira.</li>
            </ul>
            <div className={styles.videoActions}>
              <a href={PLAY_STORE} target="_blank" rel="noreferrer" className={styles.primaryBtn}>
                Testar no Android
              </a>
              <a href={WINDOWS_APP} download className={styles.secondaryBtn}>
                Usar no Windows
              </a>
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.workstationSection} id="workstation">
        <div className={`container ${styles.sectionHead}`}>
          <span>Workstation MH</span>
          <h2>Experiencia de painel desktop para tomar decisao rapida e operar em ritmo alto.</h2>
          <p>
            Visual de aplicacao profissional com leitura instantanea do que ja foi feito, do que esta em risco e do que
            precisa de acao agora.
          </p>
        </div>

        <div className={`container ${styles.workstationGrid}`}>
          <article className={styles.desktopMock}>
            <header className={styles.desktopTop}>
              <span>MH Workstation</span>
              <strong>Online</strong>
            </header>
            <div className={styles.desktopViewport}>
              <Image src={personalShotAlt} alt="Interface do painel profissional no desktop" fill sizes="(max-width: 980px) 92vw, 760px" />
              <div className={styles.desktopOverlay}>
                <p>Fluxo integrado</p>
                <h3>Do planejamento ao acompanhamento do aluno sem trocar de sistema.</h3>
              </div>
            </div>
          </article>

          <aside className={styles.workstationCards}>
            {operationCards.map((item) => (
              <article key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </article>
            ))}
          </aside>
        </div>

        <div className={`container ${styles.flowStrip}`}>
          <div className={styles.flowItem}>Aluno recebe treino e feedback no app</div>
          <div className={styles.flowItem}>Personal acompanha, ajusta e orienta</div>
          <div className={styles.flowItem}>Avaliacao vira plano de acao</div>
          <div className={styles.flowItem}>Academia monitora operacao e resultado</div>
        </div>
      </section>

      <section className={styles.assistantSection} id="assistente">
        <div className={`container ${styles.sectionHead}`}>
          <span>MH Assistente</span>
          <h2>Uma camada inteligente que acelera seu trabalho sem tirar seu controle tecnico.</h2>
          <p>
            O assistente aparece onde voce ja trabalha: treino, avaliacao, agenda, conversa e documentos. Assim sua
            equipe produz mais com qualidade consistente.
          </p>
        </div>

        <div className={`container ${styles.assistantGrid}`}>
          <article className={styles.assistantMain}>
            <p className={styles.assistantLabel}>Assistente em contexto</p>
            <h3>Da pergunta ao plano pronto em poucos cliques.</h3>
            <p>
              Peca sugestoes de treino, resumos de progresso, mensagens para aluno e direcionamentos com base nos dados
              reais da rotina.
            </p>
            <div className={styles.promptRow}>
              <span>"Monte treino para emagrecimento 4x na semana"</span>
              <span>"Resuma evolucao e gere feedback para hoje"</span>
              <span>"Sugira agenda de avaliacoes da semana"</span>
            </div>
          </article>

          <div className={styles.assistantStatCard}>
            <p>Premium</p>
            <strong>IA ilimitada para quem assina</strong>
            <span>Sem premium, o usuario testa com creditos diarios e pode evoluir quando quiser.</span>
            <Link href="/register-personal" className={styles.statCardLink}>
              Ver planos do personal
            </Link>
          </div>
        </div>

        <div className={`container ${styles.assistantCardGrid}`}>
          {assistantCards.map((item) => (
            <article key={item.title} className={styles.assistantCard}>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.plansSection} id="planos">
        <div className={`container ${styles.sectionHead}`}>
          <span>Planos do personal</span>
          <h2>Escolha o ciclo ideal e mantenha o assistente inteligente ativo no seu dia a dia.</h2>
          <p>
            Todos os planos incluem operacao completa do painel. A assinatura Premium desbloqueia IA ilimitada para
            treinos, analises, resumos e comunicacao.
          </p>
        </div>

        <div className={`container ${styles.plansGrid}`}>
          {personalPlans.map((plan) => (
            <article key={plan.name} className={`${styles.planCard} ${plan.highlight ? styles.planFeatured : ''}`}>
              <div className={styles.planHeader}>
                <strong>{plan.name}</strong>
                {plan.highlight && <span>Mais escolhido</span>}
              </div>
              <p className={styles.planPrice}>{plan.price}</p>
              <p className={styles.planNote}>{plan.note}</p>
              <ul className={styles.planList}>
                <li>Treinos, alunos, agenda e financeiro integrados</li>
                <li>Assistente para sugestoes e respostas no painel</li>
                <li>Analise de imagem e resumo de evolucao</li>
              </ul>
              <Link href="/register-personal" className={styles.planLink}>
                Ativar {plan.name}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.profileSection} id="beneficios">
        <div className={`container ${styles.sectionHead}`}>
          <span>Plataforma por publico</span>
          <h2>Cada perfil recebe a experiencia certa, mas todos trabalham conectados.</h2>
          <p>
            O aluno conversa e treina no app. O personal responde, ajusta e avalia no painel. A academia acompanha a
            operacao com visao ampla de equipe, vinculos e indicadores.
          </p>
        </div>

        <div className={`container ${styles.profileGrid}`}>
          {profileCards.map((card) => (
            <article key={card.title} className={styles.profileCard}>
              <div>
                <strong>{card.title}</strong>
                <p>{card.subtitle}</p>
              </div>
              <div className={styles.channelRow}>
                {card.channels.map((channel) => (
                  <span key={`${card.title}-${channel}`}>{channel}</span>
                ))}
              </div>
              <ul>
                {card.points.map((point) => (
                  <li key={`${card.title}-${point}`}>{point}</li>
                ))}
              </ul>
              {card.external ? (
                <a href={card.ctaHref} target="_blank" rel="noreferrer" className={styles.profileLink}>
                  {card.ctaLabel}
                </a>
              ) : (
                <Link href={card.ctaHref} className={styles.profileLink}>
                  {card.ctaLabel}
                </Link>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className={styles.footerCta}>
        <div className={`container ${styles.footerCtaInner}`}>
          <div>
            <span>Comece agora</span>
            <h2>Transforme sua operacao em uma experiencia conectada e inteligente.</h2>
            <p>
              Do primeiro treino ao acompanhamento de evolucao, tudo fica no mesmo ecossistema com velocidade,
              previsibilidade e suporte ao crescimento.
            </p>
          </div>
          <div className={styles.footerCtaActions}>
            <a href={PLAY_STORE} target="_blank" rel="noreferrer" className={styles.primaryBtn}>
              Android
            </a>
            <a href={WINDOWS_APP} download className={styles.secondaryBtn}>
              Windows
            </a>
            <Link href="/login" className={styles.ghostBtn}>
              Entrar
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

