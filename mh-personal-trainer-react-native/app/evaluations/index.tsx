import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  KeyboardAvoidingView,
  TextInput,
} from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/hooks/useTheme';
import { Loading, Button } from '../../src/components/common';
import { EvaluationCard } from '../../src/components/evaluation/EvaluationCard';
import { spacing, borderRadius } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { PhysicalEvaluation, EvaluationType } from '../../src/types/evaluation';
import { fetchEvaluations, fetchEvaluationsForStudents, getEvaluationTypeLabel } from '../../src/services/evaluations';
import { firestoreService, Aluno } from '../../src/services/firestoreService';
import { SearchableSelect } from '../../src/components/common';

const FILTER_OPTIONS: { id: EvaluationType | null; label: string }[] = [
  { id: null, label: 'Todas' },
  { id: 'online', label: 'Online' },
  { id: 'personalizada', label: 'Personalizada' },
  { id: 'postural', label: 'Postural' },
  { id: 'fisica', label: 'Fisica' },
];

export default function EvaluationsListScreen() {
  const { colors } = useTheme();
  const { user, role } = useAuthStore();
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  const isPersonal = role === 'personal' || role === 'professor';

  const [evaluations, setEvaluations] = useState<PhysicalEvaluation[]>([]);
  const [filteredEvaluations, setFilteredEvaluations] = useState<PhysicalEvaluation[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<EvaluationType | null>(null);
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    typeof studentId === 'string' ? studentId : null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const studentOptions = students.map((student) => ({
    id: student.id,
    label: student.nome,
    description: student.email,
  }));

  useEffect(() => {
    if (!isPersonal || !user?.uid) return;

    const loadStudents = async () => {
      const alunos = await firestoreService.getAlunosDoPersonal(user.uid);
      setStudents(alunos);
      if (!selectedStudentId && alunos.length > 0) {
        setSelectedStudentId(alunos[0].id);
      }
    };

    void loadStudents();
  }, [isPersonal, user?.uid, selectedStudentId]);

  const loadEvaluations = useCallback(async () => {
    if (!user?.uid) {
      setIsLoading(false);
      return;
    }

    try {
      const result = isPersonal
        ? await fetchEvaluationsForStudents(
            selectedStudentId ? [selectedStudentId] : students.map((student) => student.id),
            selectedFilter || undefined
          )
        : await fetchEvaluations(user.uid, selectedFilter || undefined);

      if (result.error) {
        setError(result.error);
      } else {
        setEvaluations(result.data || []);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, isPersonal, selectedStudentId, students, selectedFilter]);

  useEffect(() => {
    void loadEvaluations();
  }, [loadEvaluations]);

  useEffect(() => {
    if (selectedFilter) {
      setFilteredEvaluations(evaluations.filter((evaluation) => evaluation.type === selectedFilter));
    } else {
      setFilteredEvaluations(evaluations);
    }
  }, [evaluations, selectedFilter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEvaluations();
    setRefreshing(false);
  }, [loadEvaluations]);

  const handleEvaluationPress = (evaluation: PhysicalEvaluation) => {
    router.push({
      pathname: '/evaluations/[id]',
      params: { id: evaluation.id, type: evaluation.type, userId: evaluation.userId },
    });
  };

  const handleCreateEvaluation = () => {
    if (!isPersonal) return;
    const targetStudent = selectedStudentId ? `?studentId=${selectedStudentId}` : '';
    router.push(`/evaluations/create${targetStudent}`);
  };

  const handleOpenAssistant = (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      showAlert('Assistente', 'Digite um prompt para gerar a avaliacao.');
      return;
    }

    const assistantTypes: EvaluationType[] = ['fisica', 'personalizada', 'postural'];
    const selectedStudent = students.find((student) => student.id === selectedStudentId);

    const typeLabel =
      selectedFilter && assistantTypes.includes(selectedFilter)
        ? getEvaluationTypeLabel(selectedFilter).toLowerCase()
        : null;

    const parts: string[] = [];
    if (typeLabel) parts.push(`avaliacao ${typeLabel}`);
    if (isPersonal && selectedStudent?.nome) parts.push(`para o aluno ${selectedStudent.nome}`);

    const prefix = parts.length ? `Crie ${parts.join(' ')}.` : '';
    const finalPrompt = prefix ? `${prefix} ${trimmed}` : trimmed;

    router.push(`/chat/ai?prompt=${encodeURIComponent(finalPrompt)}` as any);
  };

  const renderEmptyState = () => (
    <View style={[styles.emptyContainer, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
      <View style={[styles.emptyIconWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="clipboard-outline" size={30} color={colors.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Nenhuma avaliacao encontrada</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        {selectedFilter
          ? `Nao ha registros no filtro ${getEvaluationTypeLabel(selectedFilter)}.`
          : 'Quando houver novas avaliacoes, elas aparecerao aqui.'}
      </Text>
      {isPersonal ? (
        <TouchableOpacity
          style={[styles.emptyCta, { backgroundColor: colors.primary }]}
          onPress={handleCreateEvaluation}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.info} />
          <Text style={[styles.emptyCtaText, { color: colors.info }]}>Criar avaliacao</Text>
        </TouchableOpacity>
      ) : (
        <Text style={[styles.emptyHint, { color: colors.textMuted }]}>Somente o personal cria avaliacoes.</Text>
      )}
    </View>
  );

  const renderHeader = () => (
    <View style={styles.headerContent}>
      <LinearGradient
        colors={['#071A2D', '#10345A', '#1E679B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroGlowPrimary} />
        <View style={styles.heroGlowSecondary} />

        <View style={styles.heroRow}>
          <View style={styles.heroText}>
            <Text style={styles.heroEyebrow}>MH IA</Text>
            <Text style={[styles.title, { color: '#F4FBFF' }]}>Avaliacoes</Text>
            <Text style={[styles.heroSubtitle, { color: 'rgba(217,238,255,0.88)' }]}>
              Painel para evolucao fisica, postural e personalizada.
            </Text>
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatChip}>
                <Ionicons name="document-text-outline" size={13} color="#8ED6FF" />
                <Text style={styles.heroStatText}>{filteredEvaluations.length} registros</Text>
              </View>
              <View style={styles.heroStatChip}>
                <Ionicons name="funnel-outline" size={13} color="#8ED6FF" />
                <Text style={styles.heroStatText}>
                  {selectedFilter ? getEvaluationTypeLabel(selectedFilter) : 'Todos os tipos'}
                </Text>
              </View>
            </View>
          </View>

          {isPersonal ? (
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleCreateEvaluation}
              activeOpacity={0.9}
            >
              <Ionicons name="add" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>
      </LinearGradient>

      <View
        style={[
          styles.filtersCard,
          { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg, borderColor: colors.border },
        ]}
      >
        {isPersonal && students.length > 0 ? (
          <View style={styles.studentSelect}>
            <SearchableSelect
              label="Aluno"
              placeholder="Selecione um aluno"
              options={studentOptions}
              value={selectedStudentId}
              onChange={setSelectedStudentId}
            />
          </View>
        ) : null}

        <FlatList
          horizontal
          data={FILTER_OPTIONS}
          keyExtractor={(item) => item.id || 'all'}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => {
            const isSelected = selectedFilter === item.id;
            return (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected ? colors.primary + '24' : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setSelectedFilter(item.id)}
                activeOpacity={0.85}
              >
                {isSelected ? <Ionicons name="checkmark-circle" size={14} color={colors.primary} /> : null}
                <Text style={[styles.filterChipText, { color: isSelected ? colors.primary : colors.textSecondary }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {isPersonal ? <AssistantPromptCard onSubmit={handleOpenAssistant} /> : null}

      {error ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.error + '20', borderColor: colors.error + '55' }]}>
          <Ionicons name="alert-circle" size={20} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      ) : null}
    </View>
  );

  if (isLoading) {
    return (
      <LinearGradient
        colors={[colors.primaryBackground, colors.alternate]}
        start={{ x: 0.85, y: 0 }}
        end={{ x: 0.15, y: 1 }}
        style={styles.container}
      >
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
          <Loading />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.85, y: 0 }}
      end={{ x: 0.15, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView style={styles.container} behavior="height" keyboardVerticalOffset={0}>
          <FlatList
            data={filteredEvaluations}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            renderItem={({ item }) => <EvaluationCard evaluation={item} onPress={() => handleEvaluationPress(item)} />}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={renderHeader}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            ListEmptyComponent={renderEmptyState}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function AssistantPromptCard({ onSubmit }: { onSubmit: (prompt: string) => void }) {
  const { colors } = useTheme();
  const [prompt, setPrompt] = useState('');

  const handlePress = () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      showAlert('Assistente', 'Digite um prompt para gerar a avaliacao.');
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <View style={[styles.assistantCard, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}> 
      <View style={styles.assistantHeader}>
        <View style={[styles.assistantIconWrap, { backgroundColor: colors.primary + '1A' }]}> 
          <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
        </View>
        <Text style={[styles.assistantTitle, { color: colors.text }]}>Assistente para avaliacoes</Text>
      </View>

      <Text style={[styles.assistantSubtitle, { color: colors.textSecondary }]}> 
        Descreva o perfil do aluno e a IA monta uma avaliacao guiada.
      </Text>

      <View style={[styles.promptInputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
        <TextInput
          placeholder="Ex.: avaliacao postural para iniciante com dor lombar"
          placeholderTextColor={colors.textMuted}
          value={prompt}
          onChangeText={setPrompt}
          multiline
          numberOfLines={3}
          style={[styles.promptInput, { color: colors.text }]}
          textAlignVertical="top"
        />
      </View>

      <Button
        title="Abrir assistente"
        onPress={handlePress}
        size="small"
        fullWidth
        disabled={!prompt.trim()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContent: {
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
  },
  heroCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(174,226,255,0.34)',
    overflow: 'hidden',
    padding: spacing.lg,
  },
  heroGlowPrimary: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    right: -70,
    top: -64,
    backgroundColor: 'rgba(116,209,255,0.22)',
  },
  heroGlowSecondary: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    left: -40,
    bottom: -45,
    backgroundColor: 'rgba(113,167,255,0.22)',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroText: {
    flex: 1,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: 'rgba(193,229,255,0.9)',
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  heroStatsRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  heroStatChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(167,221,255,0.28)',
    backgroundColor: 'rgba(9,32,54,0.45)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  heroStatText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#D8EEFF',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtersCard: {
    padding: spacing.md,
    borderWidth: 1,
  },
  studentSelect: {
    paddingBottom: spacing.md,
  },
  filterList: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  filterChip: {
    borderWidth: 1,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.lg,
  },
  emptyIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  emptyCta: {
    marginTop: spacing.lg,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyCtaText: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyHint: {
    marginTop: spacing.md,
    fontSize: 12,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  errorText: {
    fontSize: 14,
    flex: 1,
  },
  assistantCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  assistantIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  assistantSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  promptInputWrap: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  promptInput: {
    minHeight: 72,
    fontSize: 14,
  },
});
