import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useAuthStore } from '../../src/store/authStore';
import { useAuth } from '../../src/hooks/useAuth';
import {
  countPendingNotificationsForUser,
  fetchNotificationsForUser,
  isNotificationUnreadForUser,
  markNotificationsAsRead,
  respondToSecurityLoginAlert,
} from '../../src/services/notificationCenter';
import { setBadgeCount } from '../../src/services/notifications';
import { NotificationItem } from '../../src/types/notification';

function getIconByType(type?: string): keyof typeof Ionicons.glyphMap {
  const value = (type || '').toLowerCase();
  if (value.includes('segur')) return 'shield-checkmark-outline';
  if (value.includes('treino')) return 'barbell-outline';
  if (value.includes('mensagem')) return 'chatbubble-outline';
  if (value.includes('sistema')) return 'settings-outline';
  if (value.includes('avaliacao')) return 'calendar-outline';
  if (value.includes('alerta')) return 'warning-outline';
  return 'notifications-outline';
}

function getBadgeColor(type?: string, colors?: any): string {
  const value = (type || '').toLowerCase();
  if (value.includes('segur')) return colors.warning || colors.primary;
  if (value.includes('treino')) return colors.primary;
  if (value.includes('mensagem')) return colors.secondary;
  if (value.includes('sistema')) return colors.customColor3;
  if (value.includes('avaliacao')) return colors.tertiary;
  if (value.includes('alerta')) return colors.error;
  return colors.primary;
}

export default function NotificationsScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { padding, columns, isDesktop } = useResponsive();
  const { user, role } = useAuthStore();
  const { resetPassword, logout } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const syncNotificationBadge = useCallback(async (targetUserId?: string) => {
    if (!targetUserId) {
      await setBadgeCount(0);
      return;
    }

    const result = await countPendingNotificationsForUser(targetUserId);
    await setBadgeCount(Math.max(0, Number(result.data || 0)));
  }, []);

  const loadNotifications = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'silent') => {
      if (!user?.uid) {
        setNotifications([]);
        await setBadgeCount(0);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (mode === 'initial') {
        setLoading(true);
      } else if (mode === 'refresh') {
        setRefreshing(true);
      }
      try {
        const result = await fetchNotificationsForUser(user.uid);
        const loadedNotifications = result.data || [];
        setNotifications(loadedNotifications);

        const unreadNotifications = loadedNotifications.filter((item) =>
          isNotificationUnreadForUser(item, user.uid)
        );

        if (unreadNotifications.length > 0) {
          await markNotificationsAsRead(
            user.uid,
            unreadNotifications.map((item) => ({ id: item.id, paraTodos: item.paraTodos }))
          );

          const readIds = new Set(unreadNotifications.map((item) => item.id));
          setNotifications((prev) =>
            prev.map((item) =>
              readIds.has(item.id)
                ? {
                    ...item,
                    unread: false,
                    readBy: Array.from(new Set([...(item.readBy || []), user.uid])),
                  }
                : item
            )
          );
        }

        await syncNotificationBadge(user.uid);
      } finally {
        if (mode === 'initial') {
          setLoading(false);
        } else if (mode === 'refresh') {
          setRefreshing(false);
        }
      }
    },
    [syncNotificationBadge, user?.uid]
  );

  useEffect(() => {
    void loadNotifications('initial');
  }, [loadNotifications]);

  const isAdmin = role === 'admin';

  const emptyText = useMemo(() => {
    if (loading) return 'Carregando notificacoes...';
    return 'Nenhuma notificacao encontrada';
  }, [loading]);

  const handleNotificationPress = (item: NotificationItem) => {
    if (item.tipo && item.tipo.toLowerCase().includes('treino') && item.treinoId) {
      if (item.workoutUserId && user?.uid && item.workoutUserId !== user.uid) {
        router.push({
          pathname: '/workout/[id]',
          params: { id: item.treinoId, studentId: item.workoutUserId },
        });
      } else {
        router.push({
          pathname: '/start-workout',
          params: { workoutId: item.treinoId },
        });
      }
      return;
    }

    if (item.tipo && item.tipo.toLowerCase().includes('avali') && item.evaluationId && item.evaluationType) {
      router.push({
        pathname: '/evaluations/[id]',
        params: {
          id: item.evaluationId,
          type: item.evaluationType,
          ...(item.evaluationUserId ? { userId: item.evaluationUserId } : {}),
        },
      });
      return;
    }
  };

  const applySecurityDecision = useCallback(
    async (item: NotificationItem, decision: 'confirmed' | 'denied') => {
      if (!user?.uid) return;
      setActionLoadingId(item.id);
      try {
        await respondToSecurityLoginAlert({
          notificationId: item.id,
          userId: user.uid,
          decision,
        });

        setNotifications((prev) =>
          prev.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  unread: false,
                  readBy: Array.from(new Set([...(row.readBy || []), user.uid])),
                  securityStatus: decision,
                  securityResolvedAt: new Date(),
                }
              : row
          )
        );

        await syncNotificationBadge(user.uid);

        if (decision === 'denied') {
          if (user.email) {
            await resetPassword(user.email);
          }
          await logout();
          Alert.alert(
            'Conta protegida',
            'Login marcado como suspeito. Enviamos reset de senha e encerramos sua sessao.'
          );
          router.replace('/(auth)/login');
        }
      } catch (error) {
        console.error('Erro ao responder alerta de seguranca:', error);
        Alert.alert('Erro', 'Nao foi possivel salvar sua resposta agora.');
      } finally {
        setActionLoadingId(null);
      }
    },
    [logout, resetPassword, syncNotificationBadge, user?.email, user?.uid]
  );

  const handleSecurityDecision = useCallback(
    (item: NotificationItem, decision: 'confirmed' | 'denied') => {
      if (decision === 'denied') {
        Alert.alert(
          'Confirmar alerta',
          'Voce quer marcar este login como suspeito? Vamos encerrar sua sessao e enviar reset de senha.',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Nao fui eu',
              style: 'destructive',
              onPress: () => {
                void applySecurityDecision(item, decision);
              },
            },
          ]
        );
        return;
      }
      void applySecurityDecision(item, decision);
    },
    [applySecurityDecision]
  );

  const renderNotification = ({ item }: { item: NotificationItem }) => (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.secondaryBackground,
          borderRadius: borderRadius.lg,
          padding: spacing.md,
          marginBottom: spacing.sm,
          width: isDesktop ? `${100 / columns - 2}%` : '100%',
        },
      ]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={item.treinoId || item.evaluationId ? 0.7 : 1}
    >
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.iconBadge,
            {
              backgroundColor: getBadgeColor(item.tipo, colors) + '20',
              borderRadius: borderRadius.full,
            },
          ]}
        >
          <Ionicons name={getIconByType(item.tipo)} size={20} color={getBadgeColor(item.tipo, colors)} />
        </View>
        <Text
          style={[{ color: colors.primaryText, flex: 1 }, typography.titleSmall]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {item.titulo}
        </Text>
      </View>
      <Text
        style={[{ color: colors.secondaryText }, typography.bodySmall]}
        numberOfLines={3}
        ellipsizeMode="tail"
      >
        {item.descricao}
      </Text>
      {item.securityEvent ? (
        <View style={[styles.securityBox, { marginTop: spacing.sm }]}>
          {item.securityStatus === 'pending' || !item.securityStatus ? (
            <View style={styles.securityActions}>
              <TouchableOpacity
                style={[
                  styles.securityButton,
                  {
                    borderRadius: borderRadius.full,
                    borderColor: colors.primary,
                    backgroundColor: 'transparent',
                  },
                ]}
                disabled={actionLoadingId === item.id}
                onPress={() => handleSecurityDecision(item, 'confirmed')}
              >
                <Text style={[{ color: colors.primary }, typography.labelMedium]}>Fui eu</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.securityButton,
                  {
                    borderRadius: borderRadius.full,
                    borderColor: colors.error || '#ef4444',
                    backgroundColor: 'transparent',
                  },
                ]}
                disabled={actionLoadingId === item.id}
                onPress={() => handleSecurityDecision(item, 'denied')}
              >
                <Text style={[{ color: colors.error || '#ef4444' }, typography.labelMedium]}>Nao fui eu</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
              {item.securityStatus === 'confirmed'
                ? 'Login confirmado por voce.'
                : 'Login suspeito reportado. Sessao encerrada.'}
            </Text>
          )}
        </View>
      ) : null}
      <View style={styles.cardFooter}>
        <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
          {item.data ? item.data.toLocaleDateString('pt-BR') : '--'}
        </Text>
        {item.treinoId ? (
          <Text style={[{ color: colors.primary }, typography.labelSmall]}>Abrir treino</Text>
        ) : null}
        {!item.treinoId && item.evaluationId ? (
          <Text style={[{ color: colors.primary }, typography.labelSmall]}>Abrir avaliacao</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.85, y: 0 }}
      end={{ x: 0.15, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.header, { paddingHorizontal: padding, paddingVertical: spacing.md }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={[
                styles.backButton,
                {
                  backgroundColor: colors.secondaryBackground,
                  borderRadius: borderRadius.full,
                },
              ]}
              onPress={() => router.push('/(tabs)/profile')}
            >
              <Ionicons name="arrow-back" size={20} color={colors.primaryText} />
            </TouchableOpacity>
            <Text style={[{ color: colors.primaryText, flexShrink: 1 }, typography.headlineLarge]}>
              Notificacoes
            </Text>
          </View>
          <View style={styles.headerRight}>
            {isAdmin && (
              <TouchableOpacity
                style={[styles.adminButton, { backgroundColor: colors.primary, borderRadius: borderRadius.full }]}
                onPress={() => router.push('/notifications/admin')}
              >
                <Ionicons name="megaphone-outline" size={18} color={colors.info} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          numColumns={isDesktop ? columns : 1}
          key={isDesktop ? 'desktop' : 'mobile'}
          contentContainerStyle={[styles.listContent, { padding }]}
          refreshing={refreshing}
          onRefresh={() => loadNotifications('refresh')}
          ListEmptyComponent={
            <View style={[styles.emptyContainer, { paddingVertical: spacing['4xl'] }]}>
              <Ionicons name="notifications-outline" size={64} color={colors.secondaryText} />
              <Text style={[{ color: colors.secondaryText, marginTop: spacing.md }, typography.bodyLarge]}>
                {emptyText}
              </Text>
            </View>
          }
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerRight: {
    minWidth: 40,
    alignItems: 'flex-end',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    flexGrow: 1,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 6,
  },
  iconBadge: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  securityBox: {
    width: '100%',
  },
  securityActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  securityButton: {
    minHeight: 34,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
