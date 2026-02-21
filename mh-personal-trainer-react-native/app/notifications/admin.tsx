import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { createNotification } from '../../src/services/notificationCenter';

const typeOptions = ['Sistema', 'Treinos', 'Mensagem', 'Avaliacao Online', 'Alerta'];

export default function NotificationAdminScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { role } = useAuthStore();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('Sistema');
  const [sendToAll, setSendToAll] = useState(true);
  const [targetUserId, setTargetUserId] = useState('');
  const [loading, setLoading] = useState(false);

  const isAdmin = role === 'admin';

  const handleSubmit = async () => {
    if (!isAdmin) return;
    if (!title.trim() || !body.trim()) {
      showAlert('Atenção', 'Informe título e mensagem.');
      return;
    }
    if (!sendToAll && !targetUserId.trim()) {
      showAlert('Atenção', 'Informe o ID do usuário.');
      return;
    }
    setLoading(true);
    const result = await createNotification({
      titulo: title.trim(),
      descricao: body.trim(),
      tipo: type,
      para: sendToAll ? undefined : targetUserId.trim(),
      paraTodos: sendToAll,
    });
    setLoading(false);
    if (result.error) {
      showAlert('Erro', result.error);
      return;
    }
    setTitle('');
    setBody('');
    setTargetUserId('');
    showAlert('Sucesso', 'Notificacao enviada.');
  };

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.85, y: 0 }}
      end={{ x: 0.15, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.header, { padding: spacing.lg }]}>
          <Text style={[{ color: colors.primaryText }, typography.headlineLarge]}>
            Notificacao admin
          </Text>
        </View>

        {!isAdmin ? (
          <View style={styles.emptyState}>
            <Ionicons name="lock-closed-outline" size={48} color={colors.secondaryText} />
            <Text style={[{ color: colors.secondaryText }, typography.bodyLarge]}>
              Acesso restrito a administradores
            </Text>
          </View>
        ) : (
          <View style={[styles.formCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
            <Text style={[{ color: colors.primaryText }, typography.titleSmall]}>Titulo</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.primaryText }]}
              placeholder="Titulo da notificacao"
              placeholderTextColor={colors.secondaryText}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={[{ color: colors.primaryText }, typography.titleSmall]}>Mensagem</Text>
            <TextInput
              style={[styles.input, styles.textarea, { borderColor: colors.border, color: colors.primaryText }]}
              placeholder="Mensagem"
              placeholderTextColor={colors.secondaryText}
              value={body}
              onChangeText={setBody}
              multiline
              numberOfLines={4}
            />

            <Text style={[{ color: colors.primaryText }, typography.titleSmall]}>Tipo</Text>
            <View style={styles.typeRow}>
              {typeOptions.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.typeChip,
                    {
                      backgroundColor: type === option ? colors.primary : colors.surface,
                      borderRadius: borderRadius.full,
                    },
                  ]}
                  onPress={() => setType(option)}
                >
                  <Text
                    style={[
                      typography.labelSmall,
                      { color: type === option ? colors.info : colors.secondaryText },
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  {
                    backgroundColor: sendToAll ? colors.primary : colors.surface,
                    borderRadius: borderRadius.full,
                  },
                ]}
                onPress={() => setSendToAll(true)}
              >
                <Text style={[typography.labelMedium, { color: sendToAll ? colors.info : colors.secondaryText }]}>
                  Enviar para todos
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  {
                    backgroundColor: !sendToAll ? colors.primary : colors.surface,
                    borderRadius: borderRadius.full,
                  },
                ]}
                onPress={() => setSendToAll(false)}
              >
                <Text style={[typography.labelMedium, { color: !sendToAll ? colors.info : colors.secondaryText }]}>
                  Enviar para usuario
                </Text>
              </TouchableOpacity>
            </View>

            {!sendToAll && (
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.primaryText }]}
                placeholder="ID do usuario"
                placeholderTextColor={colors.secondaryText}
                value={targetUserId}
                onChangeText={setTargetUserId}
              />
            )}

            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: colors.primary, borderRadius: borderRadius.lg },
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={[{ color: colors.info }, typography.titleSmall]}>
                {loading ? 'Enviando...' : 'Enviar notificacao'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
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
    alignItems: 'center',
  },
  formCard: {
    marginHorizontal: 16,
    padding: 16,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textarea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  submitButton: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
});
