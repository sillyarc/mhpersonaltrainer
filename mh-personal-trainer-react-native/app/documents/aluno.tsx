import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useAuthStore } from '../../src/store/authStore';
import { firestoreService, Aluno } from '../../src/services/firestoreService';
import { fetchUserDocuments } from '../../src/services/documents';
import { DocumentFile } from '../../src/types/document';

export default function ArquivosDoAlunoScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { padding, columns, isDesktop } = useResponsive();
  const { role, user } = useAuthStore();
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(studentId || null);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isPersonal = role === 'personal' || role === 'professor';
  const targetUserId = isPersonal ? selectedStudentId : user?.uid;

  useEffect(() => {
    if (!isPersonal || !user?.uid) return;
    const loadStudents = async () => {
      const alunos = await firestoreService.getAlunosDoPersonal(user.uid);
      setStudents(alunos);
      if (!selectedStudentId && alunos.length > 0) {
        setSelectedStudentId(alunos[0].id);
      }
    };
    loadStudents();
  }, [isPersonal, user?.uid, selectedStudentId]);

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

  const documentLabel = useMemo(() => {
    return isPersonal ? 'Arquivos do aluno' : 'Meus documentos';
  }, [isPersonal]);

  const renderDocument = ({ item }: { item: DocumentFile }) => {
    const isPhoto = !!item.fotos;
    return (
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
        onPress={() =>
          router.push(`/documents/view/${item.id}?studentId=${targetUserId ?? ''}`)
        }
      >
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.iconBadge,
              { backgroundColor: colors.primary + '20', borderRadius: borderRadius.md },
            ]}
          >
            <Ionicons
              name={isPhoto ? 'image-outline' : 'document-text-outline'}
              size={20}
              color={colors.primary}
            />
          </View>
          <View style={styles.cardInfo}>
            <Text style={[{ color: colors.primaryText }, typography.titleSmall]} numberOfLines={1}>
              {item.nome}
            </Text>
            <Text style={[{ color: colors.secondaryText }, typography.labelSmall]}>
              {item.data ? item.data.toLocaleDateString('pt-BR') : '--'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient
      colors={[colors.primaryBackground, colors.alternate]}
      start={{ x: 0.85, y: 0 }}
      end={{ x: 0.15, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.header, { paddingHorizontal: padding, paddingVertical: spacing.md }]}>
          <Text style={[{ color: colors.primaryText }, typography.headlineLarge]}>
            {documentLabel}
          </Text>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.primary, borderRadius: borderRadius.full }]}
            onPress={() => router.push(`/documents/upload?studentId=${targetUserId ?? ''}`)}
          >
            <Ionicons name="add" size={22} color={colors.info} />
          </TouchableOpacity>
        </View>

        {isPersonal && students.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.studentsScroll}
            contentContainerStyle={[styles.studentsRow, { paddingHorizontal: padding, gap: spacing.sm }]}
          >
            {students.map((student) => (
              <TouchableOpacity
                key={student.id}
                style={[
                  styles.studentChip,
                  {
                    backgroundColor:
                      selectedStudentId === student.id ? colors.primary : colors.secondaryBackground,
                    borderRadius: borderRadius.full,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  },
                ]}
                onPress={() => setSelectedStudentId(student.id)}
              >
                <Text
                  style={[
                    typography.labelMedium,
                    { color: selectedStudentId === student.id ? colors.info : colors.secondaryText },
                  ]}
                >
                  {student.nome}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <FlatList
          data={documents}
          renderItem={renderDocument}
          keyExtractor={(item) => item.id}
          numColumns={isDesktop ? columns : 1}
          key={isDesktop ? 'desktop' : 'mobile'}
          contentContainerStyle={[styles.listContent, { padding }]}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentsScroll: {
    maxHeight: 50,
  },
  studentsRow: {
    paddingBottom: 8,
  },
  studentChip: {},
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
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
