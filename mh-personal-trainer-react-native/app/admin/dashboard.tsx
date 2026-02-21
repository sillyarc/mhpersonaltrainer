import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAdminDashboardData } from '../../src/hooks/useAdminDashboardData';
import { Card, Loading, Button } from '../../src/components/common';
import { spacing, borderRadius } from '../../src/theme';

export default function AdminDashboardScreen() {
  const { colors } = useTheme();
  const { overview, loading, error, refresh } = useAdminDashboardData(true);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Loading />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Admin dashboard</Text>
        <TouchableOpacity onPress={refresh}>
          <Ionicons name="refresh" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <Card style={[styles.errorCard, { backgroundColor: colors.error + '15' }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </Card>
        ) : null}

        <View style={styles.summaryGrid}>
          <Card style={[styles.summaryCard, { borderLeftColor: colors.primary }]}>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>
              {overview?.totalUsers ?? 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Usuarios</Text>
          </Card>
          <Card style={[styles.summaryCard, { borderLeftColor: colors.warning }]}>
            <Text style={[styles.summaryValue, { color: colors.warning }]}>
              {overview?.totalAdmins ?? 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Admins</Text>
          </Card>
          <Card style={[styles.summaryCard, { borderLeftColor: colors.success }]}>
            <Text style={[styles.summaryValue, { color: colors.success }]}>
              {overview?.totalPersonals ?? 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Personals</Text>
          </Card>
          <Card style={[styles.summaryCard, { borderLeftColor: colors.secondary }]}>
            <Text style={[styles.summaryValue, { color: colors.secondary }]}>
              {overview?.totalAlunos ?? 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Alunos</Text>
          </Card>
        </View>

        <View style={styles.actionsRow}>
          <Button
            title="Todos os usuarios"
            onPress={() => router.push('/admin/users')}
            variant="primary"
            fullWidth
          />
          <Button
            title="Gerenciar alunos"
            onPress={() => router.push('/admin/manage-students')}
            variant="outline"
            fullWidth
          />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Usuarios recentes</Text>
        {overview?.recentUsers?.length ? (
          overview.recentUsers.map((user) => (
            <Card key={user.id} style={styles.recentCard}>
              <View style={styles.recentRow}>
                <View style={styles.recentInfo}>
                  <Text style={[styles.recentName, { color: colors.text }]}>
                    {user.name}
                  </Text>
                  <Text style={[styles.recentEmail, { color: colors.textSecondary }]}>
                    {user.email}
                  </Text>
                </View>
                <View style={[styles.roleBadge, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.roleText, { color: colors.textSecondary }]}>
                    {user.role}
                  </Text>
                </View>
              </View>
            </Card>
          ))
        ) : (
          <Card style={styles.emptyCard}>
            <Ionicons name="people-outline" size={40} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Nenhum usuario encontrado.
            </Text>
          </Card>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['4xl'],
  },
  errorCard: {
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: 14,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryCard: {
    width: '48%',
    borderLeftWidth: 4,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  actionsRow: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  recentCard: {
    marginBottom: spacing.sm,
  },
  recentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentInfo: {
    flex: 1,
  },
  recentName: {
    fontSize: 15,
    fontWeight: '600',
  },
  recentEmail: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  roleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  roleText: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
  },
});
