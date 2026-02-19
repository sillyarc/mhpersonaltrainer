import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../src/services/firebase';
import { Card, Avatar, Loading, Button } from '../../src/components/common';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { spacing, borderRadius } from '../../src/theme';

interface Student {
  uid: string;
  displayName: string;
  email: string;
  photoUrl?: string;
  assinatura?: boolean;
  objetivoNoApp?: string;
  lastAccess?: Date;
}

export default function StudentsListScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    if (!user?.uid) return;

    try {
      const studentsQuery = query(
        collection(db, 'users'),
        where('personal_id', '==', user.uid)
      );
      const snapshot = await getDocs(studentsQuery);

      const loadedStudents = snapshot.docs.map(doc => ({
        uid: doc.id,
        displayName: doc.data().display_name || doc.data().email,
        email: doc.data().email,
        photoUrl: doc.data().photo_url,
        assinatura: doc.data().assinatura,
        objetivoNoApp: doc.data().objetivoNoApp,
        lastAccess: doc.data().last_access?.toDate(),
      }));

      setStudents(loadedStudents);
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = students.filter(student =>
    student.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderStudent = ({ item }: { item: Student }) => (
    <TouchableOpacity
      onPress={() => router.push(`/admin/student/${item.uid}`)}
    >
      <Card style={styles.studentCard}>
        <Avatar source={item.photoUrl} name={item.displayName} size="medium" />
        
        <View style={styles.studentInfo}>
          <Text style={[styles.studentName, { color: colors.text }]}>
            {item.displayName}
          </Text>
          <Text style={[styles.studentEmail, { color: colors.textSecondary }]}>
            {item.email}
          </Text>
          {item.objetivoNoApp && (
            <Text style={[styles.studentGoal, { color: colors.textSecondary }]} numberOfLines={1}>
              Objetivo: {item.objetivoNoApp}
            </Text>
          )}
        </View>

        <View style={styles.studentStatus}>
          <View style={[
            styles.statusBadge,
            { backgroundColor: item.assinatura ? `${colors.success}20` : `${colors.error}20` }
          ]}>
            <Text style={[
              styles.statusText,
              { color: item.assinatura ? colors.success : colors.error }
            ]}>
              {item.assinatura ? 'Ativo' : 'Inativo'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </View>
      </Card>
    </TouchableOpacity>
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
        <Text style={[styles.title, { color: colors.text }]}>
          Meus Alunos
        </Text>
        <TouchableOpacity onPress={() => router.push('/admin/students/add')}>
          <Ionicons name="person-add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Buscar alunos..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statItem, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statNumber, { color: colors.primary }]}>
            {students.length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Total
          </Text>
        </View>
        <View style={[styles.statItem, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statNumber, { color: colors.success }]}>
            {students.filter(s => s.assinatura).length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Ativos
          </Text>
        </View>
        <View style={[styles.statItem, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statNumber, { color: colors.error }]}>
            {students.filter(s => !s.assinatura).length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Inativos
          </Text>
        </View>
      </View>

      {filteredStudents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {searchQuery ? 'Nenhum aluno encontrado' : 'Nenhum aluno cadastrado'}
          </Text>
          {!searchQuery && (
            <Button
              title="Adicionar Aluno"
              onPress={() => router.push('/admin/students/add')}
              icon="person-add"
              style={{ marginTop: spacing.md }}
            />
          )}
        </View>
      ) : (
        <FlatList
          data={filteredStudents}
          renderItem={renderStudent}
          keyExtractor={item => item.uid}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  list: {
    padding: spacing.base,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  studentInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
  },
  studentEmail: {
    fontSize: 13,
    marginTop: spacing.xs,
  },
  studentGoal: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  studentStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: 16,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
