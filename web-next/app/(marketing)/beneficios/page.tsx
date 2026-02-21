import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { buildMarketingMetadata } from '@/lib/seo';
import MobileAwareLink from '@/components/MobileAwareLink';

import heroPhotoTwo from '@/assets/3[1].jpg';
import heroPhotoThree from '@/assets/4[1].jpg';
import appPreviewAlt from '@/assets/Design-sem-nome-49-scaled.webp';

export const metadata: Metadata = buildMarketingMetadata({
  title: 'Beneficios do MH Personal Trainer para aluno, personal e academia',
  description: 'Veja os beneficios da plataforma: treino com IA, agenda, avaliacoes, chat e financeiro integrados.',
  path: '/beneficios',
  keywords: [
    'beneficios personal trainer',
    'treino com ia',
    'agenda fitness',
    'avaliacao fisica app',
    'chat para alunos'
  ],
});
const benefitBlocks = [
  {
    title: 'Aluno engajado',
    text: 'Treino claro, metas visiveis e feedback no ritmo certo.',
    points: ['Treino do dia com check-in rapido.', 'Historico e progresso visivel.', 'Notificacoes e metas claras.'],
  },
  {
    title: 'Personal produtivo',
    text: 'Menos tempo em planilhas, mais tempo com alunos.',
    points: ['IA para montar treinos em minutos.', 'Agenda com confirmacoes automaticas.', 'Relatorios e avaliacoes por aluno.'],
  },
  {
    title: 'Academia no controle',
    text: 'Padronizacao, dados e previsibilidade para a gestao.',
    points: ['Planos, repasses e financeiro em dia.', 'Indicadores de presenca e retencao.', 'Operacao centralizada e padronizada.'],
  },
];

const features = [
  {
    title: 'Treinos com IA + biblioteca',
    text: 'Modelos por objetivo, ajustes rapidos e historico completo.',
  },
  {
    title: 'Agenda inteligente',
    text: 'Aulas, lembretes e reagendamentos automaticos.',
  },
  {
    title: 'Chat e feedbacks',
    text: 'Mensagens diretas e acompanhamento diario.',
  },
  {
    title: 'Avaliacoes e evolucao',
    text: 'Medidas, fotos e metas com comparativos visuais.',
  },
  {
    title: 'Financeiro completo',
    text: 'Planos, pagamentos, repasses e fluxo de caixa.',
  },
  {
    title: 'Dashboards gerenciais',
    text: 'Indicadores de presenca, retencao e produtividade.',
  },
];

export default function BeneficiosPage() {
  return (
    <div className="marketing-page">
      <section className="marketing-hero marketing-hero--compact">
        <div className="container marketing-hero-grid">
          <div className="marketing-hero-copy">
            <span className="marketing-eyebrow">Beneficios do sistema</span>
            <h1>Resultados claros para aluno, personal e academia.</h1>
            <p className="marketing-lead">
              Uma plataforma unica para treinos, agenda, chat, avaliacoes e financeiro. Tudo integrado e pronto para
              escalar.
            </p>
            <div className="marketing-cta-row">
              <MobileAwareLink href="/register" mobilePath="/register" className="marketing-button">
                Criar conta
              </MobileAwareLink>
              <MobileAwareLink href="/login" mobilePath="/login" className="marketing-button ghost">
                Entrar
              </MobileAwareLink>
            </div>
          </div>
          <div className="marketing-hero-media">
            <div className="device-stack device-stack--compact">
              <div className="device-card device-card--tall">
                <Image
                  src={heroPhotoThree}
                  alt="Tela do aluno com treinos e progresso"
                  fill
                  priority
                  sizes="(max-width: 900px) 90vw, 520px"
                />
                <span className="device-label">Aluno</span>
              </div>
              <div className="device-card">
                <Image
                  src={heroPhotoTwo}
                  alt="Tela do personal criando treinos"
                  fill
                  sizes="(max-width: 900px) 90vw, 240px"
                />
                <span className="device-label">Personal</span>
              </div>
              <div className="device-card">
                <Image
                  src={appPreviewAlt}
                  alt="Painel web da academia"
                  fill
                  sizes="(max-width: 900px) 90vw, 240px"
                />
                <span className="device-label">Academia</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="container">
          <div className="marketing-section-head">
            <span className="marketing-eyebrow">Beneficios por perfil</span>
            <h2>O que cada publico ganha com o MH Personal Trainer</h2>
            <p>Experiencias desenhadas para quem treina, para quem orienta e para quem gere.</p>
          </div>
          <div className="marketing-role-grid">
            {benefitBlocks.map((block) => (
              <div key={block.title} className="marketing-role-card">
                <h3>{block.title}</h3>
                <p>{block.text}</p>
                <ul>
                  {block.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section marketing-surface">
        <div className="container">
          <div className="marketing-section-head">
            <span className="marketing-eyebrow">Tudo que esta incluso</span>
            <h2>Funcionalidades completas para a rotina</h2>
            <p>Treinos, agenda, chat, avaliacao e financeiro em um unico fluxo.</p>
          </div>
          <div className="marketing-feature-grid">
            {features.map((item) => (
              <div key={item.title} className="marketing-feature-card">
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-cta">
        <div className="container marketing-cta-inner">
          <div>
            <span className="marketing-eyebrow">Pronto para comecar?</span>
            <h2>Leve o MH Personal Trainer para sua operacao</h2>
            <p>Crie sua conta e organize alunos, treinos e agenda em minutos.</p>
          </div>
          <div className="marketing-cta-row">
            <MobileAwareLink href="/register" mobilePath="/register" className="marketing-button">
              Criar conta
            </MobileAwareLink>
            <Link href="/beneficios" className="marketing-button ghost">
              Voltar ao topo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}


