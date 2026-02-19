'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import UserScopePicker from '@/components/data/UserScopePicker';
import { formatDate, useCollectionData, useUserScope } from '@/lib/firestoreHooks';
import { useAuth } from '@/lib/auth';
import {
  getEvaluationStatusColor,
  getEvaluationStatusLabel,
  getEvaluationTypeLabel,
} from '@/lib/services/evaluations';
import type { EvaluationStatus, EvaluationType } from '@/lib/types/evaluation';

interface EvaluationRow {
  id: string;
  createdAt?: any;
  data?: any;
  status?: string;
  date?: any;
  prazoResposta?: any;
}

type FilterId = 'all' | EvaluationType;

const filterOptions: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'online', label: 'Online' },
  { id: 'postural', label: 'Postural' },
  { id: 'personalizada', label: 'Personalizada' },
  { id: 'fisica', label: 'Fisica' },
];

const evaluationAreas = [
  {
    title: 'Avaliacao online',
    text: 'Medidas, fotos e observacoes para evolucao.',
    href: '/evaluations/online',
    type: 'online' as EvaluationType,
  },
  {
    title: 'Avaliacao postural',
    text: 'Fotos, observacoes e analise tecnica do aluno.',
    href: '/evaluations/postural',
    type: 'postural' as EvaluationType,
  },
  {
    title: 'Avaliacao personalizada',
    text: 'Questionarios, metas e feedback com o aluno.',
    href: '/evaluations/personalizada',
    type: 'personalizada' as EvaluationType,
  },
  {
    title: 'Avaliacao fisica',
    text: 'Medidas, composicao corporal e performance.',
    href: '/evaluations/fisica',
    type: 'fisica' as EvaluationType,
  },
  {
    title: 'Ultima avaliacao',
    text: 'Resumo rapido do ultimo registro.',
    href: '/evaluations/ultima',
    type: 'personalizada' as EvaluationType,
    tag: 'Resumo',
  },
];

const toDateValue = (value?: any) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeStatus = (status?: string): EvaluationStatus => {
  const options: EvaluationStatus[] = [
    'pendente',
    'agendada',
    'em_andamento',
    'concluida',
    'cancelada',
    'nao_realizada',
  ];
  if (status && options.includes(status as EvaluationStatus)) {
    return status as EvaluationStatus;
  }
  return 'pendente';
};

export default function EvaluationsPage() {
  const { userId } = useUserScope();
  const router = useRouter();
  const { role } = useAuth();
  const isStudent = role === 'aluno';
  const online = useCollectionData<EvaluationRow>(['users', userId, 'avaliacaoOnline']);
  const postural = useCollectionData<EvaluationRow>(['users', userId, 'avaliacaoPostural']);
  const personalizada = useCollectionData<EvaluationRow>(['users', userId, 'avaliacaoPersonalizada']);
  const fisica = useCollectionData<EvaluationRow>(['users', userId, 'avaliacoesFisicas']);
  const [selectedFilter, setSelectedFilter] = useState<FilterId>('all');
  const assistantPrompts = [
    'Crie uma avaliacao postural para aluno iniciante.',
    'Monte uma avaliacao fisica com foco em forca.',
    'Prepare perguntas para avaliacao personalizada.',
  ];

  const evaluationItems = useMemo(() => {
    const collections: Array<{ type: EvaluationType; rows: EvaluationRow[] }> = [
      { type: 'online', rows: online.data },
      { type: 'postural', rows: postural.data },
      { type: 'personalizada', rows: personalizada.data },
      { type: 'fisica', rows: fisica.data },
    ];

    return collections
      .flatMap((collection) =>
        (collection.rows || []).map((row) => {
          const dateValue = row.prazoResposta ?? row.date ?? row.createdAt ?? row.data;
          const dateLabel = dateValue ? formatDate(dateValue) : '-';
          const detail = row.prazoResposta ? `Prazo: ${dateLabel}` : `Criada em ${dateLabel}`;
          const status = normalizeStatus(row.status);
          return {
            id: `${collection.type}-${row.id}`,
            type: collection.type,
            typeLabel: getEvaluationTypeLabel(collection.type),
            status,
            statusLabel: getEvaluationStatusLabel(status),
            statusColor: getEvaluationStatusColor(status),
            detail,
            date: toDateValue(dateValue),
            dateLabel,
            href: `/evaluations/${row.id}?type=${collection.type}`,
          };
        })
      )
      .sort((a, b) => (b.date?.getTime?.() || 0) - (a.date?.getTime?.() || 0));
  }, [fisica.data, online.data, personalizada.data, postural.data]);

  const filteredEvaluations = useMemo(() => {
    if (selectedFilter === 'all') return evaluationItems;
    return evaluationItems.filter((item) => item.type === selectedFilter);
  }, [evaluationItems, selectedFilter]);

  const totalCount = evaluationItems.length;
  const latestEvaluation = evaluationItems[0];
  const handleAssistantPrompt = (prompt: string) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('mh-assistant-prompt', prompt);
    }
    router.push('/ai/assistant');
  };

  if (isStudent) {
    return (
      <section className="student-evaluations">
        <div className="student-eval-hero">
          <div>
            <p className="student-eval-kicker">Avaliacoes</p>
            <h1>Seu historico completo</h1>
            <p className="student-eval-sub">
              Acompanhe sua evolucao e os registros enviados pelo personal.
            </p>
          </div>
        </div>

        <div className="student-eval-filters">
          {filterOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`student-eval-chip${selectedFilter === option.id ? ' is-active' : ''}`}
              onClick={() => setSelectedFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="student-eval-list">
          {!userId ? (
            <div className="student-empty-state">
              <p>Entre na sua conta para ver as avaliacoes.</p>
            </div>
          ) : filteredEvaluations.length ? (
            filteredEvaluations.map((item) => (
              <Link key={item.id} href={item.href} className="student-eval-item">
                <div className="student-eval-icon" data-type={item.type}>
                  {item.typeLabel.charAt(0)}
                </div>
                <div className="student-eval-body">
                  <div className="student-eval-title-row">
                    <strong>Avaliacao {item.typeLabel}</strong>
                    <span
                      className="student-eval-status"
                      style={{ backgroundColor: `${item.statusColor}1F`, color: item.statusColor }}
                    >
                      {item.statusLabel}
                    </span>
                  </div>
                  <div className="student-eval-meta">
                    <span className="student-eval-date">{item.dateLabel || '-'}</span>
                  </div>
                </div>
                <span className="student-eval-arrow">›</span>
              </Link>
            ))
          ) : (
            <div className="student-empty-state">
              <p>Nenhuma avaliacao encontrada.</p>
              <Link href="/chat" className="student-inline-button">
                Falar com personal
              </Link>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <PageShell
      title="Avaliacoes"
      description="Avaliacoes postural, fisica e personalizada em um unico painel."
    >
      <UserScopePicker />

      <div className="evaluations-layout">
        <div className="portal-card portal-card--highlight evaluations-hero">
          <div className="evaluations-hero-copy">
            <p className="portal-pill">Monitoramento completo</p>
            <h2>Controle a evolucao do aluno com avaliacoes bem organizadas.</h2>
            <p className="subtle">
              Centralize avaliacoes, acompanhe status e gere insights para orientar cada aluno.
            </p>
            <div className="evaluations-hero-actions">
              <Link href="/evaluations/create" className="button">
                Nova avaliacao
              </Link>
              <Link href="/progress" className="button secondary">
                Abrir progresso
              </Link>
            </div>
          </div>
          <div className="portal-metrics evaluations-metrics">
            <div className="portal-metric-card">
              <strong>{totalCount}</strong>
              <span>Total de avaliacoes</span>
            </div>
            <div className="portal-metric-card">
              <strong>{online.data.length}</strong>
              <span>Avaliacao online</span>
            </div>
            <div className="portal-metric-card">
              <strong>{postural.data.length}</strong>
              <span>Avaliacao postural</span>
            </div>
            <div className="portal-metric-card">
              <strong>{personalizada.data.length}</strong>
              <span>Avaliacao personalizada</span>
            </div>
            <div className="portal-metric-card">
              <strong>{fisica.data.length}</strong>
              <span>Avaliacao fisica</span>
            </div>
            <div className="portal-metric-card">
              <strong>{latestEvaluation ? formatDate(latestEvaluation.date) : '-'}</strong>
              <span>Ultima atualizacao</span>
            </div>
          </div>
        </div>

        <div className="portal-grid portal-grid--2 evaluations-top-grid">
          <div className="portal-card evaluations-filter-card">
            <div className="evaluations-filter-header">
              <div>
                <h3>Filtrar avaliacoes</h3>
                <p className="subtle">Escolha o tipo para focar no que importa.</p>
              </div>
              <Link href="/evaluations/create" className="button secondary sm">
                Nova
              </Link>
            </div>
            <div className="evaluations-filter-chips">
              {filterOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`evaluation-chip${selectedFilter === option.id ? ' is-active' : ''}`}
                  onClick={() => setSelectedFilter(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="portal-card evaluations-assistant-card">
            <div>
              <p className="pill">MH Assistente</p>
              <h3>Gere avaliacoes com IA</h3>
              <p className="subtle" style={{ marginTop: 6 }}>
                Descreva o objetivo e monte avaliacao personalizada em segundos.
              </p>
            </div>
            <div className="evaluations-assistant-actions">
              <button type="button" className="button" onClick={() => router.push('/ai/assistant')}>
                Abrir assistente
              </button>
              <Link href="/evaluations/create" className="button secondary">
                Criar manualmente
              </Link>
            </div>
            <div className="evaluations-assistant-prompts">
              {assistantPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="evaluations-assistant-chip"
                  onClick={() => handleAssistantPrompt(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="portal-card evaluations-areas">
          <div className="evaluations-card-header">
            <div>
              <h3>Tipos de avaliacao</h3>
              <p className="subtle">Acesse rapidamente cada fluxo de avaliacao.</p>
            </div>
          </div>
          <div className="portal-grid portal-grid--2 evaluations-areas-grid">
            {evaluationAreas.map((area) => (
              <Link key={area.title} href={area.href} className="evaluations-area-card">
                <span className="portal-pill">{area.tag || getEvaluationTypeLabel(area.type)}</span>
                <strong>{area.title}</strong>
                <span className="evaluations-area-text">{area.text}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="portal-card evaluations-list-card">
          <div className="evaluations-card-header">
            <div>
              <h3>Historico recente</h3>
              <p className="subtle">
                {selectedFilter === 'all'
                  ? 'Ultimas avaliacoes registradas.'
                  : `Ultimas avaliacoes do tipo ${getEvaluationTypeLabel(selectedFilter)}.`}
              </p>
            </div>
            <Link href="/evaluations/ultima" className="button secondary sm">
              Ver resumo
            </Link>
          </div>

          {!userId ? (
            <div className="portal-empty">
              <strong>Informe um UID para listar avaliacoes.</strong>
              <span>Use o filtro acima para carregar as subcolecoes do aluno.</span>
            </div>
          ) : filteredEvaluations.length ? (
            <ul className="portal-list evaluations-list">
              {filteredEvaluations.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className="portal-list-item evaluations-item">
                    <div className="portal-avatar evaluations-icon" data-type={item.type}>
                      {item.typeLabel.charAt(0)}
                    </div>
                    <div className="portal-list-body">
                      <strong>{item.typeLabel}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <span
                      className="portal-status evaluation-status"
                      style={{ backgroundColor: `${item.statusColor}1F`, color: item.statusColor }}
                    >
                      {item.statusLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="portal-empty">
              <strong>Nenhuma avaliacao encontrada.</strong>
              <span>Crie uma nova avaliacao para acompanhar o progresso do aluno.</span>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
