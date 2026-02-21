import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Image } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { storage } from '../../src/services/firebase';
import { getStorageErrorMessage } from '../../src/services/firebaseErrors';
import { createUserDocument, deleteUserDocument, fetchUserDocuments } from '../../src/services/documents';
import { DocumentFile } from '../../src/types/document';

export default function EnviarDocumentosScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { user, role } = useAuthStore();
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [documentName, setDocumentName] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const isPersonal = role === 'personal' || role === 'professor';
  const targetUserId = isPersonal ? studentId : user?.uid;

  const loadDocuments = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'silent') => {
      if (!targetUserId) {
        setDocuments([]);
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
        const result = await fetchUserDocuments(targetUserId);
        setDocuments(result.data || []);
      } finally {
        if (mode === 'initial') {
          setLoading(false);
        } else if (mode === 'refresh') {
          setRefreshing(false);
        }
      }
    },
    [targetUserId]
  );

  useEffect(() => {
    loadDocuments('initial');
  }, [loadDocuments]);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      setSelectedFile(null);
      if (!documentName) {
        setDocumentName('Foto');
      }
    }
  };

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedFile({ uri: result.assets[0].uri, name: result.assets[0].name });
      setSelectedImage(null);
      if (!documentName) {
        setDocumentName(result.assets[0].name);
      }
    }
  };

  const handleUpload = async () => {
    if (!targetUserId) return;
    if (!selectedImage && !selectedFile) {
      showAlert('Atencao', 'Selecione um arquivo ou foto.');
      return;
    }
    if (!documentName.trim()) {
      showAlert('Atencao', 'Informe o nome do documento.');
      return;
    }
    setUploading(true);
    try {
      let downloadUrl = '';
      if (selectedImage) {
        const response = await fetch(selectedImage);
        const blob = await response.blob();
        const fileRef = ref(storage, `users/${targetUserId}/arquivos/${Date.now()}-foto.jpg`);
        await uploadBytes(fileRef, blob);
        downloadUrl = await getDownloadURL(fileRef);
        await createUserDocument(targetUserId, {
          nome: documentName.trim(),
          fotos: downloadUrl,
        });
      } else if (selectedFile) {
        const response = await fetch(selectedFile.uri);
        const blob = await response.blob();
        const fileRef = ref(storage, `users/${targetUserId}/arquivos/${Date.now()}-${selectedFile.name}`);
        await uploadBytes(fileRef, blob);
        downloadUrl = await getDownloadURL(fileRef);
        await createUserDocument(targetUserId, {
          nome: documentName.trim(),
          arquivos: downloadUrl,
        });
      }
      setSelectedImage(null);
      setSelectedFile(null);
      setDocumentName('');
      await loadDocuments('silent');
      showAlert('Sucesso', 'Documento enviado com sucesso.');
    } catch (error) {
      const message = getStorageErrorMessage(error, 'Nao foi possivel enviar o documento.');
      showAlert('Erro', message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: DocumentFile) => {
    if (!targetUserId) return;
    await deleteUserDocument(targetUserId, doc.id);
    loadDocuments('silent');
  };

  const renderDocument = ({ item }: { item: DocumentFile }) => {
    const isPhoto = !!item.fotos;
    return (
      <View
        style={[
          styles.docCard,
          { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg },
        ]}
      >
        <View style={styles.docRow}>
          {isPhoto && item.fotos ? (
            <Image source={{ uri: item.fotos }} style={[styles.thumb, { borderRadius: borderRadius.md }]} />
          ) : (
            <View style={[styles.thumb, { backgroundColor: colors.surface, borderRadius: borderRadius.md }]}>
              <Ionicons name="document-text-outline" size={20} color={colors.primary} />
            </View>
          )}
          <View style={styles.docInfo}>
            <Text style={[{ color: colors.primaryText }, typography.bodyMedium]} numberOfLines={1}>
              {item.nome}
            </Text>
            <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
              {item.data ? item.data.toLocaleDateString('pt-BR') : '--'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => handleDelete(item)}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const helperText = useMemo(() => {
    if (isPersonal) {
      return 'Envie documentos ou fotos para o aluno.';
    }
    return 'Compartilhe exames, atestados ou documentos com seu personal.';
  }, [isPersonal]);

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
            Enviar documentos
          </Text>
          <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>
            {helperText}
          </Text>
        </View>

        <View style={[styles.formCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.xl }]}>
          <Text style={[{ color: colors.primaryText }, typography.titleSmall]}>
            Nome do documento
          </Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.primaryText }]}
            placeholder="Exame, atestado, receita..."
            placeholderTextColor={colors.secondaryText}
            value={documentName}
            onChangeText={setDocumentName}
          />

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionButton, { borderColor: colors.primary, borderRadius: borderRadius.lg }]}
              onPress={handlePickFile}
              disabled={uploading}
            >
              <Ionicons name="document-text-outline" size={18} color={colors.primary} />
              <Text style={[{ color: colors.primary }, typography.labelSmall]}>Selecionar arquivo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { borderColor: colors.primary, borderRadius: borderRadius.lg }]}
              onPress={handlePickImage}
              disabled={uploading}
            >
              <Ionicons name="image-outline" size={18} color={colors.primary} />
              <Text style={[{ color: colors.primary }, typography.labelSmall]}>Selecionar foto</Text>
            </TouchableOpacity>
          </View>

          {selectedImage ? (
            <View style={styles.preview}>
              <Image source={{ uri: selectedImage }} style={[styles.previewImage, { borderRadius: borderRadius.lg }]} />
              <Text style={[{ color: colors.secondaryText }, typography.bodySmall]}>Foto selecionada</Text>
            </View>
          ) : null}
          {selectedFile ? (
            <View style={styles.preview}>
              <Ionicons name="document-text-outline" size={28} color={colors.primary} />
              <Text style={[{ color: colors.secondaryText }, typography.bodySmall]} numberOfLines={1}>
                {selectedFile.name}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: colors.primary, borderRadius: borderRadius.lg }]}
            onPress={handleUpload}
            disabled={uploading}
          >
            <Text style={[{ color: colors.info }, typography.titleSmall]}>
              {uploading ? 'Enviando...' : 'Enviar documento'}
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={documents}
          renderItem={renderDocument}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { padding: spacing.lg }]}
          refreshing={refreshing}
          onRefresh={() => loadDocuments('refresh')}
          ListEmptyComponent={
            <View style={[styles.emptyContainer, { paddingVertical: spacing['4xl'] }]}>
              <Ionicons name="folder-open-outline" size={64} color={colors.secondaryText} />
              <Text style={[{ color: colors.secondaryText, marginTop: spacing.md }, typography.bodyLarge]}>
                {loading ? 'Carregando arquivos...' : 'Nenhum arquivo encontrado'}
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
    gap: 4,
  },
  formCard: {
    marginHorizontal: 16,
    padding: 16,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    borderWidth: 1,
    paddingVertical: 10,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewImage: {
    width: 80,
    height: 80,
  },
  submitButton: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  listContent: {
    flexGrow: 1,
  },
  docCard: {
    padding: 12,
    marginBottom: 10,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  docInfo: {
    flex: 1,
  },
  thumb: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
