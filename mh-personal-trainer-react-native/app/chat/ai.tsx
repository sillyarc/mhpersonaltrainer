import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../src/hooks/useTheme';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import { ChatInput } from '../../src/components/chat/ChatInput';
import { SearchableSelect } from '../../src/components/common';
import { chatWithAI, generateText, generateEvaluationInsights } from '../../src/services/ai';
import {
  ensureConversation,
  findPersonalByCode,
  listenToMessages,
  notifyConversationEvent,
  clearConversationMessages,
  sendMessage,
} from '../../src/services/chat';
import { createUserWorkout, fetchAvailableExercises } from '../../src/services/workouts';
import { firestoreService, Aluno } from '../../src/services/firestoreService';
import { useAuthStore } from '../../src/store/authStore';
import {
  calculateBodyComposition,
  createOnlineEvaluation,
  createPersonalizedEvaluation,
  createPhysicalTestEvaluation,
  createPosturalEvaluation,
  fetchEvaluations,
  getEvaluationTypeLabel,
} from '../../src/services/evaluations';
import {
  Circumferences,
  EvaluationQuestion,
  PhysicalEvaluation,
  PersonalizedEvaluation,
  OnlineEvaluation,
  PosturalEvaluation,
  PhysicalTestEvaluation,
} from '../../src/types/evaluation';
import { Message } from '../../src/types/chat';
import { Exercise } from '../../src/types/workout';
import { spacing, borderRadius } from '../../src/theme';

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface PendingWorkout {
  workout: NonNullable<Message['workoutData']>;
}

type EvaluationType = 'personalizada' | 'fisica' | 'postural' | 'online';

interface PendingEvaluation {
  type?: EvaluationType;
  studentId?: string;
}

const SUGGESTED_PROMPTS = [
  'Monte um treino de pernas',
  'Treino para ganho de massa muscular',
  'Exercícios para iniciantes',
  'Como melhorar meu condicionamento?',
];

const ASSISTANT_ID = 'ai-assistant';
const ASSISTANT_NAME = 'MH Assistente';
const WELCOME_MESSAGE =
  'Olá! Sou o MH Assistente. Posso ajudar com treinos, avaliações e saúde. Para outros assuntos, não consigo responder.';

export default function AIChatScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const messagesRef = useRef<Message[]>([]);
  const autoPromptSent = useRef(false);
  const { user, role } = useAuthStore();
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const welcomeSeeded = useRef(false);
  const suggestionsRequest = useRef(0);
  const [isLoading, setIsLoading] = useState(false);
  const [students, setStudents] = useState<Aluno[]>([]);
  const [pendingWorkout, setPendingWorkout] = useState<PendingWorkout | null>(null);
  const [pendingEvaluation, setPendingEvaluation] = useState<PendingEvaluation | null>(null);
  const [pendingAnalysis, setPendingAnalysis] = useState<{
    studentId?: string | null;
    evaluationId?: string | null;
  } | null>(null);
  const [pendingEvaluationForm, setPendingEvaluationForm] = useState<{
    type: 'online' | 'fisica';
    studentId?: string | null;
    values: {
      peso?: number;
      altura?: number;
      circunferencias: Circumferences;
    };
  } | null>(null);
  const [analysisEvaluations, setAnalysisEvaluations] = useState<PhysicalEvaluation[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [selectedAnalysisEvaluationId, setSelectedAnalysisEvaluationId] = useState<string | null>(null);
  const [pinnedStudentId, setPinnedStudentId] = useState<string | null>(null);
  const [pinnedWeekday, setPinnedWeekday] = useState<string | null>(null);
  const [pinnedEvaluationType, setPinnedEvaluationType] = useState<EvaluationType | null>(null);
  const [selectedMeasurementField, setSelectedMeasurementField] = useState<
    'peso' | 'altura' | keyof Circumferences | null
  >(null);
  const [selectedMeasurementValue, setSelectedMeasurementValue] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(SUGGESTED_PROMPTS);

  const isPersonal = role === 'personal' || role === 'professor';

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', scrollToBottom);
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setTimeout(() => scrollToBottom(), 60);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [scrollToBottom]);

  useEffect(() => {
    if (!user?.uid) return;
    let isActive = true;
    welcomeSeeded.current = false;
    ensureConversation({
      userId: user.uid,
      userName: user.displayName,
      userPhoto: user.photoUrl,
      otherUserId: ASSISTANT_ID,
      otherName: ASSISTANT_NAME,
      type: 'ai',
    }).then((convo) => {
      if (isActive) {
        setConversationId(convo.id);
      }
    });
    return () => {
      isActive = false;
    };
  }, [user?.uid, user?.displayName, user?.photoUrl]);

  useEffect(() => {
    if (!conversationId) return;
    const unsubscribe = listenToMessages(conversationId, (items) => {
      messagesRef.current = items;
      setMessages(items);
      if (items.length === 0 && !welcomeSeeded.current) {
        welcomeSeeded.current = true;
        sendMessage({
          conversationId,
          senderId: ASSISTANT_ID,
          senderName: ASSISTANT_NAME,
          content: WELCOME_MESSAGE,
          aiGenerated: true,
        }).catch(() => null);
      }
      scrollToBottom();
    });
    return () => unsubscribe();
  }, [conversationId, scrollToBottom]);

  useEffect(() => {
    if (!isPersonal || !user?.uid) return;
    const loadStudents = async () => {
      const alunos = await firestoreService.getAlunosDoPersonal(user.uid);
      setStudents(alunos);
    };
    loadStudents();
  }, [isPersonal, user?.uid]);

  useEffect(() => {
    if (!pendingAnalysis?.studentId) {
      setAnalysisEvaluations([]);
      setSelectedAnalysisEvaluationId(null);
      return;
    }
    let isActive = true;
    setAnalysisLoading(true);
    fetchEvaluations(pendingAnalysis.studentId)
      .then((result) => {
        if (!isActive) return;
        if (result.error) {
          sendAssistantMessage('Não consegui carregar as avaliações para análise.');
          setPendingAnalysis(null);
          return;
        }
        const items = result.data || [];
        items.sort((a, b) => (b.date?.getTime?.() || 0) - (a.date?.getTime?.() || 0));
        setAnalysisEvaluations(items);
        if (items.length === 0) {
          sendAssistantMessage('Não encontrei avaliações para analisar desse aluno.');
          setPendingAnalysis(null);
        }
      })
      .finally(() => {
        if (isActive) {
          setAnalysisLoading(false);
        }
      });
    return () => {
      isActive = false;
    };
  }, [pendingAnalysis?.studentId, sendAssistantMessage]);

  useEffect(() => {
    if (!pendingEvaluationForm) {
      setSelectedMeasurementField(null);
      setSelectedMeasurementValue(null);
    }
  }, [pendingEvaluationForm]);

  useEffect(() => {
    setSelectedMeasurementValue(null);
  }, [selectedMeasurementField]);


  const sendAssistantMessage = useCallback(
    async (
      content: string,
      workoutData?: Message['workoutData'],
      action?: Message['action']
    ) => {
      if (!conversationId) return;
      await sendMessage({
        conversationId,
        senderId: ASSISTANT_ID,
        senderName: ASSISTANT_NAME,
        content,
        aiGenerated: true,
        workoutData,
        action,
        type: workoutData ? 'workout' : 'text',
      });
    },
    [conversationId]
  );

  const normalizeText = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const DEFAULT_YOUTUBE_VIDEO = 'https://www.youtube.com/watch?v=ml6cT4AZdqI';

const EVALUATION_OPTIONS: Array<{ key: EvaluationType; label: string }> = [
  { key: 'online', label: 'Online' },
  { key: 'personalizada', label: 'Personalizada' },
  { key: 'fisica', label: 'Fisica' },
  { key: 'postural', label: 'Postural' },
];

const WEEKDAY_OPTIONS = [
    { key: 'segunda', label: 'Seg' },
    { key: 'terca', label: 'Ter' },
    { key: 'quarta', label: 'Qua' },
    { key: 'quinta', label: 'Qui' },
    { key: 'sexta', label: 'Sex' },
    { key: 'sabado', label: 'Sab' },
    { key: 'domingo', label: 'Dom' },
  ];

  const MEASUREMENT_FIELDS: Array<{
    key: 'peso' | 'altura' | keyof Circumferences;
    label: string;
    unit?: string;
  }> = [
    { key: 'peso', label: 'Peso', unit: 'kg' },
    { key: 'altura', label: 'Altura', unit: 'cm' },
    { key: 'pescoco', label: 'Pescoco', unit: 'cm' },
    { key: 'ombro', label: 'Ombro', unit: 'cm' },
    { key: 'torax', label: 'Torax', unit: 'cm' },
    { key: 'cintura', label: 'Cintura', unit: 'cm' },
    { key: 'quadril', label: 'Quadril', unit: 'cm' },
    { key: 'bracoDireito', label: 'Braco direito', unit: 'cm' },
    { key: 'bracoEsquerdo', label: 'Braco esquerdo', unit: 'cm' },
    { key: 'antebracoDireito', label: 'Antebraco direito', unit: 'cm' },
    { key: 'antebracoEsquerdo', label: 'Antebraco esquerdo', unit: 'cm' },
    { key: 'coxaDireita', label: 'Coxa direita', unit: 'cm' },
    { key: 'coxaEsquerda', label: 'Coxa esquerda', unit: 'cm' },
    { key: 'panturrilhaDireita', label: 'Panturrilha direita', unit: 'cm' },
    { key: 'panturrilhaEsquerda', label: 'Panturrilha esquerda', unit: 'cm' },
  ];

  const extractWeekday = (text: string): string | null => {
    const normalized = normalizeText(text);
    const weekdays = [
      { key: 'segunda', variants: ['segunda', 'seg', 'segunda-feira'] },
      { key: 'terca', variants: ['terca', 'terca-feira', 'ter', 'terça'] },
      { key: 'quarta', variants: ['quarta', 'quarta-feira', 'qua'] },
      { key: 'quinta', variants: ['quinta', 'quinta-feira', 'qui'] },
      { key: 'sexta', variants: ['sexta', 'sexta-feira', 'sex'] },
      { key: 'sabado', variants: ['sabado', 'sabado-feira', 'sab', 'sábado'] },
      { key: 'domingo', variants: ['domingo', 'dom'] },
    ];
    for (const weekday of weekdays) {
      for (const variant of weekday.variants) {
        if (normalized.includes(normalizeText(variant))) {
          return weekday.key;
        }
      }
    }
    return null;
  };

  const detectEvaluationType = (text: string): EvaluationType | null => {
  const normalized = normalizeText(text);
  if (normalized.includes('online')) {
    return 'online';
  }
  if (normalized.includes('postural') || normalized.includes('postura')) {
    return 'postural';
  }
  if (normalized.includes('fisica') || normalized.includes('fisico')) {
    return 'fisica';
  }
  if (normalized.includes('personalizada') || normalized.includes('questionario')) {
    return 'personalizada';
  }
  return null;
};

  const hasEvaluationIntent = (text: string) => {
  const normalized = normalizeText(text);
  return (
    normalized.includes('avaliacao') ||
    normalized.includes('avaliacoes') ||
    normalized.includes('avaliar')
  );
};

  const hasAnalysisIntent = (text: string) => {
    const normalized = normalizeText(text);
    const wantsAnalysis =
      normalized.includes('analise') || normalized.includes('analisa') || normalized.includes('analisar');
    const mentionsEvaluation =
      normalized.includes('avaliacao') || normalized.includes('avaliacoes') || normalized.includes('avaliar');
    return wantsAnalysis && mentionsEvaluation;
  };

  const findStudentFromMessage = (text: string): Aluno | null => {
    const normalized = normalizeText(text);
    let match: Aluno | null = null;
    let matchLength = 0;

    for (const student of students) {
      if (!student.nome) continue;
      const nameNormalized = normalizeText(student.nome);
      if (normalized.includes(nameNormalized) && nameNormalized.length > matchLength) {
        match = student;
        matchLength = nameNormalized.length;
      } else if (normalized.includes(student.id.toLowerCase())) {
        match = student;
        matchLength = student.id.length;
      }
    }

    return match;
  };

  const findStudentById = (id?: string | null) =>
    id ? students.find((student) => student.id === id) || null : null;

  const parseExerciseLine = (line: string) => {
    const trimmed = line.trim();
    const parts = trimmed.split('-').map((part) => part.trim()).filter(Boolean);
    const name = parts[0] || trimmed;
    let series = 3;
    let reps = 12;
    let rest = 60;

    const seriesMatch = trimmed.match(/(\d+)\s*(?:series|s[ée]ries)/i);
    if (seriesMatch) series = Number(seriesMatch[1]);

    const repsMatch = trimmed.match(/(\d+)\s*(?:reps?|repeti[cç][oõ]es)/i);
    if (repsMatch) reps = Number(repsMatch[1]);

    const restMatch =
      trimmed.match(/descanso\s*(\d+)/i) ||
      trimmed.match(/(\d+)\s*(?:seg|segundos)\b/i);
    if (restMatch) rest = Number(restMatch[1]);

    const compactMatch = trimmed.match(/(\d+)\s*x\s*(\d+)/i);
    if (compactMatch) {
      series = Number(compactMatch[1]);
      reps = Number(compactMatch[2]);
    }

    return { name, series, reps, rest };
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

  const findExerciseMatch = (name: string, index: { indexed: { item: Exercise; name: string }[]; exactMap: Map<string, Exercise> }) => {
    const normalized = normalizeText(name);
    const direct = index.exactMap.get(normalized);
    if (direct) return direct;
    let best: Exercise | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    index.indexed.forEach((entry) => {
      if (!entry.name) return;
      const contains =
        entry.name.includes(normalized) || normalized.includes(entry.name);
      if (!contains) return;
      const score = Math.abs(entry.name.length - normalized.length);
      if (score < bestScore) {
        best = entry.item;
        bestScore = score;
      }
    });
    return best;
  };

  const buildWorkoutPayload = async (
    workout: NonNullable<Message['workoutData']>,
    weekday?: string
  ) => {
    const parsed = workout.treino.map(parseExerciseLine);
    const exercisesResult = await fetchAvailableExercises();
    const catalog = exercisesResult.data || [];
    const index = buildExerciseIndex(catalog);
    const resolved = parsed.map((item) => {
      const match = findExerciseMatch(item.name, index);
      return {
        ...item,
        name: match?.nomeDoTreino || item.name,
        videoUrl: resolveExerciseVideo(match),
      };
    });
    return {
      nomeDoTreino: workout.nomeDaRotina,
      obsInstrucao: workout.objetivoDaRotina,
      treino: resolved.map((item) => item.name),
      seriesRep: resolved.map((item) => item.series),
      repeticoes: resolved.map((item) => item.reps),
      carga: resolved.map(() => 0),
      intervalo: resolved.map((item) => item.rest),
      videoUrls: resolved.map((item) => item.videoUrl),
      arquivos: false,
      data: new Date(),
      ...(weekday ? { diasDaSemana: [weekday] } : {}),
    };
  };

  const createId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const defaultPersonalizedQuestions = (): EvaluationQuestion[] => [
    {
      id: createId('q'),
      pergunta: 'Qual seu objetivo principal?',
      tipo: 'texto',
      obrigatoria: true,
    },
    {
      id: createId('q'),
      pergunta: 'Como esta sua rotina de treinos atualmente?',
      tipo: 'texto',
      obrigatoria: false,
    },
    {
      id: createId('q'),
      pergunta: 'Sente dores ou limitacoes?',
      tipo: 'sim_nao',
      obrigatoria: true,
    },
    {
      id: createId('q'),
      pergunta: 'Qual nível de esforço você espera?',
      tipo: 'escala',
      obrigatoria: false,
    },
  ];

  const notifyEvaluationEvent = async (
    targetId: string,
    type: EvaluationType,
    evaluationId?: string
  ) => {
    if (!user?.uid) return;
    const label = EVALUATION_OPTIONS.find((item) => item.key === type)?.label || 'Avaliação';
    const content = isPersonal
      ? `Avaliação ${label} criada.`
      : `Avaliação ${label} enviada.`;
    const actionPayload = evaluationId
      ? {
          label: 'Abrir avaliação',
          route: `/evaluations/${evaluationId}?type=${type}&userId=${targetId}`,
        }
      : undefined;

    if (isPersonal) {
      const student = students.find((item) => item.id === targetId);
      try {
        await notifyConversationEvent({
          senderId: user.uid,
          senderName: user.displayName,
          senderPhoto: user.photoUrl,
          recipientId: targetId,
          recipientName: student?.nome,
          recipientPhoto: student?.photoUrl,
          content,
          action: actionPayload,
        });
      } catch (_) {
        // Ignore chat notification failures.
      }
      return;
    }

    const personal = await findPersonalByCode(user.codigoPersonal);
    if (!personal) return;
    try {
      await notifyConversationEvent({
        senderId: user.uid,
        senderName: user.displayName,
        senderPhoto: user.photoUrl,
        recipientId: personal.id,
        recipientName: personal.name,
        recipientPhoto: personal.photoUrl,
        content,
        action: actionPayload,
      });
    } catch (_) {
      // Ignore chat notification failures.
    }
  };

  const createEvaluationForStudent = async (targetId: string, type: EvaluationType) => {
    const base = {
      userId: targetId,
      personalId: isPersonal ? user?.uid : undefined,
      date: new Date(),
      status: 'concluida' as const,
    };

    if (type === 'personalizada') {
      const defaultDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const result = await createPersonalizedEvaluation({
        ...base,
        type: 'personalizada',
        status: 'pendente',
        perguntas: defaultPersonalizedQuestions(),
        respostas: [],
        prazoResposta: defaultDeadline,
        resultado: '',
        recomendacoes: [],
      });
      if (result.error) throw new Error(result.error);
      if (!result.data?.id) throw new Error('Falha ao obter o ID da avaliação.');
      await notifyEvaluationEvent(targetId, type, result.data.id);
      return { id: result.data.id, type };
    }

    if (type === 'online') {
      const result = await createOnlineEvaluation({
        ...base,
        type: 'online',
        peso: undefined,
        altura: undefined,
        circunferencias: {},
        fotos: {},
        observacoes: '',
        resultado: '',
      });
      if (result.error) throw new Error(result.error);
      if (!result.data?.id) throw new Error('Falha ao obter o ID da avaliacao.');
      await notifyEvaluationEvent(targetId, type, result.data.id);
      return { id: result.data.id, type };
    }

    if (type === 'online') {
      const result = await createOnlineEvaluation({
        ...base,
        type: 'online',
        peso: undefined,
        altura: undefined,
        circunferencias: {},
        fotos: {},
        observacoes: '',
        resultado: '',
      });
      if (result.error) throw new Error(result.error);
      if (!result.data?.id) throw new Error('Falha ao obter o ID da avaliacao.');
      await notifyEvaluationEvent(targetId, type, result.data.id);
      return { id: result.data.id, type };
    }

    if (type === 'fisica') {
      const result = await createPhysicalTestEvaluation({
        ...base,
        type: 'fisica',
        testes: [],
        resultados: [],
        composicaoCorporal: undefined,
      });
      if (result.error) throw new Error(result.error);
      if (!result.data?.id) throw new Error('Falha ao obter o ID da avaliação.');
      await notifyEvaluationEvent(targetId, type, result.data.id);
      return { id: result.data.id, type };
    }

    const result = await createPosturalEvaluation({
      ...base,
      type: 'postural',
      fotosPostura: {},
      analise: undefined,
      recomendacoes: [],
    });
    if (result.error) throw new Error(result.error);
    if (!result.data?.id) throw new Error('Falha ao obter o ID da avaliação.');
    await notifyEvaluationEvent(targetId, type, result.data.id);
    return { id: result.data.id, type };
  };

  const buildConversationHistory = (items: Message[], currentUserId: string): ConversationTurn[] =>
    items
      .filter((item) => item.content)
      .map((item) => ({
        role: item.senderId === currentUserId ? 'user' : 'assistant',
        content: item.content,
      }));

  const buildSuggestionsPrompt = useCallback(() => {
    const recent = messagesRef.current
      .slice(-6)
      .map((item) => item.content)
      .filter(Boolean)
      .join(' | ');

    return [
      'Crie 4 sugestoes curtas (max 6 palavras) para um chat de treinos.',
      'Responda apenas com uma lista, uma sugestao por linha, sem numeracao.',
      isPersonal
        ? 'Contexto: personal criando treinos e avaliacoes para alunos.'
        : 'Contexto: aluno pedindo treinos e avaliacoes.',
      `Ultimas mensagens: ${recent || '(vazio)'}`,
    ].join('\n');
  }, [isPersonal]);

  const refreshSuggestions = useCallback(async () => {
    if (!conversationId) return;
    if (messagesRef.current.length > 1) return;
    const requestId = ++suggestionsRequest.current;
    try {
      const prompt = buildSuggestionsPrompt();
      const response = await generateText(prompt);
      if (requestId !== suggestionsRequest.current) return;
      const parsed = response
        .split('\n')
        .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
        .filter(Boolean);
      if (parsed.length >= 2) {
        setSuggestions(parsed.slice(0, 4));
      } else {
        setSuggestions(SUGGESTED_PROMPTS);
      }
    } catch (_) {
      if (requestId === suggestionsRequest.current) {
        setSuggestions(SUGGESTED_PROMPTS);
      }
    }
  }, [buildSuggestionsPrompt, conversationId]);

  useFocusEffect(
    useCallback(() => {
      refreshSuggestions();
    }, [refreshSuggestions])
  );

  useEffect(() => {
    if (!conversationId) return;
    refreshSuggestions();
  }, [conversationId, refreshSuggestions]);

  const buildWorkoutRoute = (workoutId: string, studentId: string) =>
    `/workout/${workoutId}?studentId=${studentId}`;

  const buildEvaluationRoute = (evaluationId: string, type: EvaluationType, studentId: string) =>
    `/evaluations/${evaluationId}?type=${type}&userId=${studentId}`;

  const getMeasurementUnit = (field: 'peso' | 'altura' | keyof Circumferences) =>
    MEASUREMENT_FIELDS.find((item) => item.key === field)?.unit;

  const getMeasurementValue = (
    form: NonNullable<typeof pendingEvaluationForm>,
    field: 'peso' | 'altura' | keyof Circumferences
  ) => {
    if (field === 'peso') return form.values.peso;
    if (field === 'altura') return form.values.altura;
    return form.values.circunferencias?.[field];
  };

  const hasMeasurementValue = (
    form: NonNullable<typeof pendingEvaluationForm>,
    field: 'peso' | 'altura' | keyof Circumferences
  ) => {
    if (field === 'peso') return Boolean(form.values.peso);
    if (field === 'altura') return Boolean(form.values.altura);
    return Boolean(form.values.circunferencias?.[field]);
  };

  const formatMeasurementValue = (value: number, unit?: string) =>
    unit ? `${value} ${unit}` : `${value}`;

  const buildMeasurementValueOptions = (
    field: 'peso' | 'altura' | keyof Circumferences | null
  ) => {
    if (!field) return [];
    const unit = getMeasurementUnit(field);
    let min = 20;
    let max = 200;
    if (field === 'peso') {
      min = 30;
      max = 200;
    } else if (field === 'altura') {
      min = 120;
      max = 230;
    }
    const options = [];
    for (let value = min; value <= max; value += 1) {
      options.push({
        id: String(value),
        label: formatMeasurementValue(value, unit),
      });
    }
    return options;
  };

  const buildFilledMeasurementsText = (form: NonNullable<typeof pendingEvaluationForm>) => {
    const filled = MEASUREMENT_FIELDS.filter((field) =>
      hasMeasurementValue(form, field.key)
    ).map((field) => {
      const value = getMeasurementValue(form, field.key);
      if (typeof value === 'number') {
        return `${field.label}: ${formatMeasurementValue(value, field.unit)}`;
      }
      return field.label;
    });
    if (!filled.length) return 'Nenhuma medida preenchida ainda.';
    return `Preenchidas: ${filled.join(', ')}`;
  };

  const formatEvaluationLabel = (evaluation: PhysicalEvaluation) => {
    const dateText = evaluation.date
      ? new Date(evaluation.date).toLocaleDateString('pt-BR')
      : '';
    const typeLabel = getEvaluationTypeLabel(evaluation.type);
    return dateText ? `${typeLabel} · ${dateText}` : typeLabel;
  };

  const buildEvaluationContext = (evaluation: PhysicalEvaluation) => {
    const base = {
      tipo: evaluation.type,
      status: evaluation.status,
      data: evaluation.date ? new Date(evaluation.date).toISOString() : undefined,
    };

    if (evaluation.type === 'personalizada') {
      const personalized = evaluation as PersonalizedEvaluation;
      return JSON.stringify(
        {
          ...base,
          perguntas: personalized.perguntas?.map((item) => ({
            id: item.id,
            pergunta: item.pergunta,
            tipo: item.tipo,
            opcoes: item.opcoes || [],
            obrigatoria: item.obrigatoria,
          })),
          respostas: personalized.respostas?.map((item) => ({
            questionId: item.questionId,
            resposta: item.resposta,
          })),
        },
        null,
        2
      );
    }

    if (evaluation.type === 'online') {
      const online = evaluation as OnlineEvaluation;
      return JSON.stringify(
        {
          ...base,
          peso: online.peso,
          altura: online.altura,
          imc: online.imc,
          circunferencias: online.circunferencias,
          observacoes: online.observacoes,
          resultado: online.resultado,
        },
        null,
        2
      );
    }

    if (evaluation.type === 'fisica') {
      const physical = evaluation as PhysicalTestEvaluation;
      return JSON.stringify(
        {
          ...base,
          composicaoCorporal: physical.composicaoCorporal,
          testes: physical.testes,
          resultados: physical.resultados,
        },
        null,
        2
      );
    }

    const postural = evaluation as PosturalEvaluation;
    return JSON.stringify(
      {
        ...base,
        fotosPostura: postural.fotosPostura,
        analise: postural.analise,
        recomendacoes: postural.recomendacoes,
      },
      null,
      2
    );
  };

  const runEvaluationAnalysis = useCallback(
    async (evaluation: PhysicalEvaluation) => {
      setIsLoading(true);
      try {
        if (evaluation.type === 'personalizada') {
          const personalized = evaluation as PersonalizedEvaluation;
          if (!personalized.respostas || personalized.respostas.length === 0) {
            await sendAssistantMessage(
              'Essa avaliação personalizada ainda não tem respostas para analisar.',
              undefined,
              {
                label: 'Abrir avaliação',
                route: buildEvaluationRoute(
                  personalized.id,
                  evaluation.type,
                  personalized.userId
                ),
              }
            );
            return;
          }
        }

        const context = buildEvaluationContext(evaluation);
        const insights = await generateEvaluationInsights({
          type: evaluation.type,
          context,
        });

        const label = getEvaluationTypeLabel(evaluation.type);
        const lines = [
          `Análise da avaliação ${label}.`,
          insights.resumo ? `Resumo: ${insights.resumo}` : '',
          insights.destaques?.length ? `Destaques: ${insights.destaques.join(' | ')}` : '',
          insights.alertas?.length ? `Alertas: ${insights.alertas.join(' | ')}` : '',
          insights.proximosPassos?.length
            ? `Próximos passos: ${insights.proximosPassos.join(' | ')}`
            : '',
        ].filter(Boolean);

        await sendAssistantMessage(lines.join('\n'), undefined, {
          label: 'Abrir avaliação',
          route: buildEvaluationRoute(evaluation.id, evaluation.type, evaluation.userId),
        });
      } catch (error: any) {
        await sendAssistantMessage(
          `Não foi possível analisar a avaliação: ${error.message || 'erro desconhecido'}.`
        );
      } finally {
        setIsLoading(false);
        setPendingAnalysis(null);
        setSelectedAnalysisEvaluationId(null);
      }
    },
    [buildEvaluationRoute, sendAssistantMessage]
  );

  const finalizeEvaluationForm = useCallback(
    async (form: NonNullable<typeof pendingEvaluationForm>) => {
      if (!form.studentId) {
        await sendAssistantMessage('Selecione o aluno antes de salvar a avaliacao.');
        return;
      }
      setIsLoading(true);
      try {
        if (form.type === 'online') {
          const result = await createOnlineEvaluation({
            userId: form.studentId,
            personalId: isPersonal ? user?.uid : undefined,
            date: new Date(),
            status: 'concluida',
            peso: form.values.peso,
            altura: form.values.altura,
            circunferencias: form.values.circunferencias,
            fotos: {},
            observacoes: '',
            resultado: '',
          });
          if (result.error || !result.data?.id) {
            throw new Error(result.error || 'Falha ao criar avaliacao online.');
          }
          await notifyEvaluationEvent(form.studentId, 'online', result.data.id);
          await sendAssistantMessage('Avaliacao online criada.', undefined, {
            label: 'Abrir avaliacao',
            route: buildEvaluationRoute(result.data.id, 'online', form.studentId),
          });
        } else {
          const shouldCompose =
            typeof form.values.peso === 'number' && typeof form.values.altura === 'number';
          const composicao = shouldCompose
            ? calculateBodyComposition(form.values.peso!, form.values.altura!, 30, 'masculino')
            : undefined;
          const result = await createPhysicalTestEvaluation({
            userId: form.studentId,
            personalId: isPersonal ? user?.uid : undefined,
            date: new Date(),
            status: 'concluida',
            testes: [],
            resultados: [],
            composicaoCorporal: composicao,
          });
          if (result.error || !result.data?.id) {
            throw new Error(result.error || 'Falha ao criar avaliacao fisica.');
          }
          await notifyEvaluationEvent(form.studentId, 'fisica', result.data.id);
          await sendAssistantMessage('Avaliacao fisica criada.', undefined, {
            label: 'Abrir avaliacao',
            route: buildEvaluationRoute(result.data.id, 'fisica', form.studentId),
          });
        }
        setPendingEvaluationForm(null);
        setSelectedAnalysisEvaluationId(null);
      } catch (error: any) {
        await sendAssistantMessage(
          `Nao foi possivel criar a avaliacao: ${error.message || 'erro desconhecido'}.`
        );
      } finally {
        setIsLoading(false);
      }
    },
    [buildEvaluationRoute, isPersonal, notifyEvaluationEvent, sendAssistantMessage, user?.uid]
  );

  const resolvePinnedStudent = (overrideId?: string | null) =>
    findStudentById(overrideId ?? pinnedStudentId);

  const resolvePinnedWeekday = (override?: string | null) =>
    override ?? pinnedWeekday;

  const resolvePinnedEvaluationType = (override?: EvaluationType | null) =>
    override ?? pinnedEvaluationType;

  const completePendingWorkout = useCallback(
    async (
      workoutData: NonNullable<Message['workoutData']> | undefined,
      student: Aluno,
      weekday: string
    ) => {
      if (!workoutData) return;
      try {
        const payload = await buildWorkoutPayload(workoutData, weekday);
        const result = await createUserWorkout(student.id, payload);
        if (result.error || !result.data?.id) {
          throw new Error(result.error || 'Falha ao salvar o treino.');
        }
        setPendingWorkout(null);
        if (user?.uid) {
          try {
            await notifyConversationEvent({
              senderId: user.uid,
              senderName: user.displayName,
              senderPhoto: user.photoUrl,
              recipientId: student.id,
              recipientName: student.nome,
              recipientPhoto: student.photoUrl,
              content: `Treino novo: ${payload.nomeDoTreino}.`,
              workoutData,
              action: {
                label: 'Abrir treino',
                route: buildWorkoutRoute(result.data.id, student.id),
              },
            });
          } catch (_) {
            // Ignore chat notification failures.
          }
        }
        await sendAssistantMessage(
          `Treino salvo para ${student.nome} em ${weekday}.`,
          undefined,
          {
            label: 'Abrir treino',
            route: buildWorkoutRoute(result.data.id, student.id),
          }
        );
        setPinnedStudentId(null);
        setPinnedWeekday(null);
      } catch (error: any) {
        await sendAssistantMessage(
          `Não foi possível salvar o treino: ${error.message || 'erro desconhecido'}.`
        );
      }
    },
    [sendAssistantMessage, user]
  );

  const completePendingEvaluation = useCallback(
    async (studentId: string, type: EvaluationType) => {
      try {
        const result = await createEvaluationForStudent(studentId, type);
        const label =
          EVALUATION_OPTIONS.find((item) => item.key === type)?.label || 'Avaliação';
        await sendAssistantMessage(
          `Avaliação ${label} criada com sucesso.`,
          undefined,
          {
            label: 'Abrir avaliação',
            route: buildEvaluationRoute(result.id, type, studentId),
          }
        );
        setPendingEvaluation(null);
      } catch (error: any) {
        await sendAssistantMessage(
          `Não foi possível criar a avaliação: ${error.message || 'erro desconhecido'}.`
        );
      }
    },
    [sendAssistantMessage]
  );

  const tryResolvePendingSelection = useCallback(
    async (overrides?: {
      studentId?: string | null;
      weekday?: string | null;
      evaluationType?: EvaluationType | null;
    }) => {
      if (pendingWorkout && isPersonal) {
        const student = resolvePinnedStudent(overrides?.studentId);
        const weekday = resolvePinnedWeekday(overrides?.weekday);
        if (student && weekday) {
          await completePendingWorkout(pendingWorkout.workout, student, weekday);
        }
        return;
      }

      if (pendingEvaluation) {
        const resolvedType =
          resolvePinnedEvaluationType(overrides?.evaluationType) || pendingEvaluation.type;
        const resolvedStudentId =
          pendingEvaluation.studentId ||
          (isPersonal ? resolvePinnedStudent(overrides?.studentId)?.id : user?.uid);

        if (resolvedType && resolvedStudentId) {
          await completePendingEvaluation(resolvedStudentId, resolvedType);
        }
      }
    },
    [
      completePendingEvaluation,
      completePendingWorkout,
      isPersonal,
      pendingEvaluation,
      pendingWorkout,
      resolvePinnedEvaluationType,
      resolvePinnedStudent,
      resolvePinnedWeekday,
      user?.uid,
    ]
  );

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!user?.uid || !conversationId) {
      showAlert('Erro', 'Não foi possível iniciar a conversa.');
      return;
    }

    const conversationHistory = buildConversationHistory(messages, user.uid);

    setIsLoading(true);

    try {
      await sendMessage({
        conversationId,
        senderId: user.uid,
        senderName: user.displayName,
        senderPhoto: user.photoUrl,
        content: trimmed,
      });

      if (pendingEvaluationForm) {
        const detectedStudent = isPersonal ? findStudentFromMessage(trimmed) : null;
        if (detectedStudent && !pinnedStudentId) {
          setPinnedStudentId(detectedStudent.id);
        }

        const resolvedStudentId =
          pendingEvaluationForm.studentId ||
          (isPersonal ? resolvePinnedStudent(detectedStudent?.id)?.id : user.uid);

        if (!resolvedStudentId) {
          setPendingEvaluationForm({ ...pendingEvaluationForm, studentId: null });
          await sendAssistantMessage('Para qual aluno devo criar a avaliacao?');
          return;
        }

        if (!pendingEvaluationForm.studentId && resolvedStudentId) {
          setPendingEvaluationForm({ ...pendingEvaluationForm, studentId: resolvedStudentId });
        }

        const normalized = normalizeText(trimmed);
        if (normalized.includes('finalizar') || normalized.includes('salvar')) {
          await finalizeEvaluationForm({
            ...pendingEvaluationForm,
            studentId: resolvedStudentId,
          });
          return;
        }

        await sendAssistantMessage(
          'Use os menus abaixo para preencher as medidas e depois salve a avaliacao.'
        );
        return;
      }

      if (pendingAnalysis) {
        const detectedStudent = isPersonal ? findStudentFromMessage(trimmed) : null;
        if (detectedStudent && !pinnedStudentId) {
          setPinnedStudentId(detectedStudent.id);
        }

        const resolvedStudentId =
          pendingAnalysis.studentId ||
          (isPersonal ? resolvePinnedStudent(detectedStudent?.id)?.id : user.uid);

        if (!resolvedStudentId) {
          setPendingAnalysis({ studentId: null });
          await sendAssistantMessage('Para qual aluno devo analisar a avaliação?');
          return;
        }

        if (!pendingAnalysis.studentId) {
          setPendingAnalysis({ ...pendingAnalysis, studentId: resolvedStudentId });
        }

        const detectedType = detectEvaluationType(trimmed);
        if (detectedType && analysisEvaluations.length > 0) {
          const candidate =
            analysisEvaluations.find((item) => item.type === detectedType) ||
            analysisEvaluations[0];
          if (candidate) {
            await runEvaluationAnalysis(candidate);
            return;
          }
        }

        await sendAssistantMessage('Selecione a avaliação abaixo para analisar.');
        return;
      }

      if (pendingEvaluation) {
        const detectedType = detectEvaluationType(trimmed);
        const detectedStudent = isPersonal ? findStudentFromMessage(trimmed) : null;

        if (detectedType && !pinnedEvaluationType) {
          setPinnedEvaluationType(detectedType);
        }
        if (detectedStudent && !pinnedStudentId) {
          setPinnedStudentId(detectedStudent.id);
        }

        const resolvedType =
          resolvePinnedEvaluationType(detectedType) || pendingEvaluation.type;
        const resolvedStudent =
          resolvePinnedStudent(detectedStudent?.id) ||
          (pendingEvaluation.studentId
            ? findStudentById(pendingEvaluation.studentId)
            : null);
        const resolvedStudentId = isPersonal
          ? resolvedStudent?.id || pendingEvaluation.studentId
          : user.uid;

        if (!resolvedType || (isPersonal && !resolvedStudentId)) {
          setPendingEvaluation({ type: resolvedType, studentId: resolvedStudentId });
          if (!resolvedType && isPersonal && !resolvedStudentId) {
            await sendAssistantMessage('Preciso do tipo de avaliação e do aluno para criar.');
          } else if (!resolvedType) {
            await sendAssistantMessage('Qual tipo de avaliação devo criar?');
          } else {
            await sendAssistantMessage('Para qual aluno devo criar a avaliação?');
          }
          return;
        }

        await completePendingEvaluation(resolvedStudentId!, resolvedType);
        return;
      }

      if (pendingWorkout && isPersonal) {
        const detectedStudent = findStudentFromMessage(trimmed);
        const detectedDay = extractWeekday(trimmed);

        if (detectedStudent && !pinnedStudentId) {
          setPinnedStudentId(detectedStudent.id);
        }
        if (detectedDay && !pinnedWeekday) {
          setPinnedWeekday(detectedDay);
        }

        const resolvedStudent = resolvePinnedStudent(detectedStudent?.id);
        const resolvedDay = resolvePinnedWeekday(detectedDay);

        if (!resolvedStudent || !resolvedDay) {
          const missingParts = [];
          if (!resolvedStudent) missingParts.push('aluno');
          if (!resolvedDay) missingParts.push('dia da semana');
          await sendAssistantMessage(
            `Preciso do ${missingParts.join(' e ')} para salvar o treino. ` +
              'Selecione abaixo ou informe no texto (ex.: "Isabela na segunda").'
          );
          return;
        }

        await completePendingWorkout(pendingWorkout.workout, resolvedStudent, resolvedDay);
        return;
      }

      if (hasAnalysisIntent(trimmed)) {
        const detectedStudent = isPersonal ? findStudentFromMessage(trimmed) : null;
        if (detectedStudent && !pinnedStudentId) {
          setPinnedStudentId(detectedStudent.id);
        }

        const resolvedStudentId = isPersonal
          ? resolvePinnedStudent(detectedStudent?.id)?.id
          : user.uid;

        if (!resolvedStudentId) {
          setPendingAnalysis({ studentId: null });
          await sendAssistantMessage('Para qual aluno devo analisar a avaliação?');
          return;
        }

        setPendingAnalysis({ studentId: resolvedStudentId });
        await sendAssistantMessage('Selecione a avaliação abaixo para analisar.');
        return;
      }

      if (hasEvaluationIntent(trimmed)) {
        const evaluationType = detectEvaluationType(trimmed);
        const selectedStudent = isPersonal ? findStudentFromMessage(trimmed) : null;
        const targetStudentId = isPersonal ? selectedStudent?.id : user.uid;

        if (evaluationType && !pinnedEvaluationType) {
          setPinnedEvaluationType(evaluationType);
        }
        if (selectedStudent && !pinnedStudentId) {
          setPinnedStudentId(selectedStudent.id);
        }

        if (evaluationType && (evaluationType === 'online' || evaluationType === 'fisica')) {
          const resolvedStudentId = isPersonal
            ? resolvePinnedStudent(selectedStudent?.id)?.id || targetStudentId
            : user.uid;

          if (!resolvedStudentId && isPersonal) {
            setPendingEvaluationForm({
              type: evaluationType,
              studentId: null,
              values: { circunferencias: {} },
            });
            setSelectedMeasurementField(null);
            setSelectedMeasurementValue(null);
            await sendAssistantMessage('Para qual aluno devo criar a avaliacao?');
            return;
          }

          setPendingEvaluationForm({
            type: evaluationType,
            studentId: resolvedStudentId,
            values: { circunferencias: {} },
          });
          setSelectedMeasurementField(null);
          setSelectedMeasurementValue(null);
          await sendAssistantMessage('Preencha as medidas nos menus abaixo e depois salve a avaliacao.');
          return;
        }

        if (!evaluationType || (isPersonal && !targetStudentId)) {
          setPendingEvaluation({
            type: resolvePinnedEvaluationType(evaluationType) || undefined,
            studentId: resolvePinnedStudent(selectedStudent?.id)?.id || targetStudentId,
          });
          if (!evaluationType && isPersonal && !targetStudentId) {
            await sendAssistantMessage('Qual tipo de avaliação e para qual aluno devo criar?');
          } else if (!evaluationType) {
            await sendAssistantMessage('Qual tipo de avaliação devo criar?');
          } else {
            await sendAssistantMessage('Para qual aluno devo criar a avaliação?');
          }
          return;
        }

        const resolvedType = resolvePinnedEvaluationType(evaluationType) || evaluationType;
        const resolvedStudentId = isPersonal
          ? resolvePinnedStudent(selectedStudent?.id)?.id || targetStudentId
          : user.uid;
        if (!resolvedType || !resolvedStudentId) {
          setPendingEvaluation({
            type: resolvedType || undefined,
            studentId: resolvedStudentId,
          });
          await sendAssistantMessage('Preciso do aluno e do tipo de avaliação para criar.');
          return;
        }
        await completePendingEvaluation(resolvedStudentId, resolvedType);
        return;
      }

      const result = await chatWithAI(trimmed, conversationHistory);

      await sendAssistantMessage(result.text, result.workout);

      if (result.workout) {
        if (isPersonal) {
          setPendingWorkout({ workout: result.workout });
          if (students.length === 0) {
            await sendAssistantMessage(
              'Não encontrei alunos vinculados ao seu codigo. Vincule um aluno antes de salvar treinos.'
            );
          } else {
            const resolvedStudent = resolvePinnedStudent();
            const resolvedDay = resolvePinnedWeekday();
            if (resolvedStudent && resolvedDay) {
              await completePendingWorkout(result.workout, resolvedStudent, resolvedDay);
            } else {
              const sampleList = students.slice(0, 5).map((student) => student.nome).join(', ');
              await sendAssistantMessage(
                `Para qual aluno devo salvar e em qual dia? ` +
                  `Exemplos: ${sampleList}. ` +
                  'Selecione abaixo ou responda com o nome do aluno e o dia da semana.'
              );
            }
          }
        } else if (user?.uid) {
          try {
            const payload = await buildWorkoutPayload(result.workout);
            const saveResult = await createUserWorkout(user.uid, payload);
            if (saveResult.error) {
              throw new Error(saveResult.error);
            }
            if (saveResult.data?.id) {
              await sendAssistantMessage(
                'Treino criado e salvo nos seus treinos.',
                undefined,
                {
                  label: 'Abrir treino',
                  route: buildWorkoutRoute(saveResult.data.id, user.uid),
                }
              );
            } else {
              await sendAssistantMessage('Treino criado e salvo nos seus treinos.');
            }
          } catch (error: any) {
            await sendAssistantMessage(
              `Não consegui salvar o treino automaticamente: ${error.message || 'erro desconhecido'}.`
            );
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      if (String(errorMessage).toLowerCase().includes('openrouter api key')) {
        showAlert(
          'OpenRouter não configurado',
          'Defina EXPO_PUBLIC_OPENROUTER_API_KEY no arquivo .env para usar o assistente.'
        );
      } else {
        showAlert('Erro', `Não foi possível enviar a mensagem: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    handleSend(prompt);
  };

  useEffect(() => {
    const initialPrompt = Array.isArray(prompt) ? prompt[0] : prompt;
    if (!initialPrompt || !conversationId || !user?.uid || autoPromptSent.current) return;
    autoPromptSent.current = true;
    handleSend(String(initialPrompt));
  }, [prompt, conversationId, user?.uid]);

  const handleMenuPress = () => {
    if (!conversationId) return;
    showAlert('Opções do chat', 'O que deseja fazer?', [
      {
        text: 'Apagar conversa',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearConversationMessages(conversationId);
            welcomeSeeded.current = true;
            refreshSuggestions();
          } catch (error: any) {
            showAlert(
              'Erro',
              `Não foi possível apagar o chat: ${error.message || 'erro desconhecido'}.`
            );
          }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const handleSelectStudent = (student: Aluno) => {
    const nextId = pinnedStudentId === student.id ? null : student.id;
    setPinnedStudentId(nextId);
    if (pendingAnalysis) {
      setPendingAnalysis({ ...pendingAnalysis, studentId: nextId });
      return;
    }
    if (pendingEvaluationForm) {
      setPendingEvaluationForm({ ...pendingEvaluationForm, studentId: nextId });
      return;
    }
    if (pendingWorkout || pendingEvaluation) {
      setIsLoading(true);
      tryResolvePendingSelection({ studentId: nextId }).finally(() => setIsLoading(false));
    }
  };

  const handleSelectWeekday = (weekday: string) => {
    const nextDay = pinnedWeekday === weekday ? null : weekday;
    setPinnedWeekday(nextDay);
    if (pendingWorkout || pendingEvaluation) {
      setIsLoading(true);
      tryResolvePendingSelection({ weekday: nextDay }).finally(() => setIsLoading(false));
    }
  };

  const handleSelectEvaluationType = (type: EvaluationType) => {
    const nextType = pinnedEvaluationType === type ? null : type;
    setPinnedEvaluationType(nextType);
    if (pendingEvaluation && nextType && (nextType === 'online' || nextType === 'fisica')) {
      setPendingEvaluation(null);
      setPendingEvaluationForm({
        type: nextType,
        studentId: pendingEvaluation.studentId || null,
        values: { circunferencias: {} },
      });
      setSelectedMeasurementField(null);
      setSelectedMeasurementValue(null);
      sendAssistantMessage('Preencha as medidas nos menus abaixo e depois salve a avaliacao.');
      return;
    }
    if (pendingWorkout || pendingEvaluation) {
      setIsLoading(true);
      tryResolvePendingSelection({ evaluationType: nextType }).finally(() => setIsLoading(false));
    }
  };

  const handleSelectAnalysisEvaluation = (evaluation: PhysicalEvaluation) => {
    const nextId = selectedAnalysisEvaluationId === evaluation.id ? null : evaluation.id;
    setSelectedAnalysisEvaluationId(nextId);
    if (nextId) {
      runEvaluationAnalysis(evaluation);
    }
  };

  const handleSelectMeasurementField = (fieldId: string) => {
    if (!pendingEvaluationForm) return;
    setSelectedMeasurementField(fieldId as 'peso' | 'altura' | keyof Circumferences);
  };

  const handleSelectMeasurementValue = (valueId: string) => {
    const value = Number(valueId);
    if (!Number.isFinite(value)) return;
    if (!selectedMeasurementField) return;
    setPendingEvaluationForm((current) => {
      if (!current) return current;
      const nextValues = {
        ...current.values,
        circunferencias: { ...current.values.circunferencias },
      };
      if (selectedMeasurementField === 'peso') {
        nextValues.peso = value;
      } else if (selectedMeasurementField === 'altura') {
        nextValues.altura = value;
      } else {
        nextValues.circunferencias[selectedMeasurementField] = value;
      }
      return { ...current, values: nextValues };
    });
    setSelectedMeasurementValue(valueId);
  };

  const handleFinalizeEvaluationForm = () => {
    if (!pendingEvaluationForm) return;
    finalizeEvaluationForm(pendingEvaluationForm);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUserMessage = item.senderId === user?.uid;
    const isAssistant = item.senderId === ASSISTANT_ID;
    return (
      <MessageBubble
        content={item.content}
        isUser={isUserMessage}
        isAI={isAssistant}
        timestamp={item.createdAt}
        workoutData={item.workoutData || undefined}
        feedbackData={item.feedbackData || undefined}
        action={item.action}
        replyTo={item.replyTo}
      />
    );
  };

  const renderEmptyState = () => (
    <View style={styles.suggestionsContainer}>
      <Text style={[styles.suggestionsTitle, { color: colors.textSecondary }]}>
        Sugestões para começar:
      </Text>
      <View style={styles.suggestionsGrid}>
        {suggestions.map((prompt, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.suggestionButton, { backgroundColor: colors.surface }]}
            onPress={() => handleSuggestedPrompt(prompt)}
          >
            <Ionicons name="fitness-outline" size={20} color={colors.primary} />
            <Text style={[styles.suggestionText, { color: colors.text }]}>
              {prompt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const measurementFieldOptions = pendingEvaluationForm
    ? (pendingEvaluationForm.type === 'online'
        ? MEASUREMENT_FIELDS
        : MEASUREMENT_FIELDS.filter((field) => field.key === 'peso' || field.key === 'altura')
      ).map((field) => ({
        id: field.key,
        label: field.label,
        description: field.unit ? `em ${field.unit}` : undefined,
      }))
    : [];

  const measurementValueOptions = buildMeasurementValueOptions(selectedMeasurementField);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
      >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={[styles.headerAvatar, { backgroundColor: colors.primary }]}>
          <Ionicons name="sparkles" size={20} color="#fff" />
        </View>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            MH Assistente IA
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.success }]}>
            Online
          </Text>
        </View>
        <TouchableOpacity style={styles.menuButton} onPress={handleMenuPress}>
          <Ionicons name="ellipsis-vertical" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.messagesList,
          { paddingBottom: spacing.md + insets.bottom + 8 },
        ]}
        onContentSizeChange={scrollToBottom}
        ListFooterComponent={messages.length <= 1 ? renderEmptyState : null}
      />

      {isLoading && (
        <View style={[styles.typingIndicator, { backgroundColor: colors.surface }]}>
          <View style={[styles.typingDot, { backgroundColor: colors.primary }]} />
          <View style={[styles.typingDot, styles.typingDotMiddle, { backgroundColor: colors.primary }]} />
          <View style={[styles.typingDot, styles.typingDotLast, { backgroundColor: colors.primary }]} />
          <Text style={[styles.typingText, { color: colors.textSecondary }]}>
            MH Assistente está digitando...
          </Text>
        </View>
      )}

      {(pendingWorkout || pendingEvaluation || pendingAnalysis || pendingEvaluationForm) && (
        <View style={[styles.quickSelectContainer, { borderTopColor: colors.border }]}>
          {pendingEvaluation && !pendingEvaluation.type && (
            <View style={styles.quickRow}>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>
                Tipo de avaliação
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChips}>
                {EVALUATION_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.quickChip,
                      {
                        backgroundColor:
                          pinnedEvaluationType === option.key ? colors.primary : colors.secondaryBackground,
                      },
                    ]}
                    onPress={() => handleSelectEvaluationType(option.key)}
                  >
                    <View style={styles.quickChipContent}>
                      <Text
                        style={[
                          styles.quickChipText,
                          {
                            color:
                              pinnedEvaluationType === option.key ? colors.info : colors.primaryText,
                          },
                        ]}
                      >
                        {option.label}
                      </Text>
                      {pinnedEvaluationType === option.key && (
                        <Ionicons name="checkmark" size={14} color={colors.info} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {isPersonal && students.length > 0 && (
            <View style={styles.quickRow}>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>Alunos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChips}>
                {students.map((student) => (
                  <TouchableOpacity
                    key={student.id}
                    style={[
                      styles.quickChip,
                      {
                        backgroundColor:
                          pinnedStudentId === student.id ? colors.primary : colors.secondaryBackground,
                      },
                    ]}
                    onPress={() => handleSelectStudent(student)}
                  >
                    <View style={styles.quickChipContent}>
                      <Text
                        style={[
                          styles.quickChipText,
                          {
                            color:
                              pinnedStudentId === student.id ? colors.info : colors.primaryText,
                          },
                        ]}
                      >
                        {student.nome}
                      </Text>
                      {pinnedStudentId === student.id && (
                        <Ionicons name="checkmark" size={14} color={colors.info} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {pendingWorkout && (
            <View style={styles.quickRow}>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>Dia da semana</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChips}>
                {WEEKDAY_OPTIONS.map((weekday) => (
                  <TouchableOpacity
                    key={weekday.key}
                    style={[
                      styles.quickChip,
                      {
                        backgroundColor:
                          pinnedWeekday === weekday.key ? colors.primary : colors.secondaryBackground,
                      },
                    ]}
                    onPress={() => handleSelectWeekday(weekday.key)}
                  >
                    <View style={styles.quickChipContent}>
                      <Text
                        style={[
                          styles.quickChipText,
                          {
                            color:
                              pinnedWeekday === weekday.key ? colors.info : colors.primaryText,
                          },
                        ]}
                      >
                        {weekday.label}
                      </Text>
                      {pinnedWeekday === weekday.key && (
                        <Ionicons name="checkmark" size={14} color={colors.info} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {pendingEvaluationForm && (
            <View style={styles.quickRow}>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>Medidas</Text>
              <View style={styles.measurementSelectRow}>
                <View style={styles.measurementSelect}>
                  <SearchableSelect
                    label="Medida"
                    placeholder="Selecione a medida"
                    options={measurementFieldOptions}
                    value={selectedMeasurementField}
                    onChange={handleSelectMeasurementField}
                  />
                </View>
                <View style={styles.measurementSelect}>
                  <SearchableSelect
                    label="Valor"
                    placeholder="Selecione o valor"
                    options={measurementValueOptions}
                    value={selectedMeasurementValue}
                    onChange={handleSelectMeasurementValue}
                    disabled={!selectedMeasurementField}
                  />
                </View>
              </View>
              <Text style={[styles.quickHint, { color: colors.textMuted }]}>
                {buildFilledMeasurementsText(pendingEvaluationForm)}
              </Text>
            </View>
          )}

          {pendingEvaluationForm && (
            <View style={styles.quickRow}>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>Finalizar</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChips}>
                <TouchableOpacity
                  style={[
                    styles.quickChip,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={handleFinalizeEvaluationForm}
                >
                  <View style={styles.quickChipContent}>
                    <Text style={[styles.quickChipText, { color: colors.info }]}>Salvar avaliacao</Text>
                    <Ionicons name="checkmark" size={14} color={colors.info} />
                  </View>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}

          {pendingAnalysis && (
            <View style={styles.quickRow}>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>Avaliações</Text>
              {analysisLoading ? (
                <Text style={[styles.quickHint, { color: colors.textMuted }]}>Carregando...</Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickChips}
                >
                  {analysisEvaluations.slice(0, 10).map((evaluation) => (
                    <TouchableOpacity
                      key={`${evaluation.type}-${evaluation.id}`}
                      style={[
                        styles.quickChip,
                        {
                          backgroundColor:
                            selectedAnalysisEvaluationId === evaluation.id
                              ? colors.primary
                              : colors.secondaryBackground,
                        },
                      ]}
                      onPress={() => handleSelectAnalysisEvaluation(evaluation)}
                    >
                      <View style={styles.quickChipContent}>
                        <Text
                          style={[
                            styles.quickChipText,
                            {
                              color:
                                selectedAnalysisEvaluationId === evaluation.id
                                  ? colors.info
                                  : colors.primaryText,
                            },
                          ]}
                        >
                          {formatEvaluationLabel(evaluation)}
                        </Text>
                        {selectedAnalysisEvaluationId === evaluation.id && (
                          <Ionicons name="checkmark" size={14} color={colors.info} />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      )}

      <ChatInput
        onSend={handleSend}
        onAfterSend={scrollToBottom}
        disabled={isLoading || !conversationId}
        loading={isLoading}
        placeholder="Pergunte algo ao assistente..."
      />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  menuButton: {
    padding: spacing.sm,
  },
  messagesList: {
    paddingVertical: spacing.md,
    flexGrow: 1,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    alignSelf: 'flex-start',
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.4,
  },
  typingDotMiddle: {
    marginLeft: 4,
    opacity: 0.6,
  },
  typingDotLast: {
    marginLeft: 4,
    opacity: 0.8,
  },
  typingText: {
    fontSize: 12,
    marginLeft: spacing.sm,
  },
  quickSelectContainer: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  quickRow: {
    gap: spacing.xs,
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  quickHint: {
    fontSize: 12,
  },
  quickChips: {
    gap: spacing.sm,
    paddingRight: spacing.base,
  },
  measurementSelectRow: {
    gap: spacing.sm,
  },
  measurementSelect: {
    marginBottom: spacing.xs,
  },
  quickChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  quickChipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  suggestionsContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.xl,
  },
  suggestionsTitle: {
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  suggestionsGrid: {
    gap: spacing.sm,
  },
  suggestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  suggestionText: {
    fontSize: 14,
    flex: 1,
  },
});

