import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useAuthStore } from '../../src/store/authStore';
import { firestoreService } from '../../src/services/firestoreService';
import { AvatarStack, Card, Loading } from '../../src/components/common';
import { spacing, borderRadius } from '../../src/theme';

type StatusFilter = 'all' | 'active' | 'pending' | 'inactive';

interface StudentItem {
  id: string;
  name: string;
  email: string;
  photoUrl?: string;
  personalPhotoUrl?: string;
  status: StatusFilter;
  lastActivity?: Date;
  workoutsCompleted: number;
}

export default function StudentsScreen() {
  const { colors } = useTheme();
  const { padding } = useResponsive();
  const { user, role } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');

  const isPersonal = role === 'personal' || role === 'professor' || role === 'admin';

  const loadStudents = useCallback(async () => {
    if (!user?.uid || !isPersonal) {
      setStudents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const alunos = await firestoreService.getAlunosDoPersonal(user.uid);
    const mapped: StudentItem[] = alunos.map((aluno) => ({
      id: aluno.id,
      name: aluno.nome,
      email: aluno.email,
      photoUrl: aluno.photoUrl,
      personalPhotoUrl: aluno.personalPhotoUrl,
      status: aluno.status === 'ativo' ? 'active' : aluno.status === 'inativo' ? 'inactive' : 'pending',
      lastActivity: aluno.ultimoTreino,
      workoutsCompleted: aluno.treinosConcluidos || 0,
    }));
    setStudents(mapped);
    setLoading(false);
  }, [user?.uid, isPersonal]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const formatLastActivity = (date?: Date) => {
    if (!date) return 'Sem atividade';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Hoje';
    if (diffDays === 1) return 'Ontem';
    return `${diffDays} dias`;
  };

  const filteredStudents = useMemo(() => {
    const queryValue = searchQuery.trim().toLowerCase();
    return students.filter((student) => {
      const matchesSearch =
        !queryValue ||
        student.name.toLowerCase().includes(queryValue) ||
        student.email.toLowerCase().includes(queryValue);
      const matchesStatus = selectedStatus === 'all' || student.status === selectedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [students, searchQuery, selectedStatus]);

  const stats = useMemo(() => {
    const total = students.length;
    const active = students.filter((student) => student.status === 'active').length;
    const pending = students.filter((student) => student.status === 'pending').length;
    const inactive = students.filter((student) => student.status === 'inactive').length;
    return { total, active, pending, inactive };
  }, [students]);

  const getStatusLabel = (status: StatusFilter) => {
    if (status === 'active') return 'Ativo';
    if (status === 'inactive') return 'Inativo';
    return 'Pendente';
  };

  const getStatusColor = (status: StatusFilter) => {
    if (status === 'active') return colors.success;
    if (status === 'inactive') return colors.error;
    return colors.warning;
  };

  const statusFilters: Array<{ id: StatusFilter; label: string }> = [
    { id: 'all', label: 'Todos' },
    { id: 'active', label: 'Ativos' },
    { id: 'pending', label: 'Pendentes' },
    { id: 'inactive', label: 'Inativos' },
  ];

  const handleOpenDetails = (studentId: string) => {
    router.push(`/student/${studentId}`);
  };

  const renderStudent = ({ item }: { item: StudentItem }) => (
    <Card
      style={[styles.studentCard, { borderLeftColor: getStatusColor(item.status) }]}
      shadow
    >
      <TouchableOpacity onPress={() => handleOpenDetails(item.id)} style={styles.studentTouch}>
        <View style={styles.studentHeader}>
          <View style={styles.identityRow}>
            <AvatarStack
              primarySource={item.photoUrl}
              primaryName={item.name}
              secondarySource={item.personalPhotoUrl}
              secondaryName={item.name}
              size="medium"
            />
            <View style={styles.identityText}>
              <Text style={[styles.studentName, { color: colors.primaryText }]}>
                {item.name}
              </Text>
              <Text style={[styles.studentEmail, { color: colors.secondaryText }]}>
                {item.email}
              </Text>
            </View>
          </View>
          <View style={styles.headerMeta}>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: getStatusColor(item.status) + '20',
                  borderRadius: borderRadius.full,
                },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: getStatusColor(item.status) },
                ]}
              />
              <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                {getStatusLabel(item.status)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="barbell-outline" size={16} color={colors.secondaryText} />
            <Text style={[styles.metaText, { color: colors.secondaryText }]}>
              {item.workoutsCompleted} treinos
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={16} color={colors.secondaryText} />
            <Text style={[styles.metaText, { color: colors.secondaryText }]}>
              Ultimo treino: {formatLastActivity(item.lastActivity)}
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.primary + '20' }]}
            onPress={() => router.push(`/(tabs)/workouts?studentId=${item.id}`)}
          >
            <Ionicons name="barbell-outline" size={18} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.primary }]}>Treinos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.tertiary + '20' }]}
            onPress={() => router.push(`/evaluations/create?studentId=${item.id}`)}
          >
            <Ionicons name="clipboard-outline" size={18} color={colors.tertiary} />
            <Text style={[styles.actionText, { color: colors.tertiary }]}>Avaliar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.warning + '20' }]}
            onPress={() => router.push(`/financeiro/personal?studentId=${item.id}`)}
          >
            <Ionicons name="wallet-outline" size={18} color={colors.warning} />
            <Text style={[styles.actionText, { color: colors.warning }]}>Financeiro</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Card>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
        <Loading />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
      <View style={[styles.header, { paddingHorizontal: padding }]}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.primaryText }]}>Meus Alunos</Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
            Os alunos aparecem aqui quando vinculam seu codigo.
          </Text>
        </View>
      </View>

      <View style={[styles.infoBanner, { marginHorizontal: padding, backgroundColor: colors.secondaryBackground }]}>
        <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
        <Text style={[styles.infoText, { color: colors.secondaryText }]}>
          Compartilhe seu codigo no perfil para o aluno vincular.
        </Text>
      </View>

      <View style={[styles.statsRow, { paddingHorizontal: padding }]}>
        {[
          { label: 'Total', value: stats.total, color: colors.primary },
          { label: 'Ativos', value: stats.active, color: colors.success },
          { label: 'Pendentes', value: stats.pending, color: colors.warning },
          { label: 'Inativos', value: stats.inactive, color: colors.error },
        ].map((stat) => (
          <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.secondaryBackground }]}>
            <Text style={[styles.statLabel, { color: colors.secondaryText }]}>{stat.label}</Text>
            <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.searchContainer, { paddingHorizontal: padding }]}>
        <View style={[styles.searchBar, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={20} color={colors.secondaryText} />
          <TextInput
            style={[styles.searchInput, { color: colors.primaryText }]}
            placeholder="Buscar aluno..."
            placeholderTextColor={colors.secondaryText}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <View style={[styles.filtersRow, { paddingHorizontal: padding }]}>
        {statusFilters.map((filter) => (
          <TouchableOpacity
            key={filter.id}
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  selectedStatus === filter.id ? colors.primary : colors.secondaryBackground,
              },
            ]}
            onPress={() => setSelectedStatus(filter.id)}
          >
            <Text
              style={[
                styles.filterText,
                { color: selectedStatus === filter.id ? colors.info : colors.secondaryText },
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredStudents}
        renderItem={renderStudent}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { padding }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color={colors.secondaryText} />
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
              Nenhum aluno encontrado
            </Text>
          </View>
        }
      />
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: spacing.xs,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  infoText: {
    fontSize: 13,
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  statCard: {
    flexBasis: '47%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  searchContainer: {
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: spacing['4xl'],
  },
  studentCard: {
    marginBottom: spacing.md,
    borderLeftWidth: 4,
  },
  studentTouch: {
    gap: spacing.sm,
  },
  studentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  identityText: {
    flex: 1,
  },
  headerMeta: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  studentName: {
    fontSize: 18,
    fontWeight: '700',
  },
  studentEmail: {
    fontSize: 13,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
  },
  emptyText: {
    fontSize: 16,
    marginTop: spacing.md,
  },
});
