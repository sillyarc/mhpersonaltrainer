'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import { useAiAccessStatus } from '@/lib/hooks/useAiAccessStatus';
import { firestoreService, type Aluno } from '@/lib/services/firestoreService';
import { chatWithAI, generateAssistantSuggestions, type AssistantSuggestionTile } from '@/lib/services/ai';
import { createUserWorkout, fetchAvailableExercises } from '@/lib/services/workouts';
import {
  getAssistantUsage,
  recordAssistantUsage,
  getCachedAssistantSuggestions,
  saveAssistantSuggestions,
  type AssistantUsageItem,
  type AssistantSuggestionsCache,
} from '@/lib/services/assistantSuggestions';
import type { Exercise } from '@/lib/types/workout';

interface AssistantAnswer {
  id: string;
  text: string;
  workout?: {
    nomeDaRotina: string;
    objetivoDaRotina: string;
    treino: string[];
  };
  evaluation?: {
    titulo: string;
    objetivo?: string;
    itens: string[];
  };
  createdAt: Date;
}

type AssistantWorkout = NonNullable<AssistantAnswer['workout']>;

type WorkoutDraftItem = {
  name: string;
  series: string;
  reps: string;
  carga: string;
  rest: string;
};

type WorkoutDraft = {
  nomeDaRotina: string;
  objetivoDaRotina: string;
  items: WorkoutDraftItem[];
};

const formatTime = (date: Date) =>
  date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const formatWorkoutClipboard = (workout: AssistantAnswer['workout']) => {
  if (!workout) return '';
  const lines = workout.treino.map((item, index) => `${index + 1}. ${item}`);
  return [workout.nomeDaRotina, workout.objetivoDaRotina, ...lines].filter(Boolean).join('\n');
};

const formatEvaluationClipboard = (evaluation: AssistantAnswer['evaluation']) => {
  if (!evaluation) return '';
  const lines = evaluation.itens.map((item, index) => `${index + 1}. ${item}`);
  return [evaluation.titulo, evaluation.objetivo, ...lines].filter(Boolean).join('\n');
};

const DEFAULT_YOUTUBE_VIDEO = 'https://www.youtube.com/watch?v=ml6cT4AZdqI';

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

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

const parseExerciseLine = (line: string) => {
  const trimmed = line.trim();
  const parts = trimmed.split('-').map((part) => part.trim()).filter(Boolean);
  const name = parts[0] || trimmed;
  let series = 3;
  let reps = 12;
  let rest = 60;
  let carga = 0;

  const seriesMatch = trimmed.match(/(\d+)\s*(?:series|s[ei]ries)/i);
  if (seriesMatch) series = Number(seriesMatch[1]);

  const repsMatch = trimmed.match(/(\d+)\s*(?:reps?|repeti[cВ]oes)/i);
  if (repsMatch) reps = Number(repsMatch[1]);

  const restMatch =
    trimmed.match(/descanso\s*(\d+)/i) ||
    trimmed.match(/(\d+)\s*(?:seg|segundos)\b/i);
  if (restMatch) rest = Number(restMatch[1]);

  const cargaMatch =
    trimmed.match(/carga\s*(\d+(?:[.,]\d+)?)/i) ||
    trimmed.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (cargaMatch) {
    carga = Number(String(cargaMatch[1]).replace(',', '.'));
  }

  const compactMatch = trimmed.match(/(\d+)\s*x\s*(\d+)/i);
  if (compactMatch) {
    series = Number(compactMatch[1]);
    reps = Number(compactMatch[2]);
  }

  return { name, series, reps, rest, carga };
};

const toMetricString = (value: number | string | null | undefined, fallback: number | string) => {
  if (value === undefined || value === null || value === '') return String(fallback);
  return String(value);
};

const resolveExerciseVideo = (exercise?: Exercise | null) =>
  exercise?.videoUrl1080 ||
  exercise?.videoUrl720 ||
  exercise?.videoUrl ||
  DEFAULT_YOUTUBE_VIDEO;

const buildExerciseIndex = (items: Exercise[]) => {
  const indexed = items.map((item) => ({
    item,
    name: normalizeText(item.nomeDoTreino || ''),
  }));
  const exactMap = new Map<string, Exercise>();
  indexed.forEach((entry) => {
    if (entry.name && !exactMap.has(entry.name)) {
      exactMap.set(entry.name, entry.item);
    }
  });
  return { indexed, exactMap };
};

const findExerciseMatch = (
  name: string,
  index: { indexed: { item: Exercise; name: string }[]; exactMap: Map<string, Exercise> }
) => {
  const normalized = normalizeText(name);
  const direct = index.exactMap.get(normalized);
  if (direct) return direct;
  let best: Exercise | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  index.indexed.forEach((entry) => {
    if (!entry.name) return;
    const contains = entry.name.includes(normalized) || normalized.includes(entry.name);
    if (!contains) return;
    const score = Math.abs(entry.name.length - normalized.length);
    if (score < bestScore) {
      best = entry.item;
      bestScore = score;
    }
  });
  return best;
};

const buildWorkoutItemsFromLines = (lines: string[], catalog?: Exercise[]) => {
  const parsed = lines.map(parseExerciseLine).map((item) => ({
    name: item.name,
    series: String(item.series),
    reps: String(item.reps),
    carga: String(item.carga ?? 0),
    rest: String(item.rest),
  }));
  if (!catalog?.length) return parsed;
  const index = buildExerciseIndex(catalog);
  return parsed.map((item) => {
    const match = findExerciseMatch(item.name, index);
    return {
      ...item,
      name: match?.nomeDoTreino || item.name,
      series: toMetricString(match?.seriesRep, item.series),
      carga: toMetricString(match?.carga, item.carga),
      rest: toMetricString(match?.intervalo, item.rest),
    };
  });
};

const cleanWorkoutItems = (items: WorkoutDraftItem[]) =>
  items
    .map((item) => {
      const name = String(item.name || '').trim();
      if (!name) return null;
      return {
        name,
        series: toMetricString(item.series, 3),
        reps: toMetricString(item.reps, 12),
        carga: toMetricString(item.carga, 0),
        rest: toMetricString(item.rest, 60),
      };
    })
    .filter((item): item is WorkoutDraftItem => Boolean(item));

const serializeWorkoutItems = (items: WorkoutDraftItem[]) =>
  items
    .map((item) => {
      const name = String(item.name || '').trim();
      if (!name) return '';
      const series = String(item.series || '').trim();
      const reps = String(item.reps || '').trim();
      const rest = String(item.rest || '').trim();
      const carga = String(item.carga || '').trim();
      const parts = [name];
      if (series || reps) {
        parts.push(`${series || '3'} x ${reps || '12'}`);
      }
      if (carga && carga !== '0') {
        parts.push(`carga ${carga}`);
      }
      if (rest) {
        parts.push(`${rest} segundos`);
      }
      return parts.join(' - ');
    })
    .filter(Boolean);

const buildWorkoutPayload = async (workout: AssistantWorkout | WorkoutDraft) => {
  const rawItems =
    'items' in workout
      ? workout.items
      : buildWorkoutItemsFromLines(Array.isArray(workout.treino) ? workout.treino : []);
  const cleaned = cleanWorkoutItems(rawItems);
  const exercisesResult = await fetchAvailableExercises();
  const catalog = exercisesResult.data || [];
  const index = buildExerciseIndex(catalog);
  const resolved = cleaned.map((item) => {
    const match = findExerciseMatch(item.name, index);
    return {
      ...item,
      name: match?.nomeDoTreino || item.name,
      series: toMetricString(match?.seriesRep, item.series),
      carga: toMetricString(match?.carga, item.carga),
      rest: toMetricString(match?.intervalo, item.rest),
      videoUrl: resolveExerciseVideo(match),
    };
  });
  return {
    nomeDoTreino: workout.nomeDaRotina || 'Treino sugerido',
    obsInstrucao: workout.objetivoDaRotina || '',
    treino: resolved.map((item) => item.name),
    seriesRep: resolved.map((item) => item.series),
    repeticoes: resolved.map((item) => item.reps),
    carga: resolved.map((item) => item.carga),
    intervalo: resolved.map((item) => item.rest),
    videoUrls: resolved.map((item) => item.videoUrl),
    arquivos: false,
  };
};

const buildWorkoutRoute = (workoutId: string, studentId?: string) =>
  studentId ? `/workout/${workoutId}?studentId=${studentId}` : `/workout/${workoutId}`;

const buildLocalSuggestions = (params: {
  usage: AssistantUsageItem[];
  studentGoal?: string;
  evaluationType?: string;
}): { quickPrompts: string[]; tiles: AssistantSuggestionTile[] } => {
  const goal = params.studentGoal?.trim();
  const evaluationType =
    params.evaluationType && params.evaluationType !== 'nenhuma' ? params.evaluationType : '';
  const quickPrompts = params.usage.map((item) => item.text).filter(Boolean).slice(0, 4);

  const fallbackPrompts = [
    goal ? `Crie um treino focado em ${goal}.` : 'Crie um treino de musculacao completo.',
    evaluationType
      ? `Gere um resumo rapido da avaliacao ${evaluationType}.`
      : 'Resumo rapido da evolucao do aluno nas ultimas 4 semanas.',
    'Mensagem motivacional curta para o aluno.',
    'Checklist de aquecimento rapido antes do treino.',
  ];

  fallbackPrompts.forEach((item) => {
    if (quickPrompts.length < 4 && item) {
      quickPrompts.push(item);
    }
  });

  const tilesFromUsage = params.usage.slice(0, 3).map((item, index) => {
    const title = item.text.split(' ').slice(0, 3).join(' ') || `Sugestao ${index + 1}`;
    return {
      title,
      description: 'Baseado no seu historico recente.',
      prompt: item.text,
    };
  });

  const tilesFallback: AssistantSuggestionTile[] = [
    {
      title: goal ? `Treino ${goal}` : 'Treino objetivo',
      description: 'Plano direto com series e reps.',
      prompt: goal ? `Crie um treino com foco em ${goal}.` : 'Crie um treino com foco em hipertrofia.',
    },
    {
      title: 'Feedback do aluno',
      description: 'Mensagem curta para engajamento.',
      prompt: 'Escreva uma mensagem motivacional curta para o aluno continuar.',
    },
    {
      title: evaluationType ? `Resumo ${evaluationType}` : 'Resumo evolucao',
      description: 'Resumo dos ultimos treinos e progresso.',
      prompt: evaluationType
        ? `Gere um resumo da avaliacao ${evaluationType} com pontos de atencao.`
        : 'Resumo rapido da evolucao do aluno nas ultimas 4 semanas.',
    },
  ];

  const tiles = [...tilesFromUsage];
  tilesFallback.forEach((item) => {
    if (tiles.length < 3) {
      tiles.push(item);
    }
  });

  return { quickPrompts, tiles };
};

export default function AiAssistantPage() {
  const { user, role } = useAuth();
  const aiAccess = useAiAccessStatus();
  const searchParams = useSearchParams();
  const router = useRouter();
  const presetPrompt = searchParams.get('prompt') || '';
  const [prompt, setPrompt] = useState(presetPrompt);
  const [answers, setAnswers] = useState<AssistantAnswer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentGoal, setStudentGoal] = useState('');
  const [evaluationType, setEvaluationType] = useState('nenhuma');
  const [workoutDrafts, setWorkoutDrafts] = useState<Record<string, WorkoutDraft>>({});
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [creatingWorkoutId, setCreatingWorkoutId] = useState<string | null>(null);
  const [workoutErrors, setWorkoutErrors] = useState<Record<string, string>>({});
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [exerciseLoading, setExerciseLoading] = useState(false);
  const [exerciseLoadError, setExerciseLoadError] = useState('');
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [exerciseTargetId, setExerciseTargetId] = useState<string | null>(null);
  const [quickPrompts, setQuickPrompts] = useState<string[]>([]);
  const [suggestionTiles, setSuggestionTiles] = useState<AssistantSuggestionTile[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [usageHistory, setUsageHistory] = useState<AssistantUsageItem[]>([]);
  const [cachedSuggestions, setCachedSuggestions] = useState<AssistantSuggestionsCache | null>(null);
  const openRouterKey =
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
  const hasOpenRouter = Boolean(openRouterKey);
  const allowRemoteSuggestions = hasOpenRouter && aiAccess.premium;
  const isPersonal = role === 'personal' || role === 'professor' || role === 'admin';
  const selectedStudent = useMemo(
    () =>
      students.find((student) => (student.uid || student.id) === selectedStudentId) ||
      students.find((student) => student.id === selectedStudentId) ||
      null,
    [students, selectedStudentId]
  );

  useEffect(() => {
    if (presetPrompt) {
      setPrompt(presetPrompt);
      return;
    }
    if (typeof window === 'undefined') return;
    const stored = window.sessionStorage.getItem('mh-assistant-prompt');
    if (stored) {
      setPrompt(stored);
      window.sessionStorage.removeItem('mh-assistant-prompt');
    }
  }, [presetPrompt]);

  useEffect(() => {
    if (!user?.uid) return;
    let active = true;
    getAssistantUsage(user.uid).then((items) => {
      if (!active) return;
      setUsageHistory(items);
    });
    getCachedAssistantSuggestions(user.uid).then((cache) => {
      if (!active) return;
      setCachedSuggestions(cache);
    });
    return () => {
      active = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!copyMessage) return;
    const timer = window.setTimeout(() => setCopyMessage(''), 2000);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  useEffect(() => {
    if (!user?.uid || !isPersonal) {
      setStudents([]);
      return;
    }
    let active = true;
    firestoreService.getAlunosDoPersonal(user.uid).then((data) => {
      if (!active) return;
      setStudents(data);
      if (!selectedStudentId && data.length) {
        setSelectedStudentId(data[0].uid || data[0].id);
      }
    });
    return () => {
      active = false;
    };
  }, [isPersonal, selectedStudentId, user?.uid]);

  const loadExercises = async (setLoading = true) => {
    if (setLoading) {
      setExerciseLoading(true);
    }
    setExerciseLoadError('');
    const result = await fetchAvailableExercises();
    if (result.error) {
      setExerciseLoadError(result.error);
      setAvailableExercises([]);
      if (setLoading) setExerciseLoading(false);
      return [];
    }
    setAvailableExercises(result.data || []);
    if (setLoading) setExerciseLoading(false);
    return result.data || [];
  };

  useEffect(() => {
    if (!showExerciseModal) return;
    loadExercises(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showExerciseModal]);

  const studentLabel =
    selectedStudent?.nome || selectedStudent?.email || user?.displayName || user?.email || '';
  const normalizedGoal = studentGoal.trim();
  const goalForSuggestions = normalizedGoal.length >= 3 ? normalizedGoal : '';
  const activeDraft = editingWorkoutId ? workoutDrafts[editingWorkoutId] : null;
  const addedExerciseKeys = useMemo(() => {
    if (!activeDraft) return new Set<string>();
    return new Set(activeDraft.items.map((item) => normalizeText(item.name || '').trim()));
  }, [activeDraft]);
  const filteredExercises = useMemo(() => {
    let pool = availableExercises;
    if (selectedCategory !== 'all') {
      const keywords = CATEGORY_KEYWORDS[selectedCategory] || [];
      pool = pool.filter((exercise) => {
        const colecao = normalizeText(exercise.colecao || '').trim();
        if (!colecao) return false;
        return keywords.some((keyword) => colecao.includes(keyword));
      });
    }
    const searchTerm = normalizeText(exerciseSearch).trim();
    if (!searchTerm) return pool;
    return pool.filter((exercise) => {
      const name = normalizeText(exercise.nomeDoTreino || '').trim();
      const colecao = normalizeText(exercise.colecao || '').trim();
      return name.includes(searchTerm) || colecao.includes(searchTerm);
    });
  }, [availableExercises, exerciseSearch, selectedCategory]);

  const topUsage = useMemo(() => usageHistory.map((item) => item.text).slice(0, 8), [usageHistory]);
  const localSuggestions = useMemo(
    () =>
      buildLocalSuggestions({
        usage: usageHistory,
        studentGoal: goalForSuggestions,
        evaluationType,
      }),
    [evaluationType, goalForSuggestions, usageHistory]
  );
  const statusLabel = hasOpenRouter ? 'IA ativa' : 'IA indisponivel';
  const statusHint = hasOpenRouter
    ? 'Sugestoes inteligentes liberadas para voce.'
    : 'Conecte o OpenRouter para liberar sugestoes.';
  const contextSummary = [
    { label: 'Aluno', value: studentLabel || 'Nao definido' },
    { label: 'Objetivo', value: studentGoal.trim() ? studentGoal.trim() : 'Nao definido' },
    { label: 'Avaliacao', value: evaluationType === 'nenhuma' ? 'Nenhuma' : evaluationType },
  ];

  const recordPromptUsage = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || !user?.uid) return;
    try {
      await recordAssistantUsage(user.uid, trimmed);
      const refreshed = await getAssistantUsage(user.uid);
      setUsageHistory(refreshed);
    } catch (err) {
      console.error('Erro ao salvar uso do prompt', err);
    }
  };

  const buildPrompt = (basePrompt: string) => {
    const context: string[] = [];
    const wantsWorkout = /treino|rotina|ficha/i.test(basePrompt);
    if (studentLabel) {
      context.push(`Aluno: ${studentLabel}.`);
    }
    if (studentGoal.trim()) {
      context.push(`Objetivo: ${studentGoal.trim()}.`);
    }
    if (evaluationType !== 'nenhuma') {
      context.push(`Avaliacao: ${evaluationType}.`);
    }
    if (wantsWorkout) {
      context.push('Use exercicios da colecao treinors quando montar o treino.');
    }
    return context.length ? `${context.join(' ')}\n${basePrompt}` : basePrompt;
  };

  useEffect(() => {
    const currentContext = {
      studentGoal: goalForSuggestions || undefined,
      evaluationType,
      studentLabel: studentLabel || undefined,
    };
    const hasCache = Boolean(
      cachedSuggestions?.quickPrompts?.length || cachedSuggestions?.tiles?.length
    );
    const cacheAgeMs = cachedSuggestions?.updatedAt
      ? Date.now() - cachedSuggestions.updatedAt.getTime()
      : Number.POSITIVE_INFINITY;
    const cacheFresh = cacheAgeMs < 24 * 60 * 60 * 1000;
    const cacheContext = cachedSuggestions?.context;
    const cacheMatches =
      Boolean(cacheContext) &&
      (cacheContext?.studentGoal || '') === (currentContext.studentGoal || '') &&
      (cacheContext?.evaluationType || '') === (currentContext.evaluationType || '') &&
      (cacheContext?.studentLabel || '') === (currentContext.studentLabel || '');

    if (!allowRemoteSuggestions) {
      if (hasCache) {
        setQuickPrompts(cachedSuggestions?.quickPrompts || []);
        setSuggestionTiles(cachedSuggestions?.tiles || []);
        setSuggestionsError('');
      } else {
        setQuickPrompts(localSuggestions.quickPrompts);
        setSuggestionTiles(localSuggestions.tiles);
        setSuggestionsError(
          hasOpenRouter
            ? 'Sugestoes automaticas disponiveis apenas no Premium.'
            : 'IA indisponivel no momento.'
        );
      }
      setSuggestionsLoading(false);
      return;
    }

    if (hasCache) {
      setQuickPrompts(cachedSuggestions?.quickPrompts || []);
      setSuggestionTiles(cachedSuggestions?.tiles || []);
    } else if (localSuggestions.quickPrompts.length || localSuggestions.tiles.length) {
      setQuickPrompts(localSuggestions.quickPrompts);
      setSuggestionTiles(localSuggestions.tiles);
    }

    if (hasCache && cacheFresh && cacheMatches) {
      setSuggestionsLoading(false);
      setSuggestionsError('');
      return;
    }

    let active = true;
    setSuggestionsLoading(true);
    setSuggestionsError('');
    const timer = window.setTimeout(async () => {
      try {
        const response = await generateAssistantSuggestions({
          usage: topUsage,
          studentGoal: goalForSuggestions,
          evaluationType,
          studentLabel,
        });
        if (!active) return;
        setQuickPrompts(response.quickPrompts);
        setSuggestionTiles(response.tiles);
        if (user?.uid) {
          await saveAssistantSuggestions(user.uid, {
            quickPrompts: response.quickPrompts,
            tiles: response.tiles,
            context: currentContext,
            source: 'openrouter',
          });
          setCachedSuggestions({
            quickPrompts: response.quickPrompts,
            tiles: response.tiles,
            updatedAt: new Date(),
            context: currentContext,
            source: 'openrouter',
          });
        }
      } catch (err: any) {
        if (!active) return;
        setSuggestionsError(err.message || 'Erro ao carregar sugestoes.');
        if (hasCache) {
          setQuickPrompts(cachedSuggestions?.quickPrompts || []);
          setSuggestionTiles(cachedSuggestions?.tiles || []);
        } else {
          setQuickPrompts(localSuggestions.quickPrompts);
          setSuggestionTiles(localSuggestions.tiles);
          if (user?.uid) {
            await saveAssistantSuggestions(user.uid, {
              quickPrompts: localSuggestions.quickPrompts,
              tiles: localSuggestions.tiles,
              context: currentContext,
              source: 'local-ml',
            });
          }
        }
      } finally {
        if (active) {
          setSuggestionsLoading(false);
        }
      }
    }, 450);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    cachedSuggestions,
    evaluationType,
    allowRemoteSuggestions,
    hasOpenRouter,
    localSuggestions,
    goalForSuggestions,
    studentLabel,
    topUsage,
    user?.uid,
  ]);

  const handlePromptRequest = async (basePrompt: string, clearPrompt: boolean) => {
    const trimmed = basePrompt.trim();
    if (!trimmed) return;
    if (isPersonal && !selectedStudent) {
      setError('Selecione um aluno para contextualizar o treino.');
      return;
    }
    const promptLower = trimmed.toLowerCase();
    const needsEvaluationType = ['avaliacao', 'postural', 'fisica', 'online', 'personalizada'].some(
      (term) => promptLower.includes(term)
    );
    if (needsEvaluationType && evaluationType === 'nenhuma') {
      setError('Selecione o tipo de avaliacao desejada.');
      return;
    }
    if (!hasOpenRouter) {
      setError('IA indisponivel no momento.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await chatWithAI(buildPrompt(trimmed));
      setAnswers((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: response.text,
          workout: response.workout,
          evaluation: response.evaluation,
          createdAt: new Date(),
        },
        ...prev,
      ]);
      await recordPromptUsage(trimmed);
      if (clearPrompt) {
        setPrompt('');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar resposta.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await handlePromptRequest(prompt, true);
  };

  const startWorkoutEdit = async (answer: AssistantAnswer) => {
    const workout = answer.workout;
    if (!workout) return;
    setEditingWorkoutId(answer.id);
    setWorkoutErrors((prev) => ({ ...prev, [answer.id]: '' }));
    if (workoutDrafts[answer.id]) return;
    const catalog = availableExercises.length ? availableExercises : await loadExercises(false);
    const items = buildWorkoutItemsFromLines(workout.treino || [], catalog);
    setWorkoutDrafts((prev) => ({
      ...prev,
      [answer.id]: {
        nomeDaRotina: workout.nomeDaRotina || '',
        objetivoDaRotina: workout.objetivoDaRotina || '',
        items,
      },
    }));
  };

  const cancelWorkoutEdit = (answerId: string) => {
    setWorkoutDrafts((prev) => {
      const next = { ...prev };
      delete next[answerId];
      return next;
    });
    setEditingWorkoutId((current) => (current === answerId ? null : current));
  };

  const saveWorkoutEdit = (answerId: string) => {
    const draft = workoutDrafts[answerId];
    if (!draft) return;
    const treino = serializeWorkoutItems(draft.items);
    setAnswers((prev) =>
      prev.map((item) =>
        item.id === answerId
          ? {
              ...item,
              workout: {
                nomeDaRotina: draft.nomeDaRotina,
                objetivoDaRotina: draft.objetivoDaRotina,
                treino,
              },
            }
          : item
      )
    );
    setWorkoutDrafts((prev) => {
      const next = { ...prev };
      delete next[answerId];
      return next;
    });
    setEditingWorkoutId((current) => (current === answerId ? null : current));
  };

  const updateWorkoutField = (
    answerId: string,
    field: 'nomeDaRotina' | 'objetivoDaRotina',
    value: string
  ) => {
    setWorkoutDrafts((prev) => {
      const current = prev[answerId];
      if (!current) return prev;
      return {
        ...prev,
        [answerId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const updateWorkoutItem = (
    answerId: string,
    index: number,
    field: keyof WorkoutDraftItem,
    value: string
  ) => {
    setWorkoutDrafts((prev) => {
      const current = prev[answerId];
      if (!current) return prev;
      const items = [...current.items];
      const target = items[index];
      if (!target) return prev;
      items[index] = { ...target, [field]: value };
      return {
        ...prev,
        [answerId]: {
          ...current,
          items,
        },
      };
    });
  };

  const handleAddExerciseManual = (answerId: string) => {
    setWorkoutDrafts((prev) => {
      const current = prev[answerId];
      if (!current) return prev;
      const nextItem: WorkoutDraftItem = {
        name: '',
        series: '3',
        reps: '12',
        carga: '0',
        rest: '60',
      };
      return {
        ...prev,
        [answerId]: {
          ...current,
          items: [...current.items, nextItem],
        },
      };
    });
    setShowExerciseModal(false);
    setExerciseTargetId(null);
  };

  const handleOpenExerciseModal = (answerId: string) => {
    setExerciseSearch('');
    setSelectedCategory('all');
    setExerciseTargetId(answerId);
    setShowExerciseModal(true);
  };

  const handleAddExerciseFromList = (exercise: Exercise) => {
    const targetId = exerciseTargetId || editingWorkoutId;
    if (!targetId) return;
    const name = String(exercise.nomeDoTreino || '').trim();
    if (!name) return;
    const normalized = normalizeText(name || '').trim();
    if (addedExerciseKeys.has(normalized)) return;
    setWorkoutDrafts((prev) => {
      const current = prev[targetId];
      if (!current) return prev;
      const nextItem: WorkoutDraftItem = {
        name,
        series: toMetricString(exercise.seriesRep, 3),
        reps: '12',
        carga: toMetricString(exercise.carga, 0),
        rest: toMetricString(exercise.intervalo, 60),
      };
      return {
        ...prev,
        [targetId]: {
          ...current,
          items: [...current.items, nextItem],
        },
      };
    });
    setShowExerciseModal(false);
    setExerciseTargetId(null);
  };

  const handleRemoveDraftExercise = (answerId: string, index: number) => {
    setWorkoutDrafts((prev) => {
      const current = prev[answerId];
      if (!current) return prev;
      return {
        ...prev,
        [answerId]: {
          ...current,
          items: current.items.filter((_, itemIndex) => itemIndex !== index),
        },
      };
    });
  };

  const handleCreateWorkout = async (
    answerId: string,
    workout: AssistantWorkout | WorkoutDraft
  ) => {
    if (!user?.uid) return;
    const targetUserId = isPersonal
      ? selectedStudent?.uid || selectedStudent?.id || selectedStudentId
      : user.uid;

    if (isPersonal && !targetUserId) {
      setWorkoutErrors((prev) => ({
        ...prev,
        [answerId]: 'Selecione um aluno para criar o treino.',
      }));
      return;
    }
    const workoutCount =
      'items' in workout
        ? workout.items.filter((item) => String(item.name || '').trim()).length
        : (workout.treino || []).filter((item) => String(item || '').trim()).length;
    if (!workoutCount) {
      setWorkoutErrors((prev) => ({
        ...prev,
        [answerId]: 'Adicione pelo menos um exercicio antes de criar.',
      }));
      return;
    }

    setWorkoutErrors((prev) => ({ ...prev, [answerId]: '' }));
    setCreatingWorkoutId(answerId);
    try {
      const payload = await buildWorkoutPayload(workout);
      const result = await createUserWorkout(targetUserId, payload);
      if (result.error || !result.data?.id) {
        throw new Error(result.error || 'Falha ao criar o treino.');
      }
      const route = buildWorkoutRoute(result.data.id, isPersonal ? targetUserId : undefined);
      router.push(route);
    } catch (err: any) {
      setWorkoutErrors((prev) => ({
        ...prev,
        [answerId]: err?.message || 'Nao foi possivel criar o treino.',
      }));
    } finally {
      setCreatingWorkoutId((current) => (current === answerId ? null : current));
    }
  };

  const modalTargetId = exerciseTargetId || editingWorkoutId;

  return (
    <PageShell
      title="Assistente MH"
      description="Chat inteligente para treinos, duvidas e sugestoes."
      breadcrumbs={[{ label: 'MH Assistente', href: '/ai' }]}
    >
      <section className="ai-page ai-assistant-page">
        <div className="ai-assistant-hero assistant-hero">
          <div className="assistant-hero-main">
            <span className="assistant-pill">Assistente MH</span>
            <h2>Planeje treinos e mensagens com respostas diretas.</h2>
            <p className="subtle">
              O assistente organiza o contexto do aluno e entrega respostas prontas para voce ajustar e salvar.
            </p>
            <p className="subtle" style={{ marginTop: 6 }}>
              {aiAccess.premium
                ? 'Plano Premium: uso ilimitado.'
                : 'Plano gratuito: cada solicitacao no chat IA consome 1 credito.'}
            </p>
            <div className="assistant-hero-badges">
              <span>Treinos com IA</span>
              <span>Mensagens prontas</span>
              <span>Resumo de evolucao</span>
            </div>
          </div>
          <div className="assistant-hero-panel">
            <div className="assistant-hero-card">
              <p className="assistant-hero-label">Como pedir o prompt</p>
              <ul className="assistant-hero-list">
                <li>Descreva o aluno, objetivo e tempo disponivel.</li>
                <li>Peca resumos, mensagens ou ajustes de treino.</li>
                <li>Use as respostas como base da rotina.</li>
              </ul>
            </div>
            <div className="assistant-hero-card assistant-hero-card--status">
              <span className={`assistant-status ${hasOpenRouter ? 'is-live' : 'is-offline'}`}>
                {statusLabel}
              </span>
              <p>{statusHint}</p>
            </div>
          </div>
        </div>

        <div className="ai-assistant-grid assistant-grid">
          <div className="card ai-prompt-card assistant-prompt-card">
            <div className="assistant-card-header">
              <div>
                <h3>Prompt principal</h3>
                <p className="subtle">O contexto abaixo e aplicado automaticamente no envio.</p>
              </div>
              <button
                className="button secondary sm"
                type="button"
                onClick={() => setPrompt('')}
                disabled={loading}
              >
                Limpar
              </button>
            </div>
            <div className="assistant-context-summary">
              {contextSummary.map((item) => (
                <div key={item.label} className="assistant-context-pill">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <form className="ai-form assistant-form" onSubmit={handleSubmit}>
              <div className="ai-context-grid assistant-context-grid">
                <label>
                  Aluno
                  {isPersonal ? (
                    <select
                      value={selectedStudentId}
                      onChange={(event) => setSelectedStudentId(event.target.value)}
                    >
                      <option value="">Selecione um aluno</option>
                      {students.map((student) => (
                        <option key={student.id} value={student.uid || student.id}>
                          {student.nome} - {student.email}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={user?.displayName || user?.email || ''}
                      disabled
                    />
                  )}
                </label>
                <label>
                  Objetivo
                  <input
                    type="text"
                    value={studentGoal}
                    onChange={(event) => setStudentGoal(event.target.value)}
                    placeholder="Hipertrofia, emagrecimento..."
                  />
                </label>
                <label>
                  Tipo de avaliacao
                  <select value={evaluationType} onChange={(event) => setEvaluationType(event.target.value)}>
                    <option value="nenhuma">Nenhuma</option>
                    <option value="online">Online</option>
                    <option value="fisica">Fisica</option>
                    <option value="postural">Postural</option>
                    <option value="personalizada">Personalizada</option>
                  </select>
                </label>
              </div>
              <label className="assistant-prompt-label">
                Pergunta
                <span>Ex: Crie um treino ABC com 4 exercicios por dia.</span>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Digite sua pergunta aqui..."
                  rows={4}
                />
              </label>
              <div className="assistant-suggestions">
                <div className="assistant-suggestions-header">
                  <strong>Sugestoes rapidas</strong>
                  {suggestionsLoading && <span>Atualizando...</span>}
                </div>
                <div className="ai-chip-row assistant-chip-row">
                  {suggestionsLoading && !quickPrompts.length ? (
                    <span className="subtle">Carregando sugestoes...</span>
                  ) : quickPrompts.length ? (
                    quickPrompts.map((item) => (
                      <button
                        key={item}
                        className="ai-chip assistant-chip"
                        type="button"
                        onClick={() => {
                          setPrompt(item);
                          handlePromptRequest(item, false);
                        }}
                      >
                        {item}
                      </button>
                    ))
                  ) : suggestionsError ? (
                    <span className="subtle">{suggestionsError}</span>
                  ) : (
                    <span className="subtle">Nenhuma sugestao disponivel.</span>
                  )}
                </div>
              </div>
              {error && <p className="ai-alert">{error}</p>}
              {copyMessage && <p className="ai-alert">{copyMessage}</p>}
              <button className="button assistant-submit" type="submit" disabled={loading || !hasOpenRouter}>
                {loading ? 'Gerando...' : 'Enviar'}
              </button>
            </form>
          </div>

          <div className="card ai-response-card assistant-response-card">
            <div className="assistant-card-header">
              <div>
                <h3>Respostas recentes</h3>
                <p className="subtle">Conteudos gerados para voce reutilizar.</p>
              </div>
              <span className="assistant-pill assistant-pill--soft">Historico local</span>
            </div>
            {answers.length ? (
              <div className="ai-response-list">
                {answers.map((answer, index) => {
                  const hasWorkout = !!answer.workout?.treino?.length;
                  const hasEvaluation = !!answer.evaluation?.itens?.length;
                  const workoutKey = `workout-${answer.id}`;
                  const evaluationKey = `evaluation-${answer.id}`;
                  const workoutExpanded = expandedIds[workoutKey];
                  const evaluationExpanded = expandedIds[evaluationKey];
                  const workoutData = hasWorkout ? answer.workout : null;
                  const workoutDraft = workoutDrafts[answer.id];
                  const workoutItems = workoutData
                    ? workoutExpanded
                      ? workoutData.treino
                      : workoutData.treino.slice(0, 4)
                    : [];
                  const evaluationItems = hasEvaluation
                    ? evaluationExpanded
                      ? answer.evaluation!.itens
                      : answer.evaluation!.itens.slice(0, 4)
                    : [];
                  const isEditingWorkout = editingWorkoutId === answer.id;
                  return (
                    <div key={answer.id} className="ai-response-item assistant-response-item">
                      <div className="ai-response-meta">
                        <strong>
                          {hasWorkout
                            ? 'Treino gerado'
                            : hasEvaluation
                            ? 'Avaliacao gerada'
                            : `Resposta ${answers.length - index}`}
                        </strong>
                        <span className="assistant-time">{formatTime(answer.createdAt)}</span>
                      </div>
                      {!hasWorkout && !hasEvaluation && <p className="ai-response-text">{answer.text}</p>}
                      {hasWorkout && workoutData && (
                        <div className="ai-workout-card assistant-workout-card">
                          <div className="ai-workout-header">
                            <div>
                              <span className="ai-workout-tag">Treino IA</span>
                              <h4>{workoutData.nomeDaRotina || 'Treino sugerido'}</h4>
                              {workoutData.objetivoDaRotina && (
                                <p className="ai-workout-objective">{workoutData.objetivoDaRotina}</p>
                              )}
                            </div>
                            {!isEditingWorkout && (
                              <button
                                type="button"
                                className="ai-workout-toggle"
                                onClick={() =>
                                  setExpandedIds((prev) => ({
                                    ...prev,
                                    [workoutKey]: !prev[workoutKey],
                                  }))
                                }
                              >
                                {workoutExpanded ? 'Mostrar menos' : 'Ver treino'}
                              </button>
                            )}
                          </div>
                          {isEditingWorkout ? (
                            <div className="ai-form">
                              {workoutDraft ? (
                                <>
                                  <label>
                                    Nome do treino
                                    <input
                                      type="text"
                                      value={workoutDraft.nomeDaRotina || ''}
                                      onChange={(event) =>
                                        updateWorkoutField(answer.id, 'nomeDaRotina', event.target.value)
                                      }
                                    />
                                  </label>
                                  <label>
                                    Objetivo
                                    <textarea
                                      rows={3}
                                      value={workoutDraft.objetivoDaRotina || ''}
                                      onChange={(event) =>
                                        updateWorkoutField(answer.id, 'objetivoDaRotina', event.target.value)
                                      }
                                    />
                                  </label>
                                  <div className="workout-editor">
                                    <h4>Exercicios</h4>
                                    {workoutDraft.items.length ? (
                                      <div className="workout-editor-list">
                                        {workoutDraft.items.map((item, itemIndex) => (
                                          <div key={`${answer.id}-item-${itemIndex}`} className="workout-editor-row">
                                            <div className="workout-card-title">
                                              <span className="workout-index">
                                                {String(itemIndex + 1).padStart(2, '0')}
                                              </span>
                                              <input
                                                className="workout-input workout-name"
                                                value={item.name}
                                                onChange={(event) =>
                                                  updateWorkoutItem(
                                                    answer.id,
                                                    itemIndex,
                                                    'name',
                                                    event.target.value
                                                  )
                                                }
                                                placeholder="Nome do exercicio"
                                              />
                                              <button
                                                className="workout-remove"
                                                type="button"
                                                onClick={() => handleRemoveDraftExercise(answer.id, itemIndex)}
                                              >
                                                Remover
                                              </button>
                                            </div>
                                            <div className="workout-editor-fields">
                                              <label>
                                                Series
                                                <input
                                                  className="workout-input"
                                                  value={item.series}
                                                  onChange={(event) =>
                                                    updateWorkoutItem(
                                                      answer.id,
                                                      itemIndex,
                                                      'series',
                                                      event.target.value
                                                    )
                                                  }
                                                />
                                              </label>
                                              <label>
                                                Reps
                                                <input
                                                  className="workout-input"
                                                  value={item.reps}
                                                  onChange={(event) =>
                                                    updateWorkoutItem(
                                                      answer.id,
                                                      itemIndex,
                                                      'reps',
                                                      event.target.value
                                                    )
                                                  }
                                                />
                                              </label>
                                              <label>
                                                Carga
                                                <input
                                                  className="workout-input"
                                                  value={item.carga}
                                                  onChange={(event) =>
                                                    updateWorkoutItem(
                                                      answer.id,
                                                      itemIndex,
                                                      'carga',
                                                      event.target.value
                                                    )
                                                  }
                                                />
                                              </label>
                                              <label>
                                                Intervalo
                                                <input
                                                  className="workout-input"
                                                  value={item.rest}
                                                  onChange={(event) =>
                                                    updateWorkoutItem(
                                                      answer.id,
                                                      itemIndex,
                                                      'rest',
                                                      event.target.value
                                                    )
                                                  }
                                                />
                                              </label>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="subtle" style={{ marginTop: 8 }}>
                                        Nenhum exercicio adicionado ainda.
                                      </p>
                                    )}
                                    <div className="workout-row-actions">
                                      <button
                                        type="button"
                                        className="button secondary sm"
                                        onClick={() => handleAddExerciseManual(answer.id)}
                                      >
                                        Adicionar manual
                                      </button>
                                      <button
                                        type="button"
                                        className="button secondary sm"
                                        onClick={() => handleOpenExerciseModal(answer.id)}
                                      >
                                        Adicionar da colecao
                                      </button>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <p className="subtle">Carregando exercicios...</p>
                              )}
                              <div className="ai-workout-actions">
                                <button
                                  type="button"
                                  className="button secondary sm"
                                  onClick={() => cancelWorkoutEdit(answer.id)}
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  className="button secondary sm"
                                  onClick={() => saveWorkoutEdit(answer.id)}
                                  disabled={!workoutDraft}
                                >
                                  Salvar edicao
                                </button>
                                <button
                                  type="button"
                                  className="button sm"
                                  onClick={() => {
                                    const draft = workoutDrafts[answer.id];
                                    if (draft) {
                                      handleCreateWorkout(answer.id, draft);
                                      return;
                                    }
                                    if (workoutData) {
                                      handleCreateWorkout(answer.id, workoutData);
                                    }
                                  }}
                                  disabled={creatingWorkoutId === answer.id || !workoutDraft}
                                >
                                  {creatingWorkoutId === answer.id ? 'Criando...' : 'Criar treino agora'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <ul className="ai-workout-list">
                                {workoutItems.map((item, itemIndex) => (
                                  <li key={`${answer.id}-${itemIndex}`}>
                                    <span>{itemIndex + 1}.</span>
                                    <p>{item}</p>
                                  </li>
                                ))}
                              </ul>
                              {workoutData.treino.length > 4 && !workoutExpanded && (
                                <span className="ai-workout-hint">
                                  +{workoutData.treino.length - 4} exercicios ocultos
                                </span>
                              )}
                              <div className="ai-workout-actions">
                                <button
                                  type="button"
                                  className="button secondary sm"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(formatWorkoutClipboard(workoutData));
                                      setCopyMessage('Treino copiado!');
                                    } catch {
                                      setCopyMessage('Nao foi possivel copiar.');
                                    }
                                  }}
                                >
                                  Copiar treino
                                </button>
                                <button
                                  type="button"
                                  className="button sm"
                                  onClick={() => {
                                    if (workoutData) {
                                      handleCreateWorkout(answer.id, workoutData);
                                    }
                                  }}
                                  disabled={creatingWorkoutId === answer.id}
                                >
                                  {creatingWorkoutId === answer.id ? 'Criando...' : 'Criar treino agora'}
                                </button>
                                <button
                                  type="button"
                                  className="button secondary sm"
                                  onClick={() => startWorkoutEdit(answer)}
                                >
                                  Editar antes de criar
                                </button>
                              </div>
                            </>
                          )}
                          {workoutErrors[answer.id] && <p className="ai-alert">{workoutErrors[answer.id]}</p>}
                        </div>
                      )}
                      {hasEvaluation && (
                        <div className="ai-workout-card assistant-workout-card">
                          <div className="ai-workout-header">
                            <div>
                              <span className="ai-workout-tag">Avaliacao IA</span>
                              <h4>{answer.evaluation?.titulo || 'Avaliacao sugerida'}</h4>
                              {answer.evaluation?.objetivo && (
                                <p className="ai-workout-objective">{answer.evaluation.objetivo}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              className="ai-workout-toggle"
                              onClick={() =>
                                setExpandedIds((prev) => ({
                                  ...prev,
                                  [evaluationKey]: !prev[evaluationKey],
                                }))
                              }
                            >
                              {evaluationExpanded ? 'Mostrar menos' : 'Ver avaliacao'}
                            </button>
                          </div>
                          <ul className="ai-workout-list">
                            {evaluationItems.map((item, itemIndex) => (
                              <li key={`${answer.id}-eval-${itemIndex}`}>
                                <span>{itemIndex + 1}.</span>
                                <p>{item}</p>
                              </li>
                            ))}
                          </ul>
                          {answer.evaluation!.itens.length > 4 && !evaluationExpanded && (
                            <span className="ai-workout-hint">
                              +{answer.evaluation!.itens.length - 4} itens ocultos
                            </span>
                          )}
                          <div className="ai-workout-actions">
                            <button
                              type="button"
                              className="button secondary sm"
                              onClick={async () => {
                                if (!answer.evaluation) return;
                                try {
                                  await navigator.clipboard.writeText(formatEvaluationClipboard(answer.evaluation));
                                  setCopyMessage('Avaliacao copiada!');
                                } catch {
                                  setCopyMessage('Nao foi possivel copiar.');
                                }
                              }}
                            >
                              Copiar avaliacao
                            </button>
                            <Link href="/evaluations/create" className="button sm">
                              Criar avaliacao
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="assistant-empty">
                <p className="subtle">Nenhuma resposta ainda.</p>
                <span>Envie um prompt para ver o historico aqui.</span>
              </div>
            )}
          </div>
        </div>

        <div className="ai-section assistant-section">
          <div className="assistant-section-header">
            <div>
              <h3>Sugestoes de hoje</h3>
              <p className="subtle">Ideias rapidas para mensagens e ajustes.</p>
            </div>
          </div>
          {suggestionsError && <p className="ai-alert">{suggestionsError}</p>}
          {suggestionTiles.length ? (
            <div className="ai-suggestion-grid assistant-suggestion-grid">
              {suggestionTiles.map((item) => (
                <button
                  key={item.title}
                  className="ai-suggestion-card assistant-suggestion-card"
                  type="button"
                  onClick={() => {
                    setPrompt(item.prompt);
                    handlePromptRequest(item.prompt, false);
                  }}
                >
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                  <p>Usar sugestao</p>
                </button>
              ))}
            </div>
          ) : suggestionsLoading ? (
            <p className="subtle">Carregando sugestoes personalizadas...</p>
          ) : (
            <p className="subtle">Nenhuma sugestao disponivel no momento.</p>
          )}
        </div>
        {showExerciseModal && (
          <div
            className="exercise-modal"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setShowExerciseModal(false);
                setExerciseTargetId(null);
              }
            }}
          >
            <div className="exercise-modal-panel" role="dialog" aria-modal="true">
              <div className="exercise-modal-header">
                <div>
                  <strong>Adicionar exercicio</strong>
                  <span>Use a colecao treinors como base do treino.</span>
                </div>
                <div className="exercise-modal-header-actions">
                  <button
                    className="button secondary sm"
                    type="button"
                    onClick={() => {
                      if (modalTargetId) {
                        handleAddExerciseManual(modalTargetId);
                      }
                    }}
                    disabled={!modalTargetId}
                  >
                    Criar manual
                  </button>
                  <button
                    className="button secondary sm"
                    type="button"
                    onClick={() => {
                      setShowExerciseModal(false);
                      setExerciseTargetId(null);
                    }}
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
                  onClick={() => loadExercises(true)}
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
                      const normalized = normalizeText(name).trim();
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
                            disabled={isAdded}
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
      </section>
    </PageShell>
  );
}
