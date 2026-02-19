import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../src/services/firebase';
import { Card, Avatar, Loading, Button } from '../../../src/components/common';
import { useTheme } from '../../../src/hooks/useTheme';
import { spacing, borderRadius } from '../../../src/theme';

interface StudentDetail {
  uid: string;
  displayName: string;
  email: string;
  phoneNumber?: string;
  photoUrl?: string;
  assinatura?: boolean;
  tipoDeAssinatura?: string;
  objetivoNoApp?: string;
  experiencia?: string;
  limitacao?: string;
  peso?: string;
  altura?: string;
  birthday?: string;
  createdAt?: Date;
}

export default function StudentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<StudentDetail | null>(null);

  useEffect(() => {
    loadStudent();
  }, [id]);

  const loadStudent = async () => {
    if (!id) return;

    try {
      const studentDoc = await getDoc(doc(db, 'users', id));
      
      if (studentDoc.exists()) {
        const data = studentDoc.data();
        setStudent({
          uid: studentDoc.id,
          displayName: data.display_name || data.email,
          email: data.email,
          phoneNumber: data.phone_number,
          photoUrl: data.photo_url,
          assinatura: data.assinatura,
          tipoDeAssinatura: data.tipoDeAssinatura,
          objetivoNoApp: data.objetivoNoApp,
          experiencia: data.expericencia,
          limitacao: data.limitacao,
          peso: data.peso,
          altura: data.altura,
          birthday: data.birthday,
          createdAt: data.created_at?.toDate(),
        });
      }
    } catch (error) {
      console.error('Error loading student:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveStudent = () => {
    showAlert(
      'Remover Aluno',
      `Tem certeza que deseja remover ${student?.displayName} da sua lista de alunos?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', id!), {
                personal_id: null,
              });
              showAlert('Sucesso', 'Aluno removido da sua lista');
              router.back();
            } catch (error) {
              showAlert('Erro', 'Não foi possível remover o aluno');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Loading />
      </SafeAreaView>
    );
  }

  if (!student) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            Aluno não encontrado
          </Text>
        </View>
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
          Detalhes do Aluno
        </Text>
        <TouchableOpacity onPress={handleRemoveStudent}>
          <Ionicons name="trash-outline" size={24} color={colors.error} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileSection}>
          <Avatar source={student.photoUrl} name={student.displayName} size="xlarge" />
          <Text style={[styles.studentName, { color: colors.text }]}>
            {student.displayName}
          </Text>
          <Text style={[styles.studentEmail, { color: colors.textSecondary }]}>
            {student.email}
          </Text>
          <View style={[
            styles.statusBadge,
            { backgroundColor: student.assinatura ? `${colors.success}20` : `${colors.error}20` }
          ]}>
            <Text style={[
              styles.statusText,
              { color: student.assinatura ? colors.success : colors.error }
            ]}>
              {student.assinatura ? 'Assinatura Ativa' : 'Sem Assinatura'}
            </Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push(`/workout/create?studentId=${id}`)}
          >
            <Ionicons name="barbell" size={22} color="#fff" />
            <Text style={styles.actionBtnText}>Criar Treino</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.secondary }]}
            onPress={() => router.push(`/evaluations/create?studentId=${id}`)}
          >
            <Ionicons name="clipboard" size={22} color="#fff" />
            <Text style={styles.actionBtnText}>Nova Avaliação</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.accent }]}
            onPress={() => router.push(`/chat/${id}`)}
          >
            <Ionicons name="chatbubbles" size={22} color="#fff" />
            <Text style={styles.actionBtnText}>Mensagem</Text>
          </TouchableOpacity>
        </View>

        <Card style={styles.infoCard}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Informações Pessoais
          </Text>

          {student.phoneNumber && (
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={20} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {student.phoneNumber}
              </Text>
            </View>
          )}

          {student.birthday && (
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.text }]}>
                {student.birthday}
              </Text>
            </View>
          )}

          <View style={styles.measurementsRow}>
            {student.peso && (
              <View style={[styles.measurementItem, { backgroundColor: colors.surface }]}>
                <Text style={[styles.measurementValue, { color: colors.primary }]}>
                  {student.peso}
                </Text>
                <Text style={[styles.measurementLabel, { color: colors.textSecondary }]}>
                  Peso (kg)
                </Text>
              </View>
            )}
            {student.altura && (
              <View style={[styles.measurementItem, { backgroundColor: colors.surface }]}>
                <Text style={[styles.measurementValue, { color: colors.primary }]}>
                  {student.altura}
                </Text>
                <Text style={[styles.measurementLabel, { color: colors.textSecondary }]}>
                  Altura (cm)
                </Text>
              </View>
            )}
          </View>
        </Card>

        {student.objetivoNoApp && (
          <Card style={styles.infoCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Objetivo
            </Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {student.objetivoNoApp}
            </Text>
          </Card>
        )}

        {student.experiencia && (
          <Card style={styles.infoCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Experiência
            </Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {student.experiencia}
            </Text>
          </Card>
        )}

        {student.limitacao && (
          <Card style={styles.infoCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Limitações / Restrições
            </Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {student.limitacao}
            </Text>
          </Card>
        )}
      </ScrollView>
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
  content: {
    padding: spacing.base,
    paddingBottom: spacing['4xl'],
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  studentName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: spacing.md,
  },
  studentEmail: {
    fontSize: 14,
    marginTop: spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  infoCard: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 22,
  },
  measurementsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  measurementItem: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  measurementValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  measurementLabel: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
});
