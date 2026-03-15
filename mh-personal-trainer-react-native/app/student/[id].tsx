import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { formatMetricWithSuffix } from '@utils/workoutMetrics';
import { useTheme } from '../../src/hooks/useTheme';
import { Card, AvatarStack, Loading, Button } from '../../src/components/common';
import { useAuth } from '../../src/hooks/useAuth';
import { firestoreService } from '../../src/services/firestoreService';
import { fetchUserWorkouts } from '../../src/services/workouts';
import { fetchEvaluations } from '../../src/services/evaluations';
import { fetchPaymentsForUser } from '../../src/services/financeiro';
import { UserWorkout } from '../../src/types/workout';
import { PhysicalEvaluation } from '../../src/types/evaluation';
import { PaymentRecord } from '../../src/types/finance';
import { getWorkoutStatusPresentation } from '../../src/utils/workoutStatus';
import { spacing, borderRadius } from '../../src/theme';

export default function StudentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, typography } = useTheme();
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<any | null>(null);
  const [workouts, setWorkouts] = useState<UserWorkout[]>([]);
  const [evaluations, setEvaluations] = useState<PhysicalEvaluation[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      const doc = await firestoreService.getUserDocument(id);
      setStudent(doc);
      const [workoutsResult, evalResult] = await Promise.all([
        fetchUserWorkouts(id, false),
        fetchEvaluations(id),
      ]);
      setWorkouts(workoutsResult.data || []);
      setEvaluations(evalResult.data || []);
      const paymentResult = await fetchPaymentsForUser(id);
      setPayments(paymentResult.data || []);
      setLoading(false);
    };
    load();
  }, [id]);

  const pendingPayments = payments.filter((payment) => !payment.pago);
  const pendingTotal = pendingPayments.reduce((sum, item) => sum + (item.valorDaCombranca || 0), 0);
  const totalWorkouts = workouts.length;
  const totalEvaluations = evaluations.length;
  const isActive = !student?.acessoSuspenso;
  const isPersonal = role === 'personal' || role === 'professor';

  const formatLastActive = () => {
    if (!student?.lastActiveTime) return 'Sem atividade recente';
    return student.lastActiveTime.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatBirthday = (birthday?: string) => {
    if (!birthday) return null;
    if (birthday.includes('/')) return birthday;
    const parsed = new Date(birthday);
    if (Number.isNaN(parsed.getTime())) return birthday;
    return parsed.toLocaleDateString('pt-BR');
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
        <Loading />
      </SafeAreaView>
    );
  }

  if (!student) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
            Aluno não encontrado.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleToggleStatus = () => {
    if (!id) return;
    const nextActive = !isActive;
    const actionLabel = nextActive ? 'Ativar aluno' : 'Desativar aluno';
    showAlert(
      actionLabel,
      nextActive
        ? 'O aluno voltara a ter acesso completo ao app.'
        : 'O aluno ficara sem acesso ao app ate reativacao.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: actionLabel,
          style: nextActive ? 'default' : 'destructive',
          onPress: async () => {
            try {
              setIsUpdatingStatus(true);
              await firestoreService.updateStudentStatus(
                id,
                nextActive,
                !nextActive && isPersonal && user?.uid
                  ? {
                      actorRole: 'personal',
                      personalId: user.uid,
                      personalName: user.displayName,
                    }
                  : undefined
              );
              setStudent((prev: any) =>
                prev ? { ...prev, acessoSuspenso: !nextActive } : prev
              );
            } catch (error: any) {
              showAlert('Erro', error?.message || 'Nao foi possivel atualizar o status.');
            } finally {
              setIsUpdatingStatus(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Detalhes do aluno</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.profileCard}>
          <View style={styles.profileRow}>
            <AvatarStack
              primarySource={student.photoUrl}
              primaryName={student.displayName}
              secondarySource={student.personalPhotoUrl}
              secondaryName={student.displayName}
              size="large"
            />
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.text }]}>
                {student.displayName || 'Aluno'}
              </Text>
              <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>
                {student.email}
              </Text>
              <Text style={[styles.profileMeta, { color: colors.textSecondary }]}>
                Ultimo online: {formatLastActive()}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.chatButton, { backgroundColor: `${colors.primary}1A` }]}
            onPress={() => router.push(`/chat/${id}` as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        </Card>

        <Card style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View>
              <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>
                Status do aluno
              </Text>
              <View style={styles.statusBadgeRow}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: (isActive ? colors.success : colors.error) + '20' },
                  ]}
                >
                  <Text style={[styles.statusBadgeText, { color: isActive ? colors.success : colors.error }]}>
                    {isActive ? 'Ativo' : 'Inativo'}
                  </Text>
                </View>
              </View>
            </View>
            <Button
              title={isActive ? 'Desativar aluno' : 'Ativar aluno'}
              onPress={handleToggleStatus}
              size="small"
              variant={isActive ? 'outline' : 'primary'}
              loading={isUpdatingStatus}
              disabled={isUpdatingStatus}
            />
          </View>
        </Card>

        <Card style={styles.profileDetailsCard}>
          <Text style={[styles.profileDetailsTitle, { color: colors.text }]}>Perfil do aluno</Text>

          {student?.birthday ? (
            <View style={styles.profileInfoRow}>
              <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.profileInfoLabel, { color: colors.textSecondary }]}>Aniversario:</Text>
              <Text style={[styles.profileInfoValue, { color: colors.text }]}>
                {formatBirthday(student.birthday)}
              </Text>
            </View>
          ) : null}

          {student?.phoneNumber ? (
            <View style={styles.profileInfoRow}>
              <Ionicons name="call-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.profileInfoLabel, { color: colors.textSecondary }]}>Telefone:</Text>
              <Text style={[styles.profileInfoValue, { color: colors.text }]}>{student.phoneNumber}</Text>
            </View>
          ) : null}

          {student?.peso || student?.altura ? (
            <View style={styles.metricsRow}>
              {student?.peso ? (
                <View style={[styles.metricPill, { backgroundColor: colors.secondaryBackground }]}>
                  <Text style={[styles.metricValue, { color: colors.text }]}>{student.peso}</Text>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Peso (kg)</Text>
                </View>
              ) : null}
              {student?.altura ? (
                <View style={[styles.metricPill, { backgroundColor: colors.secondaryBackground }]}>
                  <Text style={[styles.metricValue, { color: colors.text }]}>{student.altura}</Text>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Altura (cm)</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {student?.objetivoNoApp ? (
            <View style={styles.profileTextBlock}>
              <Text style={[styles.profileTextLabel, { color: colors.textSecondary }]}>Objetivo</Text>
              <Text style={[styles.profileTextValue, { color: colors.text }]}>{student.objetivoNoApp}</Text>
            </View>
          ) : null}

          {student?.experiencia ? (
            <View style={styles.profileTextBlock}>
              <Text style={[styles.profileTextLabel, { color: colors.textSecondary }]}>Experiencia</Text>
              <Text style={[styles.profileTextValue, { color: colors.text }]}>{student.experiencia}</Text>
            </View>
          ) : null}

          {student?.limitacao ? (
            <View style={styles.profileTextBlock}>
              <Text style={[styles.profileTextLabel, { color: colors.textSecondary }]}>Limitacoes</Text>
              <Text style={[styles.profileTextValue, { color: colors.text }]}>{student.limitacao}</Text>
            </View>
          ) : null}

          {!student?.birthday &&
          !student?.phoneNumber &&
          !student?.peso &&
          !student?.altura &&
          !student?.objetivoNoApp &&
          !student?.experiencia &&
          !student?.limitacao ? (
            <Text style={[styles.emptyProfileText, { color: colors.textSecondary }]}>
              O aluno ainda nao preencheu dados de perfil.
            </Text>
          ) : null}
        </Card>

        <Card style={styles.financeCard}>
          <View style={styles.financeRow}>
            <View>
              <Text style={[styles.financeLabel, { color: colors.textSecondary }]}>
                Pendencias
              </Text>
              <Text style={[styles.financeValue, { color: colors.primary }]}>
                {pendingTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </Text>
              <Text style={[styles.financeMeta, { color: colors.textMuted }]}>
                {pendingPayments.length} cobranca(s) pendente(s)
              </Text>
            </View>
            {pendingPayments.length > 0 ? (
              <Button
                title="Cobrar aluno"
                onPress={() => router.push(`/financeiro/personal?studentId=${id}` as any)}
                size="small"
              />
            ) : (
              <View style={styles.noPendingBadge}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                <Text style={[styles.noPendingText, { color: colors.success }]}>
                  Sem pendencias
                </Text>
              </View>
            )}
          </View>
        </Card>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}>
            <Text style={[styles.statValue, { color: colors.primaryText }]}>{totalWorkouts}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Treinos</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}>
            <Text style={[styles.statValue, { color: colors.primaryText }]}>{totalEvaluations}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Avaliacoes</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Button
            title="Criar treino"
            onPress={() => router.push(`/workout/create?studentId=${id}` as any)}
            size="small"
            style={styles.actionButton}
          />
          <Button
            title="Nova avaliação"
            onPress={() => router.push(`/evaluations/create?studentId=${id}` as any)}
            size="small"
            style={styles.actionButton}
          />
          <Button
            title="Financeiro"
            onPress={() => router.push(`/financeiro/personal?studentId=${id}` as any)}
            size="small"
            style={styles.actionButton}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Treinos</Text>
            <TouchableOpacity onPress={() => router.push(`/(tabs)/workouts?studentId=${id}` as any)}>
              <Text style={[styles.sectionLink, { color: colors.primary }]}>Ver todos</Text>
            </TouchableOpacity>
          </View>
          {workouts.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Nenhum treino cadastrado.
            </Text>
          ) : (
            workouts.slice(0, 3).map((workout) => {
              const workoutStatus = getWorkoutStatusPresentation(workout);
              const hasMissingExercises = workoutStatus.status === 'partial';

              return (
                <TouchableOpacity
                  key={workout.id}
                  style={styles.itemCardTouchable}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      pathname: '/workout/[id]',
                      params: { id: workout.id, studentId: id },
                    })
                  }
                >
                  <Card style={styles.itemCard}>
                    <View style={styles.itemHeader}>
                      <View style={styles.itemHeaderText}>
                        <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>
                          {workout.nomeDoTreino}
                          {hasMissingExercises ? (
                            <Text style={{ color: colors.warning }}> !</Text>
                          ) : null}
                        </Text>
                        <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
                          {workout.obsInstrucao || 'Treino personalizado'}
                        </Text>
                        {workoutStatus.helperText ? (
                          <Text style={[styles.itemHelperText, { color: colors.warning }]}>
                            {workoutStatus.helperText}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </View>
                    <View style={styles.exerciseList}>
                      {(workout.treino || []).slice(0, 3).map((exercise, index) => {
                        const seriesLabel =
                          formatMetricWithSuffix(workout.seriesRep?.[index], ' series') || '0 series';
                        return (
                          <Text
                            key={`${workout.id}-${index}`}
                            style={[styles.exerciseLine, { color: colors.textSecondary }]}
                          >
                            {exercise} - {seriesLabel}
                          </Text>
                        );
                      })}
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Avaliacoes</Text>
            <TouchableOpacity onPress={() => router.push(`/evaluations?studentId=${id}` as any)}>
              <Text style={[styles.sectionLink, { color: colors.primary }]}>Ver todas</Text>
            </TouchableOpacity>
          </View>
          {evaluations.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Nenhuma avaliação registrada.
            </Text>
          ) : (
            evaluations.slice(0, 3).map((evaluation) => (
              <TouchableOpacity
                key={`${evaluation.type}-${evaluation.id}`}
                style={styles.itemCardTouchable}
                activeOpacity={0.85}
                onPress={() => router.push(`/evaluations/${evaluation.id}?type=${evaluation.type}&userId=${id}` as any)}
              >
                <Card style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <View style={styles.itemHeaderText}>
                      <Text style={[styles.itemTitle, { color: colors.text }]}>
                        {evaluation.type.toUpperCase()}
                      </Text>
                      <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]}>
                        {evaluation.date.toLocaleDateString('pt-BR')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </View>
                </Card>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  profileCard: {
    padding: spacing.md,
  },
  profileRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  profileInfo: {
    flex: 1,
  },
  chatButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
  },
  profileEmail: {
    fontSize: 13,
    marginTop: 4,
  },
  profileMeta: {
    fontSize: 12,
    marginTop: spacing.sm,
  },
  statusCard: {
    padding: spacing.md,
  },
  profileDetailsCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  profileDetailsTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  profileInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  profileInfoLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  profileInfoValue: {
    fontSize: 12,
    flexShrink: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricPill: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  metricLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  profileTextBlock: {
    gap: 2,
  },
  profileTextLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  profileTextValue: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyProfileText: {
    fontSize: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  statusLabel: {
    fontSize: 12,
  },
  statusBadgeRow: {
    marginTop: spacing.xs,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  financeCard: {
    padding: spacing.md,
  },
  financeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  financeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  financeValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  financeMeta: {
    fontSize: 11,
    marginTop: 4,
  },
  noPendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  noPendingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  actionsRow: {
    gap: spacing.sm,
  },
  actionButton: {
    marginBottom: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionLink: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
  },
  itemCard: {
    padding: spacing.md,
  },
  itemCardTouchable: {
    marginBottom: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemHeaderText: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemSubtitle: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  itemHelperText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  exerciseList: {
    marginTop: spacing.sm,
    gap: 4,
  },
  exerciseLine: {
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
});
