import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/hooks/useTheme';
import { useAppStore } from '../../src/store/appStore';

interface ToggleItem {
  id: string;
  title: string;
  description: string;
}

const appItems: ToggleItem[] = [
  { id: 'push', title: 'Ativar notificacoes', description: 'Receba avisos importantes' },
  { id: 'sound', title: 'Som', description: 'Tocar som nas notificacoes' },
  { id: 'vibration', title: 'Vibracao', description: 'Vibrar o dispositivo' },
  { id: 'workouts', title: 'Treinos', description: 'Lembretes e novos treinos' },
  { id: 'messages', title: 'Mensagens', description: 'Novas mensagens e alertas' },
  { id: 'evaluations', title: 'Avaliacoes', description: 'Convites e resultados' },
  { id: 'goals', title: 'Metas', description: 'Atualizacoes de metas' },
  { id: 'records', title: 'Recordes', description: 'Novos recordes alcancados' },
];

const paymentItems: ToggleItem[] = [
  { id: 'invoices', title: 'Faturas', description: 'Avisos de cobranca' },
  { id: 'promos', title: 'Promocoes', description: 'Ofertas e campanhas' },
];

export default function NotificationSettingsScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { pushNotificationsEnabled, setPushNotifications } = useAppStore();
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    sound: true,
    vibration: true,
    workouts: true,
    messages: true,
    evaluations: true,
    goals: true,
    records: true,
    invoices: true,
    promos: true,
  });

  const isDisabled = useMemo(() => !pushNotificationsEnabled, [pushNotificationsEnabled]);

  const handleToggle = (id: string, value: boolean) => {
    setToggles((prev) => ({ ...prev, [id]: value }));
  };

  const renderItem = (item: ToggleItem, value: boolean, onChange: (v: boolean) => void) => (
    <View key={item.id} style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[{ color: colors.primaryText }, typography.bodyMedium]}>{item.title}</Text>
        <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>{item.description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={item.id !== 'push' && isDisabled}
        trackColor={{ false: colors.surface, true: colors.primary + '80' }}
        thumbColor={value ? colors.primary : colors.secondaryText}
      />
    </View>
  );

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.85, y: 0 }}
      end={{ x: 0.15, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={[styles.content, { padding: spacing.lg }]}>
          <Text style={[{ color: colors.primaryText }, typography.headlineLarge]}>
            Configuracoes de notificacoes
          </Text>

          <View style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}>
            <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
              Notificacoes do app
            </Text>
            {renderItem(
              appItems[0],
              pushNotificationsEnabled,
              (value) => setPushNotifications(value)
            )}
            {appItems.slice(1).map((item) =>
              renderItem(item, toggles[item.id], (value) => handleToggle(item.id, value))
            )}
          </View>

          <View style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}>
            <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
              Notificacoes de pagamento
            </Text>
            {paymentItems.map((item) =>
              renderItem(item, toggles[item.id], (value) => handleToggle(item.id, value))
            )}
          </View>
        </ScrollView>
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
  content: {
    gap: 16,
  },
  card: {
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  rowText: {
    flex: 1,
  },
});
