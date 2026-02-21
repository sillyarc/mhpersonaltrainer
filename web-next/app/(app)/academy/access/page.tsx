'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import PageShell from '@/components/PageShell';
import AcademyGate from '@/components/AcademyGate';
import { useAcademyData, type CheckinMethods } from '@/lib/hooks/useAcademyData';
import { db, storage } from '@/lib/firebaseClient';
import { getStorageErrorMessage } from '@/lib/services/firebaseErrors';

type CaptureTarget = 'biometric' | 'nfc';
type AccessProfileScope = 'academy-student' | 'external-student' | 'personal';
type AccessProfileKind = AccessProfileScope;
type AccessMethod = keyof CheckinMethods;
type AccessMethodConfig = CheckinMethods;

type AccessProfile = {
  id: string;
  kind: AccessProfileKind;
  name: string;
  email?: string;
  codigoPersonal?: string | number;
  biometricId?: string;
  nfcTagId?: string;
  checkinPhotoUrl?: string;
  photoUrl?: string;
  checkinMethods?: CheckinMethods;
};

const PROFILE_SCOPE_LABEL: Record<AccessProfileScope, string> = {
  'academy-student': 'Alunos da academia',
  'external-student': 'Alunos do personal',
  personal: 'Personais',
};

const PROFILE_SCOPE_ORDER: AccessProfileScope[] = ['academy-student', 'external-student', 'personal'];

const PROFILE_KIND_BADGE: Record<AccessProfileKind, string> = {
  'academy-student': 'Aluno academia',
  'external-student': 'Aluno personal',
  personal: 'Personal',
};

const ACCESS_METHOD_META: Array<{
  key: AccessMethod;
  title: string;
  description: string;
}> = [
  {
    key: 'photo',
    title: 'Foto (identificacao)',
    description: 'Exige webcam no check-in diario para validar rosto (nao altera foto do perfil).',
  },
  {
    key: 'biometric',
    title: 'Biometria',
    description: 'Valida pela leitura do token biometrico cadastrado.',
  },
  {
    key: 'nfc',
    title: 'NFC',
    description: 'Valida por cartao/tag NFC vinculada ao perfil.',
  },
];

const EMPTY_METHODS: AccessMethodConfig = {
  photo: false,
  biometric: false,
  nfc: false,
};

const sanitizeToken = (value: string) =>
  value
    .replace(/\u0000/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();

const parseDeviceToken = (value: string) => {
  const cleaned = sanitizeToken(value);
  if (!cleaned) return '';
  const stripped = cleaned
    .replace(/^BIO[:\s-]*/i, '')
    .replace(/^NFC[:\s-]*/i, '')
    .replace(/^TAG[:\s-]*/i, '')
    .trim();
  return stripped || cleaned;
};

const normalizeNameForFile = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase();

const sortProfileKind = (kind: AccessProfileKind) => {
  if (kind === 'academy-student') return 0;
  if (kind === 'external-student') return 1;
  return 2;
};

const resolveProfileMethods = (profile: AccessProfile | null): AccessMethodConfig => {
  if (!profile) return EMPTY_METHODS;
  const methods = profile.checkinMethods;
  if (methods) {
    return {
      photo: Boolean(methods.photo),
      biometric: Boolean(methods.biometric),
      nfc: Boolean(methods.nfc),
    };
  }
  return {
    photo: Boolean(profile.checkinPhotoUrl),
    biometric: Boolean(profile.biometricId),
    nfc: Boolean(profile.nfcTagId),
  };
};

const enabledMethodsAsArray = (methods: AccessMethodConfig) =>
  (Object.keys(methods) as AccessMethod[]).filter((key) => methods[key]);

export default function AcademyAccessPage() {
  const {
    academyStudents,
    externalStudents,
    personals,
    loadingAcademy,
    reloadAcademy,
  } = useAcademyData();
  const [scope, setScope] = useState<AccessProfileScope>('academy-student');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [biometricId, setBiometricId] = useState('');
  const [nfcTagId, setNfcTagId] = useState('');
  const [tokenMessage, setTokenMessage] = useState('');
  const [tokenLoading, setTokenLoading] = useState(false);
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget>('biometric');
  const [methodConfig, setMethodConfig] = useState<AccessMethodConfig>(EMPTY_METHODS);
  const [methodMessage, setMethodMessage] = useState('');
  const [methodLoading, setMethodLoading] = useState(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);

  const [deviceMessage, setDeviceMessage] = useState('');
  const [serialBusy, setSerialBusy] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  const serialPortRef = useRef<any>(null);
  const serialReaderRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const allProfiles = useMemo<AccessProfile[]>(() => {
    const nextAcademyStudents: AccessProfile[] = academyStudents.map((student) => ({
      id: student.id,
      kind: 'academy-student',
      name: student.name,
      email: student.email,
      codigoPersonal: student.codigoPersonal,
      biometricId: student.biometricId,
      nfcTagId: student.nfcTagId,
      checkinPhotoUrl: student.checkinPhotoUrl,
      photoUrl: student.photoUrl,
      checkinMethods: student.checkinMethods,
    }));
    const nextExternalStudents: AccessProfile[] = externalStudents.map((student) => ({
      id: student.id,
      kind: 'external-student',
      name: student.name,
      email: student.email,
      codigoPersonal: student.codigoPersonal,
      biometricId: student.biometricId,
      nfcTagId: student.nfcTagId,
      checkinPhotoUrl: student.checkinPhotoUrl,
      photoUrl: student.photoUrl,
      checkinMethods: student.checkinMethods,
    }));
    const nextPersonals: AccessProfile[] = personals.map((personal) => ({
      id: personal.id,
      kind: 'personal',
      name: personal.displayName || 'Personal',
      email: personal.email,
      codigoPersonal: personal.codigoPersonal,
      biometricId: personal.biometricId,
      nfcTagId: personal.nfcTagId,
      checkinPhotoUrl: personal.checkinPhotoUrl,
      photoUrl: personal.photoUrl,
      checkinMethods: personal.checkinMethods,
    }));

    return [...nextAcademyStudents, ...nextExternalStudents, ...nextPersonals].sort((a, b) => {
      const kindDiff = sortProfileKind(a.kind) - sortProfileKind(b.kind);
      if (kindDiff !== 0) return kindDiff;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [academyStudents, externalStudents, personals]);

  const availableProfiles = useMemo(
    () => allProfiles.filter((item) => item.kind === scope),
    [allProfiles, scope]
  );

  const selectedProfile = useMemo(
    () => allProfiles.find((item) => item.id === selectedProfileId) || null,
    [allProfiles, selectedProfileId]
  );

  useEffect(() => {
    if (availableProfiles.length) return;
    const fallbackScope = PROFILE_SCOPE_ORDER.find((item) =>
      allProfiles.some((profile) => profile.kind === item)
    );
    if (fallbackScope && fallbackScope !== scope) {
      setScope(fallbackScope);
    }
  }, [allProfiles, availableProfiles.length, scope]);

  useEffect(() => {
    if (!availableProfiles.length) {
      setSelectedProfileId('');
      return;
    }
    const exists = availableProfiles.some((item) => item.id === selectedProfileId);
    if (!exists) {
      setSelectedProfileId(availableProfiles[0].id);
    }
  }, [availableProfiles, selectedProfileId]);

  const counters = useMemo(() => {
    const total = allProfiles.length;
    const withBiometric = allProfiles.filter((item) => item.biometricId).length;
    const withNfc = allProfiles.filter((item) => item.nfcTagId).length;
    const withPhoto = allProfiles.filter((item) => item.checkinPhotoUrl).length;
    return {
      total,
      withBiometric,
      withNfc,
      withPhoto,
    };
  }, [allProfiles]);

  const capabilities = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        serial: false,
        camera: false,
      };
    }
    const nav = navigator as any;
    return {
      serial: Boolean(nav.serial),
      camera: Boolean(nav.mediaDevices?.getUserMedia),
    };
  }, []);

  const assignToken = (rawValue: string, target: CaptureTarget) => {
    const parsed = parseDeviceToken(rawValue);
    if (!parsed) return;
    if (target === 'biometric') {
      setBiometricId(parsed);
      setDeviceMessage('Codigo de biometria capturado pelo dispositivo.');
      return;
    }
    setNfcTagId(parsed);
    setDeviceMessage('Tag NFC capturada pelo dispositivo.');
  };

  useEffect(() => {
    if (!selectedProfile) {
      setBiometricId('');
      setNfcTagId('');
      setPhotoPreview(null);
      setPhotoFile(null);
      setMethodConfig(EMPTY_METHODS);
      return;
    }
    setBiometricId(selectedProfile.biometricId || '');
    setNfcTagId(selectedProfile.nfcTagId || '');
    setPhotoPreview(selectedProfile.checkinPhotoUrl || null);
    setPhotoFile(null);
    setMethodConfig(resolveProfileMethods(selectedProfile));
    setMethodMessage('');
    setTokenMessage('');
    setPhotoMessage('');
  }, [selectedProfile]);

  useEffect(() => {
    if (!photoFile) return;
    const preview = URL.createObjectURL(photoFile);
    setPhotoPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [photoFile]);

  const releaseSerial = async () => {
    try {
      if (serialReaderRef.current) {
        await serialReaderRef.current.cancel().catch(() => {});
        serialReaderRef.current.releaseLock?.();
        serialReaderRef.current = null;
      }
      if (serialPortRef.current) {
        await serialPortRef.current.close().catch(() => {});
        serialPortRef.current = null;
      }
    } catch (_) {
      // No-op cleanup.
    }
  };

  const stopCamera = useCallback(() => {
    if (!cameraStreamRef.current) return;
    cameraStreamRef.current.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      releaseSerial();
      stopCamera();
    };
  }, [stopCamera]);

  const toggleMethod = (method: AccessMethod) => {
    setMethodConfig((previous) => ({
      ...previous,
      [method]: !previous[method],
    }));
    setMethodMessage('');
  };

  const handleSaveMethods = async () => {
    if (!selectedProfileId) {
      setMethodMessage('Selecione um perfil para salvar os metodos.');
      return;
    }

    const enabledMethods = enabledMethodsAsArray(methodConfig);
    if (!enabledMethods.length) {
      setMethodMessage('Ative pelo menos um metodo para liberar entrada.');
      return;
    }

    setMethodLoading(true);
    setMethodMessage('');
    try {
      await updateDoc(doc(db, 'users', selectedProfileId), {
        checkinMethods: methodConfig,
        checkin_enabled_methods: enabledMethods,
        checkinConfig: {
          methods: methodConfig,
          enabledMethods,
          requirePhotoDaily: methodConfig.photo,
        },
        checkin_method_updated_at: serverTimestamp(),
      });
      setMethodMessage('Metodos de entrada atualizados.');
      await reloadAcademy();
    } catch (err: any) {
      setMethodMessage(err?.message || 'Erro ao salvar metodos.');
    } finally {
      setMethodLoading(false);
    }
  };

  const handleSaveTokens = async () => {
    if (!selectedProfileId) {
      setTokenMessage('Selecione um aluno ou personal.');
      return;
    }

    const nextBiometricId = biometricId.trim();
    const nextNfcTagId = nfcTagId.trim();
    const hasCurrentValues = Boolean(selectedProfile?.biometricId || selectedProfile?.nfcTagId);
    if (!nextBiometricId && !nextNfcTagId && !hasCurrentValues) {
      setTokenMessage('Informe biometria ou NFC para salvar.');
      return;
    }
    setTokenLoading(true);
    setTokenMessage('');
    try {
      const nextMethods: AccessMethodConfig = {
        photo: methodConfig.photo,
        biometric: methodConfig.biometric || Boolean(nextBiometricId),
        nfc: methodConfig.nfc || Boolean(nextNfcTagId),
      };
      const enabledMethods = enabledMethodsAsArray(nextMethods);
      if (!enabledMethods.length) {
        setTokenMessage('Ative pelo menos um metodo para liberar entrada.');
        return;
      }
      const updates: Record<string, any> = {
        checkin_credentials_updated_at: serverTimestamp(),
        biometricId: nextBiometricId || deleteField(),
        nfcTagId: nextNfcTagId || deleteField(),
        checkinMethods: nextMethods,
        checkin_enabled_methods: enabledMethods,
        checkinConfig: {
          methods: nextMethods,
          enabledMethods,
          requirePhotoDaily: nextMethods.photo,
        },
      };
      await updateDoc(doc(db, 'users', selectedProfileId), updates);
      setMethodConfig(nextMethods);
      setTokenMessage('Credenciais salvas com sucesso.');
      await reloadAcademy();
    } catch (err: any) {
      setTokenMessage(err?.message || 'Erro ao salvar credenciais.');
    } finally {
      setTokenLoading(false);
    }
  };

  const handleConnectSerial = async () => {
    if (!capabilities.serial) {
      setDeviceMessage('Navegador sem suporte ao leitor USB.');
      return;
    }
    try {
      const nav = navigator as any;
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: 9600 });
      serialPortRef.current = port;
      setDeviceMessage('Leitor USB conectado. Clique em "Ler codigo".');
    } catch (err: any) {
      setDeviceMessage(err?.message || 'Falha ao conectar leitor USB.');
    }
  };

  const handleReadSerial = async () => {
    if (!selectedProfileId) {
      setDeviceMessage('Selecione um perfil antes de capturar.');
      return;
    }
    if (!serialPortRef.current) {
      setDeviceMessage('Conecte o leitor USB antes de ler.');
      return;
    }
    setSerialBusy(true);
    setDeviceMessage('Aguardando leitura do dispositivo...');
    try {
      const decoder = new TextDecoderStream();
      const pipePromise = serialPortRef.current.readable.pipeTo(decoder.writable);
      const reader = decoder.readable.getReader();
      serialReaderRef.current = reader;

      const result: any = await Promise.race([
        reader.read(),
        new Promise((resolve) =>
          setTimeout(() => resolve({ value: '', done: true, timeout: true }), 10000)
        ),
      ]);

      if (result?.timeout) {
        setDeviceMessage('Tempo esgotado. Tente ler novamente.');
      } else if (result?.value) {
        assignToken(result.value, captureTarget);
      } else {
        setDeviceMessage('Nenhum dado recebido do leitor.');
      }

      await reader.cancel().catch(() => {});
      reader.releaseLock();
      serialReaderRef.current = null;
      await pipePromise.catch(() => {});
    } catch (err: any) {
      setDeviceMessage(err?.message || 'Falha durante leitura do leitor.');
    } finally {
      setSerialBusy(false);
    }
  };

  const startCamera = async () => {
    if (!selectedProfileId) {
      setPhotoMessage('Selecione um aluno ou personal antes de abrir a webcam.');
      return;
    }
    if (!capabilities.camera) {
      setPhotoMessage('Camera nao suportada neste navegador.');
      return;
    }
    setCameraLoading(true);
    setPhotoMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      setPhotoMessage(err?.message || 'Falha ao abrir webcam.');
    } finally {
      setCameraLoading(false);
    }
  };

  const handleCaptureFromCamera = async () => {
    if (!videoRef.current || !canvasRef.current || !selectedProfileId) {
      setPhotoMessage('Selecione um perfil e inicie a camera.');
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setPhotoMessage('Nao foi possivel capturar imagem.');
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.92)
    );
    if (!blob) {
      setPhotoMessage('Falha ao gerar foto.');
      return;
    }
    const file = new File([blob], `checkin-${selectedProfileId}-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });
    setPhotoFile(file);
    setPhotoMessage('Foto capturada. Agora clique em "Salvar foto".');
  };

  const handleUploadPhoto = async () => {
    if (!selectedProfileId || !photoFile) {
      setPhotoMessage('Selecione um perfil e uma foto.');
      return;
    }
    setPhotoLoading(true);
    setPhotoMessage('');
    try {
      const safeName = normalizeNameForFile(selectedProfile?.name || 'perfil') || 'perfil';
      const storageRef = ref(
        storage,
        `users/${selectedProfileId}/checkin-photo/${safeName}-${Date.now()}-${photoFile.name}`
      );
      const upload = await uploadBytes(storageRef, photoFile);
      const url = await getDownloadURL(upload.ref);
      const nextMethods: AccessMethodConfig = {
        photo: true,
        biometric: methodConfig.biometric,
        nfc: methodConfig.nfc,
      };
      const enabledMethods = enabledMethodsAsArray(nextMethods);
      await updateDoc(doc(db, 'users', selectedProfileId), {
        checkinPhotoUrl: url,
        checkin_photo_url: url,
        fotoEntradaUrl: url,
        checkinMethods: nextMethods,
        checkin_enabled_methods: enabledMethods,
        checkinConfig: {
          methods: nextMethods,
          enabledMethods,
          requirePhotoDaily: true,
        },
        checkin_photo_updated_at: serverTimestamp(),
      });
      setMethodConfig(nextMethods);
      setPhotoPreview(url);
      setPhotoMessage('Foto de identificacao salva (nao altera foto do perfil).');
      setPhotoFile(null);
      await reloadAcademy();
    } catch (err: any) {
      setPhotoMessage(getStorageErrorMessage(err, 'Erro ao enviar foto.'));
    } finally {
      setPhotoLoading(false);
    }
  };

  return (
    <PageShell
      title="Credenciais de entrada"
      description="Biometria, NFC e validacao visual para alunos e personais."
    >
      <AcademyGate>
        <div className="academy-dashboard academy-revamp academy-access-page">
          <section className="academy-access-hero">
            <div>
              <p className="academy-block-kicker">Controle de identificacao</p>
              <h2>Conecte dispositivos reais e valide entrada com confianca.</h2>
              <p className="subtle">
                Biometria, NFC e foto via webcam para alunos da academia, alunos de personal e
                personais.
              </p>
            </div>
            <div className="academy-access-hero-meta">
              <div>
                <span>Perfis totais</span>
                <strong>{loadingAcademy ? '...' : counters.total}</strong>
              </div>
              <div>
                <span>Com biometria</span>
                <strong>{loadingAcademy ? '...' : counters.withBiometric}</strong>
              </div>
              <div>
                <span>Com NFC</span>
                <strong>{loadingAcademy ? '...' : counters.withNfc}</strong>
              </div>
              <div>
                <span>Com foto de identificacao</span>
                <strong>{loadingAcademy ? '...' : counters.withPhoto}</strong>
              </div>
            </div>
          </section>

          <section className="academy-block academy-access-bind">
            <div className="academy-access-bind-head">
              <div>
                <p className="academy-block-kicker">Vinculo da captura</p>
                <h3>Escolha quem vai receber as credenciais e a foto</h3>
                <p className="subtle">
                  O perfil selecionado sera usado tanto para biometria/NFC quanto para webcam.
                </p>
              </div>
              <div className="academy-access-population">
                <span className="academy-pill">Academia {academyStudents.length}</span>
                <span className="academy-pill">Alunos personal {externalStudents.length}</span>
                <span className="academy-pill">Personais {personals.length}</span>
              </div>
            </div>

            <div className="academy-access-kind-switch">
              {(['academy-student', 'external-student', 'personal'] as AccessProfileScope[]).map(
                (item) => (
                  <button
                    key={item}
                    type="button"
                    className={`academy-access-kind-button ${scope === item ? 'is-active' : ''}`}
                    onClick={() => setScope(item)}
                  >
                    {PROFILE_SCOPE_LABEL[item]}
                  </button>
                )
              )}
            </div>

            <label className="academy-access-profile-field">
              <span>Perfil para vincular</span>
              <select
                value={selectedProfileId}
                onChange={(event) => setSelectedProfileId(event.target.value)}
              >
                <option value="">Selecionar perfil</option>
                {availableProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {PROFILE_KIND_BADGE[profile.kind]} - {profile.name}
                    {profile.codigoPersonal ? ` - Cod. ${profile.codigoPersonal}` : ''}
                  </option>
                ))}
              </select>
            </label>

            {selectedProfile ? (
              <div className="academy-access-selected">
                <div>
                  <strong>{selectedProfile.name}</strong>
                  <span>{selectedProfile.email || 'Email nao informado'}</span>
                </div>
                <div className="academy-access-selected-tags">
                  <span className="academy-pill">{PROFILE_KIND_BADGE[selectedProfile.kind]}</span>
                  <span className={`academy-pill ${selectedProfile.biometricId ? 'is-paid' : 'is-pending'}`}>
                    Biometria {selectedProfile.biometricId ? 'ok' : 'pendente'}
                  </span>
                  <span className={`academy-pill ${selectedProfile.nfcTagId ? 'is-paid' : 'is-pending'}`}>
                    NFC {selectedProfile.nfcTagId ? 'ok' : 'pendente'}
                  </span>
                  <span
                    className={`academy-pill ${selectedProfile.checkinPhotoUrl ? 'is-paid' : 'is-pending'}`}
                  >
                    Foto {selectedProfile.checkinPhotoUrl ? 'ok' : 'pendente'}
                  </span>
                </div>
              </div>
            ) : (
              <span className="academy-access-feedback">Selecione um perfil para continuar.</span>
            )}

            {selectedProfile ? (
              <div className="academy-access-methods">
                <div className="academy-access-methods-head">
                  <strong>Defina os metodos liberados para este perfil</strong>
                  <span>
                    O check-in diario vai obedecer esta configuracao e bloquear metodos nao liberados.
                  </span>
                </div>
                <div className="academy-access-method-grid">
                  {ACCESS_METHOD_META.map((method) => (
                    <button
                      key={method.key}
                      type="button"
                      className={`academy-access-method-toggle ${
                        methodConfig[method.key] ? 'is-active' : ''
                      }`}
                      onClick={() => toggleMethod(method.key)}
                    >
                      <strong>{method.title}</strong>
                      <span>{method.description}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="button secondary sm"
                  onClick={handleSaveMethods}
                  disabled={methodLoading || !selectedProfileId}
                >
                  {methodLoading ? 'Salvando metodos...' : 'Salvar metodos'}
                </button>
                {methodMessage && <span className="academy-access-feedback">{methodMessage}</span>}
              </div>
            ) : null}
          </section>

          <section className="academy-access-panels">
            <div className="academy-block academy-access-panel">
              <div className="academy-block-header">
                <div>
                  <p className="academy-block-kicker">Identificacao</p>
                  <h3>Biometria e NFC com leitor USB</h3>
                  <p className="subtle">
                    Conecte o leitor via cabo USB e capture o codigo. Se preferir, digite manualmente.
                  </p>
                </div>
              </div>

              <div className="academy-access-form">
                <div className="academy-access-targets">
                  <button
                    type="button"
                    className={`academy-access-target ${captureTarget === 'biometric' ? 'is-active' : ''}`}
                    onClick={() => setCaptureTarget('biometric')}
                  >
                    Capturar para biometria
                  </button>
                  <button
                    type="button"
                    className={`academy-access-target ${captureTarget === 'nfc' ? 'is-active' : ''}`}
                    onClick={() => setCaptureTarget('nfc')}
                  >
                    Capturar para NFC
                  </button>
                </div>

                <div className="academy-access-device-grid">
                  <div className="academy-access-device-card">
                    <strong>Leitor USB (cabo)</strong>
                    <span>
                      Leitores que enviam o codigo como texto pelo cabo USB. Se o leitor digitar
                      direto, clique no campo abaixo.
                    </span>
                    <div className="academy-access-actions">
                      <button type="button" className="button secondary sm" onClick={handleConnectSerial}>
                        Conectar leitor USB
                      </button>
                      <button
                        type="button"
                        className="button secondary sm"
                        onClick={handleReadSerial}
                        disabled={serialBusy}
                      >
                        {serialBusy ? 'Lendo...' : 'Ler codigo'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="academy-access-capabilities">
                  <span className={`academy-pill ${capabilities.serial ? '' : 'is-pending'}`}>
                    USB {capabilities.serial ? 'ok' : 'indisponivel'}
                  </span>
                </div>

                {deviceMessage && <span className="academy-access-feedback">{deviceMessage}</span>}

                <div className="academy-form-row">
                  <label>
                    <span>Codigo de biometria</span>
                    <input
                      value={biometricId}
                      onChange={(event) => setBiometricId(event.target.value)}
                      placeholder="Ex: BIO-98213"
                    />
                  </label>
                  <label>
                    <span>Codigo NFC</span>
                    <input
                      value={nfcTagId}
                      onChange={(event) => setNfcTagId(event.target.value)}
                      placeholder="Ex: NFC-1209"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  className="button"
                  onClick={handleSaveTokens}
                  disabled={tokenLoading || !selectedProfileId}
                >
                  {tokenLoading ? 'Salvando...' : 'Salvar credenciais'}
                </button>
                {tokenMessage && <span className="academy-access-feedback">{tokenMessage}</span>}
              </div>
            </div>

            <div className="academy-block academy-access-panel">
              <div className="academy-block-header">
                <div>
                  <p className="academy-block-kicker">Validacao visual</p>
                  <h3>Foto de identificacao (nao altera foto do perfil)</h3>
                  <p className="subtle">Usada apenas para validar entrada diaria.</p>
                </div>
              </div>

              <div className="academy-access-form">
                <div className="academy-access-actions">
                  <button
                    type="button"
                    className="button secondary sm"
                    onClick={startCamera}
                    disabled={cameraLoading || cameraActive || !selectedProfileId}
                  >
                    {cameraLoading ? 'Abrindo...' : cameraActive ? 'Camera ativa' : 'Abrir webcam'}
                  </button>
                  <button
                    type="button"
                    className="button secondary sm"
                    onClick={handleCaptureFromCamera}
                    disabled={!cameraActive}
                  >
                    Capturar webcam
                  </button>
                  <button
                    type="button"
                    className="button secondary sm"
                    onClick={stopCamera}
                    disabled={!cameraActive}
                  >
                    Parar webcam
                  </button>
                </div>

                <div className="academy-access-camera">
                  <video ref={videoRef} playsInline muted style={{ display: cameraActive ? 'block' : 'none' }} />
                  {!cameraActive ? (
                    <span className="academy-access-camera-placeholder">
                      Webcam desligada. Abra a camera para capturar.
                    </span>
                  ) : null}
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                </div>

                <label className="academy-access-upload">
                  <span>Ou selecione arquivo</span>
                  <input
                    className="academy-access-file-input"
                    type="file"
                    accept="image/*"
                    onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
                  />
                  <small>
                    {photoFile ? `Arquivo selecionado: ${photoFile.name}` : 'Use JPG ou PNG recentes.'}
                  </small>
                </label>

                <div className="academy-access-preview">
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt={`Foto de identificacao de ${selectedProfile?.name || 'perfil'}`}
                    />
                  ) : (
                    <span>Sem foto de identificacao cadastrada para este perfil.</span>
                  )}
                </div>

                <button
                  type="button"
                  className="button"
                  onClick={handleUploadPhoto}
                  disabled={photoLoading || !selectedProfileId || !photoFile}
                >
                  {photoLoading ? 'Enviando...' : 'Salvar foto'}
                </button>
                {photoMessage && <span className="academy-access-feedback">{photoMessage}</span>}
              </div>
            </div>
          </section>
        </div>
      </AcademyGate>
    </PageShell>
  );
}
