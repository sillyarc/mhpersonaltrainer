import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { storage } from '../../src/services/firebase';
import { getStorageErrorMessage } from '../../src/services/firebaseErrors';
import { analyzePostureImage } from '../../src/services/aiAnalysis';
import { isPremiumUserRecord } from '../../src/services/ai';

export default function ImageAnalysisScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { user } = useAuthStore();
  const hasPremiumAiAccess = isPremiumUserRecord((user || {}) as Record<string, any>);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<{
    postura?: string;
    descricaoPostura?: string;
    metricas?: string;
    textoDetalhado?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePickImage = async () => {
    if (!hasPremiumAiAccess) {
      showAlert('Premium', 'A avaliacao postural com IA esta disponivel apenas no Premium.');
      router.push('/profile/subscription' as any);
      return;
    }

    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!pick.canceled && pick.assets[0]) {
      setImageUri(pick.assets[0].uri);
      setResult(null);
    }
  };

  const handleAnalyze = async () => {
    if (!hasPremiumAiAccess) {
      showAlert('Premium', 'A avaliacao postural com IA esta disponivel apenas no Premium.');
      router.push('/profile/subscription' as any);
      return;
    }

    if (!imageUri || !user?.uid) {
      showAlert('Atencao', 'Selecione uma imagem primeiro.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const fileRef = ref(storage, `users/${user.uid}/ai-analysis/${Date.now()}.jpg`);
      await uploadBytes(fileRef, blob);
      const downloadUrl = await getDownloadURL(fileRef);

      const analysis = await analyzePostureImage(downloadUrl);
      if (analysis.error) {
        throw new Error(analysis.error);
      }
      setResult(analysis.data || null);
    } catch (error: any) {
      const fallback = error?.message || 'Falha ao analisar imagem';
      const message = getStorageErrorMessage(error, fallback);
      showAlert('Erro', message);
    } finally {
      setLoading(false);
    }
  };

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
            Analise de imagem
          </Text>
          <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
            Envie uma foto para avaliacao postural com IA.
          </Text>

          {!hasPremiumAiAccess && (
            <View style={[styles.resultCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
              <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
                Recurso Premium
              </Text>
              <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                A avaliacao postural com IA e exclusiva para assinantes Premium.
              </Text>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.primary, borderRadius: borderRadius.lg }]}
                onPress={() => router.push('/profile/subscription' as any)}
              >
                <Text style={[{ color: colors.info }, typography.labelSmall]}>Ver planos Premium</Text>
              </TouchableOpacity>
            </View>
          )}

          <View
            style={[
              styles.imageCard,
              { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl },
            ]}
          >
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={[styles.imagePreview, { borderRadius: borderRadius.lg }]} />
            ) : (
              <View
                style={[
                  styles.placeholder,
                  { borderRadius: borderRadius.lg, backgroundColor: colors.surface },
                ]}
              >
                <Ionicons name="image-outline" size={36} color={colors.secondaryText} />
                <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                  Selecione uma imagem para analisar
                </Text>
              </View>
            )}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionButton, { borderColor: colors.primary, borderRadius: borderRadius.lg }]}
                onPress={handlePickImage}
                disabled={!hasPremiumAiAccess}
              >
                <Ionicons name="camera-outline" size={18} color={colors.primary} />
                <Text style={[{ color: colors.primary }, typography.labelSmall]}>Escolher foto</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.primary, borderRadius: borderRadius.lg }]}
                onPress={handleAnalyze}
                disabled={loading || !hasPremiumAiAccess}
              >
                <Text style={[{ color: colors.info }, typography.labelSmall]}>
                  {loading ? 'Analisando...' : 'Analisar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.resultCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
            <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
              Resultado da analise
            </Text>
            {result ? (
              <>
                <Text style={[{ color: colors.primaryText }, typography.bodyMedium]}>
                  {result.postura || 'Postura avaliada'}
                </Text>
                <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                  {result.descricaoPostura || 'Sem descricao no momento.'}
                </Text>
                <Text style={[{ color: colors.primaryText }, typography.bodyMedium]}>
                  Metricas detectadas
                </Text>
                <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                  {result.metricas || 'Sem metricas disponiveis.'}
                </Text>
                <Text style={[{ color: colors.primaryText }, typography.bodyMedium]}>
                  Resultado completo
                </Text>
                <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                  {result.textoDetalhado || 'Sem detalhes no momento.'}
                </Text>
              </>
            ) : (
              <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                Aguardando analise...
              </Text>
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
  imageCard: {
    padding: 16,
    gap: 12,
  },
  imagePreview: {
    width: '100%',
    height: 260,
    resizeMode: 'cover',
  },
  placeholder: {
    width: '100%',
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderWidth: 1,
  },
  resultCard: {
    padding: 16,
    gap: 8,
  },
});
