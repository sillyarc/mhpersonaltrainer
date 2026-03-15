import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuth } from '../../src/hooks/useAuth';
import { db, storage } from '../../src/services/firebase';
import { getStorageErrorMessage } from '../../src/services/firebaseErrors';
import { firestoreService } from '../../src/services/firestoreService';
import { notifyPersonalStudentLinkedByCode } from '../../src/services/notificationCenter';
import { Button, Input, Avatar, Loading, DateInput } from '../../src/components/common';
import { spacing, borderRadius } from '../../src/theme';
import { formatDateString, parseDateString } from '@utils/date';

export default function EditProfileAdvancedScreen() {
  const { colors } = useTheme();
  const { user, role, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const isPersonal = role === 'personal' || role === 'professor';

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [birthday, setBirthday] = useState<Date | null>(() => parseDateString(user?.birthday));
  const [genero, setGenero] = useState(user?.genero || '');
  const [codigoPersonal, setCodigoPersonal] = useState(
    user?.codigoPersonal ? String(user.codigoPersonal) : ''
  );
  const [photoUrl, setPhotoUrl] = useState(user?.photoUrl || '');

  useEffect(() => {
    if (isPersonal) {
      router.replace('/profile/personal-edit');
    }
  }, [isPersonal]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0].uri);
    }
  };

  const uploadPhoto = async (uri: string) => {
    if (!user?.uid) return;

    setUploadingPhoto(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();

      const photoRef = ref(storage, `users/${user.uid}/profile.jpg`);
      await uploadBytes(photoRef, blob);

      const downloadUrl = await getDownloadURL(photoRef);
      setPhotoUrl(downloadUrl);

      await updateDoc(doc(db, 'users', user.uid), {
        photo_url: downloadUrl,
      });

      showAlert('Sucesso', 'Foto atualizada com sucesso!');
    } catch (error) {
      const message = getStorageErrorMessage(error, 'Erro ao fazer upload da foto');
      showAlert('Erro', message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!user?.uid) return;

    setLoading(true);
    try {
      const previousPersonalCode = user?.codigoPersonal ? Number(user.codigoPersonal) : null;
      const codigoNumero = codigoPersonal ? Number(codigoPersonal) : null;
      let personalNameToSave = '';
      if (codigoPersonal && (codigoNumero === null || Number.isNaN(codigoNumero) || codigoNumero <= 0)) {
        showAlert('Erro', 'Informe um codigo do personal valido.');
        return;
      }

      if (!isPersonal && codigoNumero) {
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
        personalNameToSave = capacity.personalName || '';
      }

      const payload: Record<string, any> = {
        display_name: displayName,
        phone_number: phoneNumber,
        birthday: formatDateString(birthday),
        genero,
      };
      if (!isPersonal) {
        payload.codigoPersonal = codigoNumero;
        payload.nameDoSeuPersonal = codigoNumero ? personalNameToSave : '';
      }
      await updateDoc(doc(db, 'users', user.uid), payload);

      if (!isPersonal && codigoNumero && codigoNumero !== previousPersonalCode) {
        void notifyPersonalStudentLinkedByCode({
          personalCode: codigoNumero,
          studentId: user.uid,
          studentName: displayName || user.displayName,
          studentEmail: user.email,
          source: 'profile_update',
        });
      }

      await refreshUser?.();
      showAlert('Sucesso', 'Perfil atualizado com sucesso!');
    } catch (error) {
      showAlert('Erro', 'Erro ao atualizar perfil');
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
        <Text style={[styles.title, { color: colors.text }]}>Editar perfil</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickImage} disabled={uploadingPhoto}>
            {uploadingPhoto ? (
              <View style={[styles.avatarLoading, { backgroundColor: colors.surface }]}>
                <Loading size="small" />
              </View>
            ) : (
              <Avatar source={photoUrl} name={displayName} size="xlarge" />
            )}
            <View style={[styles.editBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>

        <Input label="Nome completo" value={displayName} onChangeText={setDisplayName} icon="person-outline" />
        <Input label="Telefone" value={phoneNumber} onChangeText={setPhoneNumber} keyboardType="phone-pad" icon="call-outline" />
        <DateInput label="Data de nascimento" value={birthday} onChange={setBirthday} placeholder="DD/MM/AAAA" />
        <Input label="Genero" value={genero} onChangeText={setGenero} placeholder="Masculino/Feminino" icon="male-female-outline" />
        {!isPersonal && (
          <Input label="Codigo do personal" value={codigoPersonal} onChangeText={setCodigoPersonal} keyboardType="numeric" icon="key-outline" />
        )}

        <Button
          title="Salvar alteracoes"
          onPress={handleSave}
          loading={loading}
          fullWidth
          size="large"
          style={{ marginTop: spacing.lg }}
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
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatarLoading: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
