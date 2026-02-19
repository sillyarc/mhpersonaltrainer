'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { firestoreService, type Aluno } from '@/lib/services/firestoreService';
import { fetchUserWorkouts } from '@/lib/services/workouts';
import { fetchEvaluations, calculateIMC } from '@/lib/services/evaluations';
import { generateStudentEvolutionInsights, type StudentEvolutionInsights } from '@/lib/services/ai';
import { useAiAccessStatus } from '@/lib/hooks/useAiAccessStatus';
import type {
  PhysicalEvaluation,
  OnlineEvaluation,
  PhysicalTestEvaluation,
  PosturalEvaluation,
  PersonalizedEvaluation,
} from '@/lib/types/evaluation';

type WorkoutStats = {
  totalWorkouts: number;
  totalExercises: number;
  topExercises: Array<{ name: string; count: number }>;
};

const buildStats = (workouts: Array<{ treino?: string[]; nomeDoTreino?: string }>): WorkoutStats => {
  const counts = new Map<string, number>();
  let totalExercises = 0;
  workouts.forEach((workout) => {
    (workout.treino || []).forEach((raw) => {
      const name = String(raw || '').trim();
      if (!name) return;
      totalExercises += 1;
      const key = name.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  const topExercises = Array.from(counts.entries())
    .map(([key, count]) => ({ name: key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  return {
    totalWorkouts: workouts.length,
    totalExercises,
    topExercises,
  };
};

const titleCase = (value: string) =>
  value.replace(/\b\w/g, (letter) => letter.toUpperCase());

interface AiInsightsPanelProps {
  initialStudentId?: string;
  studentLabel?: string;
  lockStudent?: boolean;
  className?: string;
}

export default function AiInsightsPanel({
  initialStudentId,
  studentLabel,
  lockStudent = false,
  className,
}: AiInsightsPanelProps) {
  const { user, role } = useAuth();
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedId, setSelectedId] = useState(initialStudentId || '');
  const [evaluations, setEvaluations] = useState<PhysicalEvaluation[]>([]);
  const [stats, setStats] = useState<WorkoutStats | null>(null);
  const [insights, setInsights] = useState<StudentEvolutionInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [insightsError, setInsightsError] = useState('');
  const [insightsLoading, setInsightsLoading] = useState(false);
  const aiAccess = useAiAccessStatus();
  const openRouterKey =
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
  const hasOpenRouter = Boolean(openRouterKey);
  const hasPremiumInsights = aiAccess.premium;

  const sortByDateDesc = (a: PhysicalEvaluation, b: PhysicalEvaluation) =>
    (b.date?.getTime?.() ?? 0) - (a.date?.getTime?.() ?? 0);
  const isOnline = (evaluation: PhysicalEvaluation): evaluation is OnlineEvaluation =>
    evaluation.type === 'online';
  const isFisica = (evaluation: PhysicalEvaluation): evaluation is PhysicalTestEvaluation =>
    evaluation.type === 'fisica';
  const isPostural = (evaluation: PhysicalEvaluation): evaluation is PosturalEvaluation =>
    evaluation.type === 'postural';
  const isPersonalizada = (
    evaluation: PhysicalEvaluation
  ): evaluation is PersonalizedEvaluation => evaluation.type === 'personalizada';

  useEffect(() => {
    let active = true;
    const loadStudents = async () => {
      if (!hasPremiumInsights) return;
      if (!user?.uid || role === 'aluno') return;
      const data = await firestoreService.getAlunosDoPersonal(user.uid);
      if (!active) return;
      setStudents(data);
      if (data.length && !selectedId) {
        setSelectedId(data[0].uid || data[0].id);
      }
    };
    loadStudents();
    return () => {
      active = false;
    };
  }, [hasPremiumInsights, user?.uid, role, selectedId]);

  useEffect(() => {
    if (!initialStudentId) return;
    if (lockStudent || !selectedId) {
      setSelectedId(initialStudentId);
    }
  }, [initialStudentId, lockStudent, selectedId]);

  const selectedStudent = useMemo(
    () => students.find((student) => (student.uid || student.id) === selectedId) || null,
    [students, selectedId]
  );

  useEffect(() => {
    let active = true;
    const loadStats = async () => {
      if (!hasPremiumInsights) {
        setStats(null);
        setEvaluations([]);
        setInsights(null);
        setInsightsError('');
        return;
      }
      if (!selectedId) {
        setStats(null);
        setEvaluations([]);
        setInsights(null);
        setInsightsError('');
        return;
      }
      setError('');
      setLoading(true);
      const [workoutResult, evalResult] = await Promise.all([
        fetchUserWorkouts(selectedId, false),
        fetchEvaluations(selectedId),
      ]);
      if (!active) return;
      if (workoutResult.error) {
        setError(workoutResult.error);
        setStats(null);
      } else {
        const workoutList = workoutResult.data || [];
        setStats(buildStats(workoutList));
      }
      if (evalResult.error) {
        setError(evalResult.error);
        setEvaluations([]);
      } else {
        const items = evalResult.data ? [...evalResult.data] : [];
        items.sort(sortByDateDesc);
        setEvaluations(items);
      }
      setInsights(null);
      setInsightsError('');
      setLoading(false);
    };
    loadStats();
    return () => {
      active = false;
    };
  }, [hasPremiumInsights, selectedId]);

  const evaluationSummary = useMemo(() => {
    const grouped = {
      online: evaluations.filter(isOnline).sort(sortByDateDesc),
      fisica: evaluations.filter(isFisica).sort(sortByDateDesc),
      postural: evaluations.filter(isPostural).sort(sortByDateDesc),
      personalizada: evaluations.filter(isPersonalizada).sort(sortByDateDesc),
    };
    const latest = evaluations[0] || null;
    const lastStamp = evaluations.reduce((max, evaluation) => {
      const stamp = evaluation.updatedAt || evaluation.createdAt || evaluation.date;
      const value = stamp ? stamp.getTime() : 0;
      return Math.max(max, value);
    }, 0);
    return {
      grouped,
      latest,
      lastStamp,
      total: evaluations.length,
    };
  }, [evaluations]);

  const latestOnline = evaluationSummary.grouped.online[0];
  const firstOnline = evaluationSummary.grouped.online[evaluationSummary.grouped.online.length - 1];
  const latestFisica = evaluationSummary.grouped.fisica[0];
  const firstFisica = evaluationSummary.grouped.fisica[evaluationSummary.grouped.fisica.length - 1];
  const latestPostural = evaluationSummary.grouped.postural[0];
  const latestPersonalizada = evaluationSummary.grouped.personalizada[0];

  const latestWeight =
    latestFisica?.composicaoCorporal?.peso || latestOnline?.peso || undefined;
  const firstWeight =
    firstFisica?.composicaoCorporal?.peso || firstOnline?.peso || undefined;
  const weightDelta =
    typeof latestWeight === 'number' && typeof firstWeight === 'number'
      ? latestWeight - firstWeight
      : null;

  const latestHeight =
    latestFisica?.composicaoCorporal?.altura || latestOnline?.altura || undefined;
  const latestImc =
    latestFisica?.composicaoCorporal?.imc ||
    latestOnline?.imc ||
    (latestWeight && latestHeight ? calculateIMC(latestWeight, latestHeight) : undefined);
  const firstImc =
    firstFisica?.composicaoCorporal?.imc ||
    firstOnline?.imc ||
    (firstWeight && latestHeight ? calculateIMC(firstWeight, latestHeight) : undefined);
  const imcDelta =
    typeof latestImc === 'number' && typeof firstImc === 'number'
      ? latestImc - firstImc
      : null;

  const cacheKey = useMemo(
    () => (selectedId ? `student-evolution:${selectedId}` : ''),
    [selectedId]
  );
  const cacheVersion = useMemo(() => {
    if (!stats) return '';
    return `${stats.totalWorkouts}:${evaluationSummary.total}:${evaluationSummary.lastStamp}`;
  }, [evaluationSummary.lastStamp, evaluationSummary.total, stats]);

  const buildInsightsContext = useMemo(() => {
    if (!stats) return '';
    const lines = [];
    const label = selectedStudent?.nome || selectedStudent?.email || studentLabel || 'Aluno';
    lines.push(`Aluno: ${label}`);
    lines.push(`Treinos cadastrados: ${stats.totalWorkouts}`);
    lines.push(`Exercicios totais: ${stats.totalExercises}`);
    if (stats.topExercises.length) {
      lines.push(
        `Top exercicios: ${stats.topExercises
          .map((item) => `${titleCase(item.name)} (${item.count}x)`)
          .join(', ')}`
      );
    }
    lines.push(`Avaliacoes: ${evaluationSummary.total}`);
    lines.push(
      `Online: ${evaluationSummary.grouped.online.length} | Fisica: ${evaluationSummary.grouped.fisica.length} | Postural: ${evaluationSummary.grouped.postural.length} | Personalizada: ${evaluationSummary.grouped.personalizada.length}`
    );
    if (evaluationSummary.latest?.date) {
      lines.push(`Ultima avaliacao: ${evaluationSummary.latest.date.toISOString()}`);
    }
    if (latestOnline) {
      lines.push(
        `Online recente: peso ${latestOnline.peso ?? '--'} kg, altura ${latestOnline.altura ?? '--'} cm, IMC ${latestOnline.imc ?? '--'}.`
      );
    }
    if (latestFisica?.composicaoCorporal) {
      const comp = latestFisica.composicaoCorporal;
      lines.push(
        `Fisica recente: peso ${comp.peso ?? '--'} kg, IMC ${comp.imc ?? '--'}, % gordura ${comp.percentualGordura ?? '--'}.`
      );
    }
    if (latestPostural) {
      const fotosCount = Object.values(latestPostural.fotosPostura || {}).filter(Boolean).length;
      lines.push(
        `Postural recente: fotos ${fotosCount}, recomendacoes ${latestPostural.recomendacoes?.length || 0}.`
      );
    }
    if (latestPersonalizada) {
      lines.push(
        `Personalizada recente: perguntas ${latestPersonalizada.perguntas?.length || 0}, respostas ${latestPersonalizada.respostas?.length || 0}.`
      );
    }
    if (weightDelta !== null) {
      lines.push(`Evolucao do peso: ${weightDelta.toFixed(1)} kg.`);
    }
    if (imcDelta !== null) {
      lines.push(`Evolucao do IMC: ${imcDelta.toFixed(1)}.`);
    }
    return lines.join('\n');
  }, [
    evaluationSummary.grouped.fisica.length,
    evaluationSummary.grouped.online.length,
    evaluationSummary.grouped.personalizada.length,
    evaluationSummary.grouped.postural.length,
    evaluationSummary.latest?.date,
    evaluationSummary.total,
    imcDelta,
    latestFisica,
    latestOnline,
    latestPersonalizada,
    latestPostural,
    selectedStudent?.email,
    selectedStudent?.nome,
    stats,
    weightDelta,
  ]);

  const loadInsights = async (force = false) => {
    if (!hasPremiumInsights) {
      setInsightsError('Insights de IA disponiveis apenas no Premium.');
      return;
    }
    if (!hasOpenRouter) {
      setInsightsError('IA indisponivel no momento.');
      return;
    }
    if (!cacheKey || !cacheVersion || !buildInsightsContext) return;
    setInsightsError('');

    if (!force && typeof window !== 'undefined') {
      try {
        const cached = window.localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as {
            version?: string;
            data?: StudentEvolutionInsights;
          };
          if (parsed?.version === cacheVersion && parsed?.data) {
            setInsights(parsed.data);
            return;
          }
        }
      } catch {
        setInsightsError('Falha ao ler o cache local.');
      }
    }

    setInsightsLoading(true);
    try {
      const response = await generateStudentEvolutionInsights({ context: buildInsightsContext });
      setInsights(response);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          cacheKey,
          JSON.stringify({ version: cacheVersion, data: response })
        );
      }
    } catch (err: any) {
      setInsightsError(err.message || 'Erro ao gerar insights.');
    } finally {
      setInsightsLoading(false);
    }
  };

  useEffect(() => {
    if (!hasPremiumInsights || !hasOpenRouter || !stats) return;
    if (evaluationSummary.total > 0 || stats.totalWorkouts > 0) {
      loadInsights(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, cacheVersion, evaluationSummary.total, hasOpenRouter, hasPremiumInsights, stats?.totalWorkouts]);

  const handleGenerate = async () => {
    if (!selectedId || !stats) return;
    await loadInsights(true);
  };

  const maxCount = Math.max(1, ...(stats?.topExercises.map((item) => item.count) || [1]));
  const displayStudentLabel = selectedStudent?.nome || selectedStudent?.email || studentLabel || 'Aluno';
  const hasScopedStudent = Boolean(initialStudentId && lockStudent);
  const weightLabel = typeof latestWeight === 'number' ? `${latestWeight} kg` : '--';
  const imcLabel = typeof latestImc === 'number' ? latestImc.toFixed(1) : '--';
  const deltaLabel = weightDelta !== null ? `${weightDelta.toFixed(1)} kg` : '--';

  if (!hasPremiumInsights) {
    return (
      <div className={`card ai-insights${className ? ` ${className}` : ''}`}>
        <div className="ai-insights-top">
          <div className="ai-insights-title">
            <span className="ai-insights-eyebrow">Assistente</span>
            <h3>Insights do aluno</h3>
            <p className="subtle">Disponivel apenas no plano Premium.</p>
          </div>
          <div className="ai-insights-actions">
            <Link href="/profile/subscription" className="button secondary">
              Ver assinatura
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`card ai-insights${className ? ` ${className}` : ''}`}>
      <div className="ai-insights-top">
        <div className="ai-insights-title">
          <span className="ai-insights-eyebrow">Assistente</span>
          <h3>Insights do aluno</h3>
          <p className="subtle">Analise do foco dos treinos e impacto no aluno.</p>
        </div>
        {students.length || hasScopedStudent ? (
          <div className="ai-insights-actions">
            {!lockStudent ? (
              <>
                <label className="ai-insights-label">
                  Aluno
                  <select
                    value={selectedId}
                    onChange={(event) => setSelectedId(event.target.value)}
                    className="ai-select"
                  >
                    {students.map((student) => {
                      const id = student.uid || student.id;
                      return (
                        <option key={id} value={id}>
                          {student.nome || student.email || id}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <button
                  className="button secondary"
                  type="button"
                  onClick={handleGenerate}
                  disabled={!stats || loading || insightsLoading || !hasOpenRouter}
                >
                  {insightsLoading ? 'Gerando...' : 'Gerar insights'}
                </button>
              </>
            ) : (
              <>
                <div className="ai-insights-student-chip">
                  <span>Aluno</span>
                  <strong>{displayStudentLabel}</strong>
                </div>
                <button
                  className="button secondary"
                  type="button"
                  onClick={handleGenerate}
                  disabled={!stats || loading || insightsLoading || !hasOpenRouter}
                >
                  {insightsLoading ? 'Gerando...' : 'Atualizar insights'}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="ai-insights-empty">Nenhum aluno encontrado para este personal.</div>
        )}
      </div>

      {loading && <div className="ai-insights-alert">Carregando estatisticas...</div>}
      {error && <div className="ai-insights-alert is-error">{error}</div>}

      {stats && (
        <>
          <div className="ai-insights-summary">
            <div className="ai-insights-tile">
              <span>Treinos</span>
              <strong>{stats.totalWorkouts}</strong>
              <small>Rotinas cadastradas</small>
            </div>
            <div className="ai-insights-tile">
              <span>Exercicios</span>
              <strong>{stats.totalExercises}</strong>
              <small>Volume total</small>
            </div>
            <div className="ai-insights-tile">
              <span>Avaliacoes</span>
              <strong>{evaluationSummary.total}</strong>
              <small>Registros no historico</small>
            </div>
            <div className="ai-insights-tile">
              <span>Peso atual</span>
              <strong>{weightLabel}</strong>
              <small>Ultima medida</small>
            </div>
            <div className="ai-insights-tile">
              <span>IMC atual</span>
              <strong>{imcLabel}</strong>
              <small>Indice recente</small>
            </div>
            <div className="ai-insights-tile">
              <span>Delta peso</span>
              <strong>{deltaLabel}</strong>
              <small>Variacao registrada</small>
            </div>
          </div>

          <div className="ai-insights-grid ai-insights-grid--primary">
            <div className="ai-insights-card ai-insights-card--focus">
              <div className="ai-insights-card-header">
                <strong>Foco principal</strong>
                <p className="subtle">Exercicios mais frequentes.</p>
              </div>
              <div className="ai-bar-list">
                {stats.topExercises.length ? (
                  stats.topExercises.map((item) => (
                    <div key={item.name} className="ai-bar-item">
                      <span>{titleCase(item.name)}</span>
                      <div className="ai-bar">
                        <span style={{ width: `${Math.round((item.count / maxCount) * 100)}%` }} />
                      </div>
                      <strong>{item.count}</strong>
                    </div>
                  ))
                ) : (
                  <p className="subtle">Sem exercicios suficientes para analise.</p>
                )}
              </div>
            </div>
            <div className="ai-insights-card ai-insights-card--evolution">
              <div className="ai-insights-card-header">
                <strong>Evolucao do aluno</strong>
                <p className="subtle">Ultima avaliacao e variacoes.</p>
              </div>
              <div className="ai-insights-stats">
                <div>
                  <span>Avaliacoes</span>
                  <strong>{evaluationSummary.total}</strong>
                </div>
                <div>
                  <span>Peso atual</span>
                  <strong>{weightLabel}</strong>
                </div>
                <div>
                  <span>IMC atual</span>
                  <strong>{imcLabel}</strong>
                </div>
                <div>
                  <span>Delta peso</span>
                  <strong>{deltaLabel}</strong>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {insightsError && <div className="ai-insights-alert is-error">{insightsError}</div>}

      {insights && (
        <div className="ai-insights-grid ai-insights-grid--ai">
          <div className="ai-insights-card ai-insights-card--summary">
            <div className="ai-insights-card-header">
              <strong>Resumo do assistente</strong>
              <p className="subtle">Pontos principais do aluno.</p>
            </div>
            <p>{insights.resumo}</p>
            <div className="ai-pill-list">
              {insights.destaques.map((item) => (
                <span key={item} className="portal-tag">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="ai-insights-card ai-insights-card--impact">
            <div className="ai-insights-card-header">
              <strong>Impacto no aluno</strong>
              <p className="subtle">Intensidade e resposta geral.</p>
            </div>
            <div className="ai-bar-list">
              {insights.graficos.map((item) => (
                <div key={item.label} className="ai-bar-item">
                  <span>{item.label}</span>
                  <div className="ai-bar">
                    <span style={{ width: `${item.value}%` }} />
                  </div>
                  <strong>{item.value}%</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="ai-insights-card ai-insights-card--distribution">
            <div className="ai-insights-card-header">
              <strong>Distribuicao de apoio</strong>
              <p className="subtle">Balanceamento entre pilares.</p>
            </div>
            <div className="ai-bar-list">
              {insights.pizza.map((item) => (
                <div key={item.label} className="ai-bar-item">
                  <span>{item.label}</span>
                  <div className="ai-bar">
                    <span style={{ width: `${item.value}%` }} />
                  </div>
                  <strong>{item.value}%</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
