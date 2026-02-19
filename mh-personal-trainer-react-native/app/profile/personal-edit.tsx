import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { collection, doc, getDocs, limit, query, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuth } from '../../src/hooks/useAuth';
import { db, storage } from '../../src/services/firebase';
import { getStorageErrorMessage } from '../../src/services/firebaseErrors';
import { Button, Input, Avatar, Loading } from '../../src/components/common';
import { spacing } from '../../src/theme';

interface PersonalAccountData {
  id: string;
  displayName?: string;
  phoneNumber?: string;
  photoUrl?: string;
  bio?: string;
  userName?: string;
  codigoPersonal?: number;
  cref?: string;
  instagram?: string;
  linkedin?: string;
}

export default function EditPersonalProfileScreen() {
  const { colors } = useTheme();
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [personalAccount, setPersonalAccount] = useState<PersonalAccountData | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [bio, setBio] = useState('');
  const [cref, setCref] = useState('');
  const [instagram, setInstagram] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [photoUrl, setPhotoUrl] = useState(user?.photoUrl || '');

  useEffect(() => {
    const loadPersonalAccount = async () => {
      if (!user?.uid) return;
      const refCol = collection(db, 'users', user.uid, 'personalAccount');
      const snapshot = await getDocs(query(refCol, limit(1)));
      const docItem = snapshot.docs[0];
      if (docItem) {
        const data = docItem.data() as any;
        const account: PersonalAccountData = {
          id: docItem.id,
          displayName: data.display_name,
          phoneNumber: data.phone_number,
          photoUrl: data.photo_url,
          bio: data.bio,
          userName: data.user_name,
          codigoPersonal: data.codigoPersonal,
          cref: data.cref,
          instagram: data.instagram,
          linkedin: data.linkedin,
        };
        setPersonalAccount(account);
        setDisplayName(account.displayName || user.displayName || '');
        setPhoneNumber(account.phoneNumber || user.phoneNumber || '');
        setBio(account.bio || '');
        setCref(account.cref || '');
        setInstagram(account.instagram || '');
        setLinkedin(account.linkedin || '');
        setPhotoUrl(account.photoUrl || user.photoUrl || '');
      }
    };
    loadPersonalAccount();
  }, [user]);

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
    } catch (error) {
      const message = getStorageErrorMessage(error, 'Erro ao fazer upload da foto');
      showAlert('Erro', message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!user?.uid || !personalAccount?.id) return;
    setLoading(true);
    try {
      const personalRef = doc(db, 'users', user.uid, 'personalAccount', personalAccount.id);
      await updateDoc(personalRef, {
        display_name: displayName,
        phone_number: phoneNumber,
        photo_url: photoUrl,
        bio,
        cref,
        instagram,
        linkedin,
      });

      await updateDoc(doc(db, 'users', user.uid), {
        display_name: displayName,
        phone_number: phoneNumber,
        photo_url: photoUrl,
      });

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
          {personalAccount?.codigoPersonal ? (
            <Text style={[styles.codeText, { color: colors.textSecondary }]}>
              Codigo do personal: {personalAccount.codigoPersonal}
            </Text>
          ) : null}
        </View>

        <Input label="Nome completo" value={displayName} onChangeText={setDisplayName} icon="person-outline" />
        <Input label="Telefone" value={phoneNumber} onChangeText={setPhoneNumber} keyboardType="phone-pad" icon="call-outline" />
        <Input label="CREF" value={cref} onChangeText={setCref} icon="document-text-outline" />
        <Input label="Biografia" value={bio} onChangeText={setBio} multiline numberOfLines={4} icon="chatbubble-ellipses-outline" />
        <Input label="Instagram" value={instagram} onChangeText={setInstagram} icon="logo-instagram" />
        <Input label="LinkedIn" value={linkedin} onChangeText={setLinkedin} icon="logo-linkedin" />

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
    gap: 8,
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
  codeText: {
    fontSize: 14,
  },
});
