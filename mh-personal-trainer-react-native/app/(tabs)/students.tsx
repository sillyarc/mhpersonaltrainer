import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useAuthStore } from '../../src/store/authStore';
import { firestoreService } from '../../src/services/firestoreService';
import { AvatarStack, Card, Loading } from '../../src/components/common';
import { spacing, borderRadius } from '../../src/theme';

type StatusFilter = 'all' | 'active' | 'pending' | 'inactive';
type FocusFilter = 'all' | 'contact_today' | 'churn_risk';

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

const parseFocusFilter = (value?: string | string[]): FocusFilter => {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (normalized === 'contact_today' || normalized === 'churn_risk') {
    return normalized;
  }
  return 'all';
};

const getDaysSince = (date?: Date) => {
  if (!date) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
};

const matchesFocusFilter = (student: StudentItem, filter: FocusFilter) => {
  if (filter === 'all') return true;
  const inactivityDays = getDaysSince(student.lastActivity);
  if (filter === 'contact_today') {
    return inactivityDays === null || inactivityDays > 7;
  }
  return student.status === 'inactive' || inactivityDays === null || inactivityDays > 30;
};

export default function StudentsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { padding } = useResponsive();
  const { user, role } = useAuthStore();
  const { focus } = useLocalSearchParams<{ focus?: string | string[] }>();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const [selectedFocus, setSelectedFocus] = useState<FocusFilter>(parseFocusFilter(focus));

  const isPersonal = role === 'personal' || role === 'professor' || role === 'admin';

  useEffect(() => {
    const nextFocus = parseFocusFilter(focus);
    setSelectedFocus(nextFocus);
    setSelectedStatus('all');
    setSearchQuery('');
  }, [focus]);

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
      status:
        aluno.status === 'ativo'
          ? 'active'
          : aluno.status === 'inativo'
            ? 'inactive'
            : 'pending',
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
    if (!date) return t('students.noActivity');
    const diffDays = getDaysSince(date) ?? 0;
    if (diffDays <= 0) return t('students.today');
    if (diffDays === 1) return t('students.yesterday');
    return t('students.daysAgo', { count: diffDays });
  };

  const filteredStudents = useMemo(() => {
    const queryValue = searchQuery.trim().toLowerCase();
    const filtered = students.filter((student) => {
      const matchesSearch =
        !queryValue ||
        student.name.toLowerCase().includes(queryValue) ||
        student.email.toLowerCase().includes(queryValue);
      const matchesStatus = selectedStatus === 'all' || student.status === selectedStatus;
      const matchesFocus = matchesFocusFilter(student, selectedFocus);
      return matchesSearch && matchesStatus && matchesFocus;
    });

    if (selectedFocus === 'all') {
      return filtered;
    }

    return filtered.sort((a, b) => {
      const aDays = getDaysSince(a.lastActivity);
      const bDays = getDaysSince(b.lastActivity);
      const aRank = aDays === null ? Number.MAX_SAFE_INTEGER : aDays;
      const bRank = bDays === null ? Number.MAX_SAFE_INTEGER : bDays;
      return bRank - aRank;
    });
  }, [students, searchQuery, selectedStatus, selectedFocus]);

  const stats = useMemo(() => {
    const total = students.length;
    const active = students.filter((student) => student.status === 'active').length;
    const pending = students.filter((student) => student.status === 'pending').length;
    const inactive = students.filter((student) => student.status === 'inactive').length;
    return { total, active, pending, inactive };
  }, [students]);

  const getStatusLabel = (status: StatusFilter) => {
    if (status === 'active') return t('students.statusActive');
    if (status === 'inactive') return t('students.statusInactive');
    return t('students.statusPending');
  };

  const getStatusColor = (status: StatusFilter) => {
    if (status === 'active') return colors.success;
    if (status === 'inactive') return colors.error;
    return colors.warning;
  };

  const statusFilters: Array<{ id: StatusFilter; label: string }> = [
    { id: 'all', label: t('students.all') },
    { id: 'active', label: t('students.active') },
    { id: 'pending', label: t('students.pending') },
    { id: 'inactive', label: t('students.inactive') },
  ];
  const focusFilters: Array<{ id: FocusFilter; label: string }> = [
    { id: 'all', label: t('students.all') },
    { id: 'contact_today', label: t('students.contactToday') },
    { id: 'churn_risk', label: t('students.churnRisk') },
  ];

  const focusSummary =
    selectedFocus === 'contact_today'
      ? t('students.focusContactSummary')
      : selectedFocus === 'churn_risk'
        ? t('students.focusChurnSummary')
        : t('students.focusDefaultSummary');

  const handleOpenDetails = (studentId: string) => {
    router.push(`/student/${studentId}`);
  };

  const renderStudent = ({ item }: { item: StudentItem }) => (
    <Card style={[styles.studentCard, { borderLeftColor: getStatusColor(item.status) }]} shadow>
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
              <Text style={[styles.studentName, { color: colors.primaryText }]}>{item.name}</Text>
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
                style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]}
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
              {t('students.workoutsCount', { count: item.workoutsCompleted })}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={16} color={colors.secondaryText} />
            <Text style={[styles.metaText, { color: colors.secondaryText }]}>
              {t('students.lastWorkout', { value: formatLastActivity(item.lastActivity) })}
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.primary + '20' }]}
            onPress={() => router.push(`/(tabs)/workouts?studentId=${item.id}`)}
          >
            <Ionicons name="barbell-outline" size={18} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.primary }]}>
              {t('students.openWorkouts')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.tertiary + '20' }]}
            onPress={() => router.push(`/evaluations/create?studentId=${item.id}`)}
          >
            <Ionicons name="clipboard-outline" size={18} color={colors.tertiary} />
            <Text style={[styles.actionText, { color: colors.tertiary }]}>
              {t('students.evaluate')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.warning + '20' }]}
            onPress={() => router.push(`/financeiro/personal?studentId=${item.id}`)}
          >
            <Ionicons name="wallet-outline" size={18} color={colors.warning} />
            <Text style={[styles.actionText, { color: colors.warning }]}>
              {t('students.finance')}
            </Text>
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
          <Text style={[styles.title, { color: colors.primaryText }]}>{t('students.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
            {t('students.subtitle')}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.infoBanner,
          { marginHorizontal: padding, backgroundColor: colors.secondaryBackground },
        ]}
      >
        <Ionicons
          name={selectedFocus === 'all' ? 'information-circle-outline' : 'funnel-outline'}
          size={18}
          color={colors.primary}
        />
        <View style={styles.infoTextGroup}>
          <Text style={[styles.infoText, { color: colors.secondaryText }]}>{focusSummary}</Text>
          <Text style={[styles.infoSubtext, { color: colors.secondaryText }]}>
            {selectedFocus === 'all'
              ? t('students.openProfileHint')
              : t('students.filteredCount', { count: filteredStudents.length })}
          </Text>
        </View>
      </View>

      <View style={[styles.statsRow, { paddingHorizontal: padding }]}>
        {[
          { label: t('students.total'), value: stats.total, color: colors.primary },
          { label: t('students.active'), value: stats.active, color: colors.success },
          { label: t('students.pending'), value: stats.pending, color: colors.warning },
          { label: t('students.inactive'), value: stats.inactive, color: colors.error },
        ].map((stat) => (
          <View
            key={stat.label}
            style={[styles.statCard, { backgroundColor: colors.secondaryBackground }]}
          >
            <Text style={[styles.statLabel, { color: colors.secondaryText }]}>{stat.label}</Text>
            <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.searchContainer, { paddingHorizontal: padding }]}>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.secondaryBackground, borderColor: colors.border },
          ]}
        >
          <Ionicons name="search-outline" size={20} color={colors.secondaryText} />
          <TextInput
            style={[styles.searchInput, { color: colors.primaryText }]}
            placeholder={t('students.searchPlaceholder')}
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

      <View style={[styles.filtersRow, { paddingHorizontal: padding }]}>
        {focusFilters.map((filter) => (
          <TouchableOpacity
            key={filter.id}
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  selectedFocus === filter.id ? colors.primary : colors.secondaryBackground,
              },
            ]}
            onPress={() => setSelectedFocus(filter.id)}
          >
            <Text
              style={[
                styles.filterText,
                { color: selectedFocus === filter.id ? colors.info : colors.secondaryText },
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
              {t('students.empty')}
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
  infoTextGroup: {
    flex: 1,
    gap: 2,
  },
  infoSubtext: {
    fontSize: 12,
    opacity: 0.9,
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
    fontSize: 15,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  studentCard: {
    marginBottom: spacing.md,
    borderLeftWidth: 4,
  },
  studentTouch: {
    gap: spacing.md,
  },
  studentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  identityText: {
    flex: 1,
  },
  studentName: {
    fontSize: 18,
    fontWeight: '700',
  },
  studentEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  headerMeta: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaRow: {
    gap: spacing.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: spacing.md,
  },
});
