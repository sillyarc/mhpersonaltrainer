'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import PageShell from '@/components/PageShell';
import UserScopePicker from '@/components/data/UserScopePicker';
import { useUserScope, formatDate } from '@/lib/firestoreHooks';
import { firestoreService } from '@/lib/services/firestoreService';
import type { User } from '@/lib/types/user';
import {
  fetchEvaluations,
  calculateIMC,
} from '@/lib/services/evaluations';
import type {
  PhysicalEvaluation,
  OnlineEvaluation,
  PhysicalTestEvaluation,
  PosturalEvaluation,
  PersonalizedEvaluation,
} from '@/lib/types/evaluation';
import {
  deleteUserWorkout,
  deleteWorkout,
  fetchAvailableExercises,
  fetchExerciseByName,
  fetchUserWorkouts,
  fetchWorkoutById,
  fetchUserWorkoutById,
  updateUserWorkout,
  updateWorkout,
} from '@/lib/services/workouts';
import type { Exercise, UserWorkout } from '@/lib/types/workout';
import { useSearchParams, usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import {
  generateStudentEvolutionInsights,
  type StudentEvolutionInsights,
} from '@/lib/services/ai';
import {
  getWorkoutInsights,
  saveWorkoutInsights,
  type StoredWorkoutInsights,
} from '@/lib/services/insights';
import { useAuth } from '@/lib/auth';

type WorkoutSource = 'public' | 'user';

interface WorkoutDetail {
  id: string;
  nomeDoTreino?: string;
  nome?: string;
  tipo?: string;
  duracao?: string;
  treino?: string[];
  seriesRep?: Array<number | string>;
  repeticoes?: Array<number | string>;
  carga?: Array<number | string>;
  intervalo?: Array<number | string>;
  videoUrls?: string[];
  obsInstrucao?: string;
  lastCompletedAt?: Date;
  updatedAt?: Date;
}

type WorkoutStats = {
  totalWorkouts: number;
  totalExercises: number;
  topExercises: Array<{ name: string; count: number }>;
};

const buildStats = (workouts: Array<{ treino?: string[] }>): WorkoutStats => {
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
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  return { totalWorkouts: workouts.length, totalExercises, topExercises };
};

const titleCase = (value: string) =>
  value.replace(/\b\w/g, (letter) => letter.toUpperCase());

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const EXERCISE_CATEGORIES = [
  { id: 'all', label: 'Todos' },
  { id: 'peitoral', label: 'Peito' },
  { id: 'costas', label: 'Costas' },
  { id: 'pernas', label: 'Pernas' },
  { id: 'ombro', label: 'Ombros' },
  { id: 'biceps', label: 'Biceps' },
  { id: 'triceps', label: 'Triceps' },
  { id: 'abdomen', label: 'Abdomen' },
  { id: 'aerobico', label: 'Aerobico' },
  { id: 'funcional', label: 'Funcional' },
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  peitoral: ['peito', 'peitoral'],
  costas: ['costa', 'costas', 'dorsal', 'lombar'],
  pernas: ['perna', 'pernas', 'membros inferiores', 'inferiores', 'coxa', 'panturrilha'],
  ombro: ['ombro', 'ombros', 'deltoide', 'deltoides'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  abdomen: ['abdomen', 'abdominal', 'core'],
  aerobico: ['aerobico', 'cardio', 'cardiovascular', 'hiit'],
  funcional: ['funcional', 'mobilidade', 'alongamento'],
};

const IconArrowLeft = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

const IconList = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <circle cx="4" cy="6" r="1" />
    <circle cx="4" cy="12" r="1" />
    <circle cx="4" cy="18" r="1" />
    <path d="M8 6h12" />
    <path d="M8 12h12" />
    <path d="M8 18h12" />
  </svg>
);

const IconTime = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

const IconRepeat = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M3 12a7 7 0 0 1 12-4" />
    <path d="M15 5h4v4" />
    <path d="M21 12a7 7 0 0 1-12 4" />
    <path d="M9 19H5v-4" />
  </svg>
);

const IconBarbell = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M3 10v4" />
    <path d="M7 6v12" />
    <path d="M17 6v12" />
    <path d="M21 10v4" />
    <path d="M7 12h10" />
  </svg>
);

const IconPlay = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon is-fill">
    <path d="M8 5l11 7-11 7V5z" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M5 12l4 4 10-10" />
  </svg>
);

export default function WorkoutDetailPage({ params }: { params: { id: string } }) {
  const { role } = useAuth();
  const { userId } = useUserScope();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const workoutId = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    return last && last !== 'workout' ? last : params.id;
  }, [pathname, params.id]);
  const scopedUserId = searchParams.get('studentId') || userId;
  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [source, setSource] = useState<WorkoutSource>('public');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [insightsError, setInsightsError] = useState('');
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsDataLoading, setInsightsDataLoading] = useState(false);
  const [studentInfo, setStudentInfo] = useState<User | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);
  const [seriesRep, setSeriesRep] = useState<string[]>([]);
  const [repeticoes, setRepeticoes] = useState<string[]>([]);
  const [carga, setCarga] = useState<string[]>([]);
  const [intervalo, setIntervalo] = useState<string[]>([]);
  const [exerciseVideos, setExerciseVideos] = useState<string[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [exerciseLoading, setExerciseLoading] = useState(false);
  const [exerciseLoadError, setExerciseLoadError] = useState('');
  const [replicating, setReplicating] = useState(false);
  const [overallStats, setOverallStats] = useState<WorkoutStats | null>(null);
  const [evaluations, setEvaluations] = useState<PhysicalEvaluation[]>([]);
  const [insights, setInsights] = useState<StudentEvolutionInsights | null>(null);
  const [insightsMeta, setInsightsMeta] = useState<{
    source: StoredWorkoutInsights['source'];
    generatedAt?: Date;
    updatedAt?: Date;
    isStale: boolean;
  } | null>(null);
  const [hasStoredInsights, setHasStoredInsights] = useState(false);
  const videoCacheRef = useRef<Map<string, string>>(new Map());
  const videoObjectUrlRef = useRef<Map<string, string>>(new Map());
  const videoPrefetchingRef = useRef<Set<string>>(new Set());
  const [videoCacheTick, setVideoCacheTick] = useState(0);
  const [obsInstrucao, setObsInstrucao] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const targetUserId = scopedUserId || userId;
  const hasOpenRouter = Boolean(
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY
  );
  const isPersonal = role === 'personal' || role === 'professor';
  const isStudent = role === 'aluno';

  useEffect(() => {
    let active = true;

    const loadWorkout = async () => {
      setLoading(true);
      setError('');

      if (isStudent) {
        if (!targetUserId) {
          setError('Treino nao encontrado.');
          setLoading(false);
          return;
        }
        const userResult = await fetchUserWorkoutById(targetUserId, workoutId);
        if (!active) return;
        if (userResult.data) {
          setWorkout(userResult.data);
          setSource('user');
        } else {
          setError(userResult.error || 'Treino nao encontrado.');
        }
        setLoading(false);
        return;
      }

      const publicResult = await fetchWorkoutById(workoutId);
      if (publicResult.data) {
        if (!active) return;
        setWorkout(publicResult.data);
        setSource('public');
        setLoading(false);
        return;
      }

      if (scopedUserId) {
        const userResult = await fetchUserWorkoutById(scopedUserId, workoutId);
        if (!active) return;
        if (userResult.data) {
          setWorkout(userResult.data);
          setSource('user');
        } else {
          setError(userResult.error || 'Treino nao encontrado.');
        }
      } else {
        setError('Treino nao encontrado.');
      }

      setLoading(false);
    };

    loadWorkout();
    return () => {
      active = false;
    };
  }, [isStudent, workoutId, scopedUserId, targetUserId]);

  const syncFromWorkout = (nextWorkout: WorkoutDetail | null) => {
    if (!nextWorkout?.treino?.length) {
      setExerciseNames([]);
      setSeriesRep([]);
      setRepeticoes([]);
      setCarga([]);
      setIntervalo([]);
      setExerciseVideos([]);
      setObsInstrucao('');
      setEditingIndex(null);
      return;
    }
    const size = nextWorkout.treino.length;
    setExerciseNames(nextWorkout.treino.map((item) => String(item || '')));
    const toValues = (items?: Array<number | string>) =>
      Array.from({ length: size }, (_, index) => (items?.[index] ?? '').toString());
    setSeriesRep(toValues(nextWorkout.seriesRep));
    setRepeticoes(toValues(nextWorkout.repeticoes));
    setCarga(toValues(nextWorkout.carga));
    setIntervalo(toValues(nextWorkout.intervalo));
    setObsInstrucao(nextWorkout.obsInstrucao || '');
    setEditingIndex(null);
  };

  useEffect(() => {
    syncFromWorkout(workout);
  }, [workout]);

  useEffect(() => {
    return () => {
      videoObjectUrlRef.current.forEach((url) => URL.revokeObjectURL(url));
      videoObjectUrlRef.current.clear();
    };
  }, []);

  const prefetchVideo = useCallback(async (url: string) => {
    if (!url) return;
    if (videoObjectUrlRef.current.has(url) || videoPrefetchingRef.current.has(url)) return;
    videoPrefetchingRef.current.add(url);
    try {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) return;
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      videoObjectUrlRef.current.set(url, objectUrl);
      setVideoCacheTick((prev) => prev + 1);
    } catch {
      // Ignore fetch errors to avoid blocking the UI.
    } finally {
      videoPrefetchingRef.current.delete(url);
    }
  }, []);

  const resolveVideoSrc = useCallback(
    (url: string) => {
      if (!url) return '';
      return videoObjectUrlRef.current.get(url) || url;
    },
    [videoCacheTick]
  );

  const hydrateExerciseVideos = async (names: string[]) => {
    if (!names.length) {
      setExerciseVideos([]);
      return;
    }
    setVideosLoading(true);
    try {
      const results = await Promise.all(
        names.map(async (rawName) => {
          const name = String(rawName || '').trim();
          if (!name) return '';
          const key = name.toLowerCase();
          if (videoCacheRef.current.has(key)) {
            return videoCacheRef.current.get(key) || '';
          }
          const result = await fetchExerciseByName(name);
          const url = result.data?.videoUrl || '';
          videoCacheRef.current.set(key, url);
          return url;
        })
      );
      setExerciseVideos(results);
      if (typeof window !== 'undefined') {
        const warmup = results.filter(Boolean).slice(0, 3);
        const schedule =
          typeof window.requestIdleCallback === 'function'
            ? window.requestIdleCallback
            : (callback: () => void) => window.setTimeout(callback, 200);
        schedule(() => {
          warmup.forEach((url) => prefetchVideo(url));
        });
      }
    } finally {
      setVideosLoading(false);
    }
  };

  useEffect(() => {
    if (!workout?.treino?.length) {
      setExerciseVideos([]);
      return;
    }
    if (editingIndex !== null) return;
    hydrateExerciseVideos(workout.treino.map((item) => String(item || '')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.treino?.join('||'), editingIndex]);

  const loadExercises = async () => {
    setExerciseLoading(true);
    setExerciseLoadError('');
    const result = await fetchAvailableExercises();
    if (result.error) {
      setExerciseLoadError(result.error);
      setAvailableExercises([]);
      setExerciseLoading(false);
      return;
    }
    setAvailableExercises(result.data || []);
    setExerciseLoading(false);
  };

  useEffect(() => {
    if (!showExerciseModal) return;
    loadExercises();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showExerciseModal]);

  useEffect(() => {
    let active = true;

    const loadStudentInfo = async () => {
      if (!scopedUserId) {
        setStudentInfo(null);
        return;
      }
      try {
        const info = await firestoreService.getUserDocument(scopedUserId);
        if (!active) return;
        setStudentInfo(info);
      } catch {
        if (!active) return;
        setStudentInfo(null);
      }
    };

    loadStudentInfo();
    return () => {
      active = false;
    };
  }, [scopedUserId]);

  useEffect(() => {
    let active = true;

    const loadInsightsData = async () => {
      if (!scopedUserId) {
        setOverallStats(null);
        setEvaluations([]);
        setInsights(null);
        setInsightsError('');
        return;
      }
      setInsightsDataLoading(true);
      setInsightsError('');
      try {
        const [workoutResult, evalResult] = await Promise.all([
          fetchUserWorkouts(scopedUserId, false),
          fetchEvaluations(scopedUserId),
        ]);
        if (!active) return;
        if (workoutResult.error) {
          setInsightsError(workoutResult.error);
          setOverallStats(null);
        } else {
          setOverallStats(buildStats(workoutResult.data || []));
        }
        if (evalResult.error) {
          setInsightsError(evalResult.error);
          setEvaluations([]);
        } else {
          const items = evalResult.data ? [...evalResult.data] : [];
          items.sort((a, b) => (b.date?.getTime?.() ?? 0) - (a.date?.getTime?.() ?? 0));
          setEvaluations(items);
        }
        setInsights(null);
      } catch (err: any) {
        if (!active) return;
        setInsightsError(err.message || 'Erro ao carregar dados do aluno.');
      } finally {
        if (active) setInsightsDataLoading(false);
      }
    };

    loadInsightsData();
    return () => {
      active = false;
    };
  }, [scopedUserId]);

  const canEdit =
    (isPersonal && source === 'user' && Boolean(scopedUserId)) ||
    (source === 'public' && role === 'admin');
  const canReplicateSeries =
    source === 'user' && isPersonal && Boolean(targetUserId) && exerciseNames.length > 0;
  const workoutRows = useMemo(() => workout?.treino || [], [workout?.treino]);
  const editorRows = useMemo(() => exerciseNames, [exerciseNames]);
  const displayRows = canEdit ? editorRows : workoutRows;
  const canReorder = canEdit && editingIndex === null;
  const totalExercises = workoutRows.length;
  const displayCount = displayRows.filter((item) => String(item || '').trim()).length;
  const addedExerciseKeys = useMemo(
    () => new Set(exerciseNames.map((name) => normalizeText(name || ''))),
    [exerciseNames]
  );

  const filteredExercises = useMemo(() => {
    let pool = availableExercises;
    if (selectedCategory !== 'all') {
      const keywords = CATEGORY_KEYWORDS[selectedCategory] || [];
      pool = pool.filter((exercise) => {
        const colecao = normalizeText(exercise.colecao || '');
        if (!colecao) return false;
        return keywords.some((keyword) => colecao.includes(keyword));
      });
    }
    const searchTerm = normalizeText(exerciseSearch);
    if (!searchTerm) return pool;
    return pool.filter((exercise) => {
      const name = normalizeText(exercise.nomeDoTreino || '');
      const colecao = normalizeText(exercise.colecao || '');
      return name.includes(searchTerm) || colecao.includes(searchTerm);
    });
  }, [availableExercises, exerciseSearch, selectedCategory]);
  const maxFocusCount = Math.max(
    1,
    ...(overallStats?.topExercises.map((item) => item.count) || [1])
  );
  const numericFrom = (value: string) => {
    const match = value.match(/(\d+(?:[.,]\d+)?)/);
    if (!match) return null;
    const parsed = Number(match[0].replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const sumMetric = (items: string[]) => {
    let total = 0;
    let count = 0;
    items.forEach((value) => {
      const numeric = numericFrom(value);
      if (numeric !== null) {
        total += numeric;
        count += 1;
      }
    });
    return count ? total : null;
  };
  const avgMetric = (items: string[]) => {
    let total = 0;
    let count = 0;
    items.forEach((value) => {
      const numeric = numericFrom(value);
      if (numeric !== null) {
        total += numeric;
        count += 1;
      }
    });
    return count ? total / count : null;
  };
  const totalSeries = sumMetric(seriesRep);
  const totalReps = sumMetric(repeticoes);
  const avgInterval = avgMetric(intervalo);
  const avgCarga = avgMetric(carga);
  const showStudentInfo = Boolean(scopedUserId && scopedUserId !== userId);
  const studentInitial = studentInfo?.displayName?.[0] || studentInfo?.email?.[0] || 'A';
  const studentMeta = useMemo(() => {
    if (!studentInfo) return [];
    const city = [studentInfo.cidade, studentInfo.estado].filter(Boolean).join(' / ');
    const items = [
      { label: 'Contato', value: studentInfo.phoneNumber },
      { label: 'Cidade', value: city },
      { label: 'Genero', value: studentInfo.genero },
      { label: 'Altura', value: studentInfo.altura },
      { label: 'Peso', value: studentInfo.peso },
      { label: 'Aluno desde', value: studentInfo.alunoDesde ? formatDate(studentInfo.alunoDesde) : '' },
    ];
    return items.filter((item) => String(item.value || '').trim());
  }, [studentInfo]);
  const studentHighlights = useMemo(() => {
    if (!studentInfo) return [];
    const items = [
      { label: 'Objetivo', value: studentInfo.objetivoNoApp },
      { label: 'Experiencia', value: studentInfo.experiencia },
      { label: 'Nivel', value: studentInfo.nivelDeAtividade },
      { label: 'Equipamento', value: studentInfo.equipamento },
      { label: 'Tempo por sessao', value: studentInfo.tempoPorSessao },
      { label: 'Dias de treino', value: studentInfo.diasDeTreino },
    ];
    return items.filter((item) => String(item.value || '').trim());
  }, [studentInfo]);
  const formatMetric = (value: number | null) =>
    value === null ? '-' : Math.round(value).toString();
  const formatDateTime = (value?: Date) => {
    if (!value) return '--';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(value);
  };

  const evaluationSummary = useMemo(() => {
    const grouped = {
      online: evaluations.filter((item) => item.type === 'online'),
      fisica: evaluations.filter((item) => item.type === 'fisica'),
      postural: evaluations.filter((item) => item.type === 'postural'),
      personalizada: evaluations.filter((item) => item.type === 'personalizada'),
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

  const latestOnline = evaluationSummary.grouped.online[0] as OnlineEvaluation | undefined;
  const latestFisica = evaluationSummary.grouped.fisica[0] as PhysicalTestEvaluation | undefined;
  const latestPostural = evaluationSummary.grouped.postural[0] as PosturalEvaluation | undefined;
  const latestPersonalizada =
    evaluationSummary.grouped.personalizada[0] as PersonalizedEvaluation | undefined;

  const latestWeight =
    latestFisica?.composicaoCorporal?.peso || latestOnline?.peso || undefined;
  const latestHeight =
    latestFisica?.composicaoCorporal?.altura || latestOnline?.altura || undefined;
  const latestImc =
    latestFisica?.composicaoCorporal?.imc ||
    latestOnline?.imc ||
    (latestWeight && latestHeight ? calculateIMC(latestWeight, latestHeight) : undefined);

  const insightsCacheKey = useMemo(() => {
    if (!scopedUserId || !workout?.id) return '';
    return `workout-insights:${scopedUserId}:${workout.id}`;
  }, [scopedUserId, workout?.id]);

  const insightsCacheVersion = useMemo(() => {
    if (!workout || !overallStats) return '';
    const workoutStamp = workout.updatedAt?.getTime?.() || 0;
    return `${workoutStamp}:${overallStats.totalWorkouts}:${evaluationSummary.total}:${evaluationSummary.lastStamp}`;
  }, [evaluationSummary.lastStamp, evaluationSummary.total, overallStats, workout]);

  const loadStoredInsights = async () => {
    if (!scopedUserId || !workout?.id) return;
    const result = await getWorkoutInsights(scopedUserId, workout.id);
    if (result.error) {
      setInsightsError(result.error);
      return;
    }
    if (result.data?.data) {
      const stale = result.data.version !== insightsCacheVersion;
      setInsights(result.data.data);
      setInsightsMeta({
        source: result.data.source,
        generatedAt: result.data.generatedAt,
        updatedAt: result.data.updatedAt,
        isStale: stale,
      });
      setHasStoredInsights(true);
    } else {
      setInsights(null);
      setInsightsMeta(null);
      setHasStoredInsights(false);
    }
  };

  const getInsightsContext = () => {
    if (!overallStats || !workout) return '';
    const lines = [];
    lines.push(`Aluno: ${studentInfo?.displayName || studentInfo?.email || 'Aluno'}`);
    lines.push(`Treino atual: ${workout.nomeDoTreino || workout.nome || workout.id}`);
    lines.push(`Exercicios no treino: ${totalExercises}`);
    lines.push(`Series totais: ${formatMetric(totalSeries)}`);
    lines.push(`Reps totais: ${formatMetric(totalReps)}`);
    lines.push(`Intervalo medio: ${formatMetric(avgInterval)}`);
    lines.push(`Carga media: ${formatMetric(avgCarga)}`);
    lines.push(`Treinos cadastrados: ${overallStats.totalWorkouts}`);
    lines.push(`Exercicios totais nos treinos: ${overallStats.totalExercises}`);
    if (overallStats.topExercises.length) {
      lines.push(
        `Top exercicios: ${overallStats.topExercises
          .map((item) => `${titleCase(item.name)} (${item.count}x)`)
          .join(', ')}`
      );
    }
    lines.push(`Avaliacoes: ${evaluationSummary.total}`);
    lines.push(
      `Online: ${evaluationSummary.grouped.online.length} | Fisica: ${evaluationSummary.grouped.fisica.length} | Postural: ${evaluationSummary.grouped.postural.length} | Personalizada: ${evaluationSummary.grouped.personalizada.length}`
    );
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
    return lines.join('\n');
  };

  const loadInsights = async (force = false) => {
    if (!hasOpenRouter) {
      setInsightsError('IA indisponivel no momento.');
      return;
    }
    if (!insightsCacheKey || !insightsCacheVersion) return;
    setInsightsError('');

    if (!force && hasStoredInsights && insightsMeta?.isStale === false) {
      return;
    }

    setInsightsLoading(true);
    try {
      const context = getInsightsContext();
      if (!context) return;
      const response = await generateStudentEvolutionInsights({ context });
      const statsSnapshot = overallStats
        ? {
            totalWorkouts: overallStats.totalWorkouts,
            totalExercises: overallStats.totalExercises,
            topExercises: overallStats.topExercises,
          }
        : undefined;
      const evaluationSnapshot = {
        total: evaluationSummary.total,
        online: evaluationSummary.grouped.online.length,
        fisica: evaluationSummary.grouped.fisica.length,
        postural: evaluationSummary.grouped.postural.length,
        personalizada: evaluationSummary.grouped.personalizada.length,
        latestWeight: latestWeight ?? null,
        latestImc: latestImc ?? null,
      };
      if (scopedUserId && workout?.id) {
        await saveWorkoutInsights({
          userId: scopedUserId,
          workoutId: workout.id,
          version: insightsCacheVersion,
          source: 'openrouter',
          data: response,
          context,
          statsSnapshot,
          evaluationSnapshot,
        });
      }
      setInsights(response);
      setInsightsMeta({
        source: 'openrouter',
        generatedAt: new Date(),
        updatedAt: new Date(),
        isStale: false,
      });
      setHasStoredInsights(true);
    } catch (err: any) {
      setInsightsError(err.message || 'Erro ao gerar insights.');
    } finally {
      setInsightsLoading(false);
    }
  };

  useEffect(() => {
    if (!overallStats || !workout) return;
    if (evaluationSummary.total > 0 || overallStats.totalWorkouts > 0) {
      loadStoredInsights();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightsCacheKey, insightsCacheVersion, evaluationSummary.total, overallStats]);

  useEffect(() => {
    if (!hasOpenRouter || !overallStats || !workout) return;
    if (!hasStoredInsights && (evaluationSummary.total > 0 || overallStats.totalWorkouts > 0)) {
      loadInsights(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStoredInsights, hasOpenRouter, overallStats, evaluationSummary.total, workout?.id]);

  const buildWorkoutPayload = (payload?: {
    names: string[];
    series: string[];
    reps: string[];
    cargas: string[];
    intervalos: string[];
  }) => {
    const sourceNames = payload?.names ?? exerciseNames;
    const sourceSeries = payload?.series ?? seriesRep;
    const sourceReps = payload?.reps ?? repeticoes;
    const sourceCarga = payload?.cargas ?? carga;
    const sourceIntervalo = payload?.intervalos ?? intervalo;

    const cleaned = sourceNames
      .map((name, index) => ({
        name: name.trim(),
        series: sourceSeries[index] || '',
        reps: sourceReps[index] || '',
        carga: sourceCarga[index] || '',
        intervalo: sourceIntervalo[index] || '',
      }))
      .filter((item) => item.name);

    return {
      treino: cleaned.map((item) => item.name),
      seriesRep: cleaned.map((item) => item.series),
      repeticoes: cleaned.map((item) => item.reps),
      carga: cleaned.map((item) => item.carga),
      intervalo: cleaned.map((item) => item.intervalo),
    };
  };

  const handleComplete = async () => {
    if (!workout) return;
    setSaving(true);
    try {
      if (source === 'user' && targetUserId) {
        await updateUserWorkout(targetUserId, workout.id, { lastCompletedAt: new Date() });
      } else {
        await updateWorkout(workout.id, { lastCompletedAt: new Date() } as any);
      }
      setWorkout((prev) => (prev ? { ...prev, lastCompletedAt: new Date() } : prev));
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar treino.');
    } finally {
      setSaving(false);
    }
  };

  const persistWorkout = async (payload?: {
    names: string[];
    series: string[];
    reps: string[];
    cargas: string[];
    intervalos: string[];
  }) => {
    if (!workout) return;
    setSaving(true);
    setSaveMessage('');
    try {
      const nextPayload = buildWorkoutPayload(payload);
      if (source === 'user' && scopedUserId) {
        await updateUserWorkout(scopedUserId, workout.id, {
          treino: nextPayload.treino,
          seriesRep: nextPayload.seriesRep,
          repeticoes: nextPayload.repeticoes,
          carga: nextPayload.carga,
          intervalo: nextPayload.intervalo,
          obsInstrucao,
        });
      } else if (source === 'public' && role === 'admin') {
        await updateWorkout(workout.id, {
          treino: nextPayload.treino,
          seriesRep: nextPayload.seriesRep,
          repeticoes: nextPayload.repeticoes,
          carga: nextPayload.carga,
          intervalo: nextPayload.intervalo,
          obsInstrucao,
        } as any);
      } else {
        return;
      }
      setWorkout((prev) =>
        prev
          ? {
              ...prev,
              treino: nextPayload.treino,
              seriesRep: nextPayload.seriesRep,
              repeticoes: nextPayload.repeticoes,
              carga: nextPayload.carga,
              intervalo: nextPayload.intervalo,
              obsInstrucao,
              updatedAt: new Date(),
            }
          : prev
      );
      setSaveMessage('Treino atualizado.');
      setExerciseNames(nextPayload.treino);
      setSeriesRep(nextPayload.seriesRep);
      setRepeticoes(nextPayload.repeticoes);
      setCarga(nextPayload.carga);
      setIntervalo(nextPayload.intervalo);
      setEditingIndex(null);
      hydrateExerciseVideos(nextPayload.treino);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar treino.');
    } finally {
      setSaving(false);
    }
  };

  const toMetricText = (value: unknown) => String(value ?? '').trim();

  const ensureMetricLength = (items: Array<number | string> | undefined, size: number) =>
    Array.from({ length: size }, (_, index) => toMetricText(items?.[index]));

  const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return items;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  };

  const handleReorderExercises = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const nextNames = moveItem(exerciseNames, fromIndex, toIndex);
    const nextSeries = moveItem(seriesRep, fromIndex, toIndex);
    const nextReps = moveItem(repeticoes, fromIndex, toIndex);
    const nextCarga = moveItem(carga, fromIndex, toIndex);
    const nextIntervalo = moveItem(intervalo, fromIndex, toIndex);
    const nextVideos =
      exerciseVideos.length === exerciseNames.length
        ? moveItem(exerciseVideos, fromIndex, toIndex)
        : exerciseVideos;

    setExerciseNames(nextNames);
    setSeriesRep(nextSeries);
    setRepeticoes(nextReps);
    setCarga(nextCarga);
    setIntervalo(nextIntervalo);
    setExerciseVideos(nextVideos);
    setEditingIndex(null);
    void persistWorkout({
      names: nextNames,
      series: nextSeries,
      reps: nextReps,
      cargas: nextCarga,
      intervalos: nextIntervalo,
    });
  };

  const handleDragStart = (event: DragEvent<HTMLSpanElement>, index: number) => {
    if (!canReorder) {
      event.preventDefault();
      return;
    }
    setDraggingIndex(index);
    setDragOverIndex(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, index: number) => {
    if (!canReorder) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (draggingIndex === null) return;
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (index: number) => {
    if (dragOverIndex === index) {
      setDragOverIndex(null);
    }
  };

  const handleDragEnd = () => {
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, index: number) => {
    if (!canReorder) return;
    event.preventDefault();
    const rawIndex = event.dataTransfer.getData('text/plain');
    const parsed = rawIndex ? Number.parseInt(rawIndex, 10) : Number.NaN;
    const fromIndex = draggingIndex ?? parsed;
    if (
      !Number.isFinite(fromIndex) ||
      fromIndex < 0 ||
      fromIndex >= exerciseNames.length ||
      index < 0 ||
      index >= exerciseNames.length
    ) {
      setDraggingIndex(null);
      setDragOverIndex(null);
      return;
    }
    handleReorderExercises(fromIndex, index);
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const buildSeriesReplicationMap = (payload: ReturnType<typeof buildWorkoutPayload>) => {
    const map = new Map<
      string,
      { series: string; reps: string; carga: string; intervalo: string }
    >();
    payload.treino.forEach((name, index) => {
      const key = normalizeText(String(name || ''));
      if (!key) return;
      map.set(key, {
        series: toMetricText(payload.seriesRep[index]),
        reps: toMetricText(payload.repeticoes[index]),
        carga: toMetricText(payload.carga[index]),
        intervalo: toMetricText(payload.intervalo[index]),
      });
    });
    return map;
  };

  const buildReplicatedMetrics = (
    baseMap: Map<string, { series: string; reps: string; carga: string; intervalo: string }>,
    targetWorkout: UserWorkout
  ) => {
    const names = targetWorkout.treino || [];
    if (!names.length) return null;
    const nextSeries = ensureMetricLength(targetWorkout.seriesRep, names.length);
    const nextReps = ensureMetricLength(targetWorkout.repeticoes, names.length);
    const nextCarga = ensureMetricLength(targetWorkout.carga, names.length);
    const nextIntervalo = ensureMetricLength(targetWorkout.intervalo, names.length);
    let changed = false;

    names.forEach((rawName, index) => {
      const key = normalizeText(String(rawName || ''));
      if (!key) return;
      const base = baseMap.get(key);
      if (!base) return;

      const applyMetric = (value: string, current: string) => {
        const nextValue = value.trim();
        if (!nextValue) return current;
        if (nextValue === current) return current;
        changed = true;
        return nextValue;
      };

      nextSeries[index] = applyMetric(base.series, nextSeries[index]);
      nextReps[index] = applyMetric(base.reps, nextReps[index]);
      nextCarga[index] = applyMetric(base.carga, nextCarga[index]);
      nextIntervalo[index] = applyMetric(base.intervalo, nextIntervalo[index]);
    });

    if (!changed) return null;
    return {
      seriesRep: nextSeries,
      repeticoes: nextReps,
      carga: nextCarga,
      intervalo: nextIntervalo,
    };
  };

  const handleReplicateSeries = async () => {
    if (!workout || !targetUserId) return;
    const basePayload = buildWorkoutPayload();
    if (!basePayload.treino.length) {
      setError('Treino atual sem exercicios para replicar.');
      return;
    }
    const confirmed = window.confirm(
      'Replicar series do treino atual para todos os treinos ativos deste aluno? ' +
        'Isso sobrescreve series, reps, carga e intervalo dos exercicios com o mesmo nome.'
    );
    if (!confirmed) return;

    setReplicating(true);
    setSaveMessage('');
    setError('');
    try {
      const baseMap = buildSeriesReplicationMap(basePayload);
      if (!baseMap.size) {
        setError('Nenhuma serie valida para replicar.');
        return;
      }

      const workoutsResult = await fetchUserWorkouts(targetUserId, false);
      if (workoutsResult.error) {
        throw new Error(workoutsResult.error);
      }

      const workouts = workoutsResult.data || [];
      const updates = workouts
        .map((item) => {
          const patch = buildReplicatedMetrics(baseMap, item);
          if (!patch) return null;
          return { id: item.id, patch };
        })
        .filter(Boolean) as Array<{ id: string; patch: Partial<UserWorkout> }>;

      if (!updates.length) {
        setSaveMessage('Nenhum treino precisou de atualizacao.');
        return;
      }

      await Promise.all(
        updates.map((item) => updateUserWorkout(targetUserId, item.id, item.patch))
      );

      setSaveMessage(`Series replicadas em ${updates.length} treinos.`);
    } catch (err: any) {
      setError(err.message || 'Erro ao replicar series.');
    } finally {
      setReplicating(false);
    }
  };

  const handleOpenExerciseModal = () => {
    setExerciseSearch('');
    setSelectedCategory('all');
    setShowExerciseModal(true);
  };

  const handleAddExerciseManual = () => {
    const nextIndex = exerciseNames.length;
    setExerciseNames((prev) => [...prev, '']);
    setSeriesRep((prev) => [...prev, '']);
    setRepeticoes((prev) => [...prev, '']);
    setCarga((prev) => [...prev, '']);
    setIntervalo((prev) => [...prev, '']);
    setExerciseVideos((prev) => [...prev, '']);
    setEditingIndex(nextIndex);
    setShowExerciseModal(false);
  };

  const handleAddExerciseFromList = (exercise: Exercise) => {
    const name = String(exercise.nomeDoTreino || '').trim();
    if (!name) return;
    const normalized = normalizeText(name);
    if (addedExerciseKeys.has(normalized)) return;

    const nextNames = [...exerciseNames, name];
    const nextSeries = [...seriesRep, String(exercise.seriesRep ?? 3)];
    const nextReps = [...repeticoes, '12'];
    const nextCarga = [...carga, String(exercise.carga ?? 0)];
    const nextIntervalo = [...intervalo, String(exercise.intervalo ?? 60)];
    const videoUrl = exercise.videoUrl1080 || exercise.videoUrl720 || exercise.videoUrl || '';

    if (videoUrl) {
      videoCacheRef.current.set(normalized, videoUrl);
    }

    setExerciseNames(nextNames);
    setSeriesRep(nextSeries);
    setRepeticoes(nextReps);
    setCarga(nextCarga);
    setIntervalo(nextIntervalo);
    setExerciseVideos((prev) => [...prev, videoUrl]);
    setEditingIndex(null);
    setShowExerciseModal(false);
    persistWorkout({
      names: nextNames,
      series: nextSeries,
      reps: nextReps,
      cargas: nextCarga,
      intervalos: nextIntervalo,
    });
  };

  const handleRemoveExercise = (index: number) => {
    const nextNames = exerciseNames.filter((_, i) => i !== index);
    const nextSeries = seriesRep.filter((_, i) => i !== index);
    const nextReps = repeticoes.filter((_, i) => i !== index);
    const nextCarga = carga.filter((_, i) => i !== index);
    const nextIntervalo = intervalo.filter((_, i) => i !== index);
    setExerciseNames(nextNames);
    setSeriesRep(nextSeries);
    setRepeticoes(nextReps);
    setCarga(nextCarga);
    setIntervalo(nextIntervalo);
    setEditingIndex(null);
    persistWorkout({
      names: nextNames,
      series: nextSeries,
      reps: nextReps,
      cargas: nextCarga,
      intervalos: nextIntervalo,
    });
  };

  const handleDelete = async () => {
    if (!workout) return;
    if (!window.confirm('Tem certeza que deseja excluir este treino?')) return;
    setSaving(true);
    try {
      if (source === 'user' && scopedUserId) {
        await deleteUserWorkout(scopedUserId, workout.id);
      } else if (source === 'public' && role === 'admin') {
        await deleteWorkout(workout.id);
      } else {
        return;
      }
      router.push('/workouts');
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir treino.');
    } finally {
      setSaving(false);
    }
  };

  const formatWorkoutMetric = (value?: number | string, suffix = '') => {
    if (value === null || value === undefined) return '';
    const text = String(value).trim();
    if (!text) return '';
    return `${text}${suffix}`;
  };

  const title = workout?.nomeDoTreino ?? workout?.nome ?? `Detalhe do treino ${workoutId}`;
  const studentExercises = useMemo(() => {
    if (!workout?.treino?.length) return [];
    return workout.treino
      .map((name, index) => ({
        id: `${workout.id}-${index}`,
        name: String(name || '').trim(),
        series: workout.seriesRep?.[index],
        reps: workout.repeticoes?.[index],
        carga: workout.carga?.[index],
        intervalo: workout.intervalo?.[index],
        videoUrl: workout.videoUrls?.[index],
      }))
      .filter((item) => item.name);
  }, [workout]);

  if (isStudent) {
    const completedToday = (() => {
      if (!workout?.lastCompletedAt) return false;
      const completed = new Date(workout.lastCompletedAt);
      const today = new Date();
      return (
        completed.getFullYear() === today.getFullYear() &&
        completed.getMonth() === today.getMonth() &&
        completed.getDate() === today.getDate()
      );
    })();
    const duration = studentExercises.length ? studentExercises.length * 2 : 0;

    if (loading) {
      return (
        <section className="student-workout-detail">
          <div className="student-loading">
            <p className="student-home-kicker">Carregando treino</p>
            <p className="student-home-sub">Buscando informacoes do treino.</p>
          </div>
        </section>
      );
    }

    if (error || !workout) {
      return (
        <section className="student-workout-detail">
          <div className="student-workout-error">
            <p>{error || 'Treino nao encontrado.'}</p>
            <button type="button" className="student-workout-back-btn" onClick={() => router.back()}>
              <IconArrowLeft />
              Voltar
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="student-workout-detail">
        <header className="student-workout-detail-header">
          <button type="button" className="student-workout-back" onClick={() => router.back()}>
            <IconArrowLeft />
          </button>
          <div className="student-workout-title">
            <strong>{title}</strong>
            <span>{completedToday ? 'Concluido hoje' : 'Treino ativo'}</span>
          </div>
          <div className="student-workout-header-spacer" />
        </header>

        <div className="student-workout-info-card">
          <p className="student-workout-info-desc">
            {workout.obsInstrucao || 'Treino personalizado'}
          </p>
          <div className="student-workout-stats">
            <div className="student-workout-stat">
              <span className="student-workout-stat-icon">
                <IconList />
              </span>
              <div>
                <strong>{studentExercises.length}</strong>
                <span>Exercicios</span>
              </div>
            </div>
            <div className="student-workout-stat">
              <span className="student-workout-stat-icon is-success">
                <IconTime />
              </span>
              <div>
                <strong>{duration ? `${duration} min` : '--'}</strong>
                <span>Duracao</span>
              </div>
            </div>
          </div>
        </div>

        <div className="student-workout-exercises">
          <h2>Exercicios</h2>
          {studentExercises.length ? (
            studentExercises.map((exercise, index) => {
              const seriesLabel = formatWorkoutMetric(exercise.series);
              const repsLabel = formatWorkoutMetric(exercise.reps);
              const seriesRepLabel =
                seriesLabel && repsLabel ? `${seriesLabel} x ${repsLabel}` : seriesLabel || repsLabel;
              const cargaLabel = formatWorkoutMetric(exercise.carga, ' kg');
              const intervaloLabel = formatWorkoutMetric(exercise.intervalo, 's');
              return (
                <div key={exercise.id} className="student-exercise-card">
                  <div className="student-exercise-index">
                    <span>{index + 1}</span>
                  </div>
                  <div className="student-exercise-content">
                    <strong>{exercise.name}</strong>
                    <div className="student-exercise-meta">
                      {seriesRepLabel && (
                        <span>
                          <IconRepeat />
                          {seriesRepLabel}
                        </span>
                      )}
                      {cargaLabel && (
                        <span>
                          <IconBarbell />
                          {cargaLabel}
                        </span>
                      )}
                      {intervaloLabel && (
                        <span>
                          <IconTime />
                          {intervaloLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  {exercise.videoUrl && <span className="student-video-pill">Video</span>}
                </div>
              );
            })
          ) : (
            <div className="student-workout-empty">
              <p>Nenhum exercicio cadastrado.</p>
            </div>
          )}
        </div>

        <div className="student-workout-footer">
          <button
            type="button"
            className="student-workout-start"
            onClick={() => router.push(`/start-workout?workoutId=${workout.id}`)}
            disabled={completedToday}
          >
            {completedToday ? (
              <>
                <IconCheck />
                Treino concluido hoje
              </>
            ) : (
              <>
                <IconPlay />
                Iniciar treino
              </>
            )}
          </button>
        </div>
      </section>
    );
  }

  return (
    <PageShell
      title={title}
      description="Resumo de exercicios, series e progresso."
      breadcrumbs={[{ label: 'Treinos', href: '/workouts' }]}
    >
      <UserScopePicker />
      {workout && canEdit && (
        <div className="workout-page-actions">
          <button className="button sm" onClick={handleComplete} disabled={saving}>
            {saving ? 'Salvando...' : 'Marcar como concluido'}
          </button>
          <button
            className="button secondary sm"
            type="button"
            onClick={handleOpenExerciseModal}
            disabled={saving}
          >
            Adicionar exercicio
          </button>
          <button
            className="button danger sm"
            type="button"
            onClick={handleDelete}
            disabled={saving}
          >
            Excluir treino inteiro
          </button>
        </div>
      )}
      {loading && <p className="subtle">Carregando treino...</p>}
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {saveMessage && <p style={{ color: '#1b7f3b' }}>{saveMessage}</p>}
      {showStudentInfo && studentInfo && (
        <div className="workout-user-strip">
          <div className="workout-user-main">
            <div className="workout-user-avatar">
              {studentInfo.photoUrl ? (
                <img src={studentInfo.photoUrl} alt={studentInfo.displayName || 'Aluno'} />
              ) : (
                <span>{studentInitial.toUpperCase()}</span>
              )}
            </div>
            <div className="workout-user-info">
              <strong>{studentInfo.displayName || 'Aluno selecionado'}</strong>
              <span>{studentInfo.email || 'Sem email'}</span>
            </div>
            {studentHighlights.length > 0 && (
              <div className="workout-user-tags">
                {studentHighlights.map((item) => (
                  <span key={item.label} className="workout-user-tag">
                    {item.label}: <strong>{item.value}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
          {studentMeta.length > 0 && (
            <div className="workout-user-pills">
              {studentMeta.map((item) => (
                <span key={item.label} className="workout-user-pill">
                  {item.label}: <strong>{item.value}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {workout && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <div className="card">
            <div className="workout-header">
              <div>
                <h3>Exercicios</h3>
                <p className="subtle" style={{ marginTop: 6 }}>
                  {displayCount ? `${displayCount} exercicios` : 'Sem exercicios'}
                </p>
              </div>
              <div className="workout-summary">
                {workout.tipo && <span className="workout-summary-pill">{workout.tipo}</span>}
                {workout.duracao && <span className="workout-summary-pill">{workout.duracao}</span>}
              </div>
            </div>
            {displayRows.length ? (
              <div className="workout-list">
                {displayRows.map((item, index) => {
                  const isEditing = editingIndex === index;
                  const isLocked = editingIndex !== null && !isEditing;
                  const isDragging = draggingIndex === index;
                  const isDropTarget = dragOverIndex === index && draggingIndex !== null && draggingIndex !== index;
                  const videoUrl = exerciseVideos[index] || '';
                  const cachedVideoUrl = resolveVideoSrc(videoUrl);
                  const isVideoCached = Boolean(videoUrl && videoObjectUrlRef.current.has(videoUrl));
                  return (
                    <div
                      key={`${item}-${index}`}
                      className={`workout-card${isEditing ? ' is-editing' : ''}${isDragging ? ' is-dragging' : ''}${
                        isDropTarget ? ' is-drop-target' : ''
                      }`}
                      onDragOver={canReorder ? (event) => handleDragOver(event, index) : undefined}
                      onDrop={canReorder ? (event) => handleDrop(event, index) : undefined}
                      onDragLeave={canReorder ? () => handleDragLeave(index) : undefined}
                    >
                      <div className="workout-card-title">
                        <span className="workout-index">{String(index + 1).padStart(2, '0')}</span>
                        {isEditing ? (
                          <input
                            className="workout-input workout-name"
                            value={item}
                            onChange={(event) => {
                              const next = [...exerciseNames];
                              next[index] = event.target.value;
                              setExerciseNames(next);
                            }}
                            placeholder="Nome do exercicio"
                          />
                        ) : (
                          <strong>{item || 'Novo exercicio'}</strong>
                        )}
                        {!isEditing && videoUrl && (
                          <a className="workout-video-link" href={videoUrl} target="_blank" rel="noreferrer">
                            Video
                          </a>
                        )}
                        {canReorder && (
                          <span
                            className="workout-drag-handle"
                            aria-hidden="true"
                            title="Arraste para reordenar"
                            draggable
                            onDragStart={(event) => handleDragStart(event, index)}
                            onDragEnd={handleDragEnd}
                          />
                        )}
                      </div>
                      {isEditing ? (
                        <>
                          <div className="workout-editor-fields">
                            <label>
                              Series
                              <input
                                className="workout-input"
                                value={seriesRep[index] || ''}
                                onChange={(event) => {
                                  const next = [...seriesRep];
                                  next[index] = event.target.value;
                                  setSeriesRep(next);
                                }}
                              />
                            </label>
                            <label>
                              Reps
                              <input
                                className="workout-input"
                                value={repeticoes[index] || ''}
                                onChange={(event) => {
                                  const next = [...repeticoes];
                                  next[index] = event.target.value;
                                  setRepeticoes(next);
                                }}
                              />
                            </label>
                            <label>
                              Carga
                              <input
                                className="workout-input"
                                value={carga[index] || ''}
                                onChange={(event) => {
                                  const next = [...carga];
                                  next[index] = event.target.value;
                                  setCarga(next);
                                }}
                              />
                            </label>
                            <label>
                              Intervalo
                              <input
                                className="workout-input"
                                value={intervalo[index] || ''}
                                onChange={(event) => {
                                  const next = [...intervalo];
                                  next[index] = event.target.value;
                                  setIntervalo(next);
                                }}
                              />
                            </label>
                          </div>
                          <div className="workout-row-actions">
                            <button
                              className="button sm"
                              type="button"
                              onClick={() => persistWorkout()}
                              disabled={saving}
                            >
                              {saving ? 'Salvando...' : 'Salvar'}
                            </button>
                            <button
                              className="button secondary sm"
                              type="button"
                              onClick={() => syncFromWorkout(workout)}
                              disabled={saving}
                            >
                              Cancelar
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          {videoUrl && (
                            <div className="workout-video">
                              <video
                                muted
                                loop
                                playsInline
                                autoPlay
                                preload={isVideoCached ? 'auto' : 'metadata'}
                                src={cachedVideoUrl}
                                controlsList="nodownload noplaybackrate noremoteplayback"
                                disablePictureInPicture
                                onContextMenu={(event) => event.preventDefault()}
                                onLoadedData={(event) => {
                                  const target = event.currentTarget;
                                  const playPromise = target.play();
                                  if (playPromise && typeof playPromise.catch === 'function') {
                                    playPromise.catch(() => undefined);
                                  }
                                }}
                                onMouseEnter={() => prefetchVideo(videoUrl)}
                                onFocus={() => prefetchVideo(videoUrl)}
                                onTouchStart={() => prefetchVideo(videoUrl)}
                              />
                              <span className="workout-video-label">Video</span>
                            </div>
                          )}
                          <div className="workout-metrics">
                            <div className="workout-metric">
                              <small>Series</small>
                              <strong>{seriesRep[index] || '-'}</strong>
                            </div>
                            <div className="workout-metric">
                              <small>Reps</small>
                              <strong>{repeticoes[index] || '-'}</strong>
                            </div>
                            <div className="workout-metric">
                              <small>Carga</small>
                              <strong>{carga[index] || '-'}</strong>
                            </div>
                            <div className="workout-metric">
                              <small>Intervalo</small>
                              <strong>{intervalo[index] || '-'}</strong>
                            </div>
                          </div>
                          {canEdit && (
                            <div className="workout-row-actions">
                              <button
                                className="button secondary sm"
                                type="button"
                                onClick={() => setEditingIndex(index)}
                                disabled={saving || isLocked}
                              >
                                Editar
                              </button>
                              <button
                                className="button danger sm"
                                type="button"
                                onClick={() => handleRemoveExercise(index)}
                                disabled={saving || isLocked}
                              >
                                Remover
                              </button>
                              {canReplicateSeries && (
                                <button
                                  className="button secondary sm"
                                  type="button"
                                  onClick={handleReplicateSeries}
                                  disabled={saving || replicating || isLocked}
                                >
                                  {replicating ? 'Replicando...' : 'Replicar series'}
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="subtle" style={{ marginTop: 8 }}>
                Nenhum exercicio cadastrado ainda.
              </p>
            )}
            {!canEdit && workout.obsInstrucao && (
              <div className="workout-notes">
                <div className="workout-notes-header">
                  <div>
                    <strong>Observacoes do treino</strong>
                    <span>Notas e ajustes registrados pelo personal.</span>
                  </div>
                </div>
                <p>{workout.obsInstrucao}</p>
              </div>
            )}
            {canEdit && (
              <div className="workout-notes">
                <div className="workout-notes-header">
                  <div>
                    <strong>Observacoes do treino</strong>
                    <span>Registre ajustes, dicas ou orientacoes para o aluno.</span>
                  </div>
                  <button
                    className="button secondary sm"
                    type="button"
                    onClick={() => persistWorkout()}
                    disabled={saving}
                  >
                    Salvar
                  </button>
                </div>
                <textarea
                  rows={4}
                  className="workout-notes-input"
                  value={obsInstrucao}
                  onChange={(event) => setObsInstrucao(event.target.value)}
                  placeholder="Ex: manter joelhos alinhados, carga moderada, foco na tecnica."
                />
              </div>
            )}
          </div>
          <div className="card">
            <h3>Visao geral</h3>
            <div className="workout-overview">
              <div className="workout-student">
                <div className="workout-student-avatar">{studentInitial.toUpperCase()}</div>
                <div>
                  <strong>
                    {showStudentInfo
                      ? studentInfo?.displayName || 'Aluno selecionado'
                      : 'Seu treino'}
                  </strong>
                  <span>
                    {showStudentInfo
                      ? studentInfo?.email || 'Sem email'
                      : 'Acompanhe a evolucao do treino'}
                  </span>
                </div>
              </div>
              <div className="workout-stats-grid">
                <div className="workout-stat">
                  <span>Exercicios</span>
                  <strong>{totalExercises}</strong>
                </div>
                <div className="workout-stat">
                  <span>Series totais</span>
                  <strong>{formatMetric(totalSeries)}</strong>
                </div>
                <div className="workout-stat">
                  <span>Reps totais</span>
                  <strong>{formatMetric(totalReps)}</strong>
                </div>
                <div className="workout-stat">
                  <span>Intervalo medio</span>
                  <strong>{formatMetric(avgInterval)}</strong>
                </div>
                <div className="workout-stat">
                  <span>Carga media</span>
                  <strong>{formatMetric(avgCarga)}</strong>
                </div>
              </div>
              <div className="workout-status">
                <div>
                  <span>Ultima execucao</span>
                  <strong>{formatDate(workout.lastCompletedAt)}</strong>
                </div>
                <div>
                  <span>Atualizado</span>
                  <strong>{formatDate(workout.updatedAt)}</strong>
                </div>
              </div>
              <div className="workout-insights">
                <div className="workout-insights-header">
                  <div>
                    <p className="workout-insights-eyebrow">Insights do treino</p>
                    <strong>Impacto do treino no aluno</strong>
                    <span>Resumo de foco, historico e sinais de evolucao.</span>
                  </div>
                  <div className="workout-insights-actions">
                    {insightsMeta && (
                      <span className={`workout-insights-meta${insightsMeta.isStale ? ' is-stale' : ''}`}>
                        {insightsMeta.source === 'openrouter' ? 'IA' : 'Cache'} ·{' '}
                        {formatDateTime(insightsMeta.updatedAt || insightsMeta.generatedAt)}
                        {insightsMeta.isStale ? ' · desatualizado' : ''}
                      </span>
                    )}
                    <button
                      className="button secondary sm"
                      type="button"
                      onClick={() => loadInsights(true)}
                      disabled={insightsLoading || !overallStats || !hasOpenRouter}
                    >
                      {insightsLoading ? 'Gerando...' : insights ? 'Atualizar IA' : 'Gerar IA'}
                    </button>
                  </div>
                </div>
                {insightsDataLoading && (
                  <p className="subtle">Carregando estatisticas do aluno...</p>
                )}
                {insightsError && <p style={{ color: '#c0392b' }}>{insightsError}</p>}
                {!insights && !insightsLoading && !insightsError && (
                  <p className="subtle">Nenhum insight salvo ainda.</p>
                )}
                {overallStats && (
                  <div className="workout-kpi-grid">
                    <div className="workout-kpi-card">
                      <span>Treinos</span>
                      <strong>{overallStats.totalWorkouts}</strong>
                      <p>Programas cadastrados para o aluno.</p>
                    </div>
                    <div className="workout-kpi-card">
                      <span>Exercicios</span>
                      <strong>{overallStats.totalExercises}</strong>
                      <p>Volume total de exercicios no historico.</p>
                    </div>
                    <div className="workout-kpi-card">
                      <span>Avaliacoes</span>
                      <strong>{evaluationSummary.total}</strong>
                      <p>Online, fisica, postural e personalizada.</p>
                    </div>
                    <div className="workout-kpi-card">
                      <span>IMC atual</span>
                      <strong>{latestImc ? latestImc.toFixed(1) : '--'}</strong>
                      <p>Baseado na ultima avaliacao.</p>
                    </div>
                  </div>
                )}
                {overallStats && (
                  <div className="workout-focus-panel">
                    <div className="workout-focus-header">
                      <strong>Foco principal</strong>
                      <span>Exercicios mais trabalhados pelo personal.</span>
                    </div>
                    <div className="workout-focus-list">
                      {overallStats.topExercises.length ? (
                        overallStats.topExercises.map((item) => (
                          <div key={item.name} className="workout-focus-item">
                            <span>{titleCase(item.name)}</span>
                            <div className="workout-focus-bar">
                              <span
                                style={{
                                  width: `${Math.round((item.count / maxFocusCount) * 100)}%`,
                                }}
                              />
                            </div>
                            <strong>{item.count}</strong>
                          </div>
                        ))
                      ) : (
                        <p className="subtle">Sem exercicios suficientes para analise.</p>
                      )}
                    </div>
                  </div>
                )}
                {insights && (
                  <div className="workout-ai-grid">
                    <div className="workout-ai-card">
                      <strong>Resumo IA</strong>
                      <p>{insights.resumo}</p>
                      <div className="ai-pill-list">
                        {insights.destaques.map((item) => (
                          <span key={item} className="portal-tag">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="workout-ai-card">
                      <strong>Impacto no aluno</strong>
                      <div className="workout-focus-list">
                        {insights.graficos.map((item) => (
                          <div key={item.label} className="workout-focus-item">
                            <span>{item.label}</span>
                            <div className="workout-focus-bar">
                              <span style={{ width: `${item.value}%` }} />
                            </div>
                            <strong>{item.value}%</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="workout-ai-card">
                      <strong>Distribuicao</strong>
                      <div className="workout-focus-list">
                        {insights.pizza.map((item) => (
                          <div key={item.label} className="workout-focus-item">
                            <span>{item.label}</span>
                            <div className="workout-focus-bar">
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
            </div>
          </div>
        </div>
      )}
      {showExerciseModal && (
        <div
          className="exercise-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowExerciseModal(false);
            }
          }}
        >
          <div className="exercise-modal-panel" role="dialog" aria-modal="true">
            <div className="exercise-modal-header">
              <div>
                <strong>Adicionar exercicio</strong>
                <span>Escolha no catalogo ou crie manualmente.</span>
              </div>
              <div className="exercise-modal-header-actions">
                <button
                  className="button secondary sm"
                  type="button"
                  onClick={handleAddExerciseManual}
                  disabled={saving}
                >
                  Criar manual
                </button>
                <button
                  className="button secondary sm"
                  type="button"
                  onClick={() => setShowExerciseModal(false)}
                >
                  Fechar
                </button>
              </div>
            </div>
            <div className="exercise-modal-controls">
              <label className="exercise-modal-search">
                Pesquisar
                <input
                  type="text"
                  value={exerciseSearch}
                  onChange={(event) => setExerciseSearch(event.target.value)}
                  placeholder="Buscar exercicio ou categoria"
                />
              </label>
              <button
                className="button secondary sm"
                type="button"
                onClick={loadExercises}
                disabled={exerciseLoading}
              >
                {exerciseLoading ? 'Carregando...' : 'Atualizar lista'}
              </button>
            </div>
            <div className="exercise-category-row">
              {EXERCISE_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`exercise-chip${selectedCategory === category.id ? ' is-active' : ''}`}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <div className="exercise-modal-content">
              {exerciseLoadError && (
                <p className="exercise-modal-error">Erro ao carregar exercicios: {exerciseLoadError}</p>
              )}
              {!exerciseLoading && filteredExercises.length === 0 && (
                <p className="subtle">Nenhum exercicio encontrado.</p>
              )}
              {exerciseLoading ? (
                <p className="subtle">Carregando exercicios...</p>
              ) : (
                <div className="exercise-grid">
                  {filteredExercises.map((exercise) => {
                    const name = exercise.nomeDoTreino || 'Exercicio';
                    const normalized = normalizeText(name);
                    const isAdded = addedExerciseKeys.has(normalized);
                    const videoUrl = exercise.videoUrl1080 || exercise.videoUrl720 || exercise.videoUrl;
                    return (
                      <div key={exercise.id} className="exercise-card-option">
                        <div className="exercise-card-title">
                          <div>
                            <strong>{name}</strong>
                            <span>{exercise.colecao || 'geral'}</span>
                          </div>
                          {videoUrl && <span className="exercise-card-pill">Video</span>}
                        </div>
                        <div className="exercise-card-meta">
                          <span>Series: {exercise.seriesRep ?? '--'}</span>
                          <span>Carga: {exercise.carga ?? '--'}</span>
                          <span>Intervalo: {exercise.intervalo ?? '--'}</span>
                        </div>
                        <button
                          className="button sm"
                          type="button"
                          onClick={() => handleAddExerciseFromList(exercise)}
                          disabled={saving || isAdded}
                        >
                          {isAdded ? 'Adicionado' : 'Adicionar'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </PageShell>
  );
}
