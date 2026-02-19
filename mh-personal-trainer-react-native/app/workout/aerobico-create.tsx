import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { firestoreService, Aluno } from '../../src/services/firestoreService';
import {
  createAerobicWorkout,
  fetchAerobicWorkoutById,
  updateAerobicWorkout,
} from '../../src/services/workouts';
import { Button, Card, DateInput, Input, SearchableSelect } from '../../src/components/common';
import { AerobicWorkoutItem } from '../../src/types/workout';
import { spacing, borderRadius } from '../../src/theme';

interface AerobicItemForm {
  id: string;
  nome: string;
}

const createEmptyItem = (): AerobicItemForm => ({
  id: `${Date.now()}-${Math.random()}`,
  nome: '',
});

export default function AerobicoCreateScreen() {
  const { colors } = useTheme();
  const { user, role } = useAuthStore();
  const { studentId, workoutId } = useLocalSearchParams<{ studentId?: string; workoutId?: string }>();

  const isPersonal = role === 'personal' || role === 'professor';
  const isEditing = typeof workoutId === 'string' && workoutId.length > 0;
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    typeof studentId === 'string' ? studentId : null
  );
  const [items, setItems] = useState<AerobicItemForm[]>([createEmptyItem()]);
  const [aquecimento, setAquecimento] = useState('');
  const [volta, setVolta] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [workoutDate, setWorkoutDate] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const studentOptions = useMemo(
    () =>
      students.map((student) => ({
        id: student.id,
        label: student.nome,
        description: student.email,
      })),
    [students]
  );
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

  useEffect(() => {
    if (!isEditing || !targetUserId) return;
    const loadWorkout = async () => {
      setLoading(true);
      const result = await fetchAerobicWorkoutById(targetUserId, workoutId as string);
      setLoading(false);
      if (result.error || !result.data) {
        showAlert('Erro', result.error || 'Treino aeróbico não encontrado.');
        return;
      }
      const loadedItems: AerobicWorkoutItem[] = result.data.items?.length
        ? result.data.items
        : result.data.treinos?.length
        ? result.data.treinos.map((nome) => ({ nome }))
        : result.data.treino
        ? [{ nome: result.data.treino }]
        : [];
      setItems(
        loadedItems.length
          ? loadedItems.map((item) => ({
              id: `${Date.now()}-${Math.random()}`,
              nome: item.nome || '',
            }))
          : [createEmptyItem()]
      );
      setAquecimento(result.data.aquecimento || '');
      setVolta(result.data.voltaacalma || '');
      setObservacoes(result.data.observacoes || '');
      setWorkoutDate(result.data.data || result.data.createdAt || new Date());
    };
    loadWorkout();
  }, [isEditing, targetUserId, workoutId]);

  const handleAddItem = () => {
    setItems((prev) => [...prev, createEmptyItem()]);
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      return next.length ? next : [createEmptyItem()];
    });
  };

  const handleChangeItem = (id: string, field: keyof AerobicItemForm, value: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const buildPayloadItems = () =>
    items
      .map((item) => ({
        nome: item.nome.trim(),
      }))
      .filter((item) => item.nome);

  const handleSave = async () => {
    if (!targetUserId) {
      showAlert('Erro', 'Selecione um aluno.');
      return;
    }
    const parsedItems = buildPayloadItems();
    if (parsedItems.length === 0) {
      showAlert('Erro', 'Adicione pelo menos um treino aeróbico.');
      return;
    }
    setSaving(true);
    const payload = {
      items: parsedItems,
      treinos: parsedItems.map((item) => item.nome),
      treino: parsedItems[0].nome,
      aquecimento: aquecimento.trim() || undefined,
      voltaacalma: volta.trim() || undefined,
      observacoes: observacoes.trim() || undefined,
      data: workoutDate,
    };
    const result = isEditing
      ? await updateAerobicWorkout(targetUserId, workoutId as string, payload)
      : await createAerobicWorkout(targetUserId, payload);
    setSaving(false);
    if (result.error) {
      showAlert('Erro', result.error);
      return;
    }
    showAlert('Sucesso', isEditing ? 'Treino aeróbico atualizado!' : 'Treino aeróbico criado!', [
      { text: 'Ok', onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Ionicons name="arrow-back" size={24} color={colors.text} onPress={() => router.back()} />
        <Text style={[styles.title, { color: colors.text }]}>
          {isEditing ? 'Editar aeróbico' : 'Novo aeróbico'}
        </Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isPersonal && (
          <Card>
            <SearchableSelect
              label="Aluno"
              placeholder="Selecione um aluno"
              options={studentOptions}
              value={selectedStudentId}
              onChange={setSelectedStudentId}
            />
          </Card>
        )}

        <DateInput
          label="Data do treino"
          placeholder="DD/MM/AAAA"
          value={workoutDate}
          onChange={setWorkoutDate}
        />

        <View style={[styles.itemsHeader, { borderColor: colors.border }]}> 
          <Text style={[styles.itemsTitle, { color: colors.text }]}>Treinos aeróbicos</Text>
          <TouchableOpacity style={styles.addButton} onPress={handleAddItem}>
            <Ionicons name="add-circle" size={22} color={colors.primary} />
            <Text style={[styles.addButtonText, { color: colors.primary }]}>Adicionar</Text>
          </TouchableOpacity>
        </View>

        {items.map((item, index) => (
          <Card key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>Treino {index + 1}</Text>
              <TouchableOpacity onPress={() => handleRemoveItem(item.id)}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
            <Input
              label="Atividade"
              placeholder="Ex: Corrida leve"
              value={item.nome}
              onChangeText={(value) => handleChangeItem(item.id, 'nome', value)}
            />
          </Card>
        ))}

        <Input
          label="Aquecimento"
          placeholder="Ex: Caminhada 5 min"
          value={aquecimento}
          onChangeText={setAquecimento}
        />
        <Input
          label="Volta a calma"
          placeholder="Ex: Alongamentos"
          value={volta}
          onChangeText={setVolta}
        />
        <Input
          label="Observações"
          placeholder="Observações adicionais"
          value={observacoes}
          onChangeText={setObservacoes}
          multiline
        />

        <Button
          title={isEditing ? 'Salvar alterações' : 'Salvar'}
          onPress={handleSave}
          loading={saving || loading}
          fullWidth
          size="large"
          style={{ marginTop: spacing.md }}
        />
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
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
  },
  itemsTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  itemCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
});
