import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Avatar } from '../../src/components/common';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { useAuth } from '../../src/hooks/useAuth';
import { useAppStore } from '../../src/store/appStore';
import { changeLanguage } from '../../src/i18n';
import { firestoreService } from '../../src/services/firestoreService';

interface SettingsItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  tintColor: string;
  danger?: boolean;
  onPress: () => void;
}

export default function SettingsScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { user, role, updateUser } = useAuthStore();
  const { logout } = useAuth();
  const { language, setLanguage } = useAppStore();

  const isPersonal = role === 'personal' || role === 'professor';
  const roleLabel = isPersonal ? 'PERSONAL' : 'ALUNO';

  const handleLogout = () => {
    showAlert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleEditProfile = () => {
    router.push(isPersonal ? '/profile/personal-edit' : '/profile/edit-advanced');
  };

  const handleLanguageChange = async (lang: string) => {
    setLanguage(lang);
    changeLanguage(lang);
    updateUser({ language: lang });

    if (!user?.uid) return;

    try {
      await firestoreService.updateUserLanguage(user.uid, lang);
    } catch (error: any) {
      showAlert('Idioma', error?.message || 'Nao foi possivel salvar seu idioma agora.');
    }
  };

  const SettingsItem = ({ icon, label, description, tintColor, danger, onPress }: SettingsItemProps) => (
    <TouchableOpacity
      style={[styles.settingRow, { borderColor: colors.border }]}
      onPress={onPress}
    >
      <View style={[styles.settingIcon, { backgroundColor: `${tintColor}1A` }]}
      >
        <Ionicons name={icon} size={18} color={tintColor} />
      </View>
      <View style={styles.settingText}>
        <Text
          style={[
            typography.titleSmall,
            { color: danger ? colors.error : colors.primaryText },
          ]}
        >
          {label}
        </Text>
        {description ? (
          <Text style={[typography.bodySmall, { color: colors.secondaryText }]}
          >
            {description}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primaryBackground, colors.alternate]}
        start={{ x: 0.8, y: 0 }}
        end={{ x: 0.2, y: 1 }}
        style={styles.background}
      />
      <View
        pointerEvents="none"
        style={[styles.glowPrimary, { backgroundColor: colors.primary }]}
      />
      <View
        pointerEvents="none"
        style={[styles.glowSecondary, { backgroundColor: colors.tertiary }]}
      />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[styles.content, { padding: spacing.lg }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={[typography.headlineLarge, { color: colors.primaryText }]}
            >
              Configuracoes
            </Text>
            <Text style={[typography.bodySmall, { color: colors.secondaryText }]}
            >
              Gerencie seu perfil, notificacoes e conta.
            </Text>
          </View>

          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.profileCard, { borderRadius: borderRadius.xl }]}
          >
            <View style={styles.profileRow}>
              <Avatar source={user?.photoUrl} name={user?.displayName || 'Conta'} size="large" />
              <View style={styles.profileInfo}>
                <Text style={[typography.titleLarge, { color: colors.info }]}>
                  {user?.displayName || 'Conta MH'}
                </Text>
                <Text style={[typography.bodySmall, { color: colors.info }]}
                >
                  {user?.email || 'Conta ativa'}
                </Text>
                <View style={styles.roleBadge}>
                  <Text style={[typography.labelSmall, { color: colors.info }]}
                  >
                    {roleLabel}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.profileAction} onPress={handleEditProfile}>
              <Ionicons name="person-outline" size={18} color="#fff" />
              <Text style={[typography.labelLarge, { color: colors.info }]}>
                Editar perfil
              </Text>
            </TouchableOpacity>
          </LinearGradient>

          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: colors.secondaryBackground,
                borderRadius: borderRadius.lg,
                borderColor: colors.border,
                padding: spacing.lg,
              },
            ]}
          >
            <Text style={[typography.titleMedium, { color: colors.primaryText }]}
            >
              Preferencias
            </Text>
            <SettingsItem
              icon="notifications-outline"
              label="Notificacoes"
              description="Alertas e lembretes"
              tintColor={colors.primary}
              onPress={() => router.push('/settings/notifications')}
            />

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={[styles.settingRow, { borderColor: colors.border }]}
            >
              <View style={[styles.settingIcon, { backgroundColor: `${colors.primary}1A` }]}
              >
                <Ionicons name="language-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.settingText}>
                <Text style={[typography.titleSmall, { color: colors.primaryText }]}>
                  Idioma
                </Text>
                <Text style={[typography.bodySmall, { color: colors.secondaryText }]}
                >
                  Escolha sua preferencia
                </Text>
              </View>
              <View style={styles.languageOptions}>
                {['pt', 'en'].map((lang) => (
                  <TouchableOpacity
                    key={lang}
                    style={[
                      styles.languageChip,
                      {
                        backgroundColor: language === lang ? colors.primary : colors.surface,
                        borderRadius: borderRadius.full,
                      },
                    ]}
                    onPress={() => {
                      void handleLanguageChange(lang);
                    }}
                  >
                    <Text
                      style={[
                        typography.labelSmall,
                        {
                          color: language === lang ? colors.info : colors.secondaryText,
                        },
                      ]}
                    >
                      {lang.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: colors.secondaryBackground,
                borderRadius: borderRadius.lg,
                borderColor: colors.border,
                padding: spacing.lg,
              },
            ]}
          >
            <Text style={[typography.titleMedium, { color: colors.primaryText }]}
            >
              Conta
            </Text>
            <SettingsItem
              icon="key-outline"
              label="Alterar senha"
              description="Seguranca da conta"
              tintColor={colors.primary}
              onPress={() => router.push('/(auth)/forgot-password')}
            />

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <SettingsItem
              icon="log-out-outline"
              label="Sair"
              tintColor={colors.error}
              danger
              onPress={handleLogout}
            />
          </View>

          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: colors.secondaryBackground,
                borderRadius: borderRadius.lg,
                borderColor: colors.border,
                padding: spacing.lg,
              },
            ]}
          >
            <Text style={[typography.titleMedium, { color: colors.primaryText }]}
            >
              Sobre o app
            </Text>
            <View style={styles.settingRow}>
              <View style={[styles.settingIcon, { backgroundColor: `${colors.primary}1A` }]}
              >
                <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.settingText}>
                <Text style={[typography.titleSmall, { color: colors.primaryText }]}>
                  Versao
                </Text>
                <Text style={[typography.bodySmall, { color: colors.secondaryText }]}
                >
                  {Constants.expoConfig?.version || '1.0.0'}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  glowPrimary: {
    position: 'absolute',
    top: -80,
    right: -120,
    width: 220,
    height: 220,
    borderRadius: 160,
    opacity: 0.18,
  },
  glowSecondary: {
    position: 'absolute',
    bottom: -120,
    left: -140,
    width: 260,
    height: 260,
    borderRadius: 180,
    opacity: 0.12,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    gap: 20,
    paddingBottom: 32,
  },
  header: {
    gap: 6,
  },
  profileCard: {
    padding: 18,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  profileAction: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  sectionCard: {
    borderWidth: 1,
    gap: 14,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingText: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  languageOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  languageChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
