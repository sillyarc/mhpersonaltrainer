import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuth } from '../../src/hooks/useAuth';
import { firestoreService } from '../../src/services/firestoreService';
import { db } from '../../src/services/firebase';
import { Button, Input, Card } from '../../src/components/common';
import { spacing, borderRadius } from '../../src/theme';

export default function ChangePersonalCodeScreen() {
  const { colors } = useTheme();
  const { user, refreshUser } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!user?.uid) return;
    const codigoNumero = Number(codigo);
    if (Number.isNaN(codigoNumero) || codigoNumero <= 0) {
      showAlert('Atenção', 'Informe um código válido.');
      return;
    }

    setLoading(true);
    try {
      const personal = await firestoreService.getPersonalProfileByCode(codigoNumero);
      if (!personal) {
        showAlert('Código não encontrado', 'Verifique o código informado e tente novamente.');
        return;
      }

      const capacity = await firestoreService.getPersonalStudentCapacityByCode(codigoNumero, {
        excludeUserId: user.uid,
      });
      if (!capacity.allowed) {
        showAlert(
          capacity.reason === 'personal_not_found' ? 'Codigo nao encontrado' : 'Limite do plano gratuito',
          capacity.reason === 'personal_not_found'
            ? 'Codigo do personal nao encontrado.'
            : 'Esse personal atingiu o limite de 4 alunos no plano gratuito. Peca para ele assinar o Premium para liberar alunos ilimitados.'
        );
        return;
      }

      await updateDoc(doc(db, 'users', user.uid), {
        codigoPersonal: codigoNumero,
        alunoDesde: serverTimestamp(),
        nameDoSeuPersonal: capacity.personalName || personal.displayName,
      });

      await refreshUser?.();
      showAlert('Sucesso', 'Código atualizado com sucesso!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      showAlert('Erro', error.message || 'Não foi possível atualizar o código.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Código do personal</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Atualize seu personal</Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            Insira o código informado pelo personal para liberar seus treinos.
          </Text>
        </Card>

        <Input
          label="Código do personal"
          value={codigo}
          onChangeText={setCodigo}
          keyboardType="numeric"
          placeholder="Ex: 530"
          icon="key-outline"
        />

        <Button
          title={loading ? 'Atualizando...' : 'Atualizar'}
          onPress={handleSave}
          loading={loading}
          fullWidth
          size="large"
          style={{ marginTop: spacing.md }}
        />

        <View style={[styles.helperCard, { borderColor: colors.border, borderRadius: borderRadius.lg }]}>
          <Text style={[styles.helperTitle, { color: colors.text }]}>Sem personal?</Text>
          <Text style={[styles.helperSubtitle, { color: colors.textSecondary }]}>
            Experimente treinos com IA e personalize sua rotina.
          </Text>
          <TouchableOpacity
            style={[styles.helperButton, { backgroundColor: colors.primary, borderRadius: borderRadius.md }]}
            onPress={() => router.push('/chat/ai' as any)}
          >
            <Text style={[styles.helperButtonText, { color: colors.info }]}>Abrir assistente IA</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    fontSize: 13,
  },
  helperCard: {
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  helperTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  helperSubtitle: {
    fontSize: 12,
  },
  helperButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  helperButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
