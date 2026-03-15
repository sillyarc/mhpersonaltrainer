import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  FlatList,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { showAlert } from '@utils/alert';
import {
  buildExerciseNameLookup,
  resolveExerciseByName,
  resolveExerciseMediaByName,
  resolveExerciseMediaFromExercise,
} from '@utils/exerciseLookup';
import {
  coerceMetricValue,
  formatMetricText,
  formatMetricWithSuffix,
  parseMetricInput,
} from '@utils/workoutMetrics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { Button, Input, Card, SearchableSelect, DateInput } from '../../src/components/common';
import { ExerciseCard } from '../../src/components/workout/ExerciseCard';
import { spacing, borderRadius } from '../../src/theme';
import { Exercise, ExerciseCategory, WorkoutExercise, UserWorkout } from '../../src/types/workout';
import {
  fetchAvailableExercises,
  fetchUserWorkoutById,
  createUserWorkout,
  updateUserWorkout,
  createAerobicWorkout,
} from '../../src/services/workouts';
import { useAuthStore } from '../../src/store/authStore';
import { firestoreService, Aluno } from '../../src/services/firestoreService';
import { notifyConversationEvent } from '../../src/services/chat';
import { chatWithAI } from '../../src/services/ai';

interface AerobicItemForm {
  id: string;
  nome: string;
}

const createEmptyAerobicItem = (): AerobicItemForm => ({
  id: `${Date.now()}-${Math.random()}`,
  nome: '',
});

const CATEGORIES: { id: ExerciseCategory | null; label: string }[] = [
  { id: null, label: 'Todos' },
  { id: 'peitoral', label: 'Peito' },
  { id: 'costas', label: 'Costas' },
  { id: 'pernas', label: 'Pernas' },
  { id: 'ombro', label: 'Ombros' },
  { id: 'biceps', label: 'Bíceps' },
  { id: 'triceps', label: 'Tríceps' },
  { id: 'abdomen', label: 'Abdômen' },
  { id: 'aerobico', label: 'Aeróbico' },
  { id: 'funcional', label: 'Funcional' },
];

const resolveCatalogVideoUrl = (exercise?: Exercise | null) =>
  exercise?.videoUrl1080 || exercise?.videoUrl720 || exercise?.videoUrl || '';

const resolveCatalogGifUrl = (exercise?: Exercise | null) =>
  exercise?.gifUrl || '';

export default function CreateWorkoutScreen() {
  const { colors } = useTheme();
  const { user, role } = useAuthStore();
  const { editId, studentId } = useLocalSearchParams<{ editId?: string; studentId?: string }>();
  const insets = useSafeAreaInsets();
  const isEditing = !!editId;
  const isPersonal = role === 'personal' || role === 'professor';
  const canManageStudentWorkout = isPersonal || role === 'admin';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [workoutDate, setWorkoutDate] = useState<Date>(new Date());
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ExerciseCategory | null>(null);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [editingExercise, setEditingExercise] = useState<WorkoutExercise | null>(null);
  const [editingSeries, setEditingSeries] = useState('');
  const [editingReps, setEditingReps] = useState('');
  const [editingWeight, setEditingWeight] = useState('');
  const [editingRest, setEditingRest] = useState('');
  const [editingNote, setEditingNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAssistantExpanded, setIsAssistantExpanded] = useState(false);
  const [isAerobic, setIsAerobic] = useState(false);
  const [aerobicItems, setAerobicItems] = useState<AerobicItemForm[]>([createEmptyAerobicItem()]);
  const [aerobicAquecimento, setAerobicAquecimento] = useState('');
  const [aerobicVolta, setAerobicVolta] = useState('');
  const [aerobicObservacoes, setAerobicObservacoes] = useState('');
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    typeof studentId === 'string' ? studentId : null
  );

  const normalizeCategory = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

  const routeStudentId =
    typeof studentId === 'string' && studentId.trim().length > 0 ? studentId : null;
  const targetUserId = canManageStudentWorkout ? selectedStudentId || routeStudentId : user?.uid;
  const studentOptions = students.map((student) => ({
    id: student.id,
    label: student.nome,
    description: student.email,
  }));
  const availableExerciseLookup = useMemo(
    () => buildExerciseNameLookup(availableExercises),
    [availableExercises]
  );

  const buildWorkoutRoute = (workoutId: string, targetId: string) =>
    `/workout/${workoutId}?studentId=${targetId}`;

  const formatExercisePreview = (exercise: WorkoutExercise) => {
    const seriesLabel = formatMetricText(exercise.series);
    const repsLabel = formatMetricText(exercise.repeticoes);
    const details: string[] = [];

    if (seriesLabel && repsLabel) {
      details.push(`${seriesLabel}x${repsLabel}`);
    } else if (seriesLabel) {
      details.push(seriesLabel);
    } else if (repsLabel) {
      details.push(repsLabel);
    }
    const cargaLabel = formatMetricWithSuffix(exercise.carga, 'kg');
    if (cargaLabel) details.push(cargaLabel);
    const intervaloLabel = formatMetricWithSuffix(exercise.intervalo, 's');
    if (intervaloLabel) details.push(intervaloLabel);

    return details.length > 0 ? `${exercise.nome} - ${details.join(' - ')}` : exercise.nome;
  };

  const buildWorkoutPreview = () => ({
    nomeDaRotina: name.trim() || 'Treino',
    objetivoDaRotina: description.trim(),
    treino: exercises.map(formatExercisePreview),
  });

  const findCatalogExercise = (
    workoutExercise: WorkoutExercise,
    catalog: Exercise[]
  ) => {
    const byId = catalog.find((item) => item.id === workoutExercise.exerciseId);
    if (byId) return byId;

    const byName = resolveExerciseByName(
      workoutExercise.nome,
      buildExerciseNameLookup(catalog)
    );
    if (byName) return byName;

    const currentMediaUrl = (workoutExercise.videoUrl || '').trim();
    if (!currentMediaUrl) return undefined;

    return catalog.find((item) => {
      const catalogVideo = resolveCatalogVideoUrl(item);
      const catalogGif = resolveCatalogGifUrl(item);
      return catalogVideo === currentMediaUrl || catalogGif === currentMediaUrl;
    });
  };

  const handleAddAerobicItem = () => {
    setAerobicItems((prev) => [...prev, createEmptyAerobicItem()]);
  };

  const handleRemoveAerobicItem = (id: string) => {
    setAerobicItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      return next.length ? next : [createEmptyAerobicItem()];
    });
  };

  const handleChangeAerobicItem = (
    id: string,
    field: keyof AerobicItemForm,
    value: string
  ) => {
    setAerobicItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const buildAerobicItemsPayload = () =>
    aerobicItems
      .map((item) => ({
        nome: item.nome.trim(),
      }))
      .filter((item) => item.nome);

  const parseExerciseLine = (line: string) => {
    const trimmed = line.trim();
    const parts = trimmed.split('-').map((part) => part.trim()).filter(Boolean);
    const name = parts[0] || trimmed;
    let series = 3;
    let reps = 12;
    let rest = 60;

    const seriesMatch = trimmed.match(/(\d+)\s*(?:series|serie)/i);
    if (seriesMatch) series = Number(seriesMatch[1]);

    const repsMatch = trimmed.match(/(\d+)\s*(?:reps|rep|repeticoes)/i);
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

  const handleGenerateWorkout = async () => {
    const prompt = assistantPrompt.trim();
    if (!prompt) {
      showAlert('Assistente', 'Digite um prompt para gerar o treino.');
      return;
    }
    setIsGenerating(true);
    try {
      const result = await chatWithAI(prompt, []);
      if (result.workout && result.workout.treino.length > 0) {
        const baseId = Date.now();
        const mappedExercises = result.workout.treino.map((item, index) => {
          const parsed = parseExerciseLine(item);
          const catalogExercise = resolveExerciseByName(parsed.name, availableExerciseLookup);
          const media = resolveExerciseMediaFromExercise(catalogExercise, 'video');
          return {
            exerciseId: `ai-${baseId}-${index}`,
            nome: catalogExercise?.nomeDoTreino || parsed.name,
            series: parsed.series,
            repeticoes: parsed.reps,
            carga: 0,
            intervalo: parsed.rest,
            videoUrl: media.url,
            gifUrl: media.gifUrl,
            mediaType: media.kind === 'gif' ? 'gif' : media.kind === 'video' ? 'video' : undefined,
          } as WorkoutExercise;
        });
        setName(result.workout.nomeDaRotina || 'Treino sugerido');
        setDescription(result.workout.objetivoDaRotina || '');
        setExercises(mappedExercises);
        return;
      }
      showAlert('Assistente', result.text || 'Nao foi possivel gerar o treino.');
    } catch (error: any) {
      const message = error?.message || 'Falha ao gerar treino pelo assistente.';
      showAlert('Assistente', message);
    } finally {
      setIsGenerating(false);
    }
  };

  const notifyWorkoutEvent = async (
    targetId: string,
    eventType: 'created' | 'updated',
    workoutId?: string
  ) => {
    if (!user?.uid) return;
    const student = students.find((item) => item.id === targetId);
    const workoutName = name.trim() || 'Treino';
    const message =
      eventType === 'created'
        ? `Treino novo: ${workoutName}.`
        : `Treino atualizado: ${workoutName}.`;
    const actionPayload = workoutId
      ? {
          label: 'Abrir treino',
          route: buildWorkoutRoute(workoutId, targetId),
        }
      : undefined;
    try {
      await notifyConversationEvent({
        senderId: user.uid,
        senderName: user.displayName,
        senderPhoto: user.photoUrl,
        recipientId: targetId,
        recipientName: student?.nome,
        recipientPhoto: student?.photoUrl,
        content: message,
        workoutData: buildWorkoutPreview(),
        action: actionPayload,
      });
    } catch (_) {
      // Ignore chat notification failures.
    }
  };

  useEffect(() => {
    const loadExercises = async () => {
      const result = await fetchAvailableExercises();
      setAvailableExercises(result.data || []);
    };
    loadExercises();
  }, []);

  useEffect(() => {
    if (!isPersonal || !user?.uid) return;
    const loadStudents = async () => {
      const alunos = await firestoreService.getAlunosDoPersonal(user.uid);
      setStudents(alunos);
      if (!selectedStudentId && alunos.length > 0) {
        setSelectedStudentId(alunos[0].id);
      }
    };
    loadStudents();
  }, [isPersonal, user?.uid, selectedStudentId]);

  useEffect(() => {
    const loadWorkout = async () => {
      if (!isEditing || !targetUserId || !editId) return;
      const result = await fetchUserWorkoutById(targetUserId, editId);
      if (result.data) {
        const loadedWorkout = result.data;
        const storedVideoUrls = loadedWorkout.videoUrls || [];
        const normalizedStoredVideoUrls = storedVideoUrls.map((item) =>
          typeof item === 'string' ? item.trim() : ''
        );
        let exerciseLookup = buildExerciseNameLookup([]);
        const workoutEntries = loadedWorkout.treino || [];
        if (workoutEntries.length > 0) {
          const exercisesResult = await fetchAvailableExercises();
          if (exercisesResult.data) {
            exerciseLookup = buildExerciseNameLookup(exercisesResult.data);
          }
        }
        setName(loadedWorkout.nomeDoTreino || '');
        setDescription(loadedWorkout.obsInstrucao || '');
        setWorkoutDate(loadedWorkout.data || loadedWorkout.createdAt || new Date());
        const resolvedMediaUrls: string[] = [];
        const mappedExercises: WorkoutExercise[] = workoutEntries.map((rawName, index) => {
          const treino = typeof rawName === 'string' ? rawName : String(rawName || '');
          const resolvedMedia = resolveExerciseMediaByName(
            treino,
            normalizedStoredVideoUrls[index] || '',
            exerciseLookup
          );
          resolvedMediaUrls[index] = resolvedMedia.url || '';
          return {
            videoUrl: resolvedMedia.url,
            gifUrl: resolvedMedia.gifUrl,
            mediaType: resolvedMedia.kind === 'gif' ? 'gif' : resolvedMedia.kind === 'video' ? 'video' : undefined,
            exerciseId: `${loadedWorkout.id}-${index}`,
            nome: treino,
            series: coerceMetricValue(loadedWorkout.seriesRep?.[index], 3),
            repeticoes: coerceMetricValue(loadedWorkout.repeticoes?.[index], 12),
            carga: coerceMetricValue(loadedWorkout.carga?.[index], 0),
            intervalo: coerceMetricValue(loadedWorkout.intervalo?.[index], 60),
          };
        });
        const shouldSyncVideoUrls =
          resolvedMediaUrls.length > 0 &&
          resolvedMediaUrls.some((url, index) => url !== (normalizedStoredVideoUrls[index] || ''));
        if (shouldSyncVideoUrls) {
          void updateUserWorkout(targetUserId, loadedWorkout.id, {
            videoUrls: resolvedMediaUrls,
          });
        }
        setExercises(mappedExercises);
      }
    };
    loadWorkout();
  }, [editId, isEditing, targetUserId]);

  const filteredExercises = useMemo(() => {
    let pool = availableExercises;
    const keywordsByCategory: Record<ExerciseCategory, string[]> = {
      peitoral: ['peito', 'peitoral'],
      costas: ['costas', 'dorsal', 'dorsais', 'lombar'],
      pernas: ['perna', 'pernas', 'membros inferiores', 'inferiores'],
      ombro: ['ombro', 'ombros', 'deltoide', 'deltoides'],
      biceps: ['biceps'],
      triceps: ['triceps'],
      abdomen: ['abdomen', 'abdominal', 'core'],
      aerobico: ['aerobico', 'cardio', 'cardiovascular'],
      funcional: ['funcional', 'funcionais', 'hiit'],
    };
    if (selectedCategory) {
      const targets = keywordsByCategory[selectedCategory] || [];
      pool = pool.filter((exercise) => {
        const colecao = normalizeCategory(exercise.colecao || '');
        if (!colecao) return false;
        return targets.some((keyword) => colecao.includes(keyword));
      });
    }

    const searchTerm = normalizeCategory(exerciseSearch);
    if (!searchTerm) return pool;
    return pool.filter((exercise) => {
      const name = normalizeCategory(exercise.nomeDoTreino || '');
      const colecao = normalizeCategory(exercise.colecao || '');
      return name.includes(searchTerm) || colecao.includes(searchTerm);
    });
  }, [availableExercises, selectedCategory, exerciseSearch]);

  const handleAddExercise = (exercise: Exercise) => {
    const media = resolveExerciseMediaFromExercise(exercise, 'video');
    const newExercise: WorkoutExercise = {
      exerciseId: exercise.id,
      nome: exercise.nomeDoTreino,
      series: Math.max(1, Number(exercise.seriesRep || 3)),
      repeticoes: 12,
      carga: Number(exercise.carga || 0),
      intervalo: Number(exercise.intervalo || 60),
      videoUrl: media.url,
      gifUrl: media.gifUrl,
      mediaType: media.kind === 'gif' ? 'gif' : media.kind === 'video' ? 'video' : undefined,
    };
    setExercises((prev) => [...prev, newExercise]);
    setShowExerciseModal(false);
  };

  const handleViewExerciseVideo = async (exercise: WorkoutExercise) => {
    let catalogPool = availableExercises;
    let catalogExercise = findCatalogExercise(exercise, availableExercises);

    if (!catalogExercise) {
      const result = await fetchAvailableExercises();
      if (result.data) {
        catalogPool = result.data;
        setAvailableExercises(result.data);
        catalogExercise = findCatalogExercise(exercise, result.data);
      }
    }

    const mediaLookup = buildExerciseNameLookup(catalogPool);
    const fallbackMedia = resolveExerciseMediaByName(
      exercise.nome,
      exercise.videoUrl || '',
      mediaLookup
    );
    const videoUrl = resolveCatalogVideoUrl(catalogExercise) || fallbackMedia.videoUrl || '';
    const gifUrl = resolveCatalogGifUrl(catalogExercise) || fallbackMedia.gifUrl || exercise.gifUrl || '';

    if (!videoUrl && !gifUrl) {
      showAlert('Midia', 'Este exercicio ainda nao possui video ou GIF.');
      return;
    }

    const applyMedia = (kind: 'video' | 'gif') => {
      const nextUrl = kind === 'video' ? videoUrl : gifUrl;
      if (!nextUrl) return;
      setExercises((prev) =>
        prev.map((item) =>
          item.exerciseId === exercise.exerciseId
            ? {
                ...item,
                videoUrl: nextUrl,
                gifUrl: gifUrl || item.gifUrl,
                mediaType: kind,
              }
            : item
        )
      );
    };

    if (videoUrl && gifUrl) {
      showAlert('Midia do exercicio', 'Escolha a midia padrao deste exercicio.', [
        {
          text: 'Video',
          onPress: () => {
            applyMedia('video');
            if (catalogExercise?.id) {
              router.push(`/workout/exercise/${catalogExercise.id}?media=video` as any);
            }
          },
        },
        {
          text: 'GIF',
          onPress: () => {
            applyMedia('gif');
            if (catalogExercise?.id) {
              router.push(`/workout/exercise/${catalogExercise.id}?media=gif` as any);
            }
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ]);
      return;
    }

    if (videoUrl) {
      applyMedia('video');
      if (catalogExercise?.id) {
        router.push(`/workout/exercise/${catalogExercise.id}` as any);
      }
      return;
    }

    applyMedia('gif');
    if (catalogExercise?.id) {
      router.push(`/workout/exercise/${catalogExercise.id}?media=gif` as any);
      return;
    }
    showAlert('GIF aplicado', 'Nao foi possivel abrir detalhes porque o exercicio nao foi localizado no Firebase.');
  };

  const handleEditExercise = (exercise: WorkoutExercise) => {
    setEditingExercise(exercise);
    setEditingSeries(formatMetricText(exercise.series));
    setEditingReps(formatMetricText(exercise.repeticoes));
    setEditingWeight(formatMetricText(exercise.carga));
    setEditingRest(formatMetricText(exercise.intervalo));
    setEditingNote(exercise.observacao || '');
    setShowEditModal(true);
  };

  const handleSaveExerciseEdit = () => {
    if (!editingExercise) return;

    setExercises((prev) =>
      prev.map((e) =>
        e.exerciseId === editingExercise.exerciseId
          ? {
              ...e,
              series: parseMetricInput(editingSeries, editingExercise.series ?? 3),
              repeticoes: parseMetricInput(editingReps, editingExercise.repeticoes ?? 12),
              carga: parseMetricInput(editingWeight, editingExercise.carga ?? 0),
              intervalo: parseMetricInput(editingRest, editingExercise.intervalo ?? 60),
              observacao: editingNote || undefined,
            }
          : e
      )
    );
    setShowEditModal(false);
    setEditingExercise(null);
  };

  const handleDeleteExercise = (exerciseId: string) => {
    showAlert('Remover exercício', 'Deseja remover este exercício do treino?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          setExercises((prev) => prev.filter((e) => e.exerciseId !== exerciseId));
        },
      },
    ]);
  };

  const buildPayload = (): Omit<UserWorkout, 'id'> => ({
    nomeDoTreino: name.trim(),
    obsInstrucao: description.trim(),
    personalId: isPersonal ? user?.uid : undefined,
    treino: exercises.map((exercise) => exercise.nome),
    seriesRep: exercises.map((exercise) => exercise.series ?? 0),
    repeticoes: exercises.map((exercise) => exercise.repeticoes ?? 0),
    carga: exercises.map((exercise) => exercise.carga ?? 0),
    intervalo: exercises.map((exercise) => exercise.intervalo ?? 0),
    videoUrls: exercises.map((exercise) => exercise.videoUrl || ''),
    arquivos: false,
    data: workoutDate,
  });

  const handlePostSave = (targetId: string) => {
    showAlert('Treino criado', 'Deseja gerar uma cobrança para este aluno?', [
      { text: 'Agora não', onPress: () => router.back(), style: 'cancel' },
      {
        text: 'Gerar cobrança',
        onPress: () => {
          const descricaoParam = `Treino ${name.trim()}`.trim();
          router.replace(
            `/financeiro/personal?studentId=${targetId}&descricao=${encodeURIComponent(descricaoParam)}` as any
          );
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!targetUserId) {
      showAlert('Erro', 'Selecione um aluno para o treino.');
      return;
    }
    if (isAerobic) {
      const parsedItems = buildAerobicItemsPayload();
      if (parsedItems.length === 0) {
        showAlert('Erro', 'Informe pelo menos um treino aeróbico.');
        return;
      }
      setIsSaving(true);
      const result = await createAerobicWorkout(targetUserId, {
        personalId: isPersonal ? user?.uid : undefined,
        items: parsedItems,
        treino: parsedItems[0].nome,
        treinos: parsedItems.map((item) => item.nome),
        aquecimento: aerobicAquecimento.trim() || undefined,
        voltaacalma: aerobicVolta.trim() || undefined,
        observacoes: aerobicObservacoes.trim() || undefined,
        data: workoutDate,
      });
      setIsSaving(false);
      if (result.error) {
        showAlert('Erro', result.error);
        return;
      }
      showAlert('Sucesso', 'Treino aeróbico criado!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
      return;
    }
    if (!name.trim()) {
      showAlert('Erro', 'Digite um nome para o treino');
      return;
    }
    if (exercises.length === 0) {
      showAlert('Erro', 'Adicione pelo menos um exercício');
      return;
    }

    setIsSaving(true);
    const payload = buildPayload();
    const result = isEditing && editId
      ? await updateUserWorkout(targetUserId, editId, payload)
      : await createUserWorkout(targetUserId, payload);
    setIsSaving(false);

    if (result.error) {
      showAlert('Erro', result.error);
      return;
    }
    if (isPersonal) {
      const workoutId = isEditing ? editId : result.data?.id;
      notifyWorkoutEvent(targetUserId, isEditing ? 'updated' : 'created', workoutId);
    }
    if (isPersonal && !isEditing) {
      handlePostSave(targetUserId);
      return;
    }
    showAlert('Sucesso', isEditing ? 'Treino atualizado!' : 'Treino criado!', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const renderExerciseOption = ({ item }: { item: Exercise }) => {
    const isAdded = exercises.some((e) => e.nome === item.nomeDoTreino);
    const hasVideo = Boolean(resolveCatalogVideoUrl(item));
    const hasGif = Boolean(resolveCatalogGifUrl(item));
    return (
      <TouchableOpacity
        style={[
          styles.exerciseOption,
          { backgroundColor: colors.card, borderColor: colors.border },
          isAdded && { opacity: 0.5 },
        ]}
        onPress={() => !isAdded && handleAddExercise(item)}
        disabled={isAdded}
      >
        <View style={styles.exerciseOptionInfo}>
          <Text style={[styles.exerciseOptionName, { color: colors.text }]} numberOfLines={2}>
            {item.nomeDoTreino}
          </Text>
          <Text style={[styles.exerciseOptionCategory, { color: colors.textMuted }]} numberOfLines={1}>
            {item.colecao}
          </Text>
          <View style={styles.exerciseOptionMediaRow}>
            {hasVideo ? (
              <View style={[styles.exerciseOptionMediaChip, { backgroundColor: colors.primary + '14' }]}>
                <Ionicons name="play-circle-outline" size={12} color={colors.primary} />
                <Text style={[styles.exerciseOptionMediaText, { color: colors.primary }]}>Video</Text>
              </View>
            ) : null}
            {hasGif ? (
              <View style={[styles.exerciseOptionMediaChip, { backgroundColor: colors.success + '14' }]}>
                <Ionicons name="images-outline" size={12} color={colors.success} />
                <Text style={[styles.exerciseOptionMediaText, { color: colors.success }]}>GIF</Text>
              </View>
            ) : null}
          </View>
        </View>
        {isAdded ? (
          <Ionicons name="checkmark-circle" size={24} color={colors.success} />
        ) : (
          <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isEditing ? 'Editar treino' : 'Novo treino'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {isPersonal && (
          <View style={styles.section}>
            {students.length === 0 ? (
              <Card>
                <Text style={{ color: colors.textSecondary }}>
                  Nenhum aluno vinculado ao seu codigo ainda.
                </Text>
              </Card>
            ) : (
              <SearchableSelect
                label="Aluno"
                placeholder="Selecione um aluno"
                options={studentOptions}
                value={selectedStudentId}
                onChange={setSelectedStudentId}
              />
            )}
          </View>
        )}

        {isPersonal && !isEditing && (
          <Card style={styles.toggleCard} shadow={false} padding="small">
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={[styles.toggleTitle, { color: colors.text }]}>
                  Treino aeróbico
                </Text>
                <Text style={[styles.toggleSubtitle, { color: colors.textSecondary }]}>
                  Ative para criar um treino aeróbico simples
                </Text>
              </View>
              <Switch
                value={isAerobic}
                onValueChange={setIsAerobic}
                trackColor={{ false: colors.border, true: colors.primary + '60' }}
                thumbColor={isAerobic ? colors.primary : colors.surface}
              />
            </View>
          </Card>
        )}

        <View style={styles.section}>
          <DateInput
            label="Data do treino"
            placeholder="DD/MM/AAAA"
            value={workoutDate}
            onChange={setWorkoutDate}
          />
        </View>

        {!isAerobic && (
          <>
            {isPersonal && (
              <Card style={styles.assistantCard} shadow={false}>
                <TouchableOpacity
                  style={styles.assistantHeaderRow}
                  onPress={() => setIsAssistantExpanded((prev) => !prev)}
                  activeOpacity={0.8}
                >
                  <View style={styles.assistantHeaderInfo}>
                    <View
                      style={[
                        styles.assistantIconWrap,
                        { backgroundColor: colors.primary + '18' },
                      ]}
                    >
                      <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.assistantTextWrap}>
                      <Text style={[styles.assistantTitle, { color: colors.text }]}>
                        Assistente para treinos
                      </Text>
                      <Text style={[styles.assistantSubtitle, { color: colors.textSecondary }]}>
                        Opcional: use IA para montar o treino mais rápido.
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={isAssistantExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>

                {isAssistantExpanded && (
                  <View style={styles.assistantBody}>
                    <Input
                      label="Prompt"
                      placeholder="Ex: Treino de peito e triceps para hipertrofia"
                      value={assistantPrompt}
                      onChangeText={setAssistantPrompt}
                      multiline
                      numberOfLines={3}
                      icon="sparkles-outline"
                      inputStyle={{ paddingVertical: spacing.sm, fontSize: 14 }}
                    />
                    <Button
                      title="Gerar treino"
                      onPress={handleGenerateWorkout}
                      loading={isGenerating}
                      disabled={isGenerating || !assistantPrompt.trim()}
                      size="small"
                      fullWidth
                    />
                  </View>
                )}
              </Card>
            )}

            <Input
              label="Nome do treino"
              placeholder="Ex: Treino A - Peito e Triceps"
              value={name}
              onChangeText={setName}
              icon="barbell-outline"
            />

            <Input
              label="Descrição"
              placeholder="Descreva o objetivo do treino"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Exercícios ({exercises.length})
                </Text>
                <TouchableOpacity
                  style={[styles.addExerciseButton, { backgroundColor: colors.primary }]}
                  onPress={() => setShowExerciseModal(true)}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.addExerciseText}>Adicionar</Text>
                </TouchableOpacity>
              </View>

              {exercises.length === 0 ? (
                <View style={[styles.emptyExercises, { backgroundColor: colors.surface }]}>
                  <Ionicons name="barbell-outline" size={48} color={colors.textMuted} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    Nenhum exercício adicionado
                  </Text>
                  <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                    Toque em "Adicionar" para incluir exercícios
                  </Text>
                </View>
              ) : (
                <DraggableFlatList
                  data={exercises}
                  keyExtractor={(item) => item.exerciseId}
                  onDragEnd={({ data }) => setExercises(data)}
                  scrollEnabled={false}
                  activationDistance={12}
                  renderItem={({ item, getIndex, drag, isActive }) => {
                    const index = getIndex?.() ?? 0;
                    return (
                      <ExerciseCard
                        exercise={item}
                        index={index}
                        showActions
                        onEdit={() => handleEditExercise(item)}
                        onDelete={() => handleDeleteExercise(item.exerciseId)}
                        onVideoPress={() => void handleViewExerciseVideo(item)}
                        onLongPress={isPersonal ? drag : undefined}
                        showDragHandle={isPersonal}
                        onDragHandlePressIn={isPersonal ? drag : undefined}
                        delayLongPress={150}
                        isActive={isActive}
                      />
                    );
                  }}
                />
              )}
            </View>
          </>
        )}

        {isAerobic && (
          <Card style={styles.aerobicCard} shadow={false}>
            <Text style={[styles.aerobicTitle, { color: colors.text }]}>
              Treino aeróbico
            </Text>
            <Text style={[styles.aerobicSubtitle, { color: colors.textSecondary }]}>
              Cadastre atividades de forma simples e objetiva.
            </Text>
            <View style={[styles.aerobicItemsHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.aerobicItemsTitle, { color: colors.text }]}>Atividades</Text>
              <TouchableOpacity style={styles.aerobicAddButton} onPress={handleAddAerobicItem}>
                <Ionicons name="add-circle" size={20} color={colors.primary} />
                <Text style={[styles.aerobicAddText, { color: colors.primary }]}>Adicionar</Text>
              </TouchableOpacity>
            </View>

            {aerobicItems.map((item, index) => (
              <View key={item.id} style={styles.aerobicItemRow}>
                <View
                  style={[
                    styles.aerobicItemIndex,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.aerobicItemIndexText, { color: colors.textSecondary }]}>
                    {index + 1}
                  </Text>
                </View>
                <View style={styles.aerobicItemInputWrap}>
                  <Input
                    placeholder={`Ex: Caminhada ${index + 1}`}
                    value={item.nome}
                    onChangeText={(value) => handleChangeAerobicItem(item.id, 'nome', value)}
                    style={styles.aerobicItemInput}
                  />
                </View>
                <TouchableOpacity
                  style={[
                    styles.aerobicRemoveButton,
                    { backgroundColor: colors.error + '12' },
                  ]}
                  onPress={() => handleRemoveAerobicItem(item.id)}
                  disabled={aerobicItems.length === 1}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={aerobicItems.length === 1 ? colors.textMuted : colors.error}
                  />
                </TouchableOpacity>
              </View>
            ))}
            <Input
              label="Aquecimento"
              placeholder="Ex: Caminhada 5 min"
              value={aerobicAquecimento}
              onChangeText={setAerobicAquecimento}
            />
            <Input
              label="Volta a calma"
              placeholder="Ex: Alongamentos"
              value={aerobicVolta}
              onChangeText={setAerobicVolta}
            />
            <Input
              label="Observações"
              placeholder="Observações adicionais"
              value={aerobicObservacoes}
              onChangeText={setAerobicObservacoes}
              multiline
              numberOfLines={3}
              autoGrow
            />
          </Card>
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Button
          title={
            isAerobic ? 'Salvar aeróbico' : isEditing ? 'Salvar alterações' : 'Criar treino'
          }
          onPress={handleSave}
          fullWidth
          size="large"
          loading={isSaving}
          disabled={isSaving}
        />
      </View>

      <Modal
        visible={showExerciseModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowExerciseModal(false)}
      >
        <SafeAreaView style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Selecionar exercício
            </Text>
            <TouchableOpacity onPress={() => setShowExerciseModal(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.exerciseSearchContainer}>
            <Input
              placeholder="Pesquisar treino"
              value={exerciseSearch}
              onChangeText={setExerciseSearch}
              icon="search-outline"
              style={styles.exerciseSearchInput}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoriesScroll}
            contentContainerStyle={styles.categoriesContainer}
          >
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id || 'all'}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor:
                      selectedCategory === cat.id ? colors.primary : colors.surface,
                  },
                ]}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    {
                      color: selectedCategory === cat.id ? '#fff' : colors.textSecondary,
                    },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            data={filteredExercises}
            renderItem={renderExerciseOption}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.exercisesList}
          />
        </SafeAreaView>
      </Modal>
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.sheetBackdrop}>
            <TouchableOpacity
              style={styles.sheetOverlay}
              activeOpacity={1}
              onPress={() => setShowEditModal(false)}
            />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
            >
              <View
                style={[
                  styles.sheetContainer,
                  { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, spacing.md) },
                ]}
              >
                <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
                <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>
                    Editar exercicio
                  </Text>
                  <TouchableOpacity onPress={() => setShowEditModal(false)}>
                    <Ionicons name="close" size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.editForm}
                  contentContainerStyle={styles.editFormContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View>
                    <Text style={[styles.editExerciseName, { color: colors.text }]}>
                      {editingExercise?.nome}
                    </Text>

                    <View style={styles.editRow}>
                      <View style={styles.editField}>
                        <Input
                          label="Series"
                          placeholder="3"
                          value={editingSeries}
                          onChangeText={setEditingSeries}
                          inputStyle={{ paddingVertical: spacing.sm, fontSize: 14 }}
                        />
                      </View>
                      <View style={styles.editField}>
                        <Input
                          label="Repeticoes"
                          placeholder="12"
                          value={editingReps}
                          onChangeText={setEditingReps}
                          inputStyle={{ paddingVertical: spacing.sm, fontSize: 14 }}
                        />
                      </View>
                    </View>

                    <View style={styles.editRow}>
                      <View style={styles.editField}>
                        <Input
                          label="Carga (kg)"
                          placeholder="0"
                          value={editingWeight}
                          onChangeText={setEditingWeight}
                          inputStyle={{ paddingVertical: spacing.sm, fontSize: 14 }}
                        />
                      </View>
                      <View style={styles.editField}>
                        <Input
                          label="Descanso (seg)"
                          placeholder="60"
                          value={editingRest}
                          onChangeText={setEditingRest}
                          inputStyle={{ paddingVertical: spacing.sm, fontSize: 14 }}
                        />
                      </View>
                    </View>

                    <Input
                      label="Observacoes"
                      placeholder="Notas sobre execucao, dicas, etc."
                      value={editingNote}
                      onChangeText={setEditingNote}
                      multiline
                      numberOfLines={3}
                      inputStyle={{ paddingVertical: spacing.sm, fontSize: 14 }}
                    />
                  </View>

                  <View style={styles.editFooter}>
                    <Button title="Salvar" onPress={handleSaveExerciseEdit} fullWidth size="large" />
                  </View>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  section: {
    marginTop: spacing.sm,
  },
  toggleCard: {
    marginTop: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  toggleSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  assistantCard: {
    marginTop: spacing.sm,
  },
  assistantHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  assistantHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  assistantIconWrap: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantTextWrap: {
    flex: 1,
  },
  assistantTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  assistantSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  assistantBody: {
    marginTop: spacing.md,
  },
  aerobicCard: {
    marginTop: spacing.sm,
  },
  aerobicTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  aerobicSubtitle: {
    fontSize: 12,
    marginBottom: spacing.md,
  },
  aerobicItemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    marginBottom: spacing.sm,
  },
  aerobicItemsTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  aerobicAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  aerobicAddText: {
    fontSize: 13,
    fontWeight: '600',
  },
  aerobicItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  aerobicItemIndex: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  aerobicItemIndexText: {
    fontSize: 14,
    fontWeight: '600',
  },
  aerobicItemInputWrap: {
    flex: 1,
  },
  aerobicItemInput: {
    marginBottom: 0,
  },
  aerobicRemoveButton: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 7,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  addExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  addExerciseText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyExercises: {
    alignItems: 'center',
    padding: spacing['2xl'],
    borderRadius: borderRadius.lg,
  },
  emptyText: {
    fontSize: 16,
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  footer: {
    padding: spacing.base,
    borderTopWidth: 1,
  },
  modal: {
    flex: 1,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetOverlay: {
    flex: 1,
  },
  sheetContainer: {
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.base,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: borderRadius.full,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  exerciseSearchContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  exerciseSearchInput: {
    marginBottom: spacing.sm,
  },
  categoriesScroll: {
    maxHeight: 64,
  },
  categoriesContainer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '500',
    includeFontPadding: false,
  },
  exercisesList: {
    padding: spacing.base,
  },
  exerciseOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  exerciseOptionInfo: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  exerciseOptionName: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
    flexShrink: 1,
  },
  exerciseOptionCategory: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  exerciseOptionMediaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  exerciseOptionMediaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  exerciseOptionMediaText: {
    fontSize: 11,
    fontWeight: '600',
  },
  editForm: {
    flexShrink: 1,
  },
  editFormContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  editExerciseName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.lg,
  },
  editRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  editField: {
    flex: 1,
  },
  editFooter: {
    paddingTop: spacing.sm,
  },
});
