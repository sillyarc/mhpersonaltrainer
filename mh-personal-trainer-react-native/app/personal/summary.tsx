import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useDashboardData } from '../../src/hooks/useDashboardData';
import { Card, Loading, AvatarStack } from '../../src/components/common';
import { spacing, borderRadius } from '../../src/theme';

type StatusFilter = 'todos' | 'ativo' | 'inativo' | 'pendente';
type ActivityFilter = 'todos' | 'ok' | 'atencao' | 'critico';
type StudentFocusFilter = 'contact_today' | 'churn_risk';

const normalize = (value?: string) => (value || '').toLowerCase().trim();

const daysSince = (value?: Date) => {
  if (!value) return null;
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - start.getTime()) / 86400000);
};

const statusLabel = (status: 'ativo' | 'inativo' | 'pendente') => {
  if (status === 'ativo') return 'Ativo';
  if (status === 'inativo') return 'Inativo';
  return 'Pendente';
};

const getStudentSignal = (aluno: { status: 'ativo' | 'inativo' | 'pendente'; ultimoTreino?: Date }) => {
  const inactivityDays = daysSince(aluno.ultimoTreino);
  if (aluno.status !== 'ativo') {
    return { label: 'Base inativa', tone: 'critico' as const };
  }
  if (inactivityDays === null || inactivityDays > 30) {
    return { label: 'Sem treino 30+ dias', tone: 'critico' as const };
  }
  if (inactivityDays > 7) {
    return { label: 'Sem treino 7+ dias', tone: 'atencao' as const };
  }
  return { label: 'Em dia', tone: 'ok' as const };
};

const formatDate = (value?: Date) => {
  if (!value) return 'Sem registro';
  return value.toLocaleDateString('pt-BR');
};

export default function PersonalSummaryScreen() {
  const { colors } = useTheme();
  const dashboard = useDashboardData();
  const { stats, alunos, loading, error } = dashboard;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('todos');

  const totalAlunos = stats.totalAlunos ?? alunos.length;
  const alunosAtivos = stats.alunosAtivos ?? alunos.filter((aluno) => aluno.status === 'ativo').length;
  const alunosInativos = alunos.filter((aluno) => aluno.status === 'inativo').length;
  const alunosPendentes = alunos.filter((aluno) => aluno.status === 'pendente').length;
  const treinosHoje = stats.treinosHoje ?? 0;
  const semEmail = alunos.filter((aluno) => !normalize(aluno.email).includes('@')).length;

  const startOfMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, []);

  const novosNoMes = alunos.filter((aluno) => aluno.alunoDesde && aluno.alunoDesde >= startOfMonth).length;
  const alunosPrecisaContatoHoje = useMemo(
    () =>
      alunos.filter((aluno) => {
        const inactivityDays = daysSince(aluno.ultimoTreino);
        return inactivityDays === null || inactivityDays > 7;
      }),
    [alunos]
  );
  const alunosEmRiscoEvasao = useMemo(
    () =>
      alunos.filter((aluno) => {
        const inactivityDays = daysSince(aluno.ultimoTreino);
        return aluno.status === 'inativo' || inactivityDays === null || inactivityDays > 30;
      }),
    [alunos]
  );
  const alunosSemTreino7 = alunosPrecisaContatoHoje.length;
  const alunosSemTreino30 = alunos.filter((aluno) => {
    const inactivityDays = daysSince(aluno.ultimoTreino);
    return inactivityDays === null || inactivityDays > 30;
  }).length;
  const taxaAtivos = totalAlunos > 0 ? Math.round((alunosAtivos / totalAlunos) * 100) : 0;
  const taxaAtividadeRecente =
    totalAlunos > 0 ? Math.max(0, Math.round(((totalAlunos - alunosSemTreino7) / totalAlunos) * 100)) : 0;

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      }).format(new Date()),
    []
  );

  const priorityStudents = useMemo(() => {
    const score = (aluno: (typeof alunos)[number]) => {
      const inactivityDays = daysSince(aluno.ultimoTreino);
      let points = 0;
      if (aluno.status !== 'ativo') points += 100;
      if (inactivityDays === null) points += 80;
      else if (inactivityDays > 30) points += 70;
      else if (inactivityDays > 14) points += 45;
      else if (inactivityDays > 7) points += 20;
      if (!normalize(aluno.email).includes('@')) points += 8;
      return points;
    };
    return [...alunos].sort((a, b) => score(b) - score(a)).slice(0, 6);
  }, [alunos]);

  const filteredStudents = useMemo(() => {
    const query = normalize(search);
    return alunos.filter((aluno) => {
      const bySearch =
        !query || normalize(aluno.nome).includes(query) || normalize(aluno.email).includes(query);
      const byStatus = statusFilter === 'todos' || aluno.status === statusFilter;
      const byActivity =
        activityFilter === 'todos' || getStudentSignal(aluno).tone === activityFilter;
      return bySearch && byStatus && byActivity;
    });
  }, [activityFilter, alunos, search, statusFilter]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Loading />
      </SafeAreaView>
    );
  }

  const handleOpenStudentFocus = (focus: StudentFocusFilter) => {
    router.push(`/students?focus=${focus}`);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Resumo do personal</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <Card style={{ ...styles.alertCard, backgroundColor: colors.error + '1A' }}>
            <Text style={[styles.alertText, { color: colors.error }]}>{error}</Text>
          </Card>
        ) : null}

        <Card style={{ ...styles.heroCard, backgroundColor: colors.secondaryBackground }}>
          <Text style={[styles.heroEyebrow, { color: colors.primary }]}>Visao diaria</Text>
          <Text style={[styles.heroTitle, { color: colors.text }]}>O que precisa da sua atencao hoje?</Text>
          <Text style={[styles.heroText, { color: colors.textSecondary }]}>
            {todayLabel}. Priorize alunos sem treino recente, base inativa e entradas novas para manter retencao.
          </Text>
          <View style={styles.heroActions}>
            <TouchableOpacity
              style={[styles.heroAction, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '50' }]}
              onPress={() => router.push('/students')}
            >
              <Text style={[styles.heroActionText, { color: colors.primary }]}>Gerir alunos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.heroAction, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
              onPress={() => router.push('/schedule')}
            >
              <Text style={[styles.heroActionText, { color: colors.text }]}>Abrir agenda</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.heroAction, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => router.push('/workout/create')}
            >
              <Text style={[styles.heroActionText, { color: '#FFFFFF' }]}>Criar treino</Text>
            </TouchableOpacity>
          </View>
        </Card>

        <View style={styles.kpiGrid}>
          <Card style={{ ...styles.kpiCard, backgroundColor: colors.secondaryBackground }}>
            <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Total de alunos</Text>
            <Text style={[styles.kpiValue, { color: colors.text }]}>{totalAlunos}</Text>
            <Text style={[styles.kpiHint, { color: colors.textMuted }]}>{alunosAtivos} ativos na base</Text>
          </Card>
          <Card style={{ ...styles.kpiCard, backgroundColor: colors.secondaryBackground }}>
            <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Treinos hoje</Text>
            <Text style={[styles.kpiValue, { color: colors.tertiary }]}>{treinosHoje}</Text>
            <Text style={[styles.kpiHint, { color: colors.textMuted }]}>{alunosSemTreino7} sem atividade 7+ dias</Text>
          </Card>
          <Card style={{ ...styles.kpiCard, backgroundColor: colors.secondaryBackground }}>
            <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Base ativa</Text>
            <Text style={[styles.kpiValue, { color: colors.success }]}>{taxaAtivos}%</Text>
            <Text style={[styles.kpiHint, { color: colors.textMuted }]}>{alunosInativos} inativos e {alunosPendentes} pendentes</Text>
          </Card>
          <Card style={{ ...styles.kpiCard, backgroundColor: colors.secondaryBackground }}>
            <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Entrada no mes</Text>
            <Text style={[styles.kpiValue, { color: colors.primary }]}>{novosNoMes}</Text>
            <Text style={[styles.kpiHint, { color: colors.textMuted }]}>{semEmail} sem email valido</Text>
          </Card>
        </View>

        <View style={styles.questionGrid}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => handleOpenStudentFocus('contact_today')}>
            <Card style={{ ...styles.questionCard, backgroundColor: colors.secondaryBackground }}>
              <View style={styles.questionHeader}>
                <Text style={[styles.questionTitle, { color: colors.textSecondary }]}>Quem precisa de contato hoje?</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              <Text style={[styles.questionValue, { color: colors.text }]}>{alunosSemTreino7} alunos</Text>
              <Text style={[styles.questionHint, { color: colors.textMuted }]}>Sem treino recente (7+ dias).</Text>
              <Text style={[styles.questionAction, { color: colors.primary }]}>Toque para ver a lista</Text>
            </Card>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={() => handleOpenStudentFocus('churn_risk')}>
            <Card style={{ ...styles.questionCard, backgroundColor: colors.secondaryBackground }}>
              <View style={styles.questionHeader}>
                <Text style={[styles.questionTitle, { color: colors.textSecondary }]}>Onde esta o risco de evasao?</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              <Text style={[styles.questionValue, { color: colors.text }]}>{alunosEmRiscoEvasao.length} alunos</Text>
              <Text style={[styles.questionHint, { color: colors.textMuted }]}>Sem treino 30+ dias ou inativo.</Text>
              <Text style={[styles.questionAction, { color: colors.primary }]}>Toque para ver a lista</Text>
            </Card>
          </TouchableOpacity>
          <Card style={{ ...styles.questionCard, backgroundColor: colors.secondaryBackground }}>
            <Text style={[styles.questionTitle, { color: colors.textSecondary }]}>Como esta o ritmo da base?</Text>
            <Text style={[styles.questionValue, { color: colors.text }]}>{taxaAtividadeRecente}% em ritmo</Text>
            <Text style={[styles.questionHint, { color: colors.textMuted }]}>Atividade nos ultimos 7 dias.</Text>
          </Card>
        </View>

        <Card style={{ ...styles.panelCard, backgroundColor: colors.secondaryBackground }}>
          <View style={styles.panelHead}>
            <View>
              <Text style={[styles.panelTitle, { color: colors.text }]}>Prioridades de acompanhamento</Text>
              <Text style={[styles.panelHint, { color: colors.textSecondary }]}>Alunos ordenados por risco de inatividade.</Text>
            </View>
          </View>
          {priorityStudents.length ? (
            <View style={styles.priorityList}>
              {priorityStudents.map((aluno) => {
                const signal = getStudentSignal(aluno);
                const inactivityDays = daysSince(aluno.ultimoTreino);
                return (
                  <View key={aluno.id} style={[styles.priorityItem, { borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.priorityName, { color: colors.text }]}>{aluno.nome}</Text>
                      <Text style={[styles.priorityMeta, { color: colors.textSecondary }]}>
                        {inactivityDays === null ? 'Sem historico de treino' : `${inactivityDays} dias sem treino`}
                      </Text>
                    </View>
                    <View style={styles.priorityBadges}>
                      <Text
                        style={[
                          styles.badge,
                          styles[`badgeStatus${aluno.status}` as keyof typeof styles],
                        ]}
                      >
                        {statusLabel(aluno.status)}
                      </Text>
                      <Text
                        style={[
                          styles.badge,
                          styles[`badgeSignal${signal.tone}` as keyof typeof styles],
                        ]}
                      >
                        {signal.label}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Nenhum aluno para priorizar no momento.</Text>
          )}
        </Card>

        <Card style={{ ...styles.panelCard, backgroundColor: colors.secondaryBackground }}>
          <View style={styles.panelHead}>
            <View>
              <Text style={[styles.panelTitle, { color: colors.text }]}>Composicao da base</Text>
              <Text style={[styles.panelHint, { color: colors.textSecondary }]}>Distribuicao por status e atividade.</Text>
            </View>
          </View>
          {[
            { label: 'Ativos', value: alunosAtivos },
            { label: 'Inativos', value: alunosInativos },
            { label: 'Pendentes', value: alunosPendentes },
            { label: 'Sem treino 30+ dias', value: alunosSemTreino30 },
          ].map((item) => {
            const width = totalAlunos ? (item.value / totalAlunos) * 100 : 0;
            return (
              <View key={item.label} style={styles.barRow}>
                <Text style={[styles.barLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.barFill, { width: `${width}%`, backgroundColor: colors.primary }]} />
                </View>
                <Text style={[styles.barValue, { color: colors.text }]}>{item.value}</Text>
              </View>
            );
          })}
        </Card>

        <Card style={{ ...styles.panelCard, backgroundColor: colors.secondaryBackground }}>
          <View style={styles.panelHead}>
            <View>
              <Text style={[styles.panelTitle, { color: colors.text }]}>Base completa de alunos</Text>
              <Text style={[styles.panelHint, { color: colors.textSecondary }]}>Filtre por status e atividade para priorizar o atendimento.</Text>
            </View>
            <Text style={[styles.totalText, { color: colors.textSecondary }]}>
              {filteredStudents.length} de {alunos.length}
            </Text>
          </View>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nome ou email"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          />

          <View style={styles.filterGroup}>
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {(['todos', 'ativo', 'inativo', 'pendente'] as StatusFilter[]).map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.filterChip,
                    {
                      borderColor: statusFilter === value ? colors.primary : colors.border,
                      backgroundColor: statusFilter === value ? colors.primary + '22' : colors.background,
                    },
                  ]}
                  onPress={() => setStatusFilter(value)}
                >
                  <Text style={[styles.filterChipText, { color: statusFilter === value ? colors.primary : colors.textSecondary }]}>
                    {value === 'todos' ? 'Todos' : statusLabel(value)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.filterGroup}>
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Sinal de atividade</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {([
                { id: 'todos', label: 'Todos' },
                { id: 'ok', label: 'Em dia' },
                { id: 'atencao', label: 'Atencao' },
                { id: 'critico', label: 'Critico' },
              ] as Array<{ id: ActivityFilter; label: string }>).map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.filterChip,
                    {
                      borderColor: activityFilter === item.id ? colors.primary : colors.border,
                      backgroundColor: activityFilter === item.id ? colors.primary + '22' : colors.background,
                    },
                  ]}
                  onPress={() => setActivityFilter(item.id)}
                >
                  <Text style={[styles.filterChipText, { color: activityFilter === item.id ? colors.primary : colors.textSecondary }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {filteredStudents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={36} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Nenhum aluno encontrado com esses filtros.</Text>
            </View>
          ) : (
            filteredStudents.map((aluno) => {
              const signal = getStudentSignal(aluno);
              return (
                <View key={aluno.id} style={[styles.studentRow, { borderColor: colors.border }]}>
                  <AvatarStack
                    primarySource={aluno.photoUrl}
                    primaryName={aluno.nome}
                    secondarySource={aluno.personalPhotoUrl}
                    secondaryName={aluno.nome}
                    size="small"
                  />
                  <View style={styles.studentInfo}>
                    <Text style={[styles.alunoName, { color: colors.text }]}>{aluno.nome}</Text>
                    <Text style={[styles.alunoEmail, { color: colors.textSecondary }]}>
                      {normalize(aluno.email).includes('@') ? aluno.email : 'Nao informado'}
                    </Text>
                    <Text style={[styles.studentMeta, { color: colors.textMuted }]}>
                      Ultimo treino: {formatDate(aluno.ultimoTreino)}
                    </Text>
                  </View>
                  <View style={styles.priorityBadges}>
                    <Text style={[styles.badge, styles[`badgeStatus${aluno.status}` as keyof typeof styles]]}>
                      {statusLabel(aluno.status)}
                    </Text>
                    <Text style={[styles.badge, styles[`badgeSignal${signal.tone}` as keyof typeof styles]]}>
                      {signal.label}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Alunos recentes</Text>
        {alunos.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="people-outline" size={40} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Nenhum aluno vinculado.</Text>
          </Card>
        ) : (
          [...alunos]
            .sort((a, b) => (b.alunoDesde?.getTime?.() || 0) - (a.alunoDesde?.getTime?.() || 0))
            .slice(0, 6)
            .map((aluno) => (
            <Card key={aluno.id} style={styles.listCard}>
              <View style={styles.alunoRow}>
                <AvatarStack
                  primarySource={aluno.photoUrl}
                  primaryName={aluno.nome}
                  secondarySource={aluno.personalPhotoUrl}
                  secondaryName={aluno.nome}
                  size="small"
                />
                <View style={styles.alunoInfo}>
                  <Text style={[styles.alunoName, { color: colors.text }]}>{aluno.nome}</Text>
                  <Text style={[styles.alunoEmail, { color: colors.textSecondary }]}>{aluno.email}</Text>
                </View>
              </View>
            </Card>
            ))
        )}
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
    padding: spacing.base,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
  alertCard: {
    borderRadius: borderRadius.lg,
  },
  alertText: {
    fontSize: 13,
    fontWeight: '600',
  },
  heroCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 25,
  },
  heroText: {
    fontSize: 13,
    lineHeight: 18,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  heroAction: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  heroActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kpiCard: {
    width: '48%',
    minHeight: 120,
    borderRadius: borderRadius.lg,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  kpiHint: {
    fontSize: 11,
    lineHeight: 15,
  },
  questionGrid: {
    gap: spacing.sm,
  },
  questionCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  questionTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  questionValue: {
    fontSize: 21,
    fontWeight: '700',
  },
  questionHint: {
    fontSize: 12,
  },
  questionAction: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  panelCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  panelHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  panelHint: {
    fontSize: 12,
    marginTop: 3,
  },
  totalText: {
    fontSize: 12,
    fontWeight: '600',
  },
  priorityList: {
    gap: spacing.sm,
  },
  priorityItem: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  priorityName: {
    fontSize: 14,
    fontWeight: '700',
  },
  priorityMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  priorityBadges: {
    alignItems: 'flex-end',
    gap: 6,
  },
  badge: {
    fontSize: 10,
    fontWeight: '700',
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  badgeStatusativo: {
    backgroundColor: '#DCFCE7',
    color: '#166534',
  },
  badgeStatusinativo: {
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
  },
  badgeStatuspendente: {
    backgroundColor: '#FEF3C7',
    color: '#92400E',
  },
  badgeSignalok: {
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
  },
  badgeSignalatencao: {
    backgroundColor: '#FEF3C7',
    color: '#92400E',
  },
  badgeSignalcritico: {
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
  },
  barRow: {
    gap: 6,
  },
  barLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  barTrack: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: borderRadius.full,
  },
  barValue: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  filterGroup: {
    gap: spacing.xs,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  filterRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  studentRow: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  studentInfo: {
    flex: 1,
  },
  studentMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  listCard: {
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  alunoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  alunoInfo: {
    flex: 1,
  },
  alunoName: {
    fontSize: 14,
    fontWeight: '600',
  },
  alunoEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyCard: {
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
