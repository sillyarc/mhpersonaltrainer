import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs, orderBy, query, limit, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../src/services/firebase';
import { Card, Loading } from '../../src/components/common';
import { useTheme } from '../../src/hooks/useTheme';
import { spacing, borderRadius } from '../../src/theme';

interface StudentItem {
  id: string;
  name: string;
  email: string;
  codigoPersonal?: string;
  assinatura?: boolean;
  acessoSuspenso?: boolean;
}

export default function ManageStudentsScreen() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [queryText, setQueryText] = useState('');

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const usersQuery = query(
        collection(db, 'users'),
        orderBy('created_time', 'desc'),
        limit(300)
      );
      const snapshot = await getDocs(usersQuery);
      const loaded = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          const isAdmin = !!data.admin;
          const isPersonal = !!data.professorAccount;
          if (isAdmin || isPersonal) {
            return null;
          }
          return {
            id: docSnap.id,
            name: data.display_name || 'Aluno',
            email: data.email || '',
            codigoPersonal: data.codigoPersonal,
            assinatura: data.assinatura,
            acessoSuspenso: data.acessoSuspenso,
          } as StudentItem;
        })
        .filter(Boolean) as StudentItem[];
      setStudents(loaded);
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = useMemo(() => {
    const normalized = queryText.trim().toLowerCase();
    if (!normalized) return students;
    return students.filter((student) => {
      return (
        student.name.toLowerCase().includes(normalized) ||
        student.email.toLowerCase().includes(normalized) ||
        (student.codigoPersonal || '').toLowerCase().includes(normalized)
      );
    });
  }, [students, queryText]);

  const toggleSuspension = (student: StudentItem) => {
    const nextValue = !student.acessoSuspenso;
    showAlert(
      nextValue ? 'Suspender aluno' : 'Reativar aluno',
      `Deseja ${nextValue ? 'suspender' : 'reativar'} ${student.name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: nextValue ? 'Suspender' : 'Reativar',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', student.id), {
                acessoSuspenso: nextValue,
              });
              setStudents((prev) =>
                prev.map((item) =>
                  item.id === student.id ? { ...item, acessoSuspenso: nextValue } : item
                )
              );
            } catch (error) {
              showAlert('Erro', 'Nao foi possivel atualizar o status do aluno.');
            }
          },
        },
      ]
    );
  };

  const renderStudent = ({ item }: { item: StudentItem }) => (
    <Card style={styles.studentCard}>
      <View style={styles.studentRow}>
        <View style={styles.studentInfo}>
          <Text style={[styles.studentName, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.studentEmail, { color: colors.textSecondary }]}>{item.email}</Text>
          <Text style={[styles.studentCode, { color: colors.textSecondary }]}>
            Codigo: {item.codigoPersonal || '-'}
          </Text>
        </View>
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: colors.surface }]}>
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
              {item.assinatura ? 'assinatura ativa' : 'sem assinatura'}
            </Text>
          </View>
          {item.acessoSuspenso && (
            <View style={[styles.badge, { backgroundColor: colors.error + '20' }]}>
              <Text style={[styles.badgeText, { color: colors.error }]}>suspenso</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push(`/admin/student/${item.id}` as any)}
        >
          <Ionicons name="person-outline" size={16} color="#fff" />
          <Text style={styles.actionText}>Ver perfil</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actionBtn,
            { backgroundColor: item.acessoSuspenso ? colors.success : colors.error },
          ]}
          onPress={() => toggleSuspension(item)}
        >
          <Ionicons
            name={item.acessoSuspenso ? 'checkmark-circle' : 'pause-circle'}
            size={16}
            color="#fff"
          />
          <Text style={styles.actionText}>
            {item.acessoSuspenso ? 'Reativar' : 'Suspender'}
          </Text>
        </TouchableOpacity>
      </View>
    </Card>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Loading />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Gerenciamento de alunos</Text>
        <TouchableOpacity onPress={loadStudents}>
          <Ionicons name="refresh" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Buscar alunos..."
            placeholderTextColor={colors.textSecondary}
            value={queryText}
            onChangeText={setQueryText}
          />
          {queryText.length > 0 && (
            <TouchableOpacity onPress={() => setQueryText('')}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {filteredStudents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={56} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Nenhum aluno encontrado.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredStudents}
          renderItem={renderStudent}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  list: {
    padding: spacing.base,
    paddingBottom: spacing['4xl'],
  },
  studentCard: {
    marginBottom: spacing.md,
  },
  studentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '600',
  },
  studentEmail: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  studentCode: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  badges: {
    gap: spacing.xs,
    alignItems: 'flex-end',
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: 11,
    textTransform: 'capitalize',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emptyText: {
    fontSize: 14,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
