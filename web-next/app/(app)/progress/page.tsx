'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import AiInsightsPanel from '@/components/AiInsightsPanel';
import UserScopePicker from '@/components/data/UserScopePicker';
import {
  firestoreHelpers,
  formatDate,
  useCollectionData,
  useDocumentData,
  useUserScope,
} from '@/lib/firestoreHooks';
import { fetchEvaluations, getEvaluationStatusLabel, getEvaluationTypeLabel } from '@/lib/services/evaluations';
import { fetchUserWorkouts } from '@/lib/services/workouts';
import { useAuth } from '@/lib/auth';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import type { PhysicalEvaluation } from '@/lib/types/evaluation';
import type { UserWorkout } from '@/lib/types/workout';

const IconArrowLeft = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

function StudentProgress() {
  const router = useRouter();
  const { treinos, avaliacoes, stats, loading, hasLoadedOnce, error } = useDashboardData();

  const workoutsSorted = useMemo(() => {
    const copy = [...treinos];
    copy.sort((a, b) => {
      const aDate = a.lastCompletedAt || a.dataCriacao;
      const bDate = b.lastCompletedAt || b.dataCriacao;
      return (bDate?.getTime?.() || 0) - (aDate?.getTime?.() || 0);
    });
    return copy;
  }, [treinos]);
  const recentWorkouts = useMemo(() => workoutsSorted.slice(0, 5), [workoutsSorted]);

  const evaluationsSorted = useMemo(() => {
    const copy = [...avaliacoes];
    copy.sort((a, b) => (b.data?.getTime?.() || 0) - (a.data?.getTime?.() || 0));
    return copy;
  }, [avaliacoes]);
  const recentEvaluations = useMemo(() => evaluationsSorted.slice(0, 5), [evaluationsSorted]);

  const completionRate = Number.isFinite(stats.taxaConclusao) ? Math.round(stats.taxaConclusao) : 0;

  const getEvaluationLabel = (type?: string) => {
    if (!type) return 'Avaliacao';
    if (type === 'online' || type === 'postural' || type === 'personalizada' || type === 'fisica') {
      return getEvaluationTypeLabel(type);
    }
    return type;
  };

  if (loading && !hasLoadedOnce) {
    return (
      <section className="student-progress">
        <div className="student-loading">
          <p className="student-home-kicker">Carregando progresso</p>
          <p className="student-home-sub">Buscando seus dados.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="student-progress">
      <header className="student-workout-detail-header">
        <button type="button" className="student-workout-back" onClick={() => router.back()} aria-label="Voltar">
          <IconArrowLeft />
        </button>
        <div className="student-workout-title">
          <strong>Meu progresso</strong>
          <span>Resumo dos treinos e avaliacoes recentes</span>
        </div>
        <div className="student-workout-header-spacer" />
      </header>

      {error && (
        <div className="student-banner">
          <p>{error}</p>
        </div>
      )}

      <div className="student-progress-card">
        <div className="student-progress-row">
          <div className="student-progress-metric">
            <strong>{stats.totalTreinos}</strong>
            <span>Treinos</span>
          </div>
          <div className="student-progress-metric">
            <strong>{stats.treinosConcluidos}</strong>
            <span>Concluidos</span>
          </div>
        </div>
        <div className="student-progress-row">
          <div className="student-progress-metric">
            <strong>{stats.sequenciaAtual}</strong>
            <span>Sequencia</span>
          </div>
          <div className="student-progress-metric">
            <strong>{completionRate}%</strong>
            <span>Taxa</span>
          </div>
        </div>
      </div>

      <section className="student-section">
        <div className="student-section-header">
          <h2>Ultimos treinos</h2>
          <Link href="/workouts" className="student-link">
            Ver todos
          </Link>
        </div>
        {recentWorkouts.length ? (
          <div className="student-list">
            {recentWorkouts.map((treino) => {
              const workoutDate = treino.lastCompletedAt || treino.dataCriacao;
              const statusLabel = treino.concluido ? 'Concluido' : 'Em andamento';
              return (
                <Link key={treino.id} href={`/workout/${treino.id}`} className="student-list-item">
                  <div>
                    <strong>{treino.nome || 'Treino'}</strong>
                    <span>{treino.tipo || 'Treino'}</span>
                  </div>
                  <div className="student-list-meta">
                    <span>{statusLabel}</span>
                    <strong>{workoutDate ? formatDate(workoutDate) : '-'}</strong>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="student-empty-state">
            <p>Nenhum treino encontrado.</p>
            <Link href="/chat" className="student-inline-button">
              Falar com personal
            </Link>
          </div>
        )}
      </section>

      <section className="student-section">
        <div className="student-section-header">
          <h2>Avaliacoes recentes</h2>
          <Link href="/evaluations" className="student-link">
            Ver todas
          </Link>
        </div>
        {recentEvaluations.length ? (
          <div className="student-list">
            {recentEvaluations.map((avaliacao) => (
              <Link
                key={avaliacao.id}
                href={`/evaluations/${avaliacao.id}?type=${avaliacao.tipo}`}
                className="student-list-item"
              >
                <div>
                  <strong>Avaliacao {getEvaluationLabel(avaliacao.tipo)}</strong>
                  <span>Registro recente</span>
                </div>
                <div className="student-list-meta">
                  <span>Data</span>
                  <strong>{avaliacao.data ? formatDate(avaliacao.data) : '-'}</strong>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="student-empty-state">
            <p>Nenhuma avaliacao encontrada.</p>
            <Link href="/chat" className="student-inline-button">
              Falar com personal
            </Link>
          </div>
        )}
      </section>
    </section>
  );
}

interface ProgressRow {
  id: string;
  date?: any;
  completed?: boolean;
  workoutId?: string;
}

interface StudentDoc {
  display_name?: string;
  email?: string;
  photo_url?: string;
}

function PersonalProgress() {
  const { userId } = useUserScope();
  const router = useRouter();
  const { data: student } = useDocumentData<StudentDoc>(['users', userId]);
  const query = useMemo(
    () => (userId ? [firestoreHelpers.where('userId', '==', userId), firestoreHelpers.orderBy('date', 'desc')] : []),
    [userId]
  );
  const { data: logs, loading: logsLoading } = useCollectionData<ProgressRow>(['workout_logs'], query);
  const [workouts, setWorkouts] = useState<UserWorkout[]>([]);
  const [evaluations, setEvaluations] = useState<PhysicalEvaluation[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [workoutError, setWorkoutError] = useState('');
  const [evaluationError, setEvaluationError] = useState('');

  const assistantPrompts = [
    'Resuma o progresso do aluno nos ultimos 30 dias.',
    'Sugira ajustes de treinos com base nas avaliacoes recentes.',
    'Crie metas semanais de acordo com o desempenho atual.',
  ];

  useEffect(() => {
    let active = true;
    if (!userId) {
      setWorkouts([]);
      setEvaluations([]);
      setWorkoutError('');
      setEvaluationError('');
      return () => {
        active = false;
      };
    }

    setDataLoading(true);
    setWorkoutError('');
    setEvaluationError('');

    Promise.all([fetchUserWorkouts(userId, false), fetchEvaluations(userId)])
      .then(([workoutResult, evaluationResult]) => {
        if (!active) return;
        if (workoutResult.error) {
          setWorkoutError(workoutResult.error);
        }
        if (evaluationResult.error) {
          setEvaluationError(evaluationResult.error);
        }
        setWorkouts(workoutResult.data || []);
        setEvaluations(evaluationResult.data || []);
      })
      .finally(() => {
        if (active) setDataLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const studentLabel = student?.display_name || student?.email || 'Aluno';
  const workoutsSorted = useMemo(() => {
    const copy = [...workouts];
    copy.sort((a, b) => {
      const aDate = a.lastCompletedAt || a.updatedAt || a.createdAt;
      const bDate = b.lastCompletedAt || b.updatedAt || b.createdAt;
      return (bDate?.getTime?.() || 0) - (aDate?.getTime?.() || 0);
    });
    return copy;
  }, [workouts]);
  const recentWorkouts = useMemo(() => workoutsSorted.slice(0, 4), [workoutsSorted]);
  const totalExercises = useMemo(
    () => workouts.reduce((total, workout) => total + (workout.treino?.length || 0), 0),
    [workouts]
  );
  const workoutMap = useMemo(() => {
    const map = new Map<string, string>();
    workouts.forEach((workout) => {
      map.set(workout.id, workout.nomeDoTreino || 'Treino');
    });
    return map;
  }, [workouts]);

  const evaluationItems = useMemo(() => {
    const items = evaluations.map((evaluation) => {
      const status = evaluation.status || 'concluida';
      return {
        id: `${evaluation.type}-${evaluation.id}`,
        type: evaluation.type,
        typeLabel: getEvaluationTypeLabel(evaluation.type),
        status,
        statusLabel: getEvaluationStatusLabel(status),
        date: evaluation.date,
        href: `/evaluations/${evaluation.id}?type=${evaluation.type}`,
      };
    });
    items.sort((a, b) => (b.date?.getTime?.() || 0) - (a.date?.getTime?.() || 0));
    return items;
  }, [evaluations]);
  const recentEvaluations = useMemo(() => evaluationItems.slice(0, 4), [evaluationItems]);

  const completedLogs = useMemo(
    () => logs.filter((log) => log.completed).length,
    [logs]
  );
  const completionRate = logs.length ? Math.round((completedLogs / logs.length) * 100) : 0;
  const lastCheckin = logs[0]?.date;
  const lastEvaluation = evaluationItems[0]?.date;
  const recentLogs = useMemo(() => logs.slice(0, 6), [logs]);

  const handleAssistantPrompt = (prompt: string) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('mh-assistant-prompt', prompt);
    }
    router.push('/ai/assistant');
  };

  return (
    <PageShell
      title="Progresso"
      description="Evolucao de cargas, medidas e metas do aluno."
      breadcrumbs={[{ label: 'Avaliacoes', href: '/evaluations' }]}
    >
      <UserScopePicker />
      <div className="progress-layout">
        <section className="portal-card portal-card--highlight progress-hero">
          <div className="progress-hero-main">
            <div className="progress-hero-copy">
              <p className="portal-pill">Visao completa</p>
              <h2>Progresso do aluno em um painel unico.</h2>
              <p className="subtle">
                Treinos, avaliacoes, check-ins e recomendacoes do assistente em um so lugar.
              </p>
              <div className="progress-hero-profile">
                <div className="progress-avatar">
                  {student?.photo_url ? (
                    <img src={student.photo_url} alt={studentLabel} />
                  ) : (
                    <span>{studentLabel.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <strong>{studentLabel}</strong>
                  <span className="subtle">{userId ? `UID ${userId}` : 'Selecione um aluno'}</span>
                </div>
              </div>
              <div className="progress-hero-actions">
                <Link href="/workouts" className="button">
                  Ver treinos
                </Link>
                <Link href="/evaluations" className="button secondary">
                  Ver avaliacoes
                </Link>
                <Link href="/ai/assistant" className="button secondary">
                  Abrir assistente
                </Link>
              </div>
            </div>
            <div className="portal-metrics progress-hero-metrics">
              <div className="portal-metric-card">
                <strong>{workouts.length}</strong>
                <span>Treinos ativos</span>
              </div>
              <div className="portal-metric-card">
                <strong>{totalExercises}</strong>
                <span>Exercicios cadastrados</span>
              </div>
              <div className="portal-metric-card">
                <strong>{evaluationItems.length}</strong>
                <span>Avaliacoes</span>
              </div>
              <div className="portal-metric-card">
                <strong>{logs.length}</strong>
                <span>Check-ins</span>
              </div>
              <div className="portal-metric-card">
                <strong>{completionRate}%</strong>
                <span>Taxa de conclusao</span>
              </div>
              <div className="portal-metric-card">
                <strong>{lastCheckin ? formatDate(lastCheckin) : '-'}</strong>
                <span>Ultimo check-in</span>
              </div>
            </div>
          </div>
        </section>

        <div className="progress-grid">
          <div className="progress-main">
            <div className="portal-card progress-card progress-card--workouts">
              <div className="progress-card-header">
                <div>
                  <h3>Treinos recentes</h3>
                  <p className="subtle">Planos ativos e ultimas atualizacoes.</p>
                </div>
                <Link href="/workouts" className="button secondary sm">
                  Ver todos
                </Link>
              </div>
              {dataLoading && userId && <p className="subtle">Carregando treinos...</p>}
              {workoutError && <p className="subtle">{workoutError}</p>}
              {!userId && <p className="subtle">Informe um UID para carregar treinos.</p>}
              {userId && !dataLoading && !recentWorkouts.length && !workoutError && (
                <p className="subtle">Nenhum treino encontrado.</p>
              )}
              {recentWorkouts.length > 0 && (
                <div className="progress-list">
                  {recentWorkouts.map((workout) => {
                    const workoutDate = workout.lastCompletedAt || workout.updatedAt || workout.createdAt;
                    return (
                      <Link
                        key={workout.id}
                        href={`/workout/${workout.id}?studentId=${userId}`}
                        className="progress-list-item"
                      >
                        <div>
                          <strong>{workout.nomeDoTreino || 'Treino'}</strong>
                          <p className="subtle">
                            {workout.treino?.length || 0} exercicios -{' '}
                            {workout.diasDaSemana?.length ? workout.diasDaSemana.join(', ') : 'Sem agenda'}
                          </p>
                        </div>
                        <div className="progress-meta">
                          <span>Atualizado</span>
                          <strong>{workoutDate ? formatDate(workoutDate) : '-'}</strong>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="portal-card progress-card progress-card--evaluations">
              <div className="progress-card-header">
                <div>
                  <h3>Avaliacoes recentes</h3>
                  <p className="subtle">Historico de avaliacoes e status atual.</p>
                </div>
                <Link href="/evaluations" className="button secondary sm">
                  Ver todas
                </Link>
              </div>
              {dataLoading && userId && <p className="subtle">Carregando avaliacoes...</p>}
              {evaluationError && <p className="subtle">{evaluationError}</p>}
              {!userId && <p className="subtle">Informe um UID para carregar avaliacoes.</p>}
              {userId && !dataLoading && !recentEvaluations.length && !evaluationError && (
                <p className="subtle">Nenhuma avaliacao encontrada.</p>
              )}
              {recentEvaluations.length > 0 && (
                <div className="progress-list">
                  {recentEvaluations.map((evaluation) => (
                    <Link key={evaluation.id} href={evaluation.href} className="progress-list-item">
                      <div>
                        <strong>{evaluation.typeLabel}</strong>
                        <p className="subtle">Registro: {formatDate(evaluation.date)}</p>
                      </div>
                      <div className="progress-meta">
                        <span className={`progress-status is-${evaluation.status}`}>
                          {evaluation.statusLabel}
                        </span>
                        <strong>{formatDate(evaluation.date)}</strong>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="portal-card progress-card progress-card--logs">
              <div className="progress-card-header">
                <div>
                  <h3>Logs de treino</h3>
                  <p className="subtle">Check-ins e presenca nas rotinas.</p>
                </div>
                <div className="progress-inline-metrics">
                  <div>
                    <span>Concluidos</span>
                    <strong>{completedLogs}</strong>
                  </div>
                  <div>
                    <span>Ultima avaliacao</span>
                    <strong>{lastEvaluation ? formatDate(lastEvaluation) : '-'}</strong>
                  </div>
                </div>
              </div>
              {logsLoading && userId && <p className="subtle">Carregando logs...</p>}
              {!userId && <p className="subtle">Informe um UID para listar o progresso.</p>}
              {userId && !logsLoading && !recentLogs.length && (
                <p className="subtle">Nenhum log encontrado.</p>
              )}
              {recentLogs.length > 0 && (
                <div className="progress-log-list">
                  {recentLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`progress-log-item ${log.completed ? 'is-done' : 'is-pending'}`}
                    >
                      <div>
                        <strong>{workoutMap.get(log.workoutId || '') || 'Treino'}</strong>
                        <p className="subtle">
                          {log.completed ? 'Concluido' : 'Em andamento'} -{' '}
                          {log.date ? formatDate(log.date) : '-'}
                        </p>
                      </div>
                      <div className="progress-meta">
                        <span>{log.completed ? 'Concluido' : 'Pendente'}</span>
                        <strong>{log.date ? formatDate(log.date) : '-'}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="progress-side">
            <AiInsightsPanel
              className="progress-assistant"
              initialStudentId={userId}
              studentLabel={studentLabel}
              lockStudent
            />
            <div className="portal-card progress-card progress-card--assistant">
              <div className="progress-card-header">
                <div>
                  <p className="portal-pill">Assistente</p>
                  <h3>Planos e orientacoes automaticas</h3>
                  <p className="subtle">
                    Gere resumos, metas e proximos passos com base no historico do aluno.
                  </p>
                </div>
                <Link href="/ai/assistant" className="button secondary sm">
                  Abrir
                </Link>
              </div>
              <div className="progress-assistant-prompts">
                {assistantPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="progress-assistant-chip"
                    onClick={() => handleAssistantPrompt(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export default function ProgressPage() {
  const { role } = useAuth();

  if (role === 'aluno') {
    return <StudentProgress />;
  }

  return <PersonalProgress />;
}
