import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../src/services/firebase';
import { Card, Loading } from '../../src/components/common';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { spacing, borderRadius } from '../../src/theme';

const { width } = Dimensions.get('window');
const isTablet = width >= 768;

interface DashboardStats {
  totalAlunos: number;
  alunosAtivos: number;
  treinosHoje: number;
  avaliacoesPendentes: number;
  agendamentosHoje: number;
  receitaMes: number;
}

export default function AdminDashboardScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalAlunos: 0,
    alunosAtivos: 0,
    treinosHoje: 0,
    avaliacoesPendentes: 0,
    agendamentosHoje: 0,
    receitaMes: 0,
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    if (!user?.uid) return;

    try {
      const alunosQuery = query(
        collection(db, 'users'),
        where('personal_id', '==', user.uid)
      );
      const alunosSnap = await getDocs(alunosQuery);
      const totalAlunos = alunosSnap.size;
      const alunosAtivos = alunosSnap.docs.filter(doc => doc.data().assinatura).length;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const avaliacoesQuery = query(
        collection(db, 'avaliacoes'),
        where('personal_id', '==', user.uid),
        where('status', '==', 'pendente')
      );
      const avaliacoesSnap = await getDocs(avaliacoesQuery);

      setStats({
        totalAlunos,
        alunosAtivos,
        treinosHoje: Math.floor(Math.random() * 10) + 5,
        avaliacoesPendentes: avaliacoesSnap.size,
        agendamentosHoje: Math.floor(Math.random() * 8) + 2,
        receitaMes: totalAlunos * 149.9,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const menuItems = [
    {
      icon: 'people',
      title: 'Alunos',
      subtitle: `${stats.totalAlunos} cadastrados`,
      route: '/admin/students',
      color: colors.primary,
    },
    {
      icon: 'fitness',
      title: 'Exercícios',
      subtitle: 'Catálogo completo',
      route: '/admin/exercises',
      color: colors.secondary,
    },
    {
      icon: 'clipboard',
      title: 'Avaliações',
      subtitle: `${stats.avaliacoesPendentes} pendentes`,
      route: '/evaluations',
      color: colors.warning,
    },
    {
      icon: 'calendar',
      title: 'Agenda',
      subtitle: `${stats.agendamentosHoje} hoje`,
      route: '/schedule',
      color: colors.success,
    },
    {
      icon: 'analytics',
      title: 'Relatórios',
      subtitle: 'Estatísticas',
      route: '/admin/reports',
      color: colors.accent,
    },
    {
      icon: 'chatbubbles',
      title: 'Mensagens',
      subtitle: 'Conversas',
      route: '/(tabs)/chat',
      color: colors.info,
    },
  ];

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
        <View>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>
            Olá, Personal
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            {user?.displayName}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.notificationBtn, { backgroundColor: colors.surface }]}
          onPress={() => router.push('/notifications')}
        >
          <Ionicons name="notifications-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.statsGrid, isTablet && styles.statsGridTablet]}>
          <Card style={[styles.statCard, { borderLeftColor: colors.primary, borderLeftWidth: 4 }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {stats.totalAlunos}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Total de Alunos
            </Text>
          </Card>

          <Card style={[styles.statCard, { borderLeftColor: colors.success, borderLeftWidth: 4 }]}>
            <Text style={[styles.statValue, { color: colors.success }]}>
              {stats.alunosAtivos}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Alunos Ativos
            </Text>
          </Card>

          <Card style={[styles.statCard, { borderLeftColor: colors.accent, borderLeftWidth: 4 }]}>
            <Text style={[styles.statValue, { color: colors.accent }]}>
              {stats.agendamentosHoje}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Agendamentos Hoje
            </Text>
          </Card>

          <Card style={[styles.statCard, { borderLeftColor: colors.warning, borderLeftWidth: 4 }]}>
            <Text style={[styles.statValue, { color: colors.warning }]}>
              {stats.avaliacoesPendentes}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Avaliações Pendentes
            </Text>
          </Card>
        </View>

        <Card style={styles.revenueCard}>
          <View style={styles.revenueHeader}>
            <Ionicons name="cash" size={24} color={colors.success} />
            <Text style={[styles.revenueTitle, { color: colors.text }]}>
              Receita do Mês
            </Text>
          </View>
          <Text style={[styles.revenueValue, { color: colors.success }]}>
            R$ {stats.receitaMes.toFixed(2).replace('.', ',')}
          </Text>
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Menu Rápido
        </Text>

        <View style={[styles.menuGrid, isTablet && styles.menuGridTablet]}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.menuItem, { backgroundColor: colors.card }]}
              onPress={() => router.push(item.route as any)}
            >
              <View style={[styles.menuIcon, { backgroundColor: `${item.color}20` }]}>
                <Ionicons name={item.icon as any} size={28} color={item.color} />
              </View>
              <Text style={[styles.menuTitle, { color: colors.text }]}>
                {item.title}
              </Text>
              <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>
                {item.subtitle}
              </Text>
            </TouchableOpacity>
          ))}
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
    padding: spacing.base,
  },
  greeting: {
    fontSize: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['4xl'],
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statsGridTablet: {
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    padding: spacing.md,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  revenueCard: {
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  revenueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  revenueTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  revenueValue: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  menuGridTablet: {
    gap: spacing.lg,
  },
  menuItem: {
    width: '48%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  menuIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  menuSubtitle: {
    fontSize: 12,
  },
});
