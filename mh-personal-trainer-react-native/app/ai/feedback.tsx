import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { submitAIFeedback } from '../../src/services/feedback';
import { isPremiumUserRecord } from '../../src/services/ai';

export default function FeedbackIAScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { user } = useAuthStore();
  const hasPremiumAiAccess = isPremiumUserRecord((user || {}) as Record<string, any>);
  const [rating, setRating] = useState(4);
  const [comment, setComment] = useState('');
  const [trainingName, setTrainingName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!user?.uid) return;
    if (!comment.trim()) {
      showAlert('Atencao', 'Informe seu comentario.');
      return;
    }
    setLoading(true);
    const result = await submitAIFeedback({
      userId: user.uid,
      rating,
      comentario: comment.trim(),
      treino: trainingName.trim(),
    });
    setLoading(false);
    if (result.error) {
      showAlert('Erro', result.error);
      return;
    }
    setComment('');
    setTrainingName('');
    showAlert('Obrigado', 'Feedback enviado com sucesso.');
  };

  if (!hasPremiumAiAccess) {
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
              Feedback da IA
            </Text>
          </View>
          <View style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
            <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
              Recurso Premium
            </Text>
            <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
              O feedback da IA esta disponivel apenas para assinantes Premium.
            </Text>
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: colors.primary, borderRadius: borderRadius.lg }]}
              onPress={() => router.push('/profile/subscription' as any)}
            >
              <Text style={[{ color: colors.info }, typography.titleSmall]}>Ver planos Premium</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

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
            Feedback da IA
          </Text>
          <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
            Conte como foi o treino sugerido.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
          <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
            Avaliacao
          </Text>
          <View style={styles.starsRow}>
            {Array.from({ length: 5 }).map((_, index) => {
              const value = index + 1;
              return (
                <TouchableOpacity key={value} onPress={() => setRating(value)}>
                  <Ionicons
                    name={value <= rating ? 'star' : 'star-outline'}
                    size={28}
                    color={colors.warning}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.primaryText }]}
            placeholder="Nome do treino (opcional)"
            placeholderTextColor={colors.secondaryText}
            value={trainingName}
            onChangeText={setTrainingName}
          />
          <TextInput
            style={[styles.input, styles.textarea, { borderColor: colors.border, color: colors.primaryText }]}
            placeholder="Conte sua experiencia..."
            placeholderTextColor={colors.secondaryText}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={4}
          />
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: colors.primary, borderRadius: borderRadius.lg }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={[{ color: colors.info }, typography.titleSmall]}>
              {loading ? 'Enviando...' : 'Enviar feedback'}
            </Text>
          </TouchableOpacity>
        </View>
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
    gap: 4,
  },
  card: {
    marginHorizontal: 16,
    padding: 16,
    gap: 12,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 6,
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
  submitButton: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
