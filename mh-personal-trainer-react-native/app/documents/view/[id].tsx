import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../src/hooks/useTheme';
import { useAuthStore } from '../../../src/store/authStore';
import { fetchUserDocumentById } from '../../../src/services/documents';
import { DocumentFile } from '../../../src/types/document';

export default function VisualizarDocumentoScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { user, role } = useAuthStore();
  const { id, studentId } = useLocalSearchParams<{ id: string; studentId?: string }>();
  const [document, setDocument] = useState<DocumentFile | null>(null);
  const [loading, setLoading] = useState(true);

  const isPersonal = role === 'personal' || role === 'professor';
  const targetUserId = isPersonal ? studentId : user?.uid;

  useEffect(() => {
    const loadDocument = async () => {
      if (!targetUserId || !id) {
        setLoading(false);
        return;
      }
      const result = await fetchUserDocumentById(targetUserId, String(id));
      setDocument(result.data || null);
      setLoading(false);
    };
    loadDocument();
  }, [id, targetUserId]);

  const fileUrl = useMemo(() => document?.arquivos || document?.fotos || '', [document]);
  const isPhoto = useMemo(() => !!document?.fotos, [document]);

  const handleOpenFile = async () => {
    if (!fileUrl) return;
    try {
      await Linking.openURL(fileUrl);
    } catch {
      showAlert('Erro', 'Nao foi possivel abrir o arquivo.');
    }
  };

  if (loading || !document) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
        <View style={styles.loadingContainer}>
          <Text style={[{ color: colors.primaryText }, typography.bodyLarge]}>
            Carregando documento...
          </Text>
        </View>
      </SafeAreaView>
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
            Visualizar documento
          </Text>
          <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
            Amplie para ver detalhes
          </Text>
        </View>

        <View style={[styles.previewCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
          {isPhoto && document.fotos ? (
            <Image source={{ uri: document.fotos }} style={[styles.previewImage, { borderRadius: borderRadius.lg }]} />
          ) : (
            <View style={[styles.filePlaceholder, { borderRadius: borderRadius.lg }]}>
              <Ionicons name="document-text-outline" size={48} color={colors.primary} />
              <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
                Documento pronto para abrir
              </Text>
              <TouchableOpacity
                style={[styles.openButton, { backgroundColor: colors.primary, borderRadius: borderRadius.lg }]}
                onPress={handleOpenFile}
              >
                <Text style={[{ color: colors.info }, typography.titleSmall]}>Abrir arquivo</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={[styles.detailsCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
          <Text style={[{ color: colors.primaryText }, typography.titleMedium]}>
            Detalhes do documento
          </Text>
          <View style={styles.detailRow}>
            <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
              Nome do arquivo:
            </Text>
            <Text style={[{ color: colors.primaryText }, typography.bodySmall]}>
              {document.nome}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
              Data de upload:
            </Text>
            <Text style={[{ color: colors.primaryText }, typography.bodySmall]}>
              {document.data ? document.data.toLocaleDateString('pt-BR') : '--'}
            </Text>
          </View>
          {fileUrl ? (
            <TouchableOpacity style={styles.openLinkRow} onPress={handleOpenFile}>
              <Ionicons name="open-outline" size={18} color={colors.primary} />
              <Text style={[{ color: colors.primary }, typography.labelSmall]}>
                Abrir documento em outra tela
              </Text>
            </TouchableOpacity>
          ) : null}
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
  previewCard: {
    marginHorizontal: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: 320,
    resizeMode: 'contain',
  },
  filePlaceholder: {
    width: '100%',
    height: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  openButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  detailsCard: {
    marginHorizontal: 16,
    padding: 16,
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  openLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
