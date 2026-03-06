import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Avatar, Card } from '../../src/components/common';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuth } from '../../src/hooks/useAuth';
import { useResponsive } from '../../src/hooks/useResponsive';
import { spacing, borderRadius } from '../../src/theme';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { colors, toggleColorScheme, isDark } = useTheme();
  const { user, role, logout } = useAuth();
  const { padding } = useResponsive();
  const isPersonal = role === 'personal' || role === 'professor';
  const editRoute = isPersonal ? '/profile/personal-edit' : '/profile/edit';

  const handleLogout = () => {
    showAlert(
      'Sair',
      'Tem certeza que deseja sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const menuItems = [
    {
      icon: 'person-outline',
      label: t('profile.editProfile'),
      route: editRoute,
    },
    {
      icon: 'notifications-outline',
      label: t('profile.notifications'),
      route: '/profile/notifications',
    },
    {
      icon: 'card-outline',
      label: t('profile.subscription'),
      route: '/profile/subscription',
    },
    ...(role === 'aluno'
      ? [
          {
            icon: 'key-outline',
            label: 'código do personal',
            route: '/personal/change-code',
          },
        ]
      : []),
    {
      icon: 'language-outline',
      label: t('profile.language'),
      route: '/profile/language',
    },
    {
      icon: 'help-circle-outline',
      label: t('profile.help'),
      route: '/help',
    },
    {
      icon: 'document-text-outline',
      label: t('profile.termsOfUse'),
      route: '/terms',
    },
    {
      icon: 'shield-checkmark-outline',
      label: t('profile.privacyPolicy'),
      route: '/privacy',
    },
  ];

  const getRoleLabel = () => {
    switch (role) {
      case 'admin':
        return 'Administrador';
      case 'professor':
        return 'Professor';
      case 'personal':
        return 'Personal Trainer';
      default:
        return 'Aluno';
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <ScrollView contentContainerStyle={[styles.scrollContent, { padding }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t('profile.myProfile')}
          </Text>
        </View>

        <Card style={styles.profileCard}>
          <TouchableOpacity
            style={styles.profileContent}
            onPress={() => router.push(editRoute)}
          >
            <Avatar
              source={user?.photoUrl}
              name={user?.displayName}
              size="large"
            />
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.text }]}>
                {user?.displayName || 'UsuÃ¡rio'}
              </Text>
              <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>
                {user?.email}
              </Text>
              <View
                style={[
                  styles.roleBadge,
                  { backgroundColor: colors.primary + '20' },
                ]}
              >
                <Text style={[styles.roleText, { color: colors.primary }]}>
                  {getRoleLabel()}
                </Text>
              </View>
            </View>
            <Ionicons
              name="chevron-forward"
              size={24}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        </Card>

        {user?.assinatura && (
          <Card style={styles.subscriptionCard}>
            <View style={styles.subscriptionContent}>
              <Ionicons name="star" size={24} color={colors.warning} />
              <View style={styles.subscriptionInfo}>
                <Text style={[styles.subscriptionTitle, { color: colors.text }]}>
                  Plano {user.tipoDeAssinatura || 'Premium'}
                </Text>
                <Text
                  style={[styles.subscriptionStatus, { color: colors.success }]}
                >
                  Ativo
                </Text>
              </View>
            </View>
          </Card>
        )}

        <Card style={styles.themeCard}>
          <TouchableOpacity
            style={styles.themeContent}
            onPress={toggleColorScheme}
          >
            <View style={styles.themeLeft}>
              <Ionicons
                name={isDark ? 'moon-outline' : 'sunny-outline'}
                size={24}
                color={colors.text}
              />
              <Text style={[styles.themeLabel, { color: colors.text }]}>
                {t('profile.theme')}
              </Text>
            </View>
            <View style={styles.themeRight}>
              <Text style={[styles.themeValue, { color: colors.textSecondary }]}>
                {isDark ? t('profile.darkMode') : t('profile.lightMode')}
              </Text>
              <View
                style={[
                  styles.themeSwitch,
                  { backgroundColor: isDark ? colors.primary : colors.surface },
                ]}
              >
                <View
                  style={[
                    styles.themeSwitchThumb,
                    {
                      backgroundColor: '#fff',
                      transform: [{ translateX: isDark ? 20 : 0 }],
                    },
                  ]}
                />
              </View>
            </View>
          </TouchableOpacity>
        </Card>

        <View style={styles.menuSection}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.menuItem,
                { borderBottomColor: colors.border },
                index === menuItems.length - 1 && styles.lastMenuItem,
              ]}
              onPress={() => router.push(item.route as any)}
            >
              <Ionicons
                name={item.icon as any}
                size={22}
                color={colors.textSecondary}
              />
              <Text style={[styles.menuLabel, { color: colors.text }]}>
                {item.label}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.logoutButton, { borderColor: colors.error }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={22} color={colors.error} />
          <Text style={[styles.logoutText, { color: colors.error }]}>
            {t('auth.logout')}
          </Text>
        </TouchableOpacity>

        <View style={styles.footerInfo}>
          <Text style={[styles.version, { color: colors.textMuted }]}>
            Versao 8.9.42+111
          </Text>
          <Text style={[styles.version, { color: colors.textMuted }]}>
            Desenvolvido por Nagazaki Software
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  profileCard: {
    marginBottom: spacing.md,
  },
  profileContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
  },
  profileEmail: {
    fontSize: 14,
    marginTop: spacing.xs,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  subscriptionCard: {
    marginBottom: spacing.md,
  },
  subscriptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subscriptionInfo: {
    marginLeft: spacing.md,
  },
  subscriptionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  subscriptionStatus: {
    fontSize: 14,
    marginTop: spacing.xs,
  },
  themeCard: {
    marginBottom: spacing.xl,
  },
  themeContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  themeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  themeLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  themeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  themeValue: {
    fontSize: 14,
  },
  themeSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
  },
  themeSwitchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  menuSection: {
    marginBottom: spacing.xl,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.base,
    borderBottomWidth: 1,
    gap: spacing.md,
  },
  lastMenuItem: {
    borderBottomWidth: 0,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    marginBottom: 4,
  },
  footerInfo: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
});
