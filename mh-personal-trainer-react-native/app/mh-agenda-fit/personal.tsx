import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuthStore } from '../../src/store/authStore';
import { useAuth } from '../../src/hooks/useAuth';
import { db, storage } from '../../src/services/firebase';
import {
  fetchStripeConnectStatus,
  submitStripeConnectOnboarding,
  StripeConnectStatus,
} from '../../src/services/payments';
import { fetchAppointments } from '../../src/services/scheduling';
import { firestoreService } from '../../src/services/firestoreService';
import { Button, Input, Avatar, Card, Loading } from '../../src/components/common';
import type { Appointment } from '../../src/types/scheduling';
import type { Aluno } from '../../src/services/firestoreService';
import { spacing, borderRadius } from '../../src/theme';

interface ServiceForm {
  nome: string;
  descricao?: string;
  preco?: number;
}

interface ReceivingFormState {
  email: string;
  firstName: string;
  lastName: string;
  cpf: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  addressLine1: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  phone: string;
  productDescription: string;
  routingNumber: string;
  accountNumber: string;
}

const initialReceivingForm: ReceivingFormState = {
  email: '',
  firstName: '',
  lastName: '',
  cpf: '',
  dobDay: '',
  dobMonth: '',
  dobYear: '',
  addressLine1: '',
  addressCity: '',
  addressState: '',
  addressPostalCode: '',
  phone: '',
  productDescription: '',
  routingNumber: '',
  accountNumber: '',
};

const formatTimeValue = (value: any) => {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const parseTimeValue = (value: string) => {
  if (!value) return undefined;
  const [hours, minutes] = value.split(':').map((item) => Number(item));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return undefined;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const normalizeServicos = (value: any) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      nome: item?.servicos || item?.nome || '',
      descricao: item?.descricao || '',
      preco: typeof item?.valor === 'number' ? item.valor : item?.preco,
    }))
    .filter((item) => item.nome);
};

const toDateKey = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

const toWeekDay = (value: Date) =>
  value.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');

const toDayMonth = (value: Date) =>
  value.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const getStatusLabel = (status?: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'confirmado') return 'Confirmado';
  if (normalized === 'concluido') return 'Concluido';
  if (normalized === 'cancelado') return 'Cancelado';
  if (normalized === 'reagendado') return 'Reagendado';
  if (normalized === 'em_andamento') return 'Em andamento';
  return 'Agendado';
};

const normalizeReceivingError = (message: string) => {
  const normalized = String(message || '').toLowerCase();
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'Nao foi possivel conectar ao servico de recebimentos.';
  }
  if (normalized.includes('permission') || normalized.includes('unauthorized')) {
    return 'Sem permissao para acessar os recebimentos.';
  }
  if (normalized.includes('stripe') || normalized.includes('api url')) {
    return 'Servico de recebimentos nao configurado.';
  }
  return message;
};

export default function MHAgendaFitPersonalScreen() {
  const { colors } = useTheme();
  const { user, updateUser } = useAuthStore();
  const { refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null);
  const [stripeStatusLoading, setStripeStatusLoading] = useState(false);
  const [receivingForm, setReceivingForm] = useState<ReceivingFormState>(initialReceivingForm);
  const [receivingSubmitting, setReceivingSubmitting] = useState(false);
  const [receivingMessage, setReceivingMessage] = useState('');
  const [receivingRedirectUrl, setReceivingRedirectUrl] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [especializacao, setEspecializacao] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [services, setServices] = useState<ServiceForm[]>([]);
  const [editingServiceIndex, setEditingServiceIndex] = useState<number | null>(null);
  const [serviceForm, setServiceForm] = useState({ nome: '', descricao: '', preco: '' });
  const [schedule, setSchedule] = useState({
    segSexInicio: '',
    segSexFim: '',
    sabInicio: '',
    sabFim: '',
    domInicio: '',
    domFim: '',
  });
  const [myStudents, setMyStudents] = useState<Aluno[]>([]);
  const [loadingMyStudents, setLoadingMyStudents] = useState(false);
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [loadingMyAppointments, setLoadingMyAppointments] = useState(false);
  const [hubError, setHubError] = useState('');

  const apiUrl = process.env.EXPO_PUBLIC_API_URL || '';
  const stripeReady =
    Boolean(process.env.EXPO_PUBLIC_STRIPE_FUNCTIONS_URL) ||
    (Boolean(apiUrl) && !apiUrl.includes('api.stripe.com'));

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (!active) return;
      if (snap.exists()) {
        const data = snap.data();
        setDisplayName(data.display_name || user.displayName || '');
        setBio(data.bio || '');
        setEspecializacao(
          Array.isArray(data.especializacao)
            ? data.especializacao.join(', ')
            : data.especializacao || ''
        );
        setCidade(data.cidade || data.city || data.cidadeAtual || '');
        setEstado(data.estado || data.uf || data.state || '');
        setPhotoUrl(data.photo_url || user.photoUrl || '');
        if (data.location?.latitude !== undefined && data.location?.latitude !== null) {
          setLatitude(String(data.location.latitude));
        }
        if (data.location?.longitude !== undefined && data.location?.longitude !== null) {
          setLongitude(String(data.location.longitude));
        }
        setServices(normalizeServicos(data.servicos));
        setSchedule({
          segSexInicio: formatTimeValue(data.horarioAtendimento?.inicioSegSex),
          segSexFim: formatTimeValue(data.horarioAtendimento?.terminioSegSex),
          sabInicio: formatTimeValue(data.horarioAtendimento?.inicioSab),
          sabFim: formatTimeValue(data.horarioAtendimento?.terminioSab),
          domInicio: formatTimeValue(data.horarioAtendimento?.inicioDom),
          domFim: formatTimeValue(data.horarioAtendimento?.terminioDom),
        });

        setReceivingForm((prev) => {
          const fullName = String(data.display_name || user.displayName || '').trim();
          const nameParts = fullName.split(/\s+/).filter(Boolean);
          const firstName = prev.firstName || nameParts[0] || '';
          const lastName = prev.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');
          return {
            ...prev,
            email: prev.email || data.email || user.email || '',
            firstName,
            lastName,
            phone: prev.phone || data.phone_number || user.phoneNumber || '',
            addressCity: prev.addressCity || data.cidade || data.city || data.cidadeAtual || '',
            addressState: prev.addressState || data.estado || data.uf || data.state || '',
            productDescription: prev.productDescription || data.bio || data.especializacao || '',
          };
        });
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !stripeReady) return;
    let active = true;
    setStripeStatusLoading(true);
    fetchStripeConnectStatus(user.uid, user.stripeAccountId)
      .then((result) => {
        if (!active) return;
        setStripeStatus(result.data);
      })
      .catch(() => {
        if (!active) return;
        setStripeStatus(null);
      })
      .finally(() => {
        if (!active) return;
        setStripeStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [stripeReady, user?.uid, user?.stripeAccountId]);

  useEffect(() => {
    let active = true;

    const loadHubData = async () => {
      if (!user?.uid) {
        setMyStudents([]);
        setMyAppointments([]);
        return;
      }

      setLoadingMyStudents(true);
      setLoadingMyAppointments(true);
      setHubError('');

      try {
        const [students, appointmentsResult] = await Promise.all([
          firestoreService.getAlunosDoPersonal(user.uid),
          fetchAppointments(user.uid, true),
        ]);

        if (!active) return;

        setMyStudents(students);
        const appointments = (appointmentsResult.data || []).sort(
          (a, b) => a.data.getTime() - b.data.getTime()
        );
        setMyAppointments(appointments);
      } catch (error: any) {
        if (!active) return;
        setHubError('Nao foi possivel carregar os dados do painel MH Agenda Fit.');
        setMyStudents([]);
        setMyAppointments([]);
      } finally {
        if (!active) return;
        setLoadingMyStudents(false);
        setLoadingMyAppointments(false);
      }
    };

    loadHubData();

    return () => {
      active = false;
    };
  }, [user?.uid]);

  const stripeConnected = useMemo(() => {
    if (stripeStatus) {
      return Boolean(stripeStatus.chargesEnabled) && stripeStatus.detailsSubmitted !== false;
    }
    return Boolean(user?.stripeAccountId) || Boolean(user?.stripeAtivo);
  }, [stripeStatus, user?.stripeAccountId, user?.stripeAtivo]);

  const stripeStatusText = stripeStatusLoading
    ? 'Verificando dados de recebimento...'
    : !stripeReady
    ? 'Servico de recebimentos nao configurado'
    : stripeConnected
    ? 'Conta pronta para receber pagamentos'
    : stripeStatus?.requirements?.disabledReason
    ? `Conta incompleta: ${stripeStatus.requirements.disabledReason}`
    : 'Conta pendente - preencha os dados para liberar recebimentos';

  const appointmentCountByDate = useMemo(() => {
    const map: Record<string, number> = {};
    myAppointments.forEach((item) => {
      const key = toDateKey(item.data);
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [myAppointments]);

  const nextSevenDays = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const current = new Date(base);
      current.setDate(base.getDate() + index);
      return current;
    });
  }, []);

  const upcomingAppointments = useMemo(() => {
    const now = new Date();
    return myAppointments.filter((item) => item.data >= now).slice(0, 5);
  }, [myAppointments]);

  const activeStudentsCount = useMemo(
    () => myStudents.filter((student) => student.status === 'ativo').length,
    [myStudents]
  );

  const newStudentsThisMonth = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return myStudents.filter((student) => student.alunoDesde && student.alunoDesde >= startOfMonth).length;
  }, [myStudents]);

  const profileCompletion = useMemo(() => {
    const checks = [
      Boolean(displayName.trim()),
      Boolean(bio.trim()),
      Boolean(especializacao.trim()),
      Boolean(cidade.trim()),
      Boolean(estado.trim()),
      services.length > 0,
      Boolean(photoUrl),
      Object.values(schedule).some(Boolean),
    ];
    const score = checks.filter(Boolean).length;
    return Math.round((score / checks.length) * 100);
  }, [displayName, bio, especializacao, cidade, estado, services.length, photoUrl, schedule]);

  const handleReceivingFieldChange =
    (field: keyof ReceivingFormState) =>
    (value: string) => {
      setReceivingForm((prev) => ({ ...prev, [field]: value }));
    };

  const refreshReceivingStatus = async () => {
    if (!user?.uid || !stripeReady) return;
    setStripeStatusLoading(true);
    try {
      const result = await fetchStripeConnectStatus(user.uid, user.stripeAccountId);
      setStripeStatus(result.data);
    } finally {
      setStripeStatusLoading(false);
    }
  };

  const handleSubmitReceivingForm = async () => {
    if (receivingSubmitting) return;
    if (!stripeReady) {
      showAlert('Recebimentos', 'Servico de recebimentos nao configurado.');
      return;
    }
    if (!user?.uid) {
      showAlert('Recebimentos', 'Conta nao encontrada.');
      return;
    }

    const requiredFields: Array<[keyof ReceivingFormState, string]> = [
      ['email', 'email'],
      ['firstName', 'nome'],
      ['lastName', 'sobrenome'],
      ['cpf', 'cpf'],
      ['dobDay', 'dia de nascimento'],
      ['dobMonth', 'mes de nascimento'],
      ['dobYear', 'ano de nascimento'],
      ['addressLine1', 'endereco'],
      ['addressCity', 'cidade'],
      ['addressState', 'estado'],
      ['addressPostalCode', 'cep'],
      ['phone', 'telefone'],
      ['productDescription', 'descricao do servico'],
      ['routingNumber', 'agencia'],
      ['accountNumber', 'conta'],
    ];
    const missing = requiredFields.find(([key]) => !receivingForm[key]?.trim());
    if (missing) {
      showAlert('Recebimentos', `Preencha ${missing[1]}.`);
      return;
    }

    const day = Number(receivingForm.dobDay);
    const month = Number(receivingForm.dobMonth);
    const year = Number(receivingForm.dobYear);
    if (Number.isNaN(day) || day < 1 || day > 31) {
      showAlert('Recebimentos', 'Dia de nascimento invalido.');
      return;
    }
    if (Number.isNaN(month) || month < 1 || month > 12) {
      showAlert('Recebimentos', 'Mes de nascimento invalido.');
      return;
    }
    if (Number.isNaN(year) || year < 1900) {
      showAlert('Recebimentos', 'Ano de nascimento invalido.');
      return;
    }

    setReceivingSubmitting(true);
    setReceivingMessage('');
    setReceivingRedirectUrl('');
    try {
      const result = await submitStripeConnectOnboarding({
        ...receivingForm,
      });
      if (result.error || !result.data?.success) {
        throw new Error(result.error || 'Nao foi possivel enviar os dados.');
      }

      if (result.data.accountId) {
        await updateDoc(doc(db, 'users', user.uid), {
          stripeAccountId: result.data.accountId,
        });
        updateUser({
          stripeAccountId: result.data.accountId,
        });
      }

      if (result.data.url) {
        setReceivingRedirectUrl(result.data.url);
        try {
          await Linking.openURL(result.data.url);
        } catch {
          setReceivingMessage('Dados enviados. Abra o link de cadastro quando estiver disponivel.');
        }
      }

      await refreshUser?.();
      await refreshReceivingStatus();
      setReceivingMessage('Dados enviados com sucesso. Complete o cadastro para liberar recebimentos.');
      showAlert('Recebimentos', 'Dados enviados. Finalize o cadastro para liberar pagamentos.');
    } catch (error: any) {
      const rawMessage = String(error?.message || 'Nao foi possivel enviar os dados de recebimento.');
      const message = normalizeReceivingError(rawMessage);
      setReceivingMessage(message);
      showAlert('Recebimentos', message);
    } finally {
      setReceivingSubmitting(false);
    }
  };

  const handlePickPhoto = async () => {
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
    } catch (error: any) {
      showAlert('Erro', 'Nao foi possivel enviar a foto.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const resetServiceForm = () => {
    setServiceForm({ nome: '', descricao: '', preco: '' });
    setEditingServiceIndex(null);
  };

  const handleSaveService = () => {
    if (!serviceForm.nome.trim()) {
      showAlert('Atencao', 'Informe o nome do servico.');
      return;
    }
    const price = Number(serviceForm.preco.replace(',', '.'));
    const payload: ServiceForm = {
      nome: serviceForm.nome.trim(),
      descricao: serviceForm.descricao.trim() || undefined,
      preco: Number.isNaN(price) ? undefined : price,
    };

    setServices((current) => {
      if (editingServiceIndex !== null) {
        return current.map((item, index) => (index === editingServiceIndex ? payload : item));
      }
      return [...current, payload];
    });
    resetServiceForm();
  };

  const handleEditService = (index: number) => {
    const item = services[index];
    setEditingServiceIndex(index);
    setServiceForm({
      nome: item.nome || '',
      descricao: item.descricao || '',
      preco: item.preco !== undefined ? String(item.preco) : '',
    });
  };

  const handleRemoveService = (index: number) => {
    showAlert('Remover servico', 'Deseja remover este servico?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => setServices((current) => current.filter((_, i) => i !== index)),
      },
    ]);
  };

  const handleSave = async () => {
    if (!user?.uid || saving) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {
        display_name: displayName.trim(),
        bio: bio.trim(),
        especializacao: especializacao.trim(),
        cidade: cidade.trim(),
        estado: estado.trim(),
        photo_url: photoUrl || null,
        servicos: services.map((service) => ({
          servicos: service.nome,
          descricao: service.descricao || '',
          valor: typeof service.preco === 'number' ? service.preco : null,
        })),
      };

      const lat = Number(latitude.replace(',', '.'));
      const lng = Number(longitude.replace(',', '.'));
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        updates.location = { latitude: lat, longitude: lng };
      }

      const horarioPayload = {
        inicioSegSex: parseTimeValue(schedule.segSexInicio),
        terminioSegSex: parseTimeValue(schedule.segSexFim),
        inicioSab: parseTimeValue(schedule.sabInicio),
        terminioSab: parseTimeValue(schedule.sabFim),
        inicioDom: parseTimeValue(schedule.domInicio),
        terminioDom: parseTimeValue(schedule.domFim),
      };
      const hasHorario = Object.values(horarioPayload).some(Boolean);
      updates.horarioAtendimento = hasHorario ? horarioPayload : null;

      await updateDoc(doc(db, 'users', user.uid), updates);
      const nextUserUpdates: Record<string, any> = {
        displayName: updates.display_name,
        photoUrl: updates.photo_url || undefined,
        bio: updates.bio,
        cidade: updates.cidade,
        estado: updates.estado,
        especializacao: updates.especializacao,
        servicos: updates.servicos.map((service: any) => ({
          nome: service.servicos,
          descricao: service.descricao,
          preco: service.valor ?? undefined,
        })),
        horarioAtendimento: updates.horarioAtendimento || undefined,
      };
      if (updates.location) {
        nextUserUpdates.location = updates.location;
      }
      updateUser(nextUserUpdates);
      await refreshUser?.();
      showAlert('Sucesso', 'Perfil atualizado no MH Agenda Fit.');
    } catch (error: any) {
      showAlert('Erro', 'Nao foi possivel salvar as alteracoes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
        <Loading message="Carregando dados..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.primaryBackground }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>MH Agenda Fit</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.heroCard}>
          <View style={[styles.heroBanner, { backgroundColor: colors.secondary }]}>
            <View style={styles.heroContent}>
              <Text style={[styles.heroPill, { color: colors.info }]}>Painel do Personal</Text>
              <Text style={[styles.heroTitle, { color: colors.info }]}>MH Agenda Fit</Text>
              <Text style={[styles.heroSubtitle, { color: colors.info }]}>
                Organize sua vitrine, acompanhe agenda e monitore seu saldo em um so lugar.
              </Text>
            </View>
            <View style={styles.heroActions}>
              <TouchableOpacity
                style={[styles.heroButton, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/schedule' as any)}
              >
                <Ionicons name="calendar-outline" size={16} color={colors.info} />
                <Text style={[styles.heroButtonText, { color: colors.info }]}>Agenda</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.heroButton, { backgroundColor: colors.info + '20', borderWidth: 1, borderColor: colors.info + '50' }]}
                onPress={() => router.push('/financeiro/personal' as any)}
              >
                <Ionicons name="cash-outline" size={16} color={colors.info} />
                <Text style={[styles.heroButtonText, { color: colors.info }]}>Financeiro</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>

        {hubError ? (
          <Text style={[styles.helperText, { color: colors.warning }]}>{hubError}</Text>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => router.push('/personal/summary' as any)}
        >
          <Card style={styles.personalSummaryCard}>
            <View style={styles.personalSummaryHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Resumo</Text>
                <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                  Visao geral dos seus alunos.
                </Text>
              </View>
              <View style={[styles.personalSummaryIcon, { backgroundColor: colors.primary + '18' }]}>
                <Text style={[styles.personalSummaryIconText, { color: colors.primary }]}>RS</Text>
              </View>
            </View>

            <View style={styles.personalSummaryStats}>
              <View style={styles.personalSummaryStatItem}>
                <Text style={[styles.personalSummaryValue, { color: colors.text }]}>
                  {loadingMyStudents ? '...' : myStudents.length}
                </Text>
                <Text style={[styles.personalSummaryLabel, { color: colors.textSecondary }]}>
                  Total de alunos
                </Text>
              </View>
              <View style={styles.personalSummaryStatItem}>
                <Text style={[styles.personalSummaryValue, { color: colors.text }]}>
                  {loadingMyStudents ? '...' : activeStudentsCount}
                </Text>
                <Text style={[styles.personalSummaryLabel, { color: colors.textSecondary }]}>
                  Ativos
                </Text>
              </View>
              <View style={styles.personalSummaryStatItem}>
                <Text style={[styles.personalSummaryValue, { color: colors.text }]}>
                  {loadingMyStudents ? '...' : newStudentsThisMonth}
                </Text>
                <Text style={[styles.personalSummaryLabel, { color: colors.textSecondary }]}>
                  Novos no mes
                </Text>
              </View>
            </View>
          </Card>
        </TouchableOpacity>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Agenda da semana</Text>
            <TouchableOpacity onPress={() => router.push('/schedule' as any)}>
              <Text style={[styles.sectionHint, { color: colors.primary }]}>Ver agenda</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
            {nextSevenDays.map((day) => {
              const key = toDateKey(day);
              const count = appointmentCountByDate[key] || 0;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.dayPill, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => router.push('/schedule' as any)}
                >
                  <Text style={[styles.dayWeek, { color: colors.textSecondary }]}>{toWeekDay(day)}</Text>
                  <Text style={[styles.dayDate, { color: colors.text }]}>{toDayMonth(day)}</Text>
                  <Text style={[styles.dayCount, { color: colors.primary }]}>{count} agend.</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.upcomingList}>
            {loadingMyAppointments ? (
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>Carregando agenda...</Text>
            ) : upcomingAppointments.length ? (
              upcomingAppointments.map((appointment) => (
                <View
                  key={appointment.id}
                  style={[styles.upcomingItem, { backgroundColor: colors.secondaryBackground, borderColor: colors.border }]}
                >
                  <View style={styles.upcomingInfo}>
                    <Text style={[styles.upcomingTitle, { color: colors.text }]}>
                      {appointment.servico || 'Atendimento'}
                    </Text>
                    <Text style={[styles.upcomingMeta, { color: colors.textSecondary }]}>
                      {appointment.alunoNome || 'Aluno'}
                    </Text>
                  </View>
                  <View style={styles.upcomingInfo}>
                    <Text style={[styles.upcomingTitle, { color: colors.text }]}>
                      {toDayMonth(appointment.data)} {appointment.horaInicio || ''}
                    </Text>
                    <Text style={[styles.upcomingMeta, { color: colors.primary }]}>
                      {getStatusLabel(appointment.status)}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                Sem proximos atendimentos na agenda.
              </Text>
            )}
          </View>
        </Card>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Seus alunos</Text>
            <TouchableOpacity onPress={() => router.push('/students' as any)}>
              <Text style={[styles.sectionHint, { color: colors.primary }]}>Ver todos</Text>
            </TouchableOpacity>
          </View>
          {loadingMyStudents ? (
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>Carregando alunos...</Text>
          ) : myStudents.length ? (
            <View style={styles.studentsList}>
              {myStudents.slice(0, 5).map((student) => (
                <View key={student.id} style={[styles.studentRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.studentMain}>
                    <Text style={[styles.studentName, { color: colors.text }]}>{student.nome}</Text>
                    <Text style={[styles.studentMeta, { color: colors.textSecondary }]}>
                      {student.email || 'Email nao informado'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.studentStatus,
                      { backgroundColor: student.status === 'ativo' ? colors.success + '20' : colors.warning + '20' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.studentStatusText,
                        { color: student.status === 'ativo' ? colors.success : colors.warning },
                      ]}
                    >
                      {student.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              Nenhum aluno vinculado ao seu codigo ainda.
            </Text>
          )}
        </Card>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Dados para recebimentos</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: stripeConnected ? colors.success + '20' : colors.warning + '20' },
              ]}
            >
              <Ionicons
                name={stripeConnected ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                size={16}
                color={stripeConnected ? colors.success : colors.warning}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: stripeConnected ? colors.success : colors.warning },
                ]}
              >
                {stripeConnected ? 'Ativo' : 'Pendente'}
              </Text>
            </View>
          </View>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            {stripeStatusText}
          </Text>
          {receivingMessage ? (
            <Text style={[styles.helperText, { color: colors.textMuted, marginTop: spacing.xs }]}>
              {receivingMessage}
            </Text>
          ) : null}

          <View style={styles.row}>
            <View style={styles.column}>
              <Input
                label="Nome"
                value={receivingForm.firstName}
                onChangeText={handleReceivingFieldChange('firstName')}
                icon="person-outline"
              />
            </View>
            <View style={styles.column}>
              <Input
                label="Sobrenome"
                value={receivingForm.lastName}
                onChangeText={handleReceivingFieldChange('lastName')}
                icon="person-outline"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.column}>
              <Input
                label="Email"
                value={receivingForm.email}
                onChangeText={handleReceivingFieldChange('email')}
                keyboardType="email-address"
                icon="mail-outline"
              />
            </View>
            <View style={styles.column}>
              <Input
                label="Telefone"
                value={receivingForm.phone}
                onChangeText={handleReceivingFieldChange('phone')}
                keyboardType="phone-pad"
                icon="call-outline"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.column}>
              <Input
                label="CPF"
                value={receivingForm.cpf}
                onChangeText={handleReceivingFieldChange('cpf')}
                keyboardType="numeric"
                icon="card-outline"
              />
            </View>
            <View style={styles.column}>
              <Input
                label="CEP"
                value={receivingForm.addressPostalCode}
                onChangeText={handleReceivingFieldChange('addressPostalCode')}
                keyboardType="numeric"
                icon="navigate-outline"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.column}>
              <Input
                label="Nascimento - dia"
                value={receivingForm.dobDay}
                onChangeText={handleReceivingFieldChange('dobDay')}
                keyboardType="numeric"
                icon="calendar-outline"
              />
            </View>
            <View style={styles.column}>
              <Input
                label="Nascimento - mes"
                value={receivingForm.dobMonth}
                onChangeText={handleReceivingFieldChange('dobMonth')}
                keyboardType="numeric"
                icon="calendar-outline"
              />
            </View>
            <View style={styles.column}>
              <Input
                label="Nascimento - ano"
                value={receivingForm.dobYear}
                onChangeText={handleReceivingFieldChange('dobYear')}
                keyboardType="numeric"
                icon="calendar-outline"
              />
            </View>
          </View>

          <Input
            label="Endereco"
            value={receivingForm.addressLine1}
            onChangeText={handleReceivingFieldChange('addressLine1')}
            icon="home-outline"
          />

          <View style={styles.row}>
            <View style={styles.column}>
              <Input
                label="Cidade"
                value={receivingForm.addressCity}
                onChangeText={handleReceivingFieldChange('addressCity')}
                icon="location-outline"
              />
            </View>
            <View style={styles.column}>
              <Input
                label="Estado (UF)"
                value={receivingForm.addressState}
                onChangeText={handleReceivingFieldChange('addressState')}
                autoCapitalize="characters"
                icon="map-outline"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.column}>
              <Input
                label="Agencia"
                value={receivingForm.routingNumber}
                onChangeText={handleReceivingFieldChange('routingNumber')}
                keyboardType="numeric"
                icon="business-outline"
              />
            </View>
            <View style={styles.column}>
              <Input
                label="Conta"
                value={receivingForm.accountNumber}
                onChangeText={handleReceivingFieldChange('accountNumber')}
                keyboardType="numeric"
                icon="wallet-outline"
              />
            </View>
          </View>

          <Input
            label="Descricao do servico"
            value={receivingForm.productDescription}
            onChangeText={handleReceivingFieldChange('productDescription')}
            icon="document-text-outline"
            multiline
            numberOfLines={3}
          />

          <View style={styles.serviceFormActions}>
            <Button
              title="Atualizar status"
              onPress={refreshReceivingStatus}
              variant="outline"
              size="small"
              style={{ flex: 1 }}
            />
            <Button
              title="Salvar dados"
              onPress={handleSubmitReceivingForm}
              size="small"
              loading={receivingSubmitting}
              style={{ flex: 1 }}
            />
          </View>
          {receivingRedirectUrl ? (
            <Button
              title="Continuar cadastro"
              onPress={() => Linking.openURL(receivingRedirectUrl)}
              variant="outline"
              size="small"
            />
          ) : null}
        </Card>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Perfil publico</Text>
            <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
              {profileCompletion}% completo
            </Text>
          </View>
          <View style={styles.avatarRow}>
            <TouchableOpacity onPress={handlePickPhoto} disabled={uploadingPhoto}>
              <Avatar source={photoUrl} name={displayName} size="xlarge" />
              <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
                <Ionicons name="camera" size={16} color={colors.info} />
              </View>
            </TouchableOpacity>
            <View style={styles.avatarInfo}>
              <Text style={[styles.avatarName, { color: colors.text }]}>{displayName || 'Personal'}</Text>
              <Text style={[styles.avatarSubtitle, { color: colors.textSecondary }]}>
                Foto e dados aparecem no seu perfil
              </Text>
            </View>
          </View>

          <Input
            label="Nome"
            value={displayName}
            onChangeText={setDisplayName}
            icon="person-outline"
            autoCapitalize="words"
          />
          <Input
            label="Especializacao"
            value={especializacao}
            onChangeText={setEspecializacao}
            icon="medal-outline"
          />
          <Input
            label="Bio"
            value={bio}
            onChangeText={setBio}
            icon="chatbubble-ellipses-outline"
            multiline
            numberOfLines={4}
          />
        </Card>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Localizacao</Text>
          </View>
          <View style={styles.row}>
            <View style={styles.column}>
              <Input
                label="Cidade"
                value={cidade}
                onChangeText={setCidade}
                icon="location-outline"
                autoCapitalize="words"
              />
            </View>
            <View style={styles.column}>
              <Input
                label="Estado"
                value={estado}
                onChangeText={setEstado}
                icon="map-outline"
                autoCapitalize="characters"
              />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.column}>
              <Input
                label="Latitude"
                value={latitude}
                onChangeText={setLatitude}
                keyboardType="numeric"
                icon="compass-outline"
              />
            </View>
            <View style={styles.column}>
              <Input
                label="Longitude"
                value={longitude}
                onChangeText={setLongitude}
                keyboardType="numeric"
                icon="compass-outline"
              />
            </View>
          </View>
          <Text style={[styles.helperText, { color: colors.textMuted }]}>
            Use cidade e estado para aparecer na busca. Latitude e longitude sao opcionais.
          </Text>
        </Card>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Servicos</Text>
            <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
              {services.length} cadastrados
            </Text>
          </View>

          {services.length === 0 ? (
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              Nenhum servico cadastrado.
            </Text>
          ) : (
            <View style={styles.serviceList}>
              {services.map((service, index) => (
                <View
                  key={`${service.nome}-${index}`}
                  style={[styles.serviceCard, { backgroundColor: colors.secondaryBackground, borderRadius: borderRadius.lg }]}
                >
                  <View style={styles.serviceHeader}>
                    <Text style={[styles.serviceName, { color: colors.text }]}>{service.nome}</Text>
                    <View style={styles.serviceActions}>
                      <TouchableOpacity onPress={() => handleEditService(index)}>
                        <Ionicons name="create-outline" size={18} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleRemoveService(index)}>
                        <Ionicons name="trash-outline" size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {service.descricao ? (
                    <Text style={[styles.serviceDesc, { color: colors.textSecondary }]}>{service.descricao}</Text>
                  ) : null}
                  {typeof service.preco === 'number' ? (
                    <Text style={[styles.servicePrice, { color: colors.primary }]}>
                      R$ {service.preco.toFixed(2).replace('.', ',')}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          <View style={styles.serviceForm}>
            <Input
              label="Nome do servico"
              value={serviceForm.nome}
              onChangeText={(value) => setServiceForm((prev) => ({ ...prev, nome: value }))}
              icon="clipboard-outline"
            />
            <Input
              label="Descricao"
              value={serviceForm.descricao}
              onChangeText={(value) => setServiceForm((prev) => ({ ...prev, descricao: value }))}
              icon="document-text-outline"
              multiline
              numberOfLines={3}
            />
            <Input
              label="Preco (R$)"
              value={serviceForm.preco}
              onChangeText={(value) => setServiceForm((prev) => ({ ...prev, preco: value }))}
              icon="cash-outline"
              keyboardType="numeric"
            />
            <View style={styles.serviceFormActions}>
              {editingServiceIndex !== null ? (
                <Button
                  title="Cancelar"
                  onPress={resetServiceForm}
                  variant="outline"
                  size="small"
                  style={{ flex: 1 }}
                />
              ) : null}
              <Button
                title={editingServiceIndex !== null ? 'Salvar servico' : 'Adicionar servico'}
                onPress={handleSaveService}
                size="small"
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </Card>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Horario de atendimento</Text>
          </View>
          <View style={styles.row}>
            <View style={styles.column}>
              <Input
                label="Seg-Sex inicio"
                value={schedule.segSexInicio}
                onChangeText={(value) => setSchedule((prev) => ({ ...prev, segSexInicio: value }))}
                placeholder="08:00"
                keyboardType="numeric"
                icon="time-outline"
              />
            </View>
            <View style={styles.column}>
              <Input
                label="Seg-Sex fim"
                value={schedule.segSexFim}
                onChangeText={(value) => setSchedule((prev) => ({ ...prev, segSexFim: value }))}
                placeholder="18:00"
                keyboardType="numeric"
                icon="time-outline"
              />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.column}>
              <Input
                label="Sabado inicio"
                value={schedule.sabInicio}
                onChangeText={(value) => setSchedule((prev) => ({ ...prev, sabInicio: value }))}
                placeholder="08:00"
                keyboardType="numeric"
                icon="time-outline"
              />
            </View>
            <View style={styles.column}>
              <Input
                label="Sabado fim"
                value={schedule.sabFim}
                onChangeText={(value) => setSchedule((prev) => ({ ...prev, sabFim: value }))}
                placeholder="12:00"
                keyboardType="numeric"
                icon="time-outline"
              />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.column}>
              <Input
                label="Domingo inicio"
                value={schedule.domInicio}
                onChangeText={(value) => setSchedule((prev) => ({ ...prev, domInicio: value }))}
                placeholder="08:00"
                keyboardType="numeric"
                icon="time-outline"
              />
            </View>
            <View style={styles.column}>
              <Input
                label="Domingo fim"
                value={schedule.domFim}
                onChangeText={(value) => setSchedule((prev) => ({ ...prev, domFim: value }))}
                placeholder="12:00"
                keyboardType="numeric"
                icon="time-outline"
              />
            </View>
          </View>
        </Card>

        <Button
          title="Salvar alteracoes"
          onPress={handleSave}
          loading={saving}
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
    gap: spacing.lg,
  },
  heroCard: {
    padding: 0,
  },
  heroBanner: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroContent: {
    gap: spacing.xs,
  },
  heroPill: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.92,
  },
  heroActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  heroButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  personalSummaryCard: {
    gap: spacing.md,
  },
  personalSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  personalSummaryIcon: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personalSummaryIconText: {
    fontSize: 12,
    fontWeight: '700',
  },
  personalSummaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  personalSummaryStatItem: {
    flex: 1,
    gap: 2,
  },
  personalSummaryValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  personalSummaryLabel: {
    fontSize: 11,
  },
  sectionCard: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionHint: {
    fontSize: 12,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
  },
  dayStrip: {
    gap: spacing.sm,
  },
  dayPill: {
    minWidth: 86,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  dayWeek: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  dayDate: {
    fontSize: 14,
    fontWeight: '700',
  },
  dayCount: {
    fontSize: 10,
    fontWeight: '600',
  },
  upcomingList: {
    gap: spacing.sm,
  },
  upcomingItem: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  upcomingInfo: {
    flex: 1,
    gap: 4,
  },
  upcomingTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  upcomingMeta: {
    fontSize: 12,
  },
  studentsList: {
    gap: spacing.xs,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingVertical: spacing.sm,
  },
  studentMain: {
    flex: 1,
    gap: 2,
    marginRight: spacing.sm,
  },
  studentName: {
    fontSize: 14,
    fontWeight: '600',
  },
  studentMeta: {
    fontSize: 12,
  },
  studentStatus: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  studentStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarInfo: {
    flex: 1,
  },
  avatarName: {
    fontSize: 16,
    fontWeight: '600',
  },
  avatarSubtitle: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  column: {
    flex: 1,
  },
  serviceList: {
    gap: spacing.sm,
  },
  serviceCard: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '600',
  },
  serviceDesc: {
    fontSize: 12,
  },
  servicePrice: {
    fontSize: 13,
    fontWeight: '600',
  },
  serviceActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  serviceForm: {
    marginTop: spacing.md,
  },
  serviceFormActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
