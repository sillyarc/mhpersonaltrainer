import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card, Loading, Button, Input, SearchableSelect } from '../../src/components/common';
import { MeasurementForm } from '../../src/components/evaluation/MeasurementForm';
import { useTheme } from '../../src/hooks/useTheme';
import { spacing, borderRadius } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { 
  PhysicalEvaluation, 
  OnlineEvaluation,
  PersonalizedEvaluation,
  PosturalEvaluation,
  PhysicalTestEvaluation,
  EvaluationType,
  EvaluationQuestion,
  EvaluationAnswer,
  SkinFolds,
} from '../../src/types/evaluation';
import {
  EvaluationAIInsights,
  generateEvaluationInsights,
  isPremiumUserRecord,
} from '../../src/services/ai';
import { AnalysisResult, analyzePostureImage } from '../../src/services/aiAnalysis';
import { sendEvaluationCompletionReminder } from '../../src/services/notificationCenter';
import { 
  fetchEvaluationById, 
  deleteEvaluation,
  getEvaluationTypeLabel,
  getEvaluationStatusLabel,
  getEvaluationStatusColor,
  calculateIMC,
  getIMCClassification,
  calculateSkinfoldProtocol,
  getSkinfoldProtocolDobras,
  getSkinfoldProtocolLabel,
  submitPersonalizedAnswers,
  confirmPersonalizedEvaluation,
  markPersonalizedEvaluationExpired,
} from '../../src/services/evaluations';
import { db } from '../../src/services/firebase';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { submitWorkoutFeedback } from '../../src/services/feedback';

const TEST_RESULT_STATES: Record<
  string,
  { label: string; emoji: string; tone: 'success' | 'warning' | 'error' }
> = {
  bom: { label: 'Bom', emoji: '😀', tone: 'success' },
  medio: { label: 'Medio', emoji: '😐', tone: 'warning' },
  ruim: { label: 'Ruim', emoji: '😞', tone: 'error' },
};

const normalizeTestResultKey = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const getTestResultState = (value: unknown) => {
  const key = normalizeTestResultKey(value);
  return key ? TEST_RESULT_STATES[key] : undefined;
};

const formatTestResultValue = (value: unknown, unit?: string) => {
  const state = getTestResultState(value);
  if (state) return `${state.emoji} ${state.label}`;
  if (typeof value === 'number') {
    return `${value}${unit ? ` ${unit}` : ''}`;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const numericText = trimmed.replace(',', '.');
    if (/^\d+(?:\.\d+)?$/.test(numericText)) {
      return `${Number(numericText)}${unit ? ` ${unit}` : ''}`;
    }
    return `${trimmed}${unit ? ` ${unit}` : ''}`;
  }
  return '';
};

export default function EvaluationDetailScreen() {
  const { colors, isDark } = useTheme();
  const { role, user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { id, type, userId } = useLocalSearchParams<{ id: string; type: EvaluationType; userId?: string }>();
  const [evaluation, setEvaluation] = useState<PhysicalEvaluation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<EvaluationAIInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [postureAnalysis, setPostureAnalysis] = useState<AnalysisResult | null>(null);
  const [postureImageLabel, setPostureImageLabel] = useState<string | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string | number | boolean>>({});
  const [submittingAnswers, setSubmittingAnswers] = useState(false);
  const [confirmingEvaluation, setConfirmingEvaluation] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [expiringEvaluation, setExpiringEvaluation] = useState(false);
  const chargeableTypes: EvaluationType[] = ['fisica', 'personalizada', 'postural'];
  const isPersonal = role === 'personal' || role === 'professor';
  const hasPremiumAiAccess = isPremiumUserRecord((user || {}) as Record<string, any>);
  const premiumPageTop = isDark ? colors.secondaryBackground : '#F4F9FF';
  const premiumPageBottom = isDark ? colors.background : '#ECF3FA';
  const premiumCard = colors.card;
  const premiumSurface = colors.surface;
  const premiumBorder = colors.border;
  const overviewGradientColors: [string, string] = isDark
    ? [colors.card, colors.surface]
    : ['#F9FCFF', '#EEF6FF'];
  const outlinedCardStyle = {
    backgroundColor: premiumCard,
    borderColor: premiumBorder,
    borderWidth: 1,
  } as const;

  useEffect(() => {
    loadEvaluation();
  }, [id, type]);

  useEffect(() => {
    if (!evaluation || evaluation.type !== 'personalizada') return;
    const personalized = evaluation as PersonalizedEvaluation;
    const drafts: Record<string, string | number | boolean> = {};
    personalized.respostas?.forEach((resposta) => {
      drafts[resposta.questionId] = resposta.resposta as string | number | boolean;
    });
    setAnswerDrafts(drafts);
  }, [evaluation?.id, evaluation?.type]);

  useEffect(() => {
    if (!evaluation || evaluation.type !== 'personalizada') return;
    if (expiringEvaluation) return;
    const personalized = evaluation as PersonalizedEvaluation;
    if (!isPersonalizedOverdue(personalized)) return;
    setExpiringEvaluation(true);
    markPersonalizedEvaluationExpired({
      evaluationId: personalized.id,
      userId: personalized.userId,
    })
      .then((result) => {
        if (!result.error) {
          setEvaluation((prev) =>
            prev ? { ...prev, status: 'nao_realizada' } : prev
          );
        }
      })
      .finally(() => setExpiringEvaluation(false));
  }, [evaluation, expiringEvaluation]);

  const loadEvaluation = async () => {
    if (!id || !type) {
      setError('ID ou tipo da avaliação não encontrado');
      setIsLoading(false);
      return;
    }

    try {
      const result = await fetchEvaluationById(id, type, userId);
      if (result.error) {
        setError(result.error);
      } else {
        setEvaluation(result.data);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    showAlert(
      'Excluir Avaliacao',
      'Tem certeza que deseja excluir esta avaliação? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              const result = await deleteEvaluation(id!, type!, userId);
              if (result.error) {
                showAlert('Erro', result.error);
              } else {
                showAlert('Sucesso', 'Avaliacao excluida com sucesso', [
                  { text: 'OK', onPress: () => router.back() },
                ]);
              }
            } catch (err: any) {
              showAlert('Erro', err.message);
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleCharge = () => {
    if (!evaluation) return;
    const descricaoParam = `Avaliacao ${getEvaluationTypeLabel(evaluation.type)}`;
    router.push(
      `/financeiro/personal?studentId=${evaluation.userId}&descricao=${encodeURIComponent(descricaoParam)}` as any
    );
  };

  const buildAnswerValue = (question: EvaluationQuestion, raw: unknown) => {
    if (raw === undefined || raw === null) return undefined;
    if (question.tipo === 'sim_nao') {
      return typeof raw === 'boolean' ? raw : undefined;
    }
    if (question.tipo === 'escala') {
      const num = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
      return Number.isNaN(num) ? undefined : num;
    }
    const text = String(raw).trim();
    if (!text) return undefined;
    if (question.tipo === 'multipla_escolha' && question.opcoes?.length) {
      const match = question.opcoes.find((option) => option === text);
      return match || text;
    }
    return text;
  };

  const handleSubmitAnswers = async () => {
    if (!evaluation || evaluation.type !== 'personalizada') return;
    if (!user?.uid) return;
    const personalized = evaluation as PersonalizedEvaluation;
    if (personalized.status === 'nao_realizada') {
      showAlert('Prazo expirado', 'Esta avaliacao foi marcada como nao realizada.');
      return;
    }
    if (isPersonalizedOverdue(personalized)) {
      showAlert('Prazo expirado', 'O prazo para responder esta avaliacao expirou.');
      return;
    }
    const missing: string[] = [];
    const answers: EvaluationAnswer[] = [];
    personalized.perguntas.forEach((question) => {
      const normalized = buildAnswerValue(question, answerDrafts[question.id]);
      if (normalized === undefined || normalized === null || normalized === '') {
        missing.push(question.pergunta);
        return;
      }
      answers.push({ questionId: question.id, resposta: normalized });
    });

    if (missing.length > 0) {
      showAlert('Responda todas', 'Preencha todas as perguntas antes de enviar.');
      return;
    }

    setSubmittingAnswers(true);
    const result = await submitPersonalizedAnswers({
      evaluationId: personalized.id,
      userId: personalized.userId,
      answers,
    });
    setSubmittingAnswers(false);
    if (result.error) {
      showAlert('Erro', result.error);
      return;
    }
    setEvaluation((prev) =>
      prev
        ? {
            ...prev,
            status: 'em_andamento',
            respondidoEm: new Date(),
            respostas: answers,
          }
        : prev
    );
    showAlert('Respostas enviadas', 'Seu personal vai revisar a avaliacao.');
  };

  const handleConfirmEvaluation = async () => {
    if (!evaluation || evaluation.type !== 'personalizada') return;
    const personalized = evaluation as PersonalizedEvaluation;
    if (!personalized.respostas || personalized.respostas.length === 0) {
      showAlert('Sem respostas', 'O aluno ainda nao respondeu a avaliacao.');
      return;
    }
    setConfirmingEvaluation(true);
    const result = await confirmPersonalizedEvaluation({
      evaluationId: personalized.id,
      userId: personalized.userId,
    });
    setConfirmingEvaluation(false);
    if (result.error) {
      showAlert('Erro', result.error);
      return;
    }
    setEvaluation((prev) =>
      prev
        ? {
            ...prev,
            status: 'concluida',
            confirmadoEm: new Date(),
          }
        : prev
    );
    showAlert('Avaliacao confirmada', 'A avaliacao foi concluida.');
  };

  const handleSendEvaluationReminder = async () => {
    if (!evaluation || evaluation.type !== 'personalizada') return;
    const personalized = evaluation as PersonalizedEvaluation;
    const totalQuestions = personalized.perguntas?.length || 0;
    const answeredCount = getAnsweredCount(personalized);
    const pendingQuestions = Math.max(0, totalQuestions - answeredCount);

    try {
      setSendingReminder(true);
      const result = await sendEvaluationCompletionReminder({
        studentId: personalized.userId,
        evaluationId: personalized.id,
        evaluationType: personalized.type,
        evaluationName: `a avaliacao ${getEvaluationTypeLabel(personalized.type).toLowerCase()}`,
        pendingQuestions,
        senderName: user?.displayName,
      });

      if (result.error) {
        showAlert('Erro', result.error);
        return;
      }

      showAlert(
        'Aviso enviado',
        'O aluno recebeu um lembrete para concluir a avaliacao.'
      );
    } catch (error: any) {
      showAlert('Erro', error?.message || 'Nao foi possivel enviar o aviso agora.');
    } finally {
      setSendingReminder(false);
    }
  };

  const handleSendFeedback = async () => {
    if (!evaluation || evaluation.type !== 'personalizada') return;
    if (!user?.uid) return;
    const codigo = Number(user.codigoPersonal || 0);
    if (!codigo || Number.isNaN(codigo)) {
      showAlert('Erro', 'Codigo do personal nao encontrado.');
      return;
    }
    if (!feedbackRating) {
      showAlert('Feedback', 'Selecione uma nota para enviar.');
      return;
    }
    setSendingFeedback(true);
    const result = await submitWorkoutFeedback({
      userId: user.uid,
      codigoDoPersonal: codigo,
      yourName: user.displayName || 'Aluno',
      comentarioDoAluno: feedbackComment.trim(),
      estrela: feedbackRating,
      nomeDoTreino: `Avaliacao ${getEvaluationTypeLabel(evaluation.type)}`,
      imgUser: user.photoUrl || undefined,
    });
    setSendingFeedback(false);
    if (result.error) {
      showAlert('Erro', result.error);
      return;
    }
    try {
      const collectionName = 'avaliacaoPersonalizada';
      const evalRef = doc(db, 'users', evaluation.userId, collectionName, evaluation.id);
      await updateDoc(evalRef, {
        feedbackEnviado: true,
        updatedAt: serverTimestamp(),
      });
    } catch (_) {
      // Ignore feedback flag failures.
    }
    setEvaluation((prev) =>
      prev
        ? {
            ...prev,
            feedbackEnviado: true,
          }
        : prev
    );
    showAlert('Obrigado', 'Seu feedback foi enviado ao personal.');
  };

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  const formatShortDate = (date: Date): string => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  };

  const getQuestionTypeLabel = (tipo: string) => {
    switch (tipo) {
      case 'escala':
        return 'Numero';
      case 'sim_nao':
        return 'Sim/nao';
      case 'multipla_escolha':
        return 'Dropdown';
      default:
        return 'Texto';
    }
  };

  const clampValue = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const formatMetric = (value?: number, digits = 1) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '--';
    return value.toFixed(digits);
  };

  const formatStatValue = (value: number, digits = 1) =>
    Number.isInteger(value) ? String(value) : value.toFixed(digits);

  const getAnsweredCount = (eval_: PersonalizedEvaluation) =>
    eval_.respostas
      ? eval_.respostas.filter((resposta) => {
          if (resposta.resposta === undefined || resposta.resposta === null) return false;
          if (typeof resposta.resposta === 'string') {
            return resposta.resposta.trim().length > 0;
          }
          return true;
        }).length
      : 0;

  const isPersonalizedOverdue = (eval_: PersonalizedEvaluation) => {
    if (!eval_.prazoResposta) return false;
    if (eval_.status === 'concluida' || eval_.status === 'nao_realizada') return false;
    const answeredCount = getAnsweredCount(eval_);
    if (answeredCount > 0) return false;
    return eval_.prazoResposta.getTime() < Date.now();
  };

  const buildStatItem = (params: {
    label: string;
    value?: number | string | null;
    icon: keyof typeof Ionicons.glyphMap;
    suffix?: string;
    color?: string;
    allowZero?: boolean;
  }) => {
    const { label, value, icon, suffix, color, allowZero } = params;
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'number' && !allowZero && value <= 0) return null;
    const displayValue =
      typeof value === 'number' ? formatStatValue(value) : String(value);
    return {
      label,
      value: suffix ? `${displayValue} ${suffix}` : displayValue,
      icon,
      color,
    };
  };

  const renderStatsCard = (title: string, items: Array<ReturnType<typeof buildStatItem>>) => {
    const filtered = items.filter(Boolean) as Array<{
      label: string;
      value: string;
      icon: keyof typeof Ionicons.glyphMap;
      color?: string;
    }>;
    if (!filtered.length) return null;
    return (
      <Card style={[styles.section, outlinedCardStyle]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        <View style={styles.statsGrid}>
          {filtered.map((item) => (
            <View
              key={item.label}
              style={[styles.statCard, { backgroundColor: premiumSurface, borderColor: premiumBorder }]}
            >
              <View
                style={[
                  styles.statIconWrap,
                  { backgroundColor: (item.color || colors.primary) + '20' },
                ]}
              >
                <Ionicons name={item.icon} size={16} color={item.color || colors.primary} />
              </View>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                {item.label}
              </Text>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    );
  };

  const renderDetailList = (
    title: string,
    items: Array<{ label: string; value: string }>
  ) => {
    if (!items.length) return null;
    return (
      <Card style={[styles.section, outlinedCardStyle]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        {items.map((item) => (
          <View key={item.label} style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
              {item.label}
            </Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>
              {item.value}
            </Text>
          </View>
        ))}
      </Card>
    );
  };

  const getInsightsCacheKey = (eval_: PhysicalEvaluation) =>
    `evaluation-insights:${eval_.type}:${eval_.id}`;

  const getInsightsCacheVersion = (eval_: PhysicalEvaluation) => {
    const stamp = eval_.updatedAt || eval_.createdAt || eval_.date;
    return stamp ? String(new Date(stamp).getTime()) : '';
  };

  const normalizeCachedInsights = (raw: any): EvaluationAIInsights => {
    const toArray = (value: any) => (Array.isArray(value) ? value.filter(Boolean) : []);
    const graficos = Array.isArray(raw?.graficos) ? raw.graficos : [];
    return {
      resumo: raw?.resumo || '',
      destaques: toArray(raw?.destaques),
      alertas: toArray(raw?.alertas),
      proximosPassos: toArray(raw?.proximosPassos),
      graficos: graficos
        .map((item: any) => ({
          label: String(item?.label || ''),
          value: Math.max(0, Math.min(100, Number(item?.value) || 0)),
        }))
        .filter((item: { label: string }) => item.label),
    };
  };

  const truncateText = (value?: string, limit = 260) => {
    if (!value) return '';
    if (value.length <= limit) return value;
    return `${value.slice(0, limit).trim()}...`;
  };

  const resolvePostureImage = (eval_: PosturalEvaluation) => {
    const candidates = [
      { label: 'Anterior', url: eval_.fotosPostura?.anterior },
      { label: 'Posterior', url: eval_.fotosPostura?.posterior },
      { label: 'Lateral direita', url: eval_.fotosPostura?.lateralDireita },
      { label: 'Lateral esquerda', url: eval_.fotosPostura?.lateralEsquerda },
    ];
    return candidates.find((item) => !!item.url);
  };

  const buildEvaluationContext = (
    base: PhysicalEvaluation,
    analysis: AnalysisResult | null,
    postureLabel?: string | null
  ) => {
    const lines: string[] = [];

    if (base.type === 'online') {
      const eval_ = base as OnlineEvaluation;
      if (typeof eval_.peso === 'number') lines.push(`Peso: ${eval_.peso} kg`);
      if (typeof eval_.altura === 'number') lines.push(`Altura: ${eval_.altura} cm`);
      if (typeof eval_.imc === 'number') lines.push(`IMC: ${eval_.imc}`);
      const circ = eval_.circunferencias || {};
        const circEntries = [
          ['Pescoco', circ.pescoco],
          ['Ombro', circ.ombro],
          ['Torax', circ.torax],
          ['Cintura', circ.cintura],
          ['Abdomen', circ.abdominal],
          ['Quadril', circ.quadril],
          ['Braco D', circ.bracoDireito],
          ['Braco E', circ.bracoEsquerdo],
        ['Coxa D', circ.coxaDireita],
        ['Coxa E', circ.coxaEsquerda],
        ['Panturrilha D', circ.panturrilhaDireita],
        ['Panturrilha E', circ.panturrilhaEsquerda],
      ]
        .filter((item) => typeof item[1] === 'number' && Number(item[1]) > 0)
        .map((item) => `${item[0]}: ${item[1]} cm`);
      if (circEntries.length) {
        lines.push(`Circunferencias: ${circEntries.join(', ')}`);
      }
      if (eval_.observacoes) lines.push(`Observacoes: ${truncateText(eval_.observacoes)}`);
      if (eval_.resultado) lines.push(`Resultado: ${truncateText(eval_.resultado)}`);
    }

    if (base.type === 'fisica') {
      const eval_ = base as PhysicalTestEvaluation;
      const comp = eval_.composicaoCorporal;
      if (comp) {
        lines.push(`Peso: ${comp.peso} kg`);
        lines.push(`Altura: ${comp.altura} cm`);
        lines.push(`IMC: ${comp.imc}`);
        if (comp.percentualGordura) lines.push(`% Gordura: ${comp.percentualGordura}`);
        if (comp.massaMagra) lines.push(`Massa magra: ${comp.massaMagra} kg`);
        if (comp.massaGorda) lines.push(`Massa gorda: ${comp.massaGorda} kg`);
        if (comp.taxaMetabolicaBasal) lines.push(`TMB: ${comp.taxaMetabolicaBasal} kcal`);
      }
      if (eval_.resultados?.length) {
        const byId = new Map(eval_.testes.map((test) => [test.id, test]));
        eval_.resultados.slice(0, 6).forEach((resultado) => {
          const teste = byId.get(resultado.testId);
          const unit = teste?.unidade || '';
          const classification = resultado.classificacao ? ` (${resultado.classificacao})` : '';
          const formatted = formatTestResultValue(resultado.valor, unit);
          if (formatted) {
            lines.push(`${teste?.nome || 'Teste'}: ${formatted}${classification}`);
          }
        });
        if (eval_.resultados.length > 6) {
          lines.push(`Mais ${eval_.resultados.length - 6} resultados adicionais.`);
        }
      }
    }

    if (base.type === 'personalizada') {
      const eval_ = base as PersonalizedEvaluation;
      const respostasMap = new Map(
        (eval_.respostas || []).map((resposta) => [resposta.questionId, resposta.resposta])
      );
      const perguntas = eval_.perguntas || [];
      if (perguntas.length) {
        lines.push('Perguntas e respostas:');
        perguntas.slice(0, 8).forEach((pergunta) => {
          const resposta = respostasMap.get(pergunta.id);
          let value = 'Sem resposta';
          if (resposta !== undefined && resposta !== null) {
            if (pergunta.tipo === 'sim_nao') {
              value = resposta ? 'Sim' : 'Nao';
            } else {
              value = String(resposta);
            }
          }
          lines.push(`- ${pergunta.pergunta}: ${truncateText(value, 120)}`);
        });
        if (perguntas.length > 8) {
          lines.push(`Mais ${perguntas.length - 8} perguntas adicionais.`);
        }
      }
      if (eval_.resultado) lines.push(`Resultado: ${truncateText(eval_.resultado)}`);
      if (eval_.recomendacoes?.length) {
        lines.push(`Recomendacoes: ${eval_.recomendacoes.slice(0, 5).join('; ')}`);
      }
    }

    if (base.type === 'postural') {
      const eval_ = base as PosturalEvaluation;
      const fotosDisponiveis = [
        eval_.fotosPostura?.anterior ? 'Anterior' : null,
        eval_.fotosPostura?.posterior ? 'Posterior' : null,
        eval_.fotosPostura?.lateralDireita ? 'Lateral direita' : null,
        eval_.fotosPostura?.lateralEsquerda ? 'Lateral esquerda' : null,
      ].filter(Boolean);
      if (fotosDisponiveis.length) {
        lines.push(`Fotos: ${fotosDisponiveis.join(', ')}`);
      }
      if (analysis) {
        lines.push(`Analise de imagem (${postureLabel || 'foto'}):`);
        if (analysis.postura) lines.push(`Postura: ${analysis.postura}`);
        if (analysis.descricaoPostura) lines.push(`Descricao: ${truncateText(analysis.descricaoPostura)}`);
        if (analysis.metricas) lines.push(`Metricas: ${truncateText(analysis.metricas)}`);
        if (analysis.textoDetalhado) lines.push(`Detalhes: ${truncateText(analysis.textoDetalhado)}`);
      }
      if (eval_.analise?.observacoes) {
        lines.push(`Observacoes: ${truncateText(eval_.analise.observacoes)}`);
      }
      if (eval_.recomendacoes?.length) {
        lines.push(`Recomendacoes: ${eval_.recomendacoes.slice(0, 5).join('; ')}`);
      }
    }

    return lines.length ? lines.join('\n') : 'Sem dados detalhados para analise.';
  };

  const loadInsights = useCallback(async () => {
    if (!evaluation || insightsLoading) return;
    if (!hasPremiumAiAccess) {
      setInsights(null);
      setPostureAnalysis(null);
      setPostureImageLabel(null);
      setInsightsError('Insights de IA e avaliacao postural por IA estao disponiveis apenas no Premium.');
      return;
    }
    setInsightsLoading(true);
    setInsightsError(null);

    const docId = `${evaluation.type}-${evaluation.id}`;
    try {
      if (evaluation.type === 'personalizada') {
        const personalized = evaluation as PersonalizedEvaluation;
        const answeredCount = getAnsweredCount(personalized);
        if (!isPersonal || answeredCount === 0) {
          setInsightsLoading(false);
          return;
        }
      }
      const cacheKey = getInsightsCacheKey(evaluation);
      const cacheVersion = getInsightsCacheVersion(evaluation);
      try {
        const cachedRaw = await AsyncStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (!cacheVersion || cached?.version === cacheVersion) {
            if (cached?.insights) {
              setInsights(normalizeCachedInsights(cached.insights));
            }
            setPostureAnalysis(cached?.postureAnalysis || null);
            setPostureImageLabel(cached?.postureImageLabel || null);
            setInsightsLoading(false);
            return;
          }
        }
      } catch (_) {
        // Ignore cache read errors.
      }

      const ref = doc(db, 'evaluationInsights', docId);
      const snapshot = await getDoc(ref);
      if (snapshot.exists()) {
        const data = snapshot.data() as EvaluationAIInsights & {
          postureAnalysis?: AnalysisResult;
          postureImageLabel?: string;
        };
        const normalized = normalizeCachedInsights(data);
        setInsights(normalized);
        setPostureAnalysis(data.postureAnalysis || null);
        setPostureImageLabel(data.postureImageLabel || null);
        try {
          const cachePayload = {
            version: getInsightsCacheVersion(evaluation),
            insights: normalized,
            postureAnalysis: data.postureAnalysis || null,
            postureImageLabel: data.postureImageLabel || null,
          };
          await AsyncStorage.setItem(cacheKey, JSON.stringify(cachePayload));
        } catch (_) {
          // Ignore cache write errors.
        }
        setInsightsLoading(false);
        return;
      }

      let analysis: AnalysisResult | null = null;
      let imageLabel: string | null = null;
      if (evaluation.type === 'postural') {
        const imageCandidate = resolvePostureImage(evaluation as PosturalEvaluation);
        if (imageCandidate?.url) {
          imageLabel = imageCandidate.label;
          const result = await analyzePostureImage(imageCandidate.url);
          if (result.data) {
            analysis = result.data;
          }
        }
      }

      if (!process.env.EXPO_PUBLIC_OPENROUTER_API_KEY) {
        setPostureAnalysis(analysis);
        setPostureImageLabel(imageLabel);
        setInsightsError('OpenRouter não configurado.');
        return;
      }

      const context = buildEvaluationContext(evaluation, analysis, imageLabel);
      const aiResult = await generateEvaluationInsights({
        type: evaluation.type,
        context,
      });
      setInsights(aiResult);
      setPostureAnalysis(analysis);
      setPostureImageLabel(imageLabel);

      try {
        const cachePayload = {
          version: getInsightsCacheVersion(evaluation),
          insights: aiResult,
          postureAnalysis: analysis,
          postureImageLabel: imageLabel,
        };
        await AsyncStorage.setItem(cacheKey, JSON.stringify(cachePayload));
      } catch (_) {
        // Ignore cache write errors.
      }

      await setDoc(
        ref,
        {
          ...aiResult,
          evaluationId: evaluation.id,
          evaluationType: evaluation.type,
          userId: evaluation.userId,
          postureAnalysis: analysis,
          postureImageLabel: imageLabel,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err: any) {
      setInsightsError(err?.message || 'Falha ao gerar insights.');
    } finally {
      setInsightsLoading(false);
    }
  }, [evaluation, hasPremiumAiAccess, insightsLoading, isPersonal]);

  useEffect(() => {
    setInsights(null);
    setInsightsError(null);
    setPostureAnalysis(null);
    setPostureImageLabel(null);
  }, [evaluation?.id, evaluation?.type]);

  useEffect(() => {
    if (!evaluation) return;
    if (!hasPremiumAiAccess) return;
    if (insights || insightsLoading) return;
    loadInsights();
  }, [evaluation, hasPremiumAiAccess, insights, insightsLoading, loadInsights]);

  const renderMetricGauge = (params: {
    label: string;
    value?: number;
    unit?: string;
    min: number;
    max: number;
    color: string;
    note?: string;
  }) => {
    if (typeof params.value !== 'number' || Number.isNaN(params.value)) return null;
    const clamped = clampValue(params.value, params.min, params.max);
    const progress =
      params.max > params.min ? (clamped - params.min) / (params.max - params.min) : 0;
    const markerLeft = Math.min(Math.max(progress * 100, 0), 98);
    return (
      <View style={styles.gaugeRow}>
        <View style={styles.gaugeHeader}>
          <Text style={[styles.gaugeLabel, { color: colors.textSecondary }]}>
            {params.label}
          </Text>
          <Text style={[styles.gaugeValue, { color: colors.text }]}>
            {formatMetric(params.value)}
            {params.unit ? ` ${params.unit}` : ''}
          </Text>
        </View>
        {params.note && (
          <Text style={[styles.gaugeNote, { color: colors.textMuted }]}>
            {params.note}
          </Text>
        )}
        <View style={[styles.gaugeTrack, { backgroundColor: premiumSurface }]}>
          <View
            style={[
              styles.gaugeFill,
              {
                width: `${progress * 100}%`,
                backgroundColor: params.color,
              },
            ]}
          />
          <View
            style={[
              styles.gaugeMarker,
              {
                left: `${markerLeft}%`,
                borderColor: params.color,
                backgroundColor: premiumCard,
              },
            ]}
          />
        </View>
        <View style={styles.gaugeRange}>
          <Text style={[styles.gaugeRangeText, { color: colors.textMuted }]}>
            {params.min}
            {params.unit ? params.unit : ''}
          </Text>
          <Text style={[styles.gaugeRangeText, { color: colors.textMuted }]}>
            {params.max}
            {params.unit ? params.unit : ''}
          </Text>
        </View>
      </View>
    );
  };

  const renderOnlineEvaluation = (eval_: OnlineEvaluation) => {
    const stats = [
      buildStatItem({
        label: 'Peso',
        value: eval_.peso,
        icon: 'barbell-outline',
        suffix: 'kg',
        color: colors.primary,
      }),
      buildStatItem({
        label: 'Altura',
        value: eval_.altura,
        icon: 'resize-outline',
        suffix: 'cm',
        color: colors.success,
      }),
      buildStatItem({
        label: 'IMC',
        value: typeof eval_.imc === 'number' && eval_.imc > 0 ? formatMetric(eval_.imc) : undefined,
        icon: 'analytics-outline',
        color: colors.warning,
      }),
        buildStatItem({
          label: 'Cintura',
          value: eval_.circunferencias?.cintura,
          icon: 'body-outline',
          suffix: 'cm',
        }),
        buildStatItem({
          label: 'Abdomen',
          value: eval_.circunferencias?.abdominal,
          icon: 'body-outline',
          suffix: 'cm',
        }),
        buildStatItem({
          label: 'Quadril',
          value: eval_.circunferencias?.quadril,
          icon: 'body-outline',
        suffix: 'cm',
      }),
      buildStatItem({
        label: 'Torax',
        value: eval_.circunferencias?.torax,
        icon: 'body-outline',
        suffix: 'cm',
      }),
    ];

    const circunferenciasList = [
      { label: 'Pescoco', value: eval_.circunferencias?.pescoco },
      { label: 'Ombro', value: eval_.circunferencias?.ombro },
      { label: 'Abdomen', value: eval_.circunferencias?.abdominal },
      { label: 'Braco direito', value: eval_.circunferencias?.bracoDireito },
      { label: 'Braco esquerdo', value: eval_.circunferencias?.bracoEsquerdo },
      { label: 'Coxa direita', value: eval_.circunferencias?.coxaDireita },
      { label: 'Coxa esquerda', value: eval_.circunferencias?.coxaEsquerda },
      { label: 'Panturrilha direita', value: eval_.circunferencias?.panturrilhaDireita },
      { label: 'Panturrilha esquerda', value: eval_.circunferencias?.panturrilhaEsquerda },
    ]
      .filter((item) => typeof item.value === 'number' && Number(item.value) > 0)
      .map((item) => ({
        label: item.label,
        value: `${formatMetric(item.value)} cm`,
      }));

    return (
      <>
        {renderStatsCard('Dados salvos', stats)}

        {renderDetailList('Circunferencias', circunferenciasList)}

      {(eval_.peso || eval_.altura) && (
        <Card style={[styles.section, outlinedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Medidas Corporais
          </Text>
          <MeasurementForm
            peso={eval_.peso}
            altura={eval_.altura}
            circunferencias={eval_.circunferencias}
            readOnly
          />
        </Card>
      )}

      {isPersonal && (() => {
        const imcValue =
          typeof eval_.imc === 'number'
            ? eval_.imc
            : eval_.peso && eval_.altura
              ? calculateIMC(eval_.peso, eval_.altura)
              : undefined;
        const imcInfo = imcValue ? getIMCClassification(imcValue) : null;
          const circumferenceItems = [
            { key: 'pescoco', label: 'Pescoco', value: eval_.circunferencias?.pescoco },
            { key: 'ombro', label: 'Ombro', value: eval_.circunferencias?.ombro },
            { key: 'torax', label: 'Torax', value: eval_.circunferencias?.torax },
            { key: 'cintura', label: 'Cintura', value: eval_.circunferencias?.cintura },
            { key: 'abdominal', label: 'Abdomen', value: eval_.circunferencias?.abdominal },
            { key: 'quadril', label: 'Quadril', value: eval_.circunferencias?.quadril },
            { key: 'bracoDireito', label: 'Braco D', value: eval_.circunferencias?.bracoDireito },
          { key: 'bracoEsquerdo', label: 'Braco E', value: eval_.circunferencias?.bracoEsquerdo },
          { key: 'antebracoDireito', label: 'Antebraco D', value: eval_.circunferencias?.antebracoDireito },
          { key: 'antebracoEsquerdo', label: 'Antebraco E', value: eval_.circunferencias?.antebracoEsquerdo },
          { key: 'coxaDireita', label: 'Coxa D', value: eval_.circunferencias?.coxaDireita },
          { key: 'coxaEsquerda', label: 'Coxa E', value: eval_.circunferencias?.coxaEsquerda },
          { key: 'panturrilhaDireita', label: 'Panturrilha D', value: eval_.circunferencias?.panturrilhaDireita },
          { key: 'panturrilhaEsquerda', label: 'Panturrilha E', value: eval_.circunferencias?.panturrilhaEsquerda },
        ].filter((item) => typeof item.value === 'number' && Number(item.value) > 0);
        const maxCircumference = circumferenceItems.reduce(
          (max, item) => Math.max(max, Number(item.value)),
          0
        );
        const cintura = eval_.circunferencias?.cintura;
        const quadril = eval_.circunferencias?.quadril;
        const altura = eval_.altura;
        const ratioCq = cintura && quadril ? Number((cintura / quadril).toFixed(2)) : undefined;
        const ratioCa = cintura && altura ? Number((cintura / altura).toFixed(2)) : undefined;

        const getRatioStatus = (type: 'cq' | 'ca', value: number) => {
          if (type === 'cq') {
            if (value < 0.85) return { label: 'Baixo risco', color: colors.success };
            if (value < 0.95) return { label: 'Risco moderado', color: colors.warning };
            return { label: 'Risco alto', color: colors.error };
          }
          if (value < 0.5) return { label: 'Baixo risco', color: colors.success };
          if (value < 0.6) return { label: 'Risco moderado', color: colors.warning };
          return { label: 'Risco alto', color: colors.error };
        };

        const asymmetryItems = [
          {
            key: 'braco',
            label: 'Braco D/E',
            left: eval_.circunferencias?.bracoEsquerdo,
            right: eval_.circunferencias?.bracoDireito,
          },
          {
            key: 'antebraco',
            label: 'Antebraco D/E',
            left: eval_.circunferencias?.antebracoEsquerdo,
            right: eval_.circunferencias?.antebracoDireito,
          },
          {
            key: 'coxa',
            label: 'Coxa D/E',
            left: eval_.circunferencias?.coxaEsquerda,
            right: eval_.circunferencias?.coxaDireita,
          },
          {
            key: 'panturrilha',
            label: 'Panturrilha D/E',
            left: eval_.circunferencias?.panturrilhaEsquerda,
            right: eval_.circunferencias?.panturrilhaDireita,
          },
        ]
          .filter(
            (item) =>
              typeof item.left === 'number' &&
              typeof item.right === 'number' &&
              Number(item.left) > 0 &&
              Number(item.right) > 0
          )
          .map((item) => ({
            ...item,
            diff: Math.abs(Number(item.left) - Number(item.right)),
          }))
          .filter((item) => item.diff > 0);
        const maxAsymmetry = asymmetryItems.reduce(
          (max, item) => Math.max(max, item.diff),
          0
        );

        if (!eval_.peso && !eval_.altura && !imcValue && circumferenceItems.length === 0) {
          return null;
        }

        return (
          <>
            <Card style={[styles.chartCard, outlinedCardStyle]}>
              <Text style={[styles.chartTitle, { color: colors.text }]}>
                Painel de indicadores
              </Text>
              <Text style={[styles.chartSubtitle, { color: colors.textSecondary }]}>
                Visualizacao profissional dos indices principais.
              </Text>
              <View style={styles.gaugeList}>
                {renderMetricGauge({
                  label: 'Peso',
                  value: eval_.peso,
                  unit: 'kg',
                  min: 40,
                  max: 140,
                  color: colors.primary,
                })}
                {renderMetricGauge({
                  label: 'Altura',
                  value: eval_.altura,
                  unit: 'cm',
                  min: 140,
                  max: 210,
                  color: colors.success,
                })}
                {renderMetricGauge({
                  label: 'IMC',
                  value: imcValue,
                  unit: '',
                  min: 16,
                  max: 40,
                  color: imcInfo?.color || colors.warning,
                  note: imcInfo?.classification,
                })}
              </View>
            </Card>

            {circumferenceItems.length > 0 && (
              <Card style={[styles.chartCard, outlinedCardStyle]}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>
                  Circunferencias
                </Text>
                <Text style={[styles.chartSubtitle, { color: colors.textSecondary }]}>
                  Comparativo entre medidas registradas.
                </Text>
                <View style={styles.barList}>
                  {circumferenceItems.map((item) => {
                    const value = Number(item.value);
                    const width =
                      maxCircumference > 0 ? Math.round((value / maxCircumference) * 100) : 0;
                    return (
                      <View key={item.key} style={styles.barRow}>
                        <View style={styles.barHeader}>
                          <Text style={[styles.barLabel, { color: colors.textSecondary }]}>
                            {item.label}
                          </Text>
                          <Text style={[styles.barValue, { color: colors.text }]}>
                            {formatMetric(value, 1)} cm
                          </Text>
                        </View>
                        <View style={[styles.barTrack, { backgroundColor: premiumSurface }]}>
                          <View
                            style={[
                              styles.barFill,
                              { width: `${width}%`, backgroundColor: colors.tertiary },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </Card>
            )}

            {(ratioCq || ratioCa) && (
              <Card style={[styles.chartCard, outlinedCardStyle]}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>
                  Analise de proporcoes
                </Text>
                <Text style={[styles.chartSubtitle, { color: colors.textSecondary }]}>
                  Indicadores de distribuicao corporal (referencia geral).
                </Text>
                <View style={styles.gaugeList}>
                  {ratioCq
                    ? (() => {
                        const status = getRatioStatus('cq', ratioCq);
                        return renderMetricGauge({
                          label: 'Relacao C/Q',
                          value: ratioCq,
                          min: 0.7,
                          max: 1.2,
                          color: status.color,
                          note: status.label,
                        });
                      })()
                    : null}
                  {ratioCa
                    ? (() => {
                        const status = getRatioStatus('ca', ratioCa);
                        return renderMetricGauge({
                          label: 'Relacao C/A',
                          value: ratioCa,
                          min: 0.35,
                          max: 0.75,
                          color: status.color,
                          note: status.label,
                        });
                      })()
                    : null}
                </View>
              </Card>
            )}

            {asymmetryItems.length > 0 && (
              <Card style={[styles.chartCard, outlinedCardStyle]}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>
                  Assimetria muscular
                </Text>
                <Text style={[styles.chartSubtitle, { color: colors.textSecondary }]}>
                  Diferenca entre medidas direita e esquerda.
                </Text>
                <View style={styles.barList}>
                  {asymmetryItems.map((item) => {
                    const width =
                      maxAsymmetry > 0 ? Math.round((item.diff / maxAsymmetry) * 100) : 0;
                    return (
                      <View key={item.key} style={styles.barRow}>
                        <View style={styles.barHeader}>
                          <Text style={[styles.barLabel, { color: colors.textSecondary }]}>
                            {item.label}
                          </Text>
                          <Text style={[styles.barValue, { color: colors.text }]}>
                            Dif: {formatMetric(item.diff, 1)} cm
                          </Text>
                        </View>
                        <View style={[styles.barTrack, { backgroundColor: premiumSurface }]}>
                          <View
                            style={[
                              styles.barFill,
                              { width: `${width}%`, backgroundColor: colors.warning },
                            ]}
                          />
                        </View>
                        <Text style={[styles.asymmetryNote, { color: colors.textMuted }]}>
                          D {formatMetric(item.right, 1)} cm | E {formatMetric(item.left, 1)} cm
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            )}
          </>
        );
      })()}

      {!isPersonal && eval_.imc && (
        <Card style={[styles.section, outlinedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Indice de Massa Corporal
          </Text>
          <View style={styles.imcDisplay}>
            <Text style={[styles.imcValue, { color: colors.text }]}>{eval_.imc}</Text>
            <View 
              style={[
                styles.imcBadge, 
                { backgroundColor: getIMCClassification(eval_.imc).color + '20' }
              ]}
            >
              <Text 
                style={[
                  styles.imcClassification, 
                  { color: getIMCClassification(eval_.imc).color }
                ]}
              >
                {getIMCClassification(eval_.imc).classification}
              </Text>
            </View>
          </View>
        </Card>
      )}

      {eval_.fotos && Object.keys(eval_.fotos).length > 0 && (
        <Card style={[styles.section, outlinedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Fotos da Avaliacao
          </Text>
          <View style={styles.photosGrid}>
            {eval_.fotos.frente && (
              <View style={styles.photoContainer}>
                <Image
                  source={{ uri: eval_.fotos.frente }}
                  style={[styles.photo, { borderColor: premiumBorder, backgroundColor: premiumSurface }]}
                />
                <Text style={[styles.photoLabel, { color: colors.textSecondary }]}>Frente</Text>
              </View>
            )}
            {eval_.fotos.costas && (
              <View style={styles.photoContainer}>
                <Image
                  source={{ uri: eval_.fotos.costas }}
                  style={[styles.photo, { borderColor: premiumBorder, backgroundColor: premiumSurface }]}
                />
                <Text style={[styles.photoLabel, { color: colors.textSecondary }]}>Costas</Text>
              </View>
            )}
            {eval_.fotos.ladoDireito && (
              <View style={styles.photoContainer}>
                <Image
                  source={{ uri: eval_.fotos.ladoDireito }}
                  style={[styles.photo, { borderColor: premiumBorder, backgroundColor: premiumSurface }]}
                />
                <Text style={[styles.photoLabel, { color: colors.textSecondary }]}>Lado Dir.</Text>
              </View>
            )}
            {eval_.fotos.ladoEsquerdo && (
              <View style={styles.photoContainer}>
                <Image
                  source={{ uri: eval_.fotos.ladoEsquerdo }}
                  style={[styles.photo, { borderColor: premiumBorder, backgroundColor: premiumSurface }]}
                />
                <Text style={[styles.photoLabel, { color: colors.textSecondary }]}>Lado Esq.</Text>
              </View>
            )}
          </View>
        </Card>
      )}

      {eval_.resultado && (
        <Card style={[styles.section, outlinedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Resultado
          </Text>
          <Text style={[styles.resultText, { color: colors.textSecondary }]}>
            {eval_.resultado}
          </Text>
        </Card>
      )}

      {eval_.observacoes && (
        <Card style={[styles.section, outlinedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Observacoes
          </Text>
          <Text style={[styles.resultText, { color: colors.textSecondary }]}>
            {eval_.observacoes}
          </Text>
        </Card>
      )}
      </>
    );
  };

  const renderPersonalizedEvaluation = (eval_: PersonalizedEvaluation) => {
    const perguntas = eval_.perguntas || [];
    const total = perguntas.length;
    const answered = getAnsweredCount(eval_);
    const hasAnswers = answered > 0;
    const isOverdue = isPersonalizedOverdue(eval_);
    const stats = [
      buildStatItem({
        label: 'Perguntas',
        value: total,
        icon: 'help-circle-outline',
        allowZero: true,
      }),
      buildStatItem({
        label: 'Respondidas',
        value: answered,
        icon: 'checkmark-circle-outline',
        allowZero: true,
        color: colors.success,
      }),
      buildStatItem({
        label: 'Pendentes',
        value: Math.max(0, total - answered),
        icon: 'time-outline',
        allowZero: true,
        color: colors.warning,
      }),
      buildStatItem({
        label: 'Recomendacoes',
        value: eval_.recomendacoes?.length || 0,
        icon: 'sparkles-outline',
        allowZero: true,
        color: colors.primary,
      }),
    ];

    return (
      <>
        {renderStatsCard('Resumo do questionario', stats)}

      {eval_.prazoResposta && (
        <Card style={[styles.section, outlinedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Prazo para responder
          </Text>
          <View style={styles.deadlineRow}>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <Text style={[styles.deadlineText, { color: colors.textSecondary }]}>
              {formatShortDate(eval_.prazoResposta)}
            </Text>
            {isOverdue || eval_.status === 'nao_realizada' ? (
              <View style={[styles.deadlineBadge, { backgroundColor: colors.warning + '20' }]}>
                <Text style={[styles.deadlineBadgeText, { color: colors.warning }]}>
                  Prazo expirado
                </Text>
              </View>
            ) : null}
          </View>
        </Card>
      )}

      <Card style={[styles.section, outlinedCardStyle]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {isPersonal ? 'Respostas do aluno' : 'Responder avaliacao'}
        </Text>
        {!perguntas.length && (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Nenhuma pergunta cadastrada.
          </Text>
        )}
        {perguntas.map((pergunta, index) => {
          const resposta = eval_.respostas?.find((item) => item.questionId === pergunta.id);
          const rawAnswer = resposta?.resposta;
          const hasAnswer =
            rawAnswer !== undefined &&
            rawAnswer !== null &&
            (typeof rawAnswer !== 'string' || rawAnswer.trim().length > 0);
          const isExpired = isOverdue || eval_.status === 'nao_realizada';
          const statusLabel = hasAnswer
            ? 'Respondida'
            : isExpired
            ? 'Prazo expirado'
            : 'Aguardando resposta';
          const statusColor = hasAnswer
            ? colors.success
            : isExpired
            ? colors.warning
            : colors.primary;
          const respostaValue =
            resposta?.resposta !== undefined && resposta?.resposta !== null
              ? pergunta.tipo === 'sim_nao'
                ? resposta.resposta
                  ? 'Sim'
                  : 'Nao'
                : String(resposta.resposta)
              : '';
          const showInputs =
            !isPersonal && !hasAnswers && !isOverdue && eval_.status !== 'nao_realizada';
          return (
            <View key={pergunta.id} style={[styles.questionItem, { backgroundColor: premiumSurface, borderColor: premiumBorder }]}>
              <Text style={[styles.questionText, { color: colors.text }]}>
                {index + 1}. {pergunta.pergunta}
              </Text>
              <View style={styles.questionMeta}>
                <Text style={[styles.questionMetaText, { color: colors.textSecondary }]}>
                  Tipo: {getQuestionTypeLabel(pergunta.tipo)}
                </Text>
                {pergunta.tipo === 'multipla_escolha' && pergunta.opcoes?.length ? (
                  <Text style={[styles.questionMetaText, { color: colors.textSecondary }]}>
                    Opcoes: {pergunta.opcoes.join(', ')}
                  </Text>
                ) : null}
              </View>
              <View style={styles.questionStatusRow}>
                <View style={[styles.questionStatusBadge, { backgroundColor: statusColor + '20' }]}>
                  <Text style={[styles.questionStatusText, { color: statusColor }]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>

              {!showInputs ? (
                <Text style={[styles.answerText, { color: colors.textSecondary }]}>
                  R:{' '}
                  {respostaValue ||
                    (isOverdue || eval_.status === 'nao_realizada'
                      ? 'Prazo expirado'
                      : 'Aguardando resposta')}
                </Text>
              ) : (
                <>
                  {pergunta.tipo === 'sim_nao' && (
                    <View style={styles.booleanRow}>
                      {['Sim', 'Nao'].map((label) => {
                        const selected = answerDrafts[pergunta.id] === (label === 'Sim');
                        return (
                          <TouchableOpacity
                            key={label}
                            style={[
                              styles.booleanButton,
                              {
                                backgroundColor: selected ? colors.primary : premiumCard,
                                borderColor: selected ? colors.primary : colors.border,
                              },
                            ]}
                            onPress={() =>
                              setAnswerDrafts((prev) => ({
                                ...prev,
                                [pergunta.id]: label === 'Sim',
                              }))
                            }
                          >
                            <Text
                              style={[
                                styles.booleanText,
                                { color: selected ? colors.info : colors.textSecondary },
                              ]}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {pergunta.tipo === 'multipla_escolha' && (
                    <>
                      {pergunta.opcoes?.length ? (
                        <SearchableSelect
                          label="Selecione uma opcao"
                          placeholder="Escolha"
                          options={(pergunta.opcoes || []).map((opcao) => ({
                            id: opcao,
                            label: opcao,
                          }))}
                          value={answerDrafts[pergunta.id] as string}
                          onChange={(value) =>
                            setAnswerDrafts((prev) => ({
                              ...prev,
                              [pergunta.id]: value as string,
                            }))
                          }
                        />
                      ) : (
                        <Input
                          label="Resposta"
                          placeholder="Digite sua resposta"
                          value={answerDrafts[pergunta.id]?.toString() || ''}
                          onChangeText={(value) =>
                            setAnswerDrafts((prev) => ({ ...prev, [pergunta.id]: value }))
                          }
                        />
                      )}
                    </>
                  )}

                  {pergunta.tipo === 'escala' && (
                    <Input
                      label="Resposta numerica"
                      placeholder="Ex: 7"
                      keyboardType="numeric"
                      value={
                        answerDrafts[pergunta.id] !== undefined
                          ? String(answerDrafts[pergunta.id])
                          : ''
                      }
                      onChangeText={(value) =>
                        setAnswerDrafts((prev) => ({ ...prev, [pergunta.id]: value }))
                      }
                    />
                  )}

                  {pergunta.tipo === 'texto' && (
                    <Input
                      label="Resposta"
                      placeholder="Digite sua resposta"
                      value={answerDrafts[pergunta.id]?.toString() || ''}
                      onChangeText={(value) =>
                        setAnswerDrafts((prev) => ({ ...prev, [pergunta.id]: value }))
                      }
                      multiline
                      numberOfLines={3}
                    />
                  )}
                </>
              )}
            </View>
          );
        })}

        {!isPersonal && !hasAnswers && !isOverdue && eval_.status !== 'nao_realizada' && (
          <Button
            title="Enviar respostas"
            onPress={handleSubmitAnswers}
            loading={submittingAnswers}
            style={{ marginTop: spacing.sm }}
          />
        )}

        {!isPersonal && isOverdue && !hasAnswers && (
          <View style={[styles.deadlineAlert, { backgroundColor: colors.warning + '15' }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
            <Text style={[styles.deadlineAlertText, { color: colors.textSecondary }]}>
              Prazo expirado. Fale com seu personal para reagendar.
            </Text>
          </View>
        )}
      </Card>

      {!isPersonal && hasAnswers && eval_.status !== 'concluida' && (
        <Card style={[styles.section, outlinedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Avalie a avaliacao
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Deixe uma nota e comentario para o seu personal.
          </Text>
          <View style={styles.starsRow}>
            {Array.from({ length: 5 }).map((_, idx) => {
              const value = idx + 1;
              return (
                <TouchableOpacity key={value} onPress={() => setFeedbackRating(value)}>
                  <Ionicons
                    name={value <= feedbackRating ? 'star' : 'star-outline'}
                    size={20}
                    color={colors.warning}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
          <Input
            label="Comentario"
            placeholder="Conte como foi sua experiencia"
            value={feedbackComment}
            onChangeText={setFeedbackComment}
            multiline
            numberOfLines={3}
          />
          <Button
            title={eval_.feedbackEnviado ? 'Feedback enviado' : 'Enviar feedback'}
            onPress={handleSendFeedback}
            disabled={eval_.feedbackEnviado}
            loading={sendingFeedback}
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      )}

      {!isPersonal && hasAnswers && eval_.status !== 'concluida' && (
        <View style={[styles.pendingNote, { backgroundColor: colors.primary + '10' }]}>
          <Ionicons name="time-outline" size={18} color={colors.primary} />
          <Text style={[styles.pendingNoteText, { color: colors.textSecondary }]}>
            Aguardando confirmacao do personal.
          </Text>
        </View>
      )}

      {isPersonal && hasAnswers && eval_.status !== 'concluida' && !isOverdue && (
        <Button
          title="Confirmar avaliacao"
          onPress={handleConfirmEvaluation}
          loading={confirmingEvaluation}
          style={{ marginBottom: spacing.lg }}
        />
      )}

      {eval_.resultado && (
        <Card style={[styles.section, outlinedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Resultado da Avaliacao
          </Text>
          <Text style={[styles.resultText, { color: colors.textSecondary }]}>
            {eval_.resultado}
          </Text>
        </Card>
      )}

      {eval_.recomendacoes && eval_.recomendacoes.length > 0 && (
        <Card style={[styles.section, outlinedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Recomendacoes
          </Text>
          {eval_.recomendacoes.map((rec, index) => (
            <View key={index} style={[styles.recommendationItem, { backgroundColor: premiumSurface }]}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={[styles.recommendationText, { color: colors.textSecondary }]}>
                {rec}
              </Text>
            </View>
          ))}
        </Card>
      )}
      </>
    );
  };

  const renderPosturalEvaluation = (eval_: PosturalEvaluation) => {
    const photoCount = Object.values(eval_.fotosPostura || {}).filter(Boolean).length;
    const stats = [
      buildStatItem({
        label: 'Fotos',
        value: photoCount,
        icon: 'image-outline',
        allowZero: true,
      }),
      buildStatItem({
        label: 'Recomendacoes',
        value: eval_.recomendacoes?.length || 0,
        icon: 'clipboard-outline',
        allowZero: true,
        color: colors.primary,
      }),
      buildStatItem({
        label: 'Observacoes',
        value: eval_.analise?.observacoes ? 'Sim' : 'Nao',
        icon: 'document-text-outline',
        allowZero: true,
      }),
    ];

    return (
      <>
        {renderStatsCard('Resumo postural', stats)}

      {eval_.fotosPostura && Object.keys(eval_.fotosPostura).length > 0 && (
        <Card style={[styles.section, outlinedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Fotos Posturais
          </Text>
          <View style={styles.photosGrid}>
            {eval_.fotosPostura.anterior && (
              <View style={styles.photoContainer}>
                <Image
                  source={{ uri: eval_.fotosPostura.anterior }}
                  style={[styles.photo, { borderColor: premiumBorder, backgroundColor: premiumSurface }]}
                />
                <Text style={[styles.photoLabel, { color: colors.textSecondary }]}>Anterior</Text>
              </View>
            )}
            {eval_.fotosPostura.posterior && (
              <View style={styles.photoContainer}>
                <Image
                  source={{ uri: eval_.fotosPostura.posterior }}
                  style={[styles.photo, { borderColor: premiumBorder, backgroundColor: premiumSurface }]}
                />
                <Text style={[styles.photoLabel, { color: colors.textSecondary }]}>Posterior</Text>
              </View>
            )}
            {eval_.fotosPostura.lateralDireita && (
              <View style={styles.photoContainer}>
                <Image
                  source={{ uri: eval_.fotosPostura.lateralDireita }}
                  style={[styles.photo, { borderColor: premiumBorder, backgroundColor: premiumSurface }]}
                />
                <Text style={[styles.photoLabel, { color: colors.textSecondary }]}>Lat. Dir.</Text>
              </View>
            )}
            {eval_.fotosPostura.lateralEsquerda && (
              <View style={styles.photoContainer}>
                <Image
                  source={{ uri: eval_.fotosPostura.lateralEsquerda }}
                  style={[styles.photo, { borderColor: premiumBorder, backgroundColor: premiumSurface }]}
                />
                <Text style={[styles.photoLabel, { color: colors.textSecondary }]}>Lat. Esq.</Text>
              </View>
            )}
          </View>
        </Card>
      )}

      {eval_.analise && (
        <Card style={[styles.section, outlinedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Analise Postural
          </Text>
          {eval_.analise.cabeca && (
            <View style={[styles.analysisItem, { borderBottomColor: premiumBorder }]}>
              <Text style={[styles.analysisLabel, { color: colors.text }]}>Cabeca:</Text>
              <Text style={[styles.analysisValue, { color: colors.textSecondary }]}>
                {eval_.analise.cabeca}
              </Text>
            </View>
          )}
          {eval_.analise.ombros && (
            <View style={[styles.analysisItem, { borderBottomColor: premiumBorder }]}>
              <Text style={[styles.analysisLabel, { color: colors.text }]}>Ombros:</Text>
              <Text style={[styles.analysisValue, { color: colors.textSecondary }]}>
                {eval_.analise.ombros}
              </Text>
            </View>
          )}
          {eval_.analise.coluna && (
            <View style={[styles.analysisItem, { borderBottomColor: premiumBorder }]}>
              <Text style={[styles.analysisLabel, { color: colors.text }]}>Coluna:</Text>
              <Text style={[styles.analysisValue, { color: colors.textSecondary }]}>
                {eval_.analise.coluna}
              </Text>
            </View>
          )}
          {eval_.analise.quadril && (
            <View style={[styles.analysisItem, { borderBottomColor: premiumBorder }]}>
              <Text style={[styles.analysisLabel, { color: colors.text }]}>Quadril:</Text>
              <Text style={[styles.analysisValue, { color: colors.textSecondary }]}>
                {eval_.analise.quadril}
              </Text>
            </View>
          )}
          {eval_.analise.joelhos && (
            <View style={[styles.analysisItem, { borderBottomColor: premiumBorder }]}>
              <Text style={[styles.analysisLabel, { color: colors.text }]}>Joelhos:</Text>
              <Text style={[styles.analysisValue, { color: colors.textSecondary }]}>
                {eval_.analise.joelhos}
              </Text>
            </View>
          )}
          {eval_.analise.pes && (
            <View style={[styles.analysisItem, { borderBottomColor: premiumBorder }]}>
              <Text style={[styles.analysisLabel, { color: colors.text }]}>Pes:</Text>
              <Text style={[styles.analysisValue, { color: colors.textSecondary }]}>
                {eval_.analise.pes}
              </Text>
            </View>
          )}
          {eval_.analise.observacoes && (
            <View style={[styles.analysisItem, { borderBottomColor: premiumBorder }]}>
              <Text style={[styles.analysisLabel, { color: colors.text }]}>Observacoes:</Text>
              <Text style={[styles.analysisValue, { color: colors.textSecondary }]}>
                {eval_.analise.observacoes}
              </Text>
            </View>
          )}
        </Card>
      )}

      {eval_.recomendacoes && eval_.recomendacoes.length > 0 && (
        <Card style={[styles.section, outlinedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Recomendacoes
          </Text>
          {eval_.recomendacoes.map((rec, index) => (
            <View key={index} style={[styles.recommendationItem, { backgroundColor: premiumSurface }]}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={[styles.recommendationText, { color: colors.textSecondary }]}>
                {rec}
              </Text>
            </View>
          ))}
        </Card>
      )}
      </>
    );
  };

  const renderPhysicalTestEvaluation = (eval_: PhysicalTestEvaluation) => {
    const comp = eval_.composicaoCorporal;
    const skinfoldItems = (() => {
      const dobras: SkinFolds | undefined = comp?.dobrasCutaneas;
      const protocolo = comp?.protocoloDobras || (dobras ? 'pollock_1984_7' : undefined);
      if (!dobras && !protocolo) return [];
      const items: Array<{ label: string; value: string }> = [];
      if (protocolo) {
        items.push({ label: 'Protocolo', value: getSkinfoldProtocolLabel(protocolo) });
      }

      const entries: Array<[string, number | undefined]> = [
        ['Tricipital', dobras?.triceps],
        ['Bicipital', dobras?.biceps],
        ['Subescapular', dobras?.subescapular],
        ['Suprailiaca', dobras?.suprailiacas],
        ['Abdominal', dobras?.abdominal],
        ['Peitoral', dobras?.peitoral],
        ['Coxa medial', dobras?.coxaMedial],
        ['Axilar media', dobras?.axilarMedia],
        ['Panturrilha medial', dobras?.panturrilhaMedial],
      ];

      entries
        .filter(([, value]) => typeof value === 'number' && value > 0)
        .forEach(([label, value]) => {
          items.push({ label, value: `${value} mm` });
        });

      if (protocolo && dobras) {
        const protocolDobras = getSkinfoldProtocolDobras(protocolo, eval_.sexo);
        const total = protocolDobras.reduce(
          (acc, key) => acc + (typeof dobras[key] === 'number' ? (dobras[key] as number) : 0),
          0
        );
        if (total > 0) {
          items.push({ label: 'Somatorio', value: `${total.toFixed(1)} mm` });
        }
      }

      if (protocolo) {
        const computed = eval_.sexo
          ? calculateSkinfoldProtocol({
              protocolo,
              dobras: dobras || {},
              sexo: eval_.sexo,
              idade: eval_.idade,
              peso: comp?.peso,
              altura: comp?.altura,
              circunferencias: comp?.circunferencias,
              maturacao: comp?.dobrasMaturacao,
              etnia: comp?.dobrasEtnia,
            })
          : null;
        const fallback = comp?.percentualGordura
          ? {
              densidadeCorporal: comp.densidadeCorporal,
              percentualGordura: comp.percentualGordura,
              percentualGorduraBrozek: comp.percentualGorduraBrozek,
            }
          : null;
        const stats = computed || fallback;
        if (stats?.densidadeCorporal) {
          items.push({ label: 'Densidade corporal', value: String(stats.densidadeCorporal) });
        }
        if (stats?.percentualGordura) {
          items.push({ label: '% Gordura (dobras)', value: `${stats.percentualGordura}%` });
        }
        if (stats?.percentualGorduraBrozek) {
          items.push({
            label: '% Gordura (Brozek)',
            value: `${stats.percentualGorduraBrozek}%`,
          });
        }
      }

      if (comp?.dobrasMaturacao) {
        items.push({ label: 'Maturacao', value: comp.dobrasMaturacao });
      }
      if (comp?.dobrasEtnia) {
        items.push({ label: 'Etnia', value: comp.dobrasEtnia });
      }

      if (protocolo === 'penrose_cote_2' && comp?.circunferencias) {
        const cintura = comp.circunferencias.cintura;
        const punho = comp.circunferencias.punhoDireito || comp.circunferencias.punhoEsquerdo;
        if (typeof cintura === 'number' && cintura > 0) {
          items.push({ label: 'Abdomen', value: `${cintura} cm` });
        }
        if (typeof punho === 'number' && punho > 0) {
          items.push({ label: 'Punho', value: `${punho} cm` });
        }
      }

      if (protocolo === 'weltman_obesos_2' && comp?.circunferencias?.cintura) {
        items.push({ label: 'Abdomen', value: `${comp.circunferencias.cintura} cm` });
      }

      return items;
    })();
    const stats = [
      buildStatItem({
        label: 'IMC',
        value: comp && comp.imc > 0 ? formatMetric(comp.imc) : undefined,
        icon: 'analytics-outline',
      }),
      buildStatItem({
        label: '% Gordura',
        value: comp?.percentualGordura,
        icon: 'pie-chart-outline',
        suffix: '%',
      }),
      buildStatItem({
        label: 'Massa magra',
        value: comp?.massaMagra,
        icon: 'fitness-outline',
        suffix: 'kg',
      }),
      buildStatItem({
        label: 'Massa gorda',
        value: comp?.massaGorda,
        icon: 'body-outline',
        suffix: 'kg',
      }),
      buildStatItem({
        label: 'TMB',
        value: comp?.taxaMetabolicaBasal,
        icon: 'flame-outline',
        suffix: 'kcal',
      }),
      buildStatItem({
        label: 'Testes',
        value: eval_.resultados?.length || 0,
        icon: 'clipboard-outline',
        allowZero: true,
      }),
    ];

    return (
      <>
        {renderStatsCard('Resumo fisico', stats)}

      {eval_.composicaoCorporal && (
        <Card style={[styles.section, outlinedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Composicao Corporal
          </Text>
          <View style={styles.compositionGrid}>
            <View style={[styles.compositionItem, { backgroundColor: premiumSurface, borderColor: premiumBorder }]}>
              <Text style={[styles.compositionLabel, { color: colors.textSecondary }]}>Peso</Text>
              <Text style={[styles.compositionValue, { color: colors.text }]}>
                {eval_.composicaoCorporal.peso} kg
              </Text>
            </View>
            <View style={[styles.compositionItem, { backgroundColor: premiumSurface, borderColor: premiumBorder }]}>
              <Text style={[styles.compositionLabel, { color: colors.textSecondary }]}>Altura</Text>
              <Text style={[styles.compositionValue, { color: colors.text }]}>
                {eval_.composicaoCorporal.altura} cm
              </Text>
            </View>
            <View style={[styles.compositionItem, { backgroundColor: premiumSurface, borderColor: premiumBorder }]}>
              <Text style={[styles.compositionLabel, { color: colors.textSecondary }]}>IMC</Text>
              <Text style={[styles.compositionValue, { color: colors.text }]}>
                {eval_.composicaoCorporal.imc}
              </Text>
            </View>
            {eval_.composicaoCorporal.percentualGordura && (
              <View style={[styles.compositionItem, { backgroundColor: premiumSurface, borderColor: premiumBorder }]}>
                <Text style={[styles.compositionLabel, { color: colors.textSecondary }]}>% Gordura</Text>
                <Text style={[styles.compositionValue, { color: colors.text }]}>
                  {eval_.composicaoCorporal.percentualGordura}%
                </Text>
              </View>
            )}
            {eval_.composicaoCorporal.massaMagra && (
              <View style={[styles.compositionItem, { backgroundColor: premiumSurface, borderColor: premiumBorder }]}>
                <Text style={[styles.compositionLabel, { color: colors.textSecondary }]}>Massa Magra</Text>
                <Text style={[styles.compositionValue, { color: colors.text }]}>
                  {eval_.composicaoCorporal.massaMagra} kg
                </Text>
              </View>
            )}
            {eval_.composicaoCorporal.massaGorda && (
              <View style={[styles.compositionItem, { backgroundColor: premiumSurface, borderColor: premiumBorder }]}>
                <Text style={[styles.compositionLabel, { color: colors.textSecondary }]}>Massa Gorda</Text>
                <Text style={[styles.compositionValue, { color: colors.text }]}>
                  {eval_.composicaoCorporal.massaGorda} kg
                </Text>
              </View>
            )}
            {eval_.composicaoCorporal.taxaMetabolicaBasal && (
              <View style={[styles.compositionItem, { backgroundColor: premiumSurface, borderColor: premiumBorder }]}>
                <Text style={[styles.compositionLabel, { color: colors.textSecondary }]}>TMB</Text>
                <Text style={[styles.compositionValue, { color: colors.text }]}>
                  {eval_.composicaoCorporal.taxaMetabolicaBasal} kcal
                </Text>
              </View>
            )}
          </View>
        </Card>
      )}

      {skinfoldItems.length > 0 && renderDetailList('Dobras cutaneas', skinfoldItems)}

      {eval_.resultados && eval_.resultados.length > 0 && (
        <Card style={[styles.section, outlinedCardStyle]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Resultados dos Testes
          </Text>
          {eval_.resultados.map((resultado, index) => {
            const teste = eval_.testes.find(t => t.id === resultado.testId);
            const state = getTestResultState(resultado.valor);
            const toneColor = state
              ? state.tone === 'success'
                ? colors.success
                : state.tone === 'warning'
                ? colors.warning
                : colors.error
              : colors.primary;
            const formattedValue = formatTestResultValue(resultado.valor, teste?.unidade);
            return (
              <View key={resultado.testId} style={[styles.testResultItem, { borderBottomColor: premiumBorder }]}>
                <View style={styles.testResultHeader}>
                  <Text style={[styles.testName, { color: colors.text }]}>
                    {teste?.nome || `Teste ${index + 1}`}
                  </Text>
                  {state ? (
                    <View
                      style={[
                        styles.testResultBadge,
                        { backgroundColor: toneColor + '20', borderColor: toneColor },
                      ]}
                    >
                      <Text style={styles.testResultBadgeEmoji}>{state.emoji}</Text>
                      <Text style={[styles.testResultBadgeText, { color: toneColor }]}>
                        {state.label}
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.testValue, { color: colors.primary }]}>
                      {formattedValue}
                    </Text>
                  )}
                </View>
                {resultado.classificacao && (
                  <Text style={[styles.testClassification, { color: colors.textSecondary }]}>
                    {resultado.classificacao}
                  </Text>
                )}
              </View>
            );
          })}
        </Card>
      )}
      </>
    );
  };

  const renderInsightList = (
    title: string,
    items: string[],
    icon: keyof typeof Ionicons.glyphMap,
    color: string
  ) => {
    if (!items.length) return null;
    return (
      <View style={styles.aiSection}>
        <View style={styles.aiSectionHeader}>
          <Ionicons name={icon} size={16} color={color} />
          <Text style={[styles.aiSectionTitle, { color }]}>{title}</Text>
        </View>
        {items.map((item, index) => (
          <View key={`${title}-${index}`} style={styles.aiBulletRow}>
            <Ionicons name="checkmark-circle" size={14} color={color} />
            <Text style={[styles.aiBulletText, { color: colors.textSecondary }]}>
              {item}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderInsightsSection = () => {
    if (evaluation?.type === 'personalizada') {
      const personalized = evaluation as PersonalizedEvaluation;
      if (!isPersonal) return null;
      if (getAnsweredCount(personalized) === 0) return null;
    }
    if (!hasPremiumAiAccess) {
      return (
        <Card style={[styles.aiCard, outlinedCardStyle]}>
          <View style={styles.aiHeader}>
            <View style={styles.aiHeaderLeft}>
              <Ionicons name="lock-closed" size={18} color={colors.primary} />
              <Text style={[styles.aiTitle, { color: colors.text }]}>
                Insights inteligentes
              </Text>
            </View>
          </View>
          <Text style={[styles.aiText, { color: colors.textSecondary }]}>
            Insights de IA e avaliacao postural por IA estao disponiveis apenas no Premium.
          </Text>
          <Button
            title="Ver planos Premium"
            onPress={() => router.push('/profile/subscription' as any)}
            variant="outline"
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      );
    }
    if (!insights && !postureAnalysis && !insightsLoading && !insightsError) {
      return null;
    }

    return (
      <Card style={[styles.aiCard, outlinedCardStyle]}>
        <View style={styles.aiHeader}>
          <View style={styles.aiHeaderLeft}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <Text style={[styles.aiTitle, { color: colors.text }]}>
              Insights inteligentes
            </Text>
          </View>
          {insightsLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        </View>

        {insightsError && (
          <Text style={[styles.aiError, { color: colors.error }]}>{insightsError}</Text>
        )}

        {postureAnalysis && (
          <View style={styles.aiSection}>
            <Text style={[styles.aiSectionTitle, { color: colors.text }]}>
              Analise de postura{postureImageLabel ? ` (${postureImageLabel})` : ''}
            </Text>
            {postureAnalysis.postura && (
              <Text style={[styles.aiText, { color: colors.textSecondary }]}>
                Postura: {postureAnalysis.postura}
              </Text>
            )}
            {postureAnalysis.descricaoPostura && (
              <Text style={[styles.aiText, { color: colors.textSecondary }]}>
                {postureAnalysis.descricaoPostura}
              </Text>
            )}
            {postureAnalysis.metricas && (
              <Text style={[styles.aiText, { color: colors.textSecondary }]}>
                {postureAnalysis.metricas}
              </Text>
            )}
            {postureAnalysis.textoDetalhado && (
              <Text style={[styles.aiText, { color: colors.textSecondary }]}>
                {postureAnalysis.textoDetalhado}
              </Text>
            )}
          </View>
        )}

        {insights ? (
          <>
            <Text style={[styles.aiText, { color: colors.textSecondary }]}>
              {insights.resumo}
            </Text>

            {insights.graficos?.length ? (
              <View style={styles.aiMetrics}>
                {insights.graficos.map((metric) => (
                  <InsightMetricBar
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
                  />
                ))}
              </View>
            ) : null}

            {renderInsightList('Destaques', insights.destaques, 'sparkles', colors.success)}
            {renderInsightList('Pontos de atencao', insights.alertas, 'alert-circle', colors.warning)}
            {renderInsightList('Proximos passos', insights.proximosPassos, 'rocket-outline', colors.primary)}
          </>
        ) : (
          !insightsLoading && !insightsError && (
            <Text style={[styles.aiText, { color: colors.textSecondary }]}>
              Insights ainda nao disponiveis.
            </Text>
          )
        )}
      </Card>
    );
  };

  if (isLoading) {
    return (
      <LinearGradient
        colors={[premiumPageTop, premiumPageBottom]}
        start={{ x: 0.85, y: 0 }}
        end={{ x: 0.15, y: 1 }}
        style={styles.container}
      >
        <SafeAreaView style={styles.container}>
          <Loading />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (error || !evaluation) {
    return (
      <LinearGradient
        colors={[premiumPageTop, premiumPageBottom]}
        start={{ x: 0.85, y: 0 }}
        end={{ x: 0.15, y: 1 }}
        style={styles.container}
      >
        <SafeAreaView style={styles.container}>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={64} color={colors.error} />
            <Text style={[styles.errorTitle, { color: colors.text }]}>Erro ao carregar avaliacao</Text>
            <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>
              {error || 'Avaliacao nao encontrada'}
            </Text>
            <Button title="Voltar" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const statusColor = getEvaluationStatusColor(evaluation.status);
  const canCharge = isPersonal && chargeableTypes.includes(evaluation.type);
  const personalizedEvaluation =
    evaluation.type === 'personalizada' ? (evaluation as PersonalizedEvaluation) : null;
  const personalizedAnsweredCount = personalizedEvaluation ? getAnsweredCount(personalizedEvaluation) : 0;
  const personalizedPendingQuestions = personalizedEvaluation
    ? Math.max(0, (personalizedEvaluation.perguntas?.length || 0) - personalizedAnsweredCount)
    : 0;
  const canSendEvaluationReminder =
    Boolean(
      isPersonal &&
      personalizedEvaluation &&
      personalizedEvaluation.userId &&
      personalizedAnsweredCount === 0 &&
      !isPersonalizedOverdue(personalizedEvaluation) &&
      personalizedEvaluation.status !== 'nao_realizada' &&
      personalizedEvaluation.status !== 'concluida'
    );

  return (
    <LinearGradient
      colors={[premiumPageTop, premiumPageBottom]}
      start={{ x: 0.85, y: 0 }}
      end={{ x: 0.15, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.container}>
        <View style={[styles.header, { borderBottomColor: premiumBorder, backgroundColor: premiumCard }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.iconButton, { backgroundColor: premiumSurface, borderColor: premiumBorder }]}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            Avaliacao {getEvaluationTypeLabel(evaluation.type)}
          </Text>
          <TouchableOpacity
            onPress={handleDelete}
            style={[
              styles.iconButton,
              styles.deleteIconButton,
              {
                backgroundColor: colors.error + (isDark ? '22' : '12'),
                borderColor: colors.error + (isDark ? '45' : '25'),
              },
            ]}
            disabled={isDeleting}
          >
            <Ionicons name="trash-outline" size={24} color={colors.error} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: spacing['3xl'] + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
        >
          <Card
            style={[styles.overviewCard, { backgroundColor: premiumCard, borderColor: premiumBorder }]}
            padding="none"
            shadow={false}
          >
            <LinearGradient
              colors={overviewGradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.overviewGradient}
            >
              <View style={styles.overviewHeader}>
                <View style={styles.overviewTextWrap}>
                  <Text style={[styles.overviewTitle, { color: colors.text }]}>
                    Avaliacao {getEvaluationTypeLabel(evaluation.type)}
                  </Text>
                  <View style={styles.overviewDateRow}>
                    <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                    <Text style={[styles.overviewDate, { color: colors.textSecondary }]}>
                      {formatDate(evaluation.date)}
                    </Text>
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '45' }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{getEvaluationStatusLabel(evaluation.status)}</Text>
                </View>
              </View>
            </LinearGradient>
          </Card>

          {canCharge && (
            <Card style={[styles.chargeCard, { backgroundColor: premiumCard, borderColor: premiumBorder }]}>
              <View style={styles.chargeRow}>
                <View style={styles.chargeInfo}>
                  <Text style={[styles.chargeTitle, { color: colors.text }]}>Cobranca da avaliacao</Text>
                  <Text style={[styles.chargeSubtitle, { color: colors.textSecondary }]}>Gere uma cobranca para este aluno.</Text>
                </View>
                <Button title="Cobrar aluno" onPress={handleCharge} size="small" />
              </View>
            </Card>
          )}

          {canSendEvaluationReminder && (
            <Card style={[styles.chargeCard, { backgroundColor: premiumCard, borderColor: premiumBorder }]}>
              <View style={styles.chargeRow}>
                <View style={styles.chargeInfo}>
                  <Text style={[styles.chargeTitle, { color: colors.text }]}>Lembrete da avaliacao</Text>
                  <Text style={[styles.chargeSubtitle, { color: colors.textSecondary }]}>
                    {personalizedPendingQuestions > 0
                      ? `Avise o aluno para responder as ${personalizedPendingQuestions} pergunta${personalizedPendingQuestions === 1 ? '' : 's'} pendente${personalizedPendingQuestions === 1 ? '' : 's'}.`
                      : 'Avise o aluno para concluir esta avaliacao.'}
                  </Text>
                </View>
                <Button
                  title="Avisar aluno"
                  onPress={handleSendEvaluationReminder}
                  size="small"
                  loading={sendingReminder}
                  disabled={sendingReminder}
                />
              </View>
            </Card>
          )}

          {renderInsightsSection()}

          {evaluation.type === 'online' && renderOnlineEvaluation(evaluation as OnlineEvaluation)}
          {evaluation.type === 'personalizada' && renderPersonalizedEvaluation(evaluation as PersonalizedEvaluation)}
          {evaluation.type === 'postural' && renderPosturalEvaluation(evaluation as PosturalEvaluation)}
          {evaluation.type === 'fisica' && renderPhysicalTestEvaluation(evaluation as PhysicalTestEvaluation)}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function InsightMetricBar({ label, value }: { label: string; value: number }) {
  const { colors, isDark } = useTheme();
  const metricTrackColor = isDark ? colors.alternate : '#E7EEF6';
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <View style={styles.aiMetricRow}>
      <View style={styles.aiMetricHeader}>
        <Text style={[styles.aiMetricLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
        <Text style={[styles.aiMetricValue, { color: colors.text }]}>
          {Math.round(safeValue)}%
        </Text>
      </View>
      <View style={[styles.aiMetricTrack, { backgroundColor: metricTrackColor }]}>
        <View
          style={[
            styles.aiMetricFill,
            { backgroundColor: colors.primary, width: `${Math.round(safeValue)}%` },
          ]}
        />
      </View>
    </View>
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
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  deleteIconButton: {
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.base,
    gap: spacing.xs,
    paddingBottom: spacing['3xl'],
  },
  overviewCard: {
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  overviewGradient: {
    padding: spacing.base,
  },
  overviewTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  overviewDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chargeCard: {
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  aiCard: {
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  aiHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  aiTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  aiText: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  aiError: {
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  aiSection: {
    marginTop: spacing.sm,
  },
  aiSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  aiSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  aiBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  aiBulletText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  aiMetrics: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  aiMetricRow: {
    gap: spacing.xs,
  },
  aiMetricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  aiMetricLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  aiMetricValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  aiMetricTrack: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  aiMetricFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  chargeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  chargeInfo: {
    flex: 1,
  },
  chargeTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  chargeSubtitle: {
    fontSize: 12,
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  chartCard: {
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  chartSubtitle: {
    fontSize: 12,
    marginBottom: spacing.md,
  },
  gaugeList: {
    gap: spacing.md,
  },
  gaugeRow: {
    gap: spacing.xs,
  },
  gaugeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  gaugeLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  gaugeValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  gaugeNote: {
    fontSize: 12,
  },
  gaugeTrack: {
    position: 'relative',
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  gaugeMarker: {
    position: 'absolute',
    top: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  gaugeRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gaugeRangeText: {
    fontSize: 11,
  },
  barList: {
    gap: spacing.md,
  },
  barRow: {
    gap: spacing.xs,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  barValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  barTrack: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  asymmetryNote: {
    fontSize: 11,
  },
  overviewTitle: {
    fontSize: 19,
    fontWeight: '700',
  },
  overviewDate: {
    fontSize: 13,
  },
  statusBadge: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  section: {
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    width: '31%',
    minHeight: 104,
    padding: spacing.sm + 2,
    borderRadius: borderRadius.lg,
    gap: spacing.xs,
    borderWidth: 1,
  },
  statIconWrap: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  detailLabel: {
    fontSize: 12,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  imcDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  imcValue: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  imcBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  imcClassification: {
    fontSize: 14,
    fontWeight: '600',
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  photoContainer: {
    width: '47%',
    alignItems: 'center',
  },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  photoLabel: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  resultText: {
    fontSize: 14,
    lineHeight: 22,
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  deadlineText: {
    fontSize: 14,
  },
  deadlineBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  deadlineBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  questionItem: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  questionMeta: {
    marginBottom: spacing.sm,
  },
  questionMetaText: {
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  questionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  questionStatusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  questionStatusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  questionText: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  answerText: {
    fontSize: 14,
  },
  booleanRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  booleanButton: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  booleanText: {
    fontSize: 12,
    fontWeight: '600',
  },
  deadlineAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  deadlineAlertText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  starsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  pendingNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  pendingNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  recommendationText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  analysisItem: {
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  analysisLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  analysisValue: {
    fontSize: 14,
  },
  compositionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  compositionItem: {
    width: '48%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
  },
  compositionLabel: {
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  compositionValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  testResultItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  testResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  testName: {
    fontSize: 14,
    fontWeight: '500',
  },
  testValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  testResultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 40,
  },
  testResultBadgeEmoji: {
    fontSize: 16,
  },
  testResultBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  testClassification: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.lg,
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
