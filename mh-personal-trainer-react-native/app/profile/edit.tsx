import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../src/services/firebase';
import { getStorageErrorMessage } from '../../src/services/firebaseErrors';
import { firestoreService } from '../../src/services/firestoreService';
import { Button, Input, Avatar, Loading, DateInput } from '../../src/components/common';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { spacing, borderRadius } from '../../src/theme';
import { formatDateString, parseDateString } from '@utils/date';

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user, role, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const isPersonal = role === 'personal' || role === 'professor';

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [birthday, setBirthday] = useState<Date | null>(() => parseDateString(user?.birthday));
  const [peso, setPeso] = useState(user?.peso || '');
  const [altura, setAltura] = useState(user?.altura || '');
  const [objetivoNoApp, setObjetivoNoApp] = useState(user?.objetivoNoApp || '');
  const [experiencia, setExperiencia] = useState(user?.experiencia || '');
  const [limitacao, setLimitacao] = useState(user?.limitacao || '');
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
      console.error('Error uploading photo:', error);
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
        peso,
        altura,
        objetivoNoApp,
        expericencia: experiencia,
        limitacao,
      };
      if (!isPersonal) {
        payload.codigoPersonal = codigoNumero;
        payload.nameDoSeuPersonal = codigoNumero ? personalNameToSave : '';
      }
      await updateDoc(doc(db, 'users', user.uid), payload);

      await refreshUser?.();
      showAlert('Sucesso', 'Perfil atualizado com sucesso!');
      router.back();
    } catch (error) {
      console.error('Error updating profile:', error);
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
        <Text style={[styles.title, { color: colors.text }]}>
          {t('profile.editProfile')}
        </Text>
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

        <Input
          label={t('auth.name')}
          value={displayName}
          onChangeText={setDisplayName}
          icon="person-outline"
        />

        <Input
          label={t('auth.phone')}
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          keyboardType="phone-pad"
          icon="call-outline"
        />

        <DateInput
          label="Data de Nascimento"
          value={birthday}
          onChange={setBirthday}
          placeholder="DD/MM/AAAA"
        />

        <View style={styles.row}>
          <View style={styles.halfInput}>
            <Input
              label="Peso (kg)"
              value={peso}
              onChangeText={setPeso}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.halfInput}>
            <Input
              label="Altura (cm)"
              value={altura}
              onChangeText={setAltura}
              keyboardType="numeric"
            />
          </View>
        </View>

        <Input
          label={t('profile.goal')}
          value={objetivoNoApp}
          onChangeText={setObjetivoNoApp}
          multiline
          numberOfLines={3}
          icon="flag-outline"
        />

        {!isPersonal && (
          <Input
            label="Codigo do personal"
            value={codigoPersonal}
            onChangeText={setCodigoPersonal}
            keyboardType="numeric"
            icon="key-outline"
          />
        )}

        <Input
          label={t('profile.experience')}
          value={experiencia}
          onChangeText={setExperiencia}
          placeholder="Iniciante, Intermediário, Avançado..."
          icon="fitness-outline"
        />

        <Input
          label={t('profile.limitations')}
          value={limitacao}
          onChangeText={setLimitacao}
          multiline
          numberOfLines={3}
          placeholder="Lesões, restrições médicas..."
          icon="warning-outline"
        />

        <Button
          title={t('common.save')}
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
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfInput: {
    flex: 1,
  },
});
