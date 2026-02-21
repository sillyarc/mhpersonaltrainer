import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../src/hooks/useTheme';
import { Button, Input, Card, SearchableSelect, DateInput } from '../../src/components/common';
import { MeasurementForm } from '../../src/components/evaluation/MeasurementForm';
import { spacing, borderRadius } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import {
  BodyComposition,
  Circumferences,
  EvaluationPhotos,
  EvaluationQuestion,
  EvaluationType,
  PhysicalTest,
  PostureAnalysis,
  PosturePhotos,
  SkinFolds,
  SkinfoldProtocolId,
  SkinfoldMaturacao,
  SkinfoldEtnia,
  TestResult,
} from '../../src/types/evaluation';
import {
  calculateIMC,
  calculateBodyCompositionFromSkinfolds,
  calculateSkinfoldProtocol,
  createOnlineEvaluation,
  createPersonalizedEvaluation,
  createPhysicalTestEvaluation,
  createPosturalEvaluation,
  getEvaluationTypeLabel,
  getSkinfoldProtocolDobras,
  getSkinfoldProtocolLabel,
  SKINFOLD_PROTOCOL_OPTIONS,
} from '../../src/services/evaluations';
import { firestoreService, Aluno } from '../../src/services/firestoreService';
import { notifyConversationEvent } from '../../src/services/chat';
import { User } from '../../src/types/user';
import { formatDateString } from '@utils/date';

const EVALUATION_TYPES: { id: EvaluationType; label: string; icon: string; description: string }[] = [
  {
    id: 'online',
    label: 'Online',
    icon: 'globe-outline',
    description: 'Medidas e fotos',
  },
  {
    id: 'fisica',
    label: 'Fisica',
    icon: 'fitness-outline',
    description: 'Testes fisicos e composicao corporal',
  },
  {
    id: 'postural',
    label: 'Postural',
    icon: 'body-outline',
    description: 'Analise da postura com fotos',
  },
  {
    id: 'personalizada',
    label: 'Personalizada',
    icon: 'clipboard-outline',
    description: 'Questionario personalizado',
  },
];

const QUESTION_TYPE_OPTIONS: { id: EvaluationQuestion['tipo']; label: string }[] = [
  { id: 'texto', label: 'Texto livre' },
  { id: 'escala', label: 'Numero' },
  { id: 'sim_nao', label: 'Sim/Nao' },
  { id: 'multipla_escolha', label: 'Dropdown' },
];

const SEX_OPTIONS = [
  { id: 'masculino', label: 'Masculino' },
  { id: 'feminino', label: 'Feminino' },
];

const MATURACAO_OPTIONS: { id: SkinfoldMaturacao; label: string }[] = [
  { id: 'prepuber', label: 'Pre-puber' },
  { id: 'puber', label: 'Puber' },
  { id: 'pospuber', label: 'Pos-puber' },
];

const ETNIA_OPTIONS: { id: SkinfoldEtnia; label: string }[] = [
  { id: 'branco', label: 'Branco' },
  { id: 'negro', label: 'Negro' },
  { id: 'outro', label: 'Outro' },
];

const SKINFOLD_FIELD_LABELS: Record<keyof SkinFolds, string> = {
  triceps: 'Tricipital',
  biceps: 'Bicipital',
  subescapular: 'Subescapular',
  suprailiacas: 'Suprailiaca',
  abdominal: 'Abdominal',
  peitoral: 'Peitoral',
  coxaMedial: 'Coxa medial',
  axilarMedia: 'Axilar media',
  panturrilhaMedial: 'Panturrilha medial',
};

const TEST_RESULT_OPTIONS = [
  { id: 'bom', label: 'Bom', emoji: '😀' },
  { id: 'medio', label: 'Medio', emoji: '😐' },
  { id: 'ruim', label: 'Ruim', emoji: '😞' },
];

export default function CreateEvaluationScreen() {
  const { colors } = useTheme();
  const { user, role } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  const chargeableTypes: EvaluationType[] = ['fisica', 'personalizada', 'postural'];

  const isPersonal = role === 'personal' || role === 'professor';
  const isFocusedStudent = !!studentId;
  const [step, setStep] = useState<'type' | 'form'>('type');
  const [selectedType, setSelectedType] = useState<EvaluationType | null>(null);

  const [peso, setPeso] = useState(0);
  const [altura, setAltura] = useState(0);
  const [circunferencias, setCircunferencias] = useState<Circumferences>({});
  const [bodyComposition, setBodyComposition] = useState<BodyComposition | null>(null);
  const [onlineDate, setOnlineDate] = useState<Date>(new Date());
  const [physicalDate, setPhysicalDate] = useState<Date>(new Date());
  const [posturalDate, setPosturalDate] = useState<Date>(new Date());

  const [photos, setPhotos] = useState<EvaluationPhotos>({});
  const [posturePhotos, setPosturePhotos] = useState<PosturePhotos>({});
  const [postureAnalysis, setPostureAnalysis] = useState<PostureAnalysis>({});
  const [postureRecommendations, setPostureRecommendations] = useState<string[]>([]);

  const [personalQuestions, setPersonalQuestions] = useState<EvaluationQuestion[]>([]);
  const [personalResultado, setPersonalResultado] = useState('');
  const [personalRecommendations, setPersonalRecommendations] = useState<string[]>([]);
  const [personalDeadline, setPersonalDeadline] = useState<Date | null>(null);

  const [physicalTests, setPhysicalTests] = useState<PhysicalTest[]>([]);
  const [physicalResults, setPhysicalResults] = useState<Record<string, string>>({});
  const [skinfolds, setSkinfolds] = useState<SkinFolds>({});
  const [skinfoldAge, setSkinfoldAge] = useState('');
  const [skinfoldSex, setSkinfoldSex] = useState<'masculino' | 'feminino' | ''>('');
  const [skinfoldProtocol, setSkinfoldProtocol] = useState<SkinfoldProtocolId>('pollock_1984_7');
  const [skinfoldMaturacao, setSkinfoldMaturacao] = useState<SkinfoldMaturacao | ''>('');
  const [skinfoldEtnia, setSkinfoldEtnia] = useState<SkinfoldEtnia | ''>('');

  const [observacoes, setObservacoes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [chargeValue, setChargeValue] = useState('');
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedStudentProfile, setSelectedStudentProfile] = useState<User | null>(null);
  const studentOptions = students.map((student) => ({
    id: student.id,
    label: student.nome,
    description: student.email,
  }));

  const buildEvaluationRoute = (evaluationId: string, type: EvaluationType, targetUserId: string) =>
    `/evaluations/${evaluationId}?type=${type}&userId=${targetUserId}`;

  const countPhotos = (photos: Record<string, string | undefined>) =>
    Object.values(photos || {}).filter(Boolean).length;

  const parseBirthday = (value?: string): Date | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parseFromParts = (day: number, month: number, year: number) => {
      if (!day || !month || !year) return null;
      const date = new Date(year, month - 1, day);
      if (Number.isNaN(date.getTime())) return null;
      if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
        return null;
      }
      return date;
    };
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length !== 3) return null;
      return parseFromParts(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    }
    if (trimmed.includes('-')) {
      const parts = trimmed.split('-');
      if (parts.length !== 3) return null;
      if (parts[0].length === 4) {
        return parseFromParts(Number(parts[2]), Number(parts[1]), Number(parts[0]));
      }
      return parseFromParts(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    }
    return null;
  };

  const calculateAge = (birthDate?: Date | null): number | null => {
    if (!birthDate) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const hasBirthdayPassed =
      today.getMonth() > birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
    if (!hasBirthdayPassed) age -= 1;
    return age > 0 ? age : null;
  };

  const normalizeSex = (value?: string | null): 'masculino' | 'feminino' | null => {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.includes('fem') || normalized.includes('mulher') || normalized === 'f') {
      return 'feminino';
    }
    if (normalized.includes('masc') || normalized.includes('homem') || normalized === 'm') {
      return 'masculino';
    }
    return null;
  };

  const normalizeSkinfolds = (value: SkinFolds) => {
    const normalized: SkinFolds = {};
    ([
      'triceps',
      'biceps',
      'subescapular',
      'suprailiacas',
      'abdominal',
      'peitoral',
      'coxaMedial',
      'axilarMedia',
      'panturrilhaMedial',
    ] as const).forEach((key) => {
      const raw = value[key];
      if (typeof raw === 'number' && raw > 0) {
        normalized[key] = raw;
      }
    });
    return normalized;
  };

  const getSkinfoldTotal = (value: SkinFolds, keys?: Array<keyof SkinFolds>) => {
    const items = keys?.length ? keys.map((key) => value[key]) : Object.values(value);
    return items.reduce((acc, item) => acc + (typeof item === 'number' ? item : 0), 0);
  };

  const parseNumeric = (value: string) => Number(value.replace(',', '.'));

  const buildEvaluationContent = (type: EvaluationType) => {
    const label = getEvaluationTypeLabel(type);
    const lines: string[] = [`Avaliação ${label} criada.`];

    if (type === 'online') {
      if (peso > 0) lines.push(`Peso: ${peso}kg`);
      if (altura > 0) lines.push(`Altura: ${altura}cm`);
      if (peso > 0 && altura > 0) lines.push(`IMC: ${calculateIMC(peso, altura)}`);
      const photoCount = countPhotos(photos);
      if (photoCount > 0) lines.push(`Fotos: ${photoCount}`);
    }

    if (type === 'fisica') {
      const comp = bodyComposition;
      const normalizedDobras = normalizeSkinfolds(skinfolds);
      const sexo = skinfoldSex || normalizeSex(selectedStudentProfile?.genero || null);
      const idade =
        parseNumeric(skinfoldAge) ||
        calculateAge(parseBirthday(selectedStudentProfile?.birthday)) ||
        undefined;
      const protocolDobras = getSkinfoldProtocolDobras(skinfoldProtocol, sexo || undefined);
      const totalDobras = getSkinfoldTotal(normalizedDobras, protocolDobras);
      const skinfoldStats = sexo
        ? calculateSkinfoldProtocol({
            protocolo: skinfoldProtocol,
            dobras: normalizedDobras,
            sexo,
            idade,
            peso,
            altura,
            circunferencias,
            maturacao: skinfoldMaturacao || undefined,
            etnia: skinfoldEtnia || undefined,
          })
        : null;
      if (comp?.peso || peso > 0) lines.push(`Peso: ${comp?.peso || peso}kg`);
      if (comp?.altura || altura > 0) lines.push(`Altura: ${comp?.altura || altura}cm`);
      if (comp?.imc || (peso > 0 && altura > 0)) {
        lines.push(`IMC: ${comp?.imc || calculateIMC(peso, altura)}`);
      }
      if (skinfoldProtocol) {
        lines.push(`Protocolo: ${getSkinfoldProtocolLabel(skinfoldProtocol)}`);
      }
      if (totalDobras > 0) lines.push(`Dobras: ${totalDobras.toFixed(1)} mm`);
      if (skinfoldStats?.percentualGordura) {
        lines.push(`% Gordura (dobras): ${skinfoldStats.percentualGordura}`);
      }
      if (physicalTests.length > 0) lines.push(`Testes: ${physicalTests.length}`);
    }

    if (type === 'postural') {
      const photoCount = countPhotos(posturePhotos);
      if (photoCount > 0) lines.push(`Fotos: ${photoCount}`);
      const recCount = postureRecommendations.filter((rec) => rec.trim().length > 0).length;
      if (recCount > 0) lines.push(`Recomendacoes: ${recCount}`);
    }

    if (type === 'personalizada') {
      if (personalQuestions.length > 0) lines.push(`Perguntas: ${personalQuestions.length}`);
      const deadlineLabel = formatDateString(personalDeadline);
      if (deadlineLabel) lines.push(`Prazo: ${deadlineLabel}`);
      const recCount = personalRecommendations.filter((rec) => rec.trim().length > 0).length;
      if (recCount > 0) lines.push(`Recomendacoes: ${recCount}`);
    }

    return lines.join('\n');
  };

  const notifyEvaluationEvent = async (
    targetUserId: string,
    type: EvaluationType,
    evaluationId?: string
  ) => {
    if (!user?.uid) return;
    const student = students.find((item) => item.id === targetUserId);
    const actionPayload = evaluationId
      ? {
          label: 'Abrir avaliação',
          route: buildEvaluationRoute(evaluationId, type, targetUserId),
        }
      : undefined;
    try {
      await notifyConversationEvent({
        senderId: user.uid,
        senderName: user.displayName,
        senderPhoto: user.photoUrl,
        recipientId: targetUserId,
        recipientName: student?.nome,
        recipientPhoto: student?.photoUrl,
        content: buildEvaluationContent(type),
        action: actionPayload,
      });
    } catch (_) {
      // Ignore chat notification failures.
    }
  };

  const handlePostSave = (targetUserId: string, type: EvaluationType) => {
    if (!chargeableTypes.includes(type)) {
      showAlert('Avaliação criada', 'Avaliação salva com sucesso.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
      return;
    }
    showAlert('Avaliação criada', 'Deseja gerar uma cobrança para este aluno?', [
      { text: 'Agora não', onPress: () => router.back(), style: 'cancel' },
      {
        text: 'Gerar cobrança',
        onPress: () => {
          const descricaoParam = `Avaliação ${getEvaluationTypeLabel(type)}`.trim();
          const valorParam = chargeValue.trim();
          const valorQuery = valorParam ? `&valor=${encodeURIComponent(valorParam)}` : '';
          router.replace(
            `/financeiro/personal?studentId=${targetUserId}&descricao=${encodeURIComponent(descricaoParam)}${valorQuery}` as any
          );
        },
      },
    ]);
  };

  useEffect(() => {
    if (!isPersonal || !user?.uid) return;
    const loadStudents = async () => {
      const alunos = await firestoreService.getAlunosDoPersonal(user.uid);
      setStudents(alunos);
      if (!selectedStudentId && !studentId && alunos.length > 0) {
        setSelectedStudentId(alunos[0].id);
      }
    };
    loadStudents();
  }, [isPersonal, user?.uid, selectedStudentId, studentId]);

  useEffect(() => {
    if (studentId) {
      setSelectedStudentId(studentId);
    }
  }, [studentId]);

  useEffect(() => {
    if (!isPersonal) return;
    const targetId = selectedStudentId || studentId;
    if (!targetId) {
      setSelectedStudentProfile(null);
      return;
    }
    let active = true;
    firestoreService.getUserDocument(targetId).then((profile) => {
      if (active) {
        setSelectedStudentProfile(profile);
      }
    });
    return () => {
      active = false;
    };
  }, [isPersonal, selectedStudentId, studentId]);

  useEffect(() => {
    if (!selectedStudentProfile) return;
    const profileAge = calculateAge(parseBirthday(selectedStudentProfile.birthday));
    const profileSex = normalizeSex(selectedStudentProfile.genero || null);
    setSkinfoldAge(profileAge ? String(profileAge) : '');
    setSkinfoldSex(profileSex || '');
  }, [selectedStudentProfile?.uid]);

  const handleSelectType = (type: EvaluationType) => {
    setSelectedType(type);
    setStep('form');
  };

  const handlePickImage = async (onPicked: (uri: string) => void) => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showAlert('Permissão necessária', 'Precisamos de permissão para acessar suas fotos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        onPicked(result.assets[0].uri);
      }
    } catch (error) {
      showAlert('Erro', 'Nao foi possivel selecionar a imagem');
    }
  };

  const handleTakePhoto = async (onPicked: (uri: string) => void) => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        showAlert('Permissão necessária', 'Precisamos de permissão para usar a câmera.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        onPicked(result.assets[0].uri);
      }
    } catch (error) {
      showAlert('Erro', 'Nao foi possivel tirar a foto');
    }
  };

  const showPhotoOptions = (onPicked: (uri: string) => void) => {
    showAlert('Adicionar foto', 'Escolha uma opcao', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Galeria', onPress: () => handlePickImage(onPicked) },
      { text: 'Camera', onPress: () => handleTakePhoto(onPicked) },
    ]);
  };

  const createId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const handleAddQuestion = () => {
    setPersonalQuestions((prev) => [
      ...prev,
      { id: createId('q'), pergunta: '', tipo: 'texto', obrigatoria: false },
    ]);
  };

  const handleAddRecommendation = (type: 'postural' | 'personal') => {
    if (type === 'postural') {
      setPostureRecommendations((prev) => [...prev, '']);
    } else {
      setPersonalRecommendations((prev) => [...prev, '']);
    }
  };

  const handleAddTest = () => {
    setPhysicalTests((prev) => [
      ...prev,
      { id: createId('t'), nome: '', unidade: '' },
    ]);
  };

  const parseTestResultValue = (value: string): TestResult['valor'] | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.toLowerCase();
    if (TEST_RESULT_OPTIONS.some((option) => option.id === normalized)) {
      return normalized;
    }
    const numericText = trimmed.replace(',', '.');
    if (/^\d+(?:\.\d+)?$/.test(numericText)) {
      const parsed = Number(numericText);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return trimmed;
  };

  const handleSave = async () => {
    if (!user?.uid || !selectedType) {
      showAlert('Erro', 'Usuário não autenticado');
      return;
    }

    const targetUserId = isPersonal ? selectedStudentId : user.uid;
    if (!targetUserId) {
      showAlert('Erro', 'Selecione um aluno para esta avaliação');
      return;
    }

    setIsSaving(true);

    try {
      const imc = calculateIMC(peso, altura);
      const personalId = isPersonal ? user.uid : undefined;

      if (selectedType === 'online') {
        if (peso <= 0 || altura <= 0) {
          showAlert('Erro', 'Preencha o peso e altura');
          setIsSaving(false);
          return;
        }

        const result = await createOnlineEvaluation({
          type: 'online',
          userId: targetUserId,
          personalId,
          date: onlineDate,
          status: 'concluida',
          peso,
          altura,
          imc,
          circunferencias,
          fotos: photos,
          observacoes,
        });

        if (result.error) {
          showAlert('Erro', result.error);
        } else {
          await notifyEvaluationEvent(targetUserId, 'online', result.data?.id);
          handlePostSave(targetUserId, 'online');
        }
      } else if (selectedType === 'fisica') {
        if (peso <= 0 || altura <= 0) {
          showAlert('Erro', 'Preencha o peso e altura');
          setIsSaving(false);
          return;
        }

        const normalizedDobras = normalizeSkinfolds(skinfolds);
        const sexo = skinfoldSex || normalizeSex(selectedStudentProfile?.genero || null);
        const idade =
          parseNumeric(skinfoldAge) ||
          calculateAge(parseBirthday(selectedStudentProfile?.birthday)) ||
          0;
        const skinfoldComposition = sexo
          ? calculateBodyCompositionFromSkinfolds(peso, altura, idade, sexo, normalizedDobras, {
              protocolo: skinfoldProtocol,
              circunferencias,
              maturacao: skinfoldMaturacao || undefined,
              etnia: skinfoldEtnia || undefined,
            })
          : null;
        const baseComposition = skinfoldComposition || bodyComposition || {
          peso,
          altura,
          imc,
        };
        const hasCircunferencias = Object.values(circunferencias).some(
          (value) => typeof value === 'number' && value > 0
        );
        const finalComposition: BodyComposition = {
          ...baseComposition,
          dobrasCutaneas:
            Object.keys(normalizedDobras).length > 0
              ? normalizedDobras
              : baseComposition.dobrasCutaneas,
          protocoloDobras: skinfoldProtocol,
          dobrasMaturacao: skinfoldMaturacao || baseComposition.dobrasMaturacao,
          dobrasEtnia: skinfoldEtnia || baseComposition.dobrasEtnia,
          circunferencias: hasCircunferencias
            ? circunferencias
            : baseComposition.circunferencias,
        };

        const resultados: TestResult[] = Object.entries(physicalResults)
          .map(([testId, valor]) => {
            const parsed = parseTestResultValue(valor);
            return parsed === null ? null : { testId, valor: parsed };
          })
          .filter((item): item is TestResult => item !== null);

        const result = await createPhysicalTestEvaluation({
          type: 'fisica',
          userId: targetUserId,
          personalId,
          date: physicalDate,
          status: 'concluida',
          testes: physicalTests,
          resultados,
          composicaoCorporal: finalComposition,
          sexo: sexo || undefined,
          idade: idade || undefined,
        });

        if (result.error) {
          showAlert('Erro', result.error);
        } else {
          await notifyEvaluationEvent(targetUserId, 'fisica', result.data?.id);
          handlePostSave(targetUserId, 'fisica');
        }
      } else if (selectedType === 'postural') {
        const cleanedRecs = postureRecommendations.filter((rec) => rec.trim().length > 0);
        const result = await createPosturalEvaluation({
          type: 'postural',
          userId: targetUserId,
          personalId,
          date: posturalDate,
          status: 'concluida',
          fotosPostura: posturePhotos,
          analise: postureAnalysis,
          recomendacoes: cleanedRecs,
        });

        if (result.error) {
          showAlert('Erro', result.error);
        } else {
          await notifyEvaluationEvent(targetUserId, 'postural', result.data?.id);
          handlePostSave(targetUserId, 'postural');
        }
      } else if (selectedType === 'personalizada') {
        const deadline = personalDeadline;
        if (!deadline) {
          showAlert('Erro', 'Informe o prazo para o aluno responder (DD/MM/AAAA).');
          setIsSaving(false);
          return;
        }

        const sanitizedQuestions = personalQuestions
          .map((question) => {
            const pergunta = question.pergunta.trim();
            const opcoes = (question.opcoes || [])
              .map((item) => item.trim())
              .filter((item) => item.length > 0);
            return {
              ...question,
              pergunta,
              opcoes,
            };
          })
          .filter((question) => question.pergunta.length > 0);

        if (sanitizedQuestions.length === 0) {
          showAlert('Erro', 'Adicione ao menos uma pergunta valida.');
          setIsSaving(false);
          return;
        }

        const hasInvalidOptions = sanitizedQuestions.some(
          (question) => question.tipo === 'multipla_escolha' && (!question.opcoes || question.opcoes.length < 2)
        );
        if (hasInvalidOptions) {
          showAlert('Erro', 'Perguntas de multipla escolha precisam de ao menos 2 opcoes.');
          setIsSaving(false);
          return;
        }

        const cleanedRecs = personalRecommendations.filter((rec) => rec.trim().length > 0);

        const result = await createPersonalizedEvaluation({
          type: 'personalizada',
          userId: targetUserId,
          personalId,
          date: new Date(),
          status: 'pendente',
          perguntas: sanitizedQuestions,
          respostas: [],
          prazoResposta: deadline,
          resultado: personalResultado,
          recomendacoes: cleanedRecs,
        });

        if (result.error) {
          showAlert('Erro', result.error);
        } else {
          await notifyEvaluationEvent(targetUserId, 'personalizada', result.data?.id);
          handlePostSave(targetUserId, 'personalizada');
        }
      }
    } catch (error: any) {
      showAlert('Erro', error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const renderStudentSelector = () => {
    if (!isPersonal) return null;
    if (isFocusedStudent) {
      const selectedStudent = students.find((student) => student.id === studentId);
      return (
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Aluno</Text>
          <Card>
            <Text style={[{ color: colors.textSecondary }]}>
              {selectedStudent?.nome || 'Aluno selecionado'}
            </Text>
          </Card>
        </View>
      );
    }

    return (
      <View style={{ marginBottom: spacing.lg }}>
        {students.length === 0 ? (
          <Card>
            <Text style={[{ color: colors.textSecondary }]}>
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
    );
  };

  const renderOnlineForm = () => (
    <>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Data</Text>
      <DateInput
        label="Data da avaliacao"
        placeholder="DD/MM/AAAA"
        value={onlineDate}
        onChange={setOnlineDate}
      />

      <MeasurementForm
        peso={peso}
        altura={altura}
        circunferencias={circunferencias}
        onChangePeso={setPeso}
        onChangeAltura={setAltura}
        onChangeCircunferencias={setCircunferencias}
        onBodyCompositionChange={setBodyComposition}
      />

      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: spacing.xl }]}>
        Fotos da avaliação
      </Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
        Adicione fotos para acompanhar sua evolucao
      </Text>

      <View style={styles.photosGrid}>
        {(['frente', 'costas', 'ladoDireito', 'ladoEsquerdo'] as const).map((position) => (
          <TouchableOpacity
            key={position}
            style={[styles.photoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => showPhotoOptions((uri) => setPhotos((prev) => ({ ...prev, [position]: uri })))}
          >
            {photos[position] ? (
              <Image source={{ uri: photos[position] }} style={styles.photoPreview} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={32} color={colors.textMuted} />
                <Text style={[styles.photoLabel, { color: colors.textMuted }]}>
                  {position === 'frente' && 'Frente'}
                  {position === 'costas' && 'Costas'}
                  {position === 'ladoDireito' && 'Lado dir.'}
                  {position === 'ladoEsquerdo' && 'Lado esq.'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Input
        label="Observacoes"
        placeholder="Notas adicionais..."
        value={observacoes}
        onChangeText={setObservacoes}
        multiline
        numberOfLines={4}
        style={{ marginTop: spacing.lg }}
      />
    </>
  );

  const renderPhysicalForm = () => (
    <>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Data</Text>
      <DateInput
        label="Data da avaliacao"
        placeholder="DD/MM/AAAA"
        value={physicalDate}
        onChange={setPhysicalDate}
      />

      <MeasurementForm
        peso={peso}
        altura={altura}
        circunferencias={circunferencias}
        onChangePeso={setPeso}
        onChangeAltura={setAltura}
        onChangeCircunferencias={setCircunferencias}
        onBodyCompositionChange={setBodyComposition}
      />

      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: spacing.lg }]}>
        Dobras cutaneas e protocolos
      </Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
        Selecione o protocolo e preencha as medidas necessarias.
      </Text>

      <View style={{ marginBottom: spacing.md }}>
        <SearchableSelect
          label="Protocolo de dobras"
          placeholder="Selecione o protocolo"
          options={SKINFOLD_PROTOCOL_OPTIONS}
          value={skinfoldProtocol}
          onChange={(value) => setSkinfoldProtocol(value as SkinfoldProtocolId)}
        />
      </View>

      <View style={styles.row}>
        <View style={styles.field}>
          <Input
            label="Idade"
            placeholder="30"
            keyboardType="numeric"
            value={skinfoldAge}
            onChangeText={setSkinfoldAge}
          />
        </View>
        <View style={styles.field}>
          <SearchableSelect
            label="Sexo"
            placeholder="Selecione"
            options={SEX_OPTIONS}
            value={skinfoldSex || undefined}
            onChange={(value) => setSkinfoldSex(value as 'masculino' | 'feminino')}
          />
        </View>
      </View>

      {skinfoldProtocol === 'guedes_2_criancas' && skinfoldSex === 'masculino' && (
        <View style={styles.row}>
          <View style={styles.field}>
            <SearchableSelect
              label="Maturacao"
              placeholder="Selecione"
              options={MATURACAO_OPTIONS}
              value={skinfoldMaturacao || undefined}
              onChange={(value) => setSkinfoldMaturacao(value as SkinfoldMaturacao)}
            />
          </View>
          <View style={styles.field}>
            <SearchableSelect
              label="Etnia"
              placeholder="Selecione"
              options={ETNIA_OPTIONS}
              value={skinfoldEtnia || undefined}
              onChange={(value) => setSkinfoldEtnia(value as SkinfoldEtnia)}
            />
          </View>
        </View>
      )}

      {(() => {
        const sexo = skinfoldSex || normalizeSex(selectedStudentProfile?.genero || null);
        const protocolDobras = getSkinfoldProtocolDobras(
          skinfoldProtocol,
          sexo || undefined
        );
        if (!protocolDobras.length) {
          const note =
            skinfoldProtocol === 'penrose_cote_2'
              ? sexo === 'feminino'
                ? 'Protocolo disponivel apenas para masculino.'
                : 'Use cintura (abdomen) e punho direito para o calculo.'
              : skinfoldProtocol === 'weltman_obesos_2'
              ? 'Use cintura (abdomen), peso e altura para o calculo.'
              : 'Este protocolo utiliza medidas de circunferencia.';
          return (
            <Card style={{ marginTop: spacing.md }}>
              <Text style={{ color: colors.textSecondary }}>
                {note} Preencha as medidas solicitadas acima.
              </Text>
            </Card>
          );
        }
        return protocolDobras.map((key, index) => {
          if (index % 2 !== 0) return null;
          const nextKey = protocolDobras[index + 1];
          return (
            <View key={key} style={styles.row}>
              <View style={styles.field}>
                <Input
                  label={SKINFOLD_FIELD_LABELS[key]}
                  placeholder="0"
                  keyboardType="numeric"
                  value={skinfolds[key]?.toString() || ''}
                  onChangeText={(value) =>
                    setSkinfolds((prev) => ({
                      ...prev,
                      [key]: Number(value.replace(',', '.')) || undefined,
                    }))
                  }
                />
              </View>
              {nextKey ? (
                <View style={styles.field}>
                  <Input
                    label={SKINFOLD_FIELD_LABELS[nextKey]}
                    placeholder="0"
                    keyboardType="numeric"
                    value={skinfolds[nextKey]?.toString() || ''}
                    onChangeText={(value) =>
                      setSkinfolds((prev) => ({
                        ...prev,
                        [nextKey]: Number(value.replace(',', '.')) || undefined,
                      }))
                    }
                  />
                </View>
              ) : (
                <View style={styles.field} />
              )}
            </View>
          );
        });
      })()}

      {(() => {
        const normalizedDobras = normalizeSkinfolds(skinfolds);
        const sexo = skinfoldSex || normalizeSex(selectedStudentProfile?.genero || null);
        const idade =
          parseNumeric(skinfoldAge) ||
          calculateAge(parseBirthday(selectedStudentProfile?.birthday)) ||
          undefined;
        const protocolDobras = getSkinfoldProtocolDobras(skinfoldProtocol, sexo || undefined);
        const totalDobras = getSkinfoldTotal(normalizedDobras, protocolDobras);
        const hasAllDobras = protocolDobras.length
          ? protocolDobras.every(
              (key) => typeof (normalizedDobras as any)[key] === 'number' && (normalizedDobras as any)[key] > 0
            )
          : true;
        const skinfoldStats = sexo
          ? calculateSkinfoldProtocol({
              protocolo: skinfoldProtocol,
              dobras: normalizedDobras,
              sexo,
              idade,
              peso,
              altura,
              circunferencias,
              maturacao: skinfoldMaturacao || undefined,
              etnia: skinfoldEtnia || undefined,
            })
          : null;

        if (!totalDobras && protocolDobras.length) {
          return (
            <Card style={{ marginTop: spacing.md }}>
              <Text style={{ color: colors.textSecondary }}>
                Preencha as dobras para ver o calculo automatico.
              </Text>
            </Card>
          );
        }

        return (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: spacing.sm }]}>
              Calculos do protocolo
            </Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              Protocolo: {getSkinfoldProtocolLabel(skinfoldProtocol)}
            </Text>
            {protocolDobras.length ? (
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                Somatorio: {totalDobras.toFixed(1)} mm
              </Text>
            ) : null}
            {!hasAllDobras ? (
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                Preencha todas as dobras para calcular o percentual.
              </Text>
            ) : skinfoldStats ? (
              <>
                {skinfoldStats.densidadeCorporal ? (
                  <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                    Densidade corporal: {skinfoldStats.densidadeCorporal}
                  </Text>
                ) : null}
                <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                  Percentual de gordura: {skinfoldStats.percentualGordura}%
                </Text>
                {skinfoldStats.percentualGorduraBrozek ? (
                  <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                    Percentual de gordura (Brozek): {skinfoldStats.percentualGorduraBrozek}%
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                Informe os dados necessarios para calcular o percentual.
              </Text>
            )}
          </Card>
        );
      })()}

      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: spacing.xl }]}>
        Testes fisicos
      </Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
        Adicione testes e resultados
      </Text>

      {physicalTests.length === 0 && (
        <Card style={{ marginBottom: spacing.md }}>
          <Text style={{ color: colors.textSecondary }}>Nenhum teste adicionado.</Text>
        </Card>
      )}

      {physicalTests.map((test, index) => (
        <Card key={test.id} style={{ marginBottom: spacing.md }}>
          <Input
            label={`Teste ${index + 1}`}
            placeholder="Ex: Flexao"
            value={test.nome}
            onChangeText={(value) =>
              setPhysicalTests((prev) => prev.map((item) => (item.id === test.id ? { ...item, nome: value } : item)))
            }
          />
          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Unidade"
                placeholder="Ex: reps"
                value={test.unidade || ''}
                onChangeText={(value) =>
                  setPhysicalTests((prev) => prev.map((item) => (item.id === test.id ? { ...item, unidade: value } : item)))
                }
              />
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Resultado</Text>
              <View style={styles.testResultOptions}>
                {TEST_RESULT_OPTIONS.map((option) => {
                  const isActive = physicalResults[test.id] === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.testResultOption,
                        {
                          borderColor: isActive ? colors.primary : colors.border,
                          backgroundColor: isActive ? colors.primary + '15' : colors.surface,
                        },
                      ]}
                      onPress={() =>
                        setPhysicalResults((prev) => ({ ...prev, [test.id]: option.id }))
                      }
                    >
                      <Text style={styles.testResultEmoji}>{option.emoji}</Text>
                      <Text
                        style={[
                          styles.testResultLabel,
                          { color: isActive ? colors.primary : colors.textSecondary },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => setPhysicalTests((prev) => prev.filter((item) => item.id !== test.id))}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error} />
            <Text style={[styles.removeButtonText, { color: colors.error }]}>Remover teste</Text>
          </TouchableOpacity>
        </Card>
      ))}

      <Button
        title="Adicionar teste"
        onPress={handleAddTest}
        style={{ marginTop: spacing.sm }}
      />
    </>
  );

  const renderPosturalForm = () => (
    <>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Data</Text>
      <DateInput
        label="Data da avaliacao"
        placeholder="DD/MM/AAAA"
        value={posturalDate}
        onChange={setPosturalDate}
      />

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Fotos posturais
      </Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
        Registre fotos de postura para analise
      </Text>

      <View style={styles.photosGrid}>
        {(['anterior', 'posterior', 'lateralDireita', 'lateralEsquerda'] as const).map((position) => (
          <TouchableOpacity
            key={position}
            style={[styles.photoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() =>
              showPhotoOptions((uri) =>
                setPosturePhotos((prev) => ({ ...prev, [position]: uri }))
              )
            }
          >
            {posturePhotos[position] ? (
              <Image source={{ uri: posturePhotos[position] }} style={styles.photoPreview} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={32} color={colors.textMuted} />
                <Text style={[styles.photoLabel, { color: colors.textMuted }]}>
                  {position === 'anterior' && 'Anterior'}
                  {position === 'posterior' && 'Posterior'}
                  {position === 'lateralDireita' && 'Lat. dir.'}
                  {position === 'lateralEsquerda' && 'Lat. esq.'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: spacing.xl }]}>
        Analise postural
      </Text>
      <Input
        label="Cabeca"
        placeholder="Observacoes da cabeca"
        value={postureAnalysis.cabeca || ''}
        onChangeText={(value) => setPostureAnalysis((prev) => ({ ...prev, cabeca: value }))}
      />
      <Input
        label="Ombros"
        placeholder="Observacoes dos ombros"
        value={postureAnalysis.ombros || ''}
        onChangeText={(value) => setPostureAnalysis((prev) => ({ ...prev, ombros: value }))}
      />
      <Input
        label="Coluna"
        placeholder="Observacoes da coluna"
        value={postureAnalysis.coluna || ''}
        onChangeText={(value) => setPostureAnalysis((prev) => ({ ...prev, coluna: value }))}
      />
      <Input
        label="Quadril"
        placeholder="Observacoes do quadril"
        value={postureAnalysis.quadril || ''}
        onChangeText={(value) => setPostureAnalysis((prev) => ({ ...prev, quadril: value }))}
      />
      <Input
        label="Joelhos"
        placeholder="Observacoes dos joelhos"
        value={postureAnalysis.joelhos || ''}
        onChangeText={(value) => setPostureAnalysis((prev) => ({ ...prev, joelhos: value }))}
      />
      <Input
        label="Pes"
        placeholder="Observacoes dos pes"
        value={postureAnalysis.pes || ''}
        onChangeText={(value) => setPostureAnalysis((prev) => ({ ...prev, pes: value }))}
      />
      <Input
        label="Observacoes gerais"
        placeholder="Comentarios adicionais"
        value={postureAnalysis.observacoes || ''}
        onChangeText={(value) => setPostureAnalysis((prev) => ({ ...prev, observacoes: value }))}
      />

      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: spacing.xl }]}>
        Recomendacoes
      </Text>
      {postureRecommendations.map((rec, index) => (
        <Input
          key={`posture-rec-${index}`}
          label={`Recomendacao ${index + 1}`}
          placeholder="Ex: Fortalecer core"
          value={rec}
          onChangeText={(value) =>
            setPostureRecommendations((prev) => prev.map((item, idx) => (idx === index ? value : item)))
          }
        />
      ))}
      <Button
        title="Adicionar recomendacao"
        onPress={() => handleAddRecommendation('postural')}
        style={{ marginTop: spacing.sm }}
      />
    </>
  );

  const renderPersonalizedForm = () => (
    <>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Prazo</Text>
      <DateInput
        label="Data limite para o aluno responder"
        placeholder="DD/MM/AAAA"
        value={personalDeadline}
        onChange={setPersonalDeadline}
      />

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Questionario
      </Text>
      {personalQuestions.length === 0 && (
        <Card style={{ marginBottom: spacing.md }}>
          <Text style={{ color: colors.textSecondary }}>Adicione perguntas para o aluno responder.</Text>
        </Card>
      )}

      {personalQuestions.map((question, index) => (
        <Card key={question.id} style={{ marginBottom: spacing.md }}>
          <Input
            label={`Pergunta ${index + 1}`}
            placeholder="Escreva a pergunta"
            value={question.pergunta}
            onChangeText={(value) =>
              setPersonalQuestions((prev) =>
                prev.map((item) => (item.id === question.id ? { ...item, pergunta: value } : item))
              )
            }
          />
          <SearchableSelect
            label="Tipo da pergunta"
            placeholder="Selecione o tipo"
            options={QUESTION_TYPE_OPTIONS}
            value={question.tipo}
            onChange={(value) =>
              setPersonalQuestions((prev) =>
                prev.map((item) =>
                  item.id === question.id
                    ? {
                        ...item,
                        tipo: value as EvaluationQuestion['tipo'],
                        opcoes: value === 'multipla_escolha' ? item.opcoes || [] : [],
                      }
                    : item
                )
              )
            }
          />

          {question.tipo === 'multipla_escolha' && (
            <Input
              label="Opcoes (separadas por virgula)"
              placeholder="Ex: Iniciante, Intermediario, Avancado"
              value={(question.opcoes || []).join(', ')}
              onChangeText={(value) =>
                setPersonalQuestions((prev) =>
                  prev.map((item) =>
                    item.id === question.id
                      ? {
                          ...item,
                          opcoes: value
                            .split(',')
                            .map((option) => option.trim())
                            .filter((option) => option.length > 0),
                        }
                      : item
                  )
                )
              }
            />
          )}
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => setPersonalQuestions((prev) => prev.filter((item) => item.id !== question.id))}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error} />
            <Text style={[styles.removeButtonText, { color: colors.error }]}>Remover pergunta</Text>
          </TouchableOpacity>
        </Card>
      ))}

      <Button title="Adicionar pergunta" onPress={handleAddQuestion} />

      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: spacing.xl }]}>
        Resultado
      </Text>
      <Input
        label="Resultado"
        placeholder="Resumo da avaliação"
        value={personalResultado}
        onChangeText={setPersonalResultado}
        multiline
        numberOfLines={3}
      />

      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: spacing.xl }]}>
        Recomendacoes
      </Text>
      {personalRecommendations.map((rec, index) => (
        <Input
          key={`personal-rec-${index}`}
          label={`Recomendacao ${index + 1}`}
          placeholder="Ex: Melhorar mobilidade"
          value={rec}
          onChangeText={(value) =>
            setPersonalRecommendations((prev) => prev.map((item, idx) => (idx === index ? value : item)))
          }
        />
      ))}
      <Button
        title="Adicionar recomendacao"
        onPress={() => handleAddRecommendation('personal')}
        style={{ marginTop: spacing.sm }}
      />
    </>
  );

  const renderForm = () => (
    <ScrollView
      style={[styles.formScroll, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.formContent,
        { paddingBottom: spacing.xl + spacing.lg + insets.bottom },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      nestedScrollEnabled
    >
      {renderStudentSelector()}

      {isPersonal && selectedType && ['fisica', 'personalizada', 'postural'].includes(selectedType) && (
        <Card style={styles.assistantCard}>
          <Text style={[styles.assistantTitle, { color: colors.text }]}>
            Assistente para avaliações
          </Text>
          <Text style={[styles.assistantSubtitle, { color: colors.textSecondary }]}>
            Descreva o que precisa para criar uma avaliação com a IA.
          </Text>
          <Input
            label="Prompt"
            placeholder="Ex: Avaliação física focada em condicionamento"
            value={assistantPrompt}
            onChangeText={setAssistantPrompt}
            multiline
            numberOfLines={3}
            icon="sparkles-outline"
            inputStyle={{ paddingVertical: spacing.sm, fontSize: 14 }}
          />
          <Button
            title="Abrir assistente"
            onPress={() => {
              const trimmed = assistantPrompt.trim();
              if (!trimmed) {
                showAlert('Assistente', 'Digite um prompt para gerar a avaliação.');
                return;
              }
              const selectedStudent = students.find((student) => student.id === selectedStudentId);
              const typeLabel = selectedType ? getEvaluationTypeLabel(selectedType).toLowerCase() : 'avaliacao';
              const parts = [`avaliacao ${typeLabel}`];
              if (selectedStudent?.nome) {
                parts.push(`para o aluno ${selectedStudent.nome}`);
              }
              const finalPrompt = `Crie ${parts.join(' ')}. ${trimmed}`;
              router.push(`/chat/ai?prompt=${encodeURIComponent(finalPrompt)}` as any);
            }}
            size="small"
            fullWidth
            disabled={!assistantPrompt.trim()}
          />
        </Card>
      )}

      {selectedType === 'online' && renderOnlineForm()}
      {selectedType === 'fisica' && renderPhysicalForm()}
      {selectedType === 'postural' && renderPosturalForm()}
      {selectedType === 'personalizada' && renderPersonalizedForm()}
      {isPersonal && selectedType && chargeableTypes.includes(selectedType) && (
        <Card style={{ marginTop: spacing.xl }}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Cobranca</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Defina o valor da cobrança para gerar depois de salvar.
          </Text>
          <Input
            label="Valor da cobrança (opcional)"
            placeholder="Ex: 150.00"
            keyboardType="numeric"
            value={chargeValue}
            onChangeText={setChargeValue}
          />
        </Card>
      )}
      <View style={styles.saveSection}>
        <Button
          title="Salvar avaliacao"
          onPress={handleSave}
          fullWidth
          size="large"
          loading={isSaving}
          disabled={isSaving}
        />
      </View>
    </ScrollView>
  );

  if (!isPersonal) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Nova avaliação</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={[styles.typeSelection, { justifyContent: 'center', alignItems: 'center' }]}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.warning} />
          <Text style={[styles.title, { color: colors.text, marginTop: spacing.lg }]}>
            Somente o personal pode criar avaliações.
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign: 'center' }]}>
            Fale com seu personal para agendar ou atualizar suas avaliações.
          </Text>
          <Button title="Voltar" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          style={[styles.container, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => (step === 'form' ? setStep('type') : router.back())}
              style={styles.backButton}
            >
              <Ionicons
                name={step === 'form' ? 'arrow-back' : 'close'}
                size={24}
                color={colors.text}
              />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {step === 'type' ? 'Nova avaliaÃ§Ã£o' : `AvaliaÃ§Ã£o ${getEvaluationTypeLabel(selectedType!)}`}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {step === 'type' ? (
            <View style={styles.typeSelection}>
              <Text style={[styles.title, { color: colors.text }]}>Tipo de avaliação</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Selecione o tipo de avaliação que deseja criar
              </Text>

              <View style={styles.typeGrid}>
                {EVALUATION_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type.id}
                    style={[styles.typeCard, { backgroundColor: colors.card }]}
                    onPress={() => handleSelectType(type.id)}
                  >
                    <View style={[styles.typeIconContainer, { backgroundColor: colors.primary + '20' }]}>
                      <Ionicons name={type.icon as any} size={32} color={colors.primary} />
                    </View>
                    <Text style={[styles.typeLabel, { color: colors.text }]}>{type.label}</Text>
                    <Text style={[styles.typeDescription, { color: colors.textSecondary }]}>{type.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            renderForm()
          )}

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
  typeSelection: {
    flex: 1,
    padding: spacing.base,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: spacing.xl,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  typeCard: {
    width: '47%',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  typeIconContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  typeDescription: {
    fontSize: 12,
    textAlign: 'center',
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    padding: spacing.base,
    paddingBottom: 120,
  },
  assistantCard: {
    marginBottom: spacing.lg,
  },
  assistantTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  assistantSubtitle: {
    fontSize: 12,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  sectionSubtitle: {
    fontSize: 14,
    marginBottom: spacing.md,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  photoBox: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  photoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoLabel: {
    fontSize: 12,
    marginTop: spacing.sm,
  },
  saveSection: {
    marginTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  testResultOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  testResultOption: {
    flex: 1,
    minHeight: 54,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  testResultEmoji: {
    fontSize: 18,
  },
  testResultLabel: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  field: {
    flex: 1,
  },
  removeButton: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  removeButtonText: {
    fontSize: 12,
  },
});
