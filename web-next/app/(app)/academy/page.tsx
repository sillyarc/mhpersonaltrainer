'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import PageShell from '@/components/PageShell';
import AcademyGate from '@/components/AcademyGate';
import { useAuth } from '@/lib/auth';
import { storage } from '@/lib/firebaseClient';
import { formatDate } from '@/lib/firestoreHooks';
import {
  useAcademyData,
  type AcademyPersonal,
  type CheckinMethods,
  type AcademyStudent,
} from '@/lib/hooks/useAcademyData';
import { verifyCheckinFace } from '@/lib/services/aiAnalysis';
import { getFirebaseDb } from '@/lib/services/firebase';
import { formatCurrency } from '@/lib/services/payments';

const normalizeCode = (value?: string | number | null) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const getStudentActivity = (student: AcademyStudent) =>
  student.lastActive || student.personalVinculadoEm || student.createdAt;

const getPersonalActivity = (personal: AcademyPersonal) =>
  personal.lastActive || personal.createdAt;

const getSortTime = (value?: Date) => (value ? value.getTime() : 0);

const extractLinkFromError = (value: string) => {
  const match = value.match(/https?:\/\/\S+/);
  return match ? match[0] : '';
};

const getInvoiceErrorMessage = (value: string) => {
  if (value.includes('COLLECTION_GROUP_ASC')) {
    return 'Indice do Firestore necessario para carregar faturas.';
  }
  return value;
};

type CheckinMethod = 'biometria' | 'foto' | 'nfc';
type FaceVerificationState = 'idle' | 'processing' | 'match' | 'mismatch' | 'error';

const CHECKIN_METHOD_LABEL: Record<CheckinMethod, string> = {
  biometria: 'Biometria',
  foto: 'Foto',
  nfc: 'NFC',
};

const CHECKIN_METHOD_TO_CONFIG: Record<CheckinMethod, keyof CheckinMethods> = {
  biometria: 'biometric',
  foto: 'photo',
  nfc: 'nfc',
};

const FACE_MATCH_THRESHOLD = 0.62;

type AccessProfileLike = {
  checkinMethods?: CheckinMethods;
  checkinPhotoUrl?: string;
  biometricId?: string;
  nfcTagId?: string;
};

const resolveProfileCheckinMethods = (profile?: AccessProfileLike | null): CheckinMethods => {
  if (!profile) {
    return { photo: false, biometric: false, nfc: false };
  }
  if (profile.checkinMethods) {
    return {
      photo: Boolean(profile.checkinMethods.photo),
      biometric: Boolean(profile.checkinMethods.biometric),
      nfc: Boolean(profile.checkinMethods.nfc),
    };
  }
  return {
    photo: Boolean(profile.checkinPhotoUrl),
    biometric: Boolean(profile.biometricId),
    nfc: Boolean(profile.nfcTagId),
  };
};

const resolveStudentCheckinMethods = (student?: AcademyStudent | null): CheckinMethods => {
  return resolveProfileCheckinMethods(student);
};

const isMethodEnabledForStudent = (methods: CheckinMethods, method: CheckinMethod) =>
  methods[CHECKIN_METHOD_TO_CONFIG[method]];

const firstEnabledMethod = (methods: CheckinMethods): CheckinMethod | null => {
  if (methods.biometric) return 'biometria';
  if (methods.photo) return 'foto';
  if (methods.nfc) return 'nfc';
  return null;
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Falha ao preparar imagem para validacao.'));
    };
    reader.onerror = () => reject(new Error('Falha ao ler imagem de captura.'));
    reader.readAsDataURL(blob);
  });

const formatConfidence = (value: number | null) => {
  if (typeof value !== 'number') return '';
  const percent = Math.round(value * 100);
  return `${percent}%`;
};

export default function AcademyDashboardPage() {
  const { user } = useAuth();
  const {
    academyCode,
    academyCodeRaw,
    students,
    personals,
    plans,
    invoices,
    summary,
    loadingAcademy,
    loadingPlans,
    loadingInvoices,
    academyError,
    invoicesError,
    reloadAcademy,
  } = useAcademyData();
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinMethod, setCheckinMethod] = useState<CheckinMethod>('biometria');
  const [checkinStudentId, setCheckinStudentId] = useState('');
  const [checkinToken, setCheckinToken] = useState('');
  const [checkinEnroll, setCheckinEnroll] = useState(false);
  const [checkinPhotoConfirm, setCheckinPhotoConfirm] = useState(false);
  const [checkinNotes, setCheckinNotes] = useState('');
  const [checkinMessage, setCheckinMessage] = useState('');
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinCameraLoading, setCheckinCameraLoading] = useState(false);
  const [checkinCameraActive, setCheckinCameraActive] = useState(false);
  const [checkinCaptureBlob, setCheckinCaptureBlob] = useState<Blob | null>(null);
  const [checkinCapturePreview, setCheckinCapturePreview] = useState('');
  const [checkinFaceState, setCheckinFaceState] = useState<FaceVerificationState>('idle');
  const [checkinFaceReason, setCheckinFaceReason] = useState('');
  const [checkinFaceConfidence, setCheckinFaceConfidence] = useState<number | null>(null);
  const checkinVideoRef = useRef<HTMLVideoElement | null>(null);
  const checkinCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const checkinCameraStreamRef = useRef<MediaStream | null>(null);

  const paidTotal = invoices
    .filter((item) => item.pago)
    .reduce((sum, item) => sum + (item.valorDaCombranca || 0), 0);
  const pendingTotal = invoices
    .filter((item) => !item.pago)
    .reduce((sum, item) => sum + (item.valorDaCombranca || 0), 0);
  const pendingInvoicesCount = invoices.filter((item) => !item.pago).length;
  const hasOpenRouter = Boolean(
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY
  );

  const accessSetup = useMemo(() => {
    const profiles: AccessProfileLike[] = [...students, ...personals];
    let withAnyMethod = 0;
    let withPhoto = 0;
    let withBiometric = 0;
    let withNfc = 0;

    profiles.forEach((profile) => {
      const methods = resolveProfileCheckinMethods(profile);
      if (methods.photo || methods.biometric || methods.nfc) {
        withAnyMethod += 1;
      }
      if (profile.checkinPhotoUrl) withPhoto += 1;
      if (profile.biometricId) withBiometric += 1;
      if (profile.nfcTagId) withNfc += 1;
    });

    const totalProfiles = profiles.length;
    const withoutMethod = Math.max(totalProfiles - withAnyMethod, 0);
    const completion = totalProfiles ? Math.round((withAnyMethod / totalProfiles) * 100) : 0;
    return {
      totalProfiles,
      withAnyMethod,
      withoutMethod,
      withPhoto,
      withBiometric,
      withNfc,
      completion,
    };
  }, [students, personals]);

  const studentsByPersonal = useMemo(() => {
    const map = new Map<string, AcademyStudent[]>();
    students.forEach((student) => {
      const code = normalizeCode(student.codigoPersonal);
      if (!code) return;
      if (!map.has(code)) {
        map.set(code, []);
      }
      map.get(code)?.push(student);
    });
    return map;
  }, [students]);

  const studentNameById = useMemo(() => {
    const map = new Map<string, string>();
    students.forEach((student) => {
      map.set(student.id, student.name);
    });
    return map;
  }, [students]);

  const personalCards = useMemo(() => {
    return personals
      .map((personal) => {
        const code = normalizeCode(personal.codigoPersonal);
        const linkedStudents = code ? studentsByPersonal.get(code) || [] : [];
        const academyLinked = linkedStudents.filter((student) => student.vinculadoPorAcademia).length;
        const privateLinked = linkedStudents.length - academyLinked;
        return {
          personal,
          code,
          linkedStudents,
          academyLinked,
          privateLinked,
        };
      })
      .sort((a, b) => b.linkedStudents.length - a.linkedStudents.length);
  }, [personals, studentsByPersonal]);

  const unassignedStudents = useMemo(
    () => students.filter((student) => !student.codigoPersonal),
    [students]
  );

  const recentStudents = useMemo(() => {
    return [...students]
      .sort(
        (a, b) => getSortTime(getStudentActivity(b)) - getSortTime(getStudentActivity(a))
      )
      .slice(0, 5);
  }, [students]);

  const recentPersonals = useMemo(() => {
    return [...personals]
      .sort(
        (a, b) => getSortTime(getPersonalActivity(b)) - getSortTime(getPersonalActivity(a))
      )
      .slice(0, 4);
  }, [personals]);

  const activePlans = useMemo(() => plans.filter((plan) => plan.ativo), [plans]);

  const recentPlans = useMemo(() => {
    return [...activePlans]
      .sort((a, b) => getSortTime(b.createdAt) - getSortTime(a.createdAt))
      .slice(0, 3);
  }, [activePlans]);

  const recentInvoices = useMemo(() => invoices.slice(0, 4), [invoices]);

  const invoiceErrorLink = useMemo(() => {
    if (!invoicesError) return '';
    return extractLinkFromError(invoicesError);
  }, [invoicesError]);

  const invoiceErrorMessage = useMemo(() => {
    if (!invoicesError) return '';
    return getInvoiceErrorMessage(invoicesError);
  }, [invoicesError]);

  const selectedCheckinStudent = useMemo(
    () => students.find((item) => item.id === checkinStudentId) || null,
    [students, checkinStudentId]
  );

  const selectedCheckinMethods = useMemo(
    () => resolveStudentCheckinMethods(selectedCheckinStudent),
    [selectedCheckinStudent]
  );

  const photoReferenceUrl = selectedCheckinStudent?.checkinPhotoUrl || '';

  const canUseMethod = useCallback(
    (method: CheckinMethod) => {
      if (!selectedCheckinStudent) return true;
      return isMethodEnabledForStudent(selectedCheckinMethods, method);
    },
    [selectedCheckinMethods, selectedCheckinStudent]
  );

  const stopCheckinCamera = useCallback(() => {
    if (!checkinCameraStreamRef.current) return;
    checkinCameraStreamRef.current.getTracks().forEach((track) => track.stop());
    checkinCameraStreamRef.current = null;
    if (checkinVideoRef.current) {
      checkinVideoRef.current.srcObject = null;
    }
    setCheckinCameraActive(false);
  }, []);

  const clearCheckinPhotoFlow = useCallback(() => {
    stopCheckinCamera();
    setCheckinCaptureBlob(null);
    setCheckinCapturePreview((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return '';
    });
    setCheckinFaceState('idle');
    setCheckinFaceReason('');
    setCheckinFaceConfidence(null);
    setCheckinPhotoConfirm(false);
  }, [stopCheckinCamera]);

  useEffect(() => {
    return () => {
      if (checkinCameraStreamRef.current) {
        checkinCameraStreamRef.current.getTracks().forEach((track) => track.stop());
        checkinCameraStreamRef.current = null;
      }
      if (checkinCapturePreview) {
        URL.revokeObjectURL(checkinCapturePreview);
      }
    };
  }, [checkinCapturePreview]);

  const openCheckin = (method: CheckinMethod) => {
    setCheckinMethod(method);
    setCheckinOpen(true);
    setCheckinMessage('');
    setCheckinToken('');
    setCheckinEnroll(false);
    setCheckinStudentId((previous) => previous || students[0]?.id || '');
    clearCheckinPhotoFlow();
  };

  const changeCheckinMethod = (method: CheckinMethod) => {
    if (!canUseMethod(method)) {
      setCheckinMessage('Metodo bloqueado para este perfil. Ajuste em Credenciais.');
      return;
    }
    setCheckinMethod(method);
    setCheckinMessage('');
    setCheckinToken('');
    setCheckinEnroll(false);
    clearCheckinPhotoFlow();
  };

  const closeCheckin = () => {
    setCheckinOpen(false);
    setCheckinMessage('');
    setCheckinToken('');
    setCheckinEnroll(false);
    setCheckinNotes('');
    clearCheckinPhotoFlow();
  };

  useEffect(() => {
    if (!checkinOpen || !selectedCheckinStudent) return;
    if (canUseMethod(checkinMethod)) return;

    const fallback = firstEnabledMethod(selectedCheckinMethods);
    if (fallback) {
      setCheckinMethod(fallback);
      setCheckinMessage(
        `Metodo ajustado para ${CHECKIN_METHOD_LABEL[fallback]} conforme regras do perfil.`
      );
      return;
    }

    setCheckinMessage('Perfil sem metodos liberados. Configure em Credenciais.');
  }, [canUseMethod, checkinMethod, checkinOpen, selectedCheckinMethods, selectedCheckinStudent]);

  useEffect(() => {
    if (!checkinOpen) return;
    clearCheckinPhotoFlow();
    setCheckinToken('');
    setCheckinEnroll(false);
  }, [checkinStudentId, checkinOpen, clearCheckinPhotoFlow]);

  useEffect(() => {
    if (!checkinOpen || checkinStudentId || !students.length) return;
    setCheckinStudentId(students[0].id);
  }, [checkinOpen, checkinStudentId, students]);

  const startCheckinCamera = async () => {
    if (!checkinStudentId) {
      setCheckinMessage('Selecione um aluno antes de abrir a webcam.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCheckinMessage('Webcam nao suportada neste navegador.');
      return;
    }

    setCheckinCameraLoading(true);
    setCheckinMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      checkinCameraStreamRef.current = stream;
      if (checkinVideoRef.current) {
        checkinVideoRef.current.srcObject = stream;
        await checkinVideoRef.current.play();
      }
      setCheckinCameraActive(true);
    } catch (err: any) {
      setCheckinMessage(err?.message || 'Falha ao abrir webcam.');
    } finally {
      setCheckinCameraLoading(false);
    }
  };

  const captureAndVerifyCheckinPhoto = async () => {
    if (!checkinVideoRef.current || !checkinCanvasRef.current) {
      setCheckinMessage('Abra a webcam antes de capturar.');
      return;
    }
    if (!selectedCheckinStudent) {
      setCheckinMessage('Selecione um aluno para validar.');
      return;
    }

    const video = checkinVideoRef.current;
    const canvas = checkinCanvasRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      setCheckinMessage('Nao foi possivel capturar a imagem da webcam.');
      return;
    }

    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.92)
    );
    if (!blob) {
      setCheckinMessage('Falha ao gerar foto do check-in.');
      return;
    }

    setCheckinCaptureBlob(blob);
    setCheckinCapturePreview((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return URL.createObjectURL(blob);
    });
    setCheckinPhotoConfirm(false);

    if (!photoReferenceUrl) {
      setCheckinFaceState('error');
      setCheckinFaceReason('Aluno sem foto de identificacao cadastrada.');
      setCheckinFaceConfidence(null);
      setCheckinMessage(
        'Cadastre a foto de identificacao do aluno em Credenciais antes do check-in por foto.'
      );
      return;
    }

    setCheckinFaceState('processing');
    setCheckinFaceReason('Comparando rosto com a foto de identificacao...');
    setCheckinFaceConfidence(null);

    try {
      const captureDataUrl = await blobToDataUrl(blob);
      const verification = await verifyCheckinFace(photoReferenceUrl, captureDataUrl);
      if (verification.error || !verification.data) {
        setCheckinFaceState('error');
        setCheckinFaceReason(verification.error || 'Falha na validacao facial.');
        setCheckinFaceConfidence(null);
        return;
      }

      const confidence = verification.data.confidence;
      const matched = verification.data.match && confidence >= FACE_MATCH_THRESHOLD;
      setCheckinFaceState(matched ? 'match' : 'mismatch');
      setCheckinFaceReason(verification.data.reason);
      setCheckinFaceConfidence(confidence);
    } catch (err: any) {
      setCheckinFaceState('error');
      setCheckinFaceReason(err?.message || 'Erro ao validar rosto.');
      setCheckinFaceConfidence(null);
    }
  };

  const handleRegisterCheckin = async () => {
    if (!academyCodeRaw) {
      setCheckinMessage('Codigo da academia nao encontrado.');
      return;
    }
    if (!checkinStudentId) {
      setCheckinMessage('Selecione um aluno para registrar.');
      return;
    }

    setCheckinLoading(true);
    setCheckinMessage('');
    try {
      const db = getFirebaseDb();
      const student = students.find((item) => item.id === checkinStudentId);
      if (!student) {
        setCheckinMessage('Aluno invalido.');
        return;
      }

      const allowedMethods = resolveStudentCheckinMethods(student);
      if (!isMethodEnabledForStudent(allowedMethods, checkinMethod)) {
        setCheckinMessage('Metodo bloqueado para este perfil. Ajuste em Credenciais.');
        return;
      }

      const token = checkinToken.trim();
      const needsToken = checkinMethod !== 'foto';
      const expectedToken =
        checkinMethod === 'biometria'
          ? String(student.biometricId || '')
          : String(student.nfcTagId || '');
      let validation = 'manual';
      let validated = false;
      let capturedPhotoUrl: string | null = null;
      let photoConfidence: number | null = null;
      let photoReason: string | null = null;
      const referencePhotoUrl = student.checkinPhotoUrl || null;

      if (checkinMethod === 'foto') {
        if (!checkinCaptureBlob) {
          setCheckinMessage('Capture a webcam para validar o rosto antes de registrar.');
          return;
        }
        if (!referencePhotoUrl) {
          setCheckinMessage('Aluno sem foto de identificacao. Cadastre em Credenciais para validar.');
          return;
        }
        if (checkinFaceState === 'processing') {
          setCheckinMessage('A validacao facial ainda esta em andamento.');
          return;
        }

        const aiMatched = checkinFaceState === 'match';
        if (!aiMatched && !checkinPhotoConfirm) {
          setCheckinMessage(
            checkinFaceState === 'mismatch'
              ? 'Rosto nao confere com a foto cadastrada. Marque confirmacao manual para continuar.'
              : 'Nao foi possivel validar automaticamente. Marque confirmacao manual para continuar.'
          );
          return;
        }

        if (aiMatched) {
          validation = 'photo-ai-match';
        } else if (checkinFaceState === 'mismatch') {
          validation = 'photo-ai-mismatch';
        } else if (checkinFaceState === 'error' || checkinFaceState === 'idle') {
          validation = 'photo-ai-error';
        } else {
          validation = 'photo-manual';
        }
        validated = true;

        const fileName = `checkin-${academyCodeRaw}-${checkinStudentId}-${Date.now()}.jpg`;
        const storageRef = ref(storage, `academy/checkins/${checkinStudentId}/${fileName}`);
        const upload = await uploadBytes(storageRef, checkinCaptureBlob, {
          contentType: 'image/jpeg',
        });
        capturedPhotoUrl = await getDownloadURL(upload.ref);
        photoConfidence = checkinFaceConfidence;
        photoReason = checkinFaceReason || null;
      } else {
        if (!token) {
          setCheckinMessage('Informe o codigo lido pelo dispositivo.');
          return;
        }
        if (expectedToken) {
          if (token !== expectedToken) {
            setCheckinMessage('Codigo nao confere com o cadastro do aluno.');
            return;
          }
          validation = 'match';
          validated = true;
        } else {
          if (!checkinEnroll) {
            setCheckinMessage('Aluno sem cadastro. Marque para salvar este codigo.');
            return;
          }
          validation = 'enrolled';
          validated = true;
        }
      }

      await addDoc(collection(db, 'academyCheckins'), {
        academyId: user?.uid || null,
        academyCode: academyCodeRaw,
        studentId: checkinStudentId,
        studentName: student?.name || '',
        method: checkinMethod,
        readerToken: needsToken ? token : null,
        validation,
        validated,
        referencePhotoUrl: checkinMethod === 'foto' ? referencePhotoUrl : null,
        capturedPhotoUrl: checkinMethod === 'foto' ? capturedPhotoUrl : null,
        photoConfidence: checkinMethod === 'foto' ? photoConfidence : null,
        photoReason: checkinMethod === 'foto' ? photoReason : null,
        manualOverride: checkinMethod === 'foto' ? checkinFaceState !== 'match' : false,
        notes: checkinNotes.trim() || null,
        source: 'academy-panel',
        createdAt: serverTimestamp(),
      });
      const updates: Record<string, any> = {
        last_active_time: serverTimestamp(),
        last_checkin_time: serverTimestamp(),
        last_checkin_method: checkinMethod,
        last_checkin_academy: academyCodeRaw,
      };
      if (checkinMethod === 'biometria' && checkinEnroll && token) {
        updates.biometricId = token;
      }
      if (checkinMethod === 'nfc' && checkinEnroll && token) {
        updates.nfcTagId = token;
      }
      await updateDoc(doc(db, 'users', checkinStudentId), updates);
      setCheckinMessage('Entrada registrada com sucesso.');
      setCheckinStudentId('');
      setCheckinNotes('');
      setCheckinToken('');
      setCheckinEnroll(false);
      clearCheckinPhotoFlow();
      await reloadAcademy();
    } catch (err: any) {
      setCheckinMessage(err?.message || 'Erro ao registrar entrada.');
    } finally {
      setCheckinLoading(false);
    }
  };

  return (
    <PageShell
      title="Painel da academia"
      description="Operacao central para alunos, personais e faturamento."
    >
      <AcademyGate>
        {academyError && (
          <div className="academy-alert is-danger" style={{ marginBottom: 20 }}>
            <div>
              <strong>Erro ao carregar</strong>
              <span>{academyError}</span>
            </div>
          </div>
        )}

        {checkinOpen && (
          <div className="academy-checkin-overlay" onClick={closeCheckin}>
            <div className="academy-checkin-modal" onClick={(event) => event.stopPropagation()}>
              <div className="academy-checkin-header">
                <div>
                  <span>Registrar entrada</span>
                  <h3>Controle de entrada da academia</h3>
                </div>
                <button type="button" className="academy-checkin-close" onClick={closeCheckin}>
                  Fechar
                </button>
              </div>
              <div className="academy-checkin-body">
                <div className="academy-checkin-methods">
                  <button
                    type="button"
                    className={`academy-checkin-method ${
                      checkinMethod === 'biometria' ? 'is-active' : ''
                    } ${selectedCheckinStudent && !selectedCheckinMethods.biometric ? 'is-disabled' : ''}`}
                    disabled={Boolean(selectedCheckinStudent && !selectedCheckinMethods.biometric)}
                    title={
                      selectedCheckinStudent && !selectedCheckinMethods.biometric
                        ? 'Biometria bloqueada para este perfil.'
                        : 'Biometria'
                    }
                    onClick={() => changeCheckinMethod('biometria')}
                  >
                    Biometria
                  </button>
                  <button
                    type="button"
                    className={`academy-checkin-method ${checkinMethod === 'foto' ? 'is-active' : ''} ${
                      selectedCheckinStudent && !selectedCheckinMethods.photo ? 'is-disabled' : ''
                    }`}
                    disabled={Boolean(selectedCheckinStudent && !selectedCheckinMethods.photo)}
                    title={
                      selectedCheckinStudent && !selectedCheckinMethods.photo
                        ? 'Foto bloqueada para este perfil.'
                        : 'Foto'
                    }
                    onClick={() => changeCheckinMethod('foto')}
                  >
                    Foto
                  </button>
                  <button
                    type="button"
                    className={`academy-checkin-method ${checkinMethod === 'nfc' ? 'is-active' : ''} ${
                      selectedCheckinStudent && !selectedCheckinMethods.nfc ? 'is-disabled' : ''
                    }`}
                    disabled={Boolean(selectedCheckinStudent && !selectedCheckinMethods.nfc)}
                    title={
                      selectedCheckinStudent && !selectedCheckinMethods.nfc
                        ? 'NFC bloqueado para este perfil.'
                        : 'NFC'
                    }
                    onClick={() => changeCheckinMethod('nfc')}
                  >
                    NFC
                  </button>
                </div>
                <div className="academy-checkin-status">
                  {(() => {
                    if (!selectedCheckinStudent) return 'Selecione um aluno para validar o acesso.';
                    const enabledMethods = resolveStudentCheckinMethods(selectedCheckinStudent);
                    const hasEnabledMethod = Boolean(
                      enabledMethods.photo || enabledMethods.biometric || enabledMethods.nfc
                    );
                    if (!hasEnabledMethod) {
                      return 'Perfil sem metodo liberado. Configure em Credenciais.';
                    }
                    if (checkinMethod === 'foto') {
                      if (!enabledMethods.photo) return 'Foto bloqueada para este perfil.';
                      if (!photoReferenceUrl) {
                        return 'Aluno sem foto de identificacao. Cadastre em Credenciais antes do check-in.';
                      }
                      if (checkinFaceState === 'processing') {
                        return 'Comparando rosto com a foto de identificacao...';
                      }
                      if (checkinFaceState === 'match') {
                        const confidenceText = formatConfidence(checkinFaceConfidence);
                        return confidenceText
                          ? `Rosto validado (${confidenceText}).`
                          : 'Rosto validado com sucesso.';
                      }
                      if (checkinFaceState === 'mismatch') {
                        return (
                          checkinFaceReason ||
                          'Rosto nao confere com a foto de identificacao. Verifique antes de liberar.'
                        );
                      }
                      if (checkinFaceState === 'error') {
                        return checkinFaceReason || 'Falha na validacao facial.';
                      }
                      return 'Abra a webcam e capture o rosto para validar entrada.';
                    }
                    if (checkinMethod === 'biometria') {
                      if (!enabledMethods.biometric) return 'Biometria bloqueada para este perfil.';
                      return selectedCheckinStudent.biometricId
                        ? 'Biometria cadastrada. Leia o codigo do leitor.'
                        : 'Aluno sem biometria cadastrada. Leia e salve o codigo.';
                    }
                    if (!enabledMethods.nfc) return 'NFC bloqueado para este perfil.';
                    return selectedCheckinStudent.nfcTagId
                      ? 'NFC cadastrado. Encoste o cartao no leitor.'
                      : 'Aluno sem NFC cadastrado. Leia e salve o codigo.';
                  })()}
                </div>
                <label className="academy-checkin-field">
                  <span>Aluno</span>
                  <select
                    value={checkinStudentId}
                    onChange={(event) => setCheckinStudentId(event.target.value)}
                  >
                    <option value="">Selecionar aluno</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name} {student.codigoPersonal ? `- ${student.codigoPersonal}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {checkinMethod !== 'foto' ? (
                  <>
                    <label className="academy-checkin-field">
                      <span>Codigo lido do dispositivo</span>
                      <input
                        type="text"
                        value={checkinToken}
                        onChange={(event) => setCheckinToken(event.target.value)}
                        placeholder={checkinMethod === 'biometria' ? 'Codigo biometrico' : 'Codigo NFC'}
                      />
                    </label>
                    {(() => {
                      const stored =
                        checkinMethod === 'biometria'
                          ? selectedCheckinStudent?.biometricId
                          : selectedCheckinStudent?.nfcTagId;
                      return (
                        <label className="academy-checkin-toggle">
                          <input
                            type="checkbox"
                            checked={checkinEnroll}
                            onChange={(event) => setCheckinEnroll(event.target.checked)}
                            disabled={Boolean(stored)}
                          />
                          {stored ? 'Cadastro ativo para este aluno.' : 'Salvar este codigo no aluno.'}
                        </label>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    <div className="academy-checkin-photo-grid">
                      <div className="academy-checkin-photo-card">
                        <span>Foto de identificacao</span>
                        {photoReferenceUrl ? (
                          <img src={photoReferenceUrl} alt="Foto de identificacao do aluno" />
                        ) : (
                          <p>Sem foto de identificacao.</p>
                        )}
                      </div>
                      <div className="academy-checkin-photo-card">
                        <span>Captura do check-in</span>
                        {checkinCapturePreview ? (
                          <img src={checkinCapturePreview} alt="Captura de check-in" />
                        ) : (
                          <p>Aguardando captura da webcam.</p>
                        )}
                      </div>
                    </div>

                    <div className="academy-checkin-camera">
                      <video ref={checkinVideoRef} playsInline muted />
                      <canvas ref={checkinCanvasRef} style={{ display: 'none' }} />
                    </div>

                    <div className="academy-checkin-actions-inline">
                      <button
                        type="button"
                        className="button secondary sm"
                        onClick={startCheckinCamera}
                        disabled={checkinCameraLoading || checkinCameraActive || !checkinStudentId}
                      >
                        {checkinCameraLoading ? 'Abrindo...' : checkinCameraActive ? 'Webcam ativa' : 'Abrir webcam'}
                      </button>
                      <button
                        type="button"
                        className="button secondary sm"
                        onClick={captureAndVerifyCheckinPhoto}
                        disabled={!checkinCameraActive}
                      >
                        Capturar e validar
                      </button>
                      <button
                        type="button"
                        className="button secondary sm"
                        onClick={stopCheckinCamera}
                        disabled={!checkinCameraActive}
                      >
                        Parar webcam
                      </button>
                    </div>

                    <div className={`academy-checkin-face-state is-${checkinFaceState}`}>
                      <strong>
                        {checkinFaceState === 'match'
                          ? 'Rosto validado'
                          : checkinFaceState === 'mismatch'
                          ? 'Rosto divergente'
                          : checkinFaceState === 'processing'
                          ? 'Validando rosto'
                          : checkinFaceState === 'error'
                          ? 'Falha na validacao'
                          : 'Aguardando captura'}
                      </strong>
                      <span>
                        {checkinFaceReason ||
                          (checkinFaceState === 'idle'
                            ? 'Capture a webcam para comparar com a foto de identificacao.'
                            : '')}
                        {checkinFaceState === 'match' && checkinFaceConfidence !== null
                          ? ` Confianca: ${formatConfidence(checkinFaceConfidence)}.`
                          : ''}
                      </span>
                    </div>

                    {(checkinFaceState === 'mismatch' || checkinFaceState === 'error') && (
                      <label className="academy-checkin-toggle">
                        <input
                          type="checkbox"
                          checked={checkinPhotoConfirm}
                          onChange={(event) => setCheckinPhotoConfirm(event.target.checked)}
                        />
                        Liberar entrada manualmente mesmo sem validacao automatica.
                      </label>
                    )}
                  </>
                )}
                <label className="academy-checkin-field">
                  <span>Observacoes (opcional)</span>
                  <textarea
                    value={checkinNotes}
                    onChange={(event) => setCheckinNotes(event.target.value)}
                    placeholder="Ex: Entrada confirmada na recepcao."
                  />
                </label>
                {checkinMessage && <span className="academy-checkin-feedback">{checkinMessage}</span>}
              </div>
              <div className="academy-checkin-actions">
                <button
                  type="button"
                  className="button"
                  onClick={handleRegisterCheckin}
                  disabled={checkinLoading}
                >
                  {checkinLoading ? 'Registrando...' : 'Registrar entrada'}
                </button>
                <button type="button" className="button secondary" onClick={closeCheckin}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="academy-dashboard academy-revamp academy-hub academy-ops">
          <section className="academy-ops-head">
            <div className="academy-ops-head-copy">
              <p className="academy-block-kicker">Operacao da academia</p>
              <h2>Painel direto para recepcao e gestao diaria</h2>
              <p className="subtle">
                Entrada, credenciais, vinculos e financeiro em um fluxo claro. Sem tela tecnica para
                quem esta na recepcao.
              </p>
            </div>
            <div className="academy-ops-head-actions">
              <button type="button" className="button" onClick={() => openCheckin('biometria')}>
                Registrar entrada
              </button>
              <button type="button" className="button secondary" onClick={() => openCheckin('foto')}>
                Check-in por foto
              </button>
              <button type="button" className="button secondary" onClick={() => openCheckin('nfc')}>
                Check-in por NFC
              </button>
              <Link href="/academy/access" className="button secondary">
                Credenciais
              </Link>
              <Link href="/academy/checkins" className="button secondary">
                Historico
              </Link>
              <Link href="/academy/billing" className="button secondary">
                Faturamento
              </Link>
            </div>
          </section>
          <section className="academy-ops-strip">
            <article className="academy-ops-strip-item">
              <span>Alunos ativos</span>
              <strong>{loadingAcademy ? '...' : summary.activeStudents}</strong>
              <small>Total {loadingAcademy ? '...' : summary.totalStudents}</small>
            </article>
            <article className="academy-ops-strip-item">
              <span>Personais ativos</span>
              <strong>{loadingAcademy ? '...' : summary.totalPersonals}</strong>
              <small>Equipe da academia</small>
            </article>
            <article className="academy-ops-strip-item">
              <span>Perfis com credencial</span>
              <strong>{loadingAcademy ? '...' : accessSetup.withAnyMethod}</strong>
              <small>{loadingAcademy ? '...' : `${accessSetup.completion}% do total`}</small>
            </article>
            <article className="academy-ops-strip-item">
              <span>Faturas pendentes</span>
              <strong>{loadingInvoices ? '...' : pendingInvoicesCount}</strong>
              <small>{loadingInvoices ? '...' : formatCurrency(pendingTotal)}</small>
            </article>
            <article className="academy-ops-strip-item">
              <span>Recebido</span>
              <strong>{loadingInvoices ? '...' : formatCurrency(paidTotal)}</strong>
              <small>Pagamentos confirmados</small>
            </article>
          </section>
          <section className="academy-ops-grid academy-ops-grid-primary">
            <article className="academy-ops-card academy-ops-card-access">
              <header className="academy-ops-card-head">
                <h3>Acesso e identificacao</h3>
                <p className="subtle">Escolha um metodo simples para entrada.</p>
              </header>
              <div className="academy-ops-method-grid">
                <button type="button" className="academy-ops-method" onClick={() => openCheckin('biometria')}>
                  <strong>Biometria USB</strong>
                  <span>Conectar leitor por cabo USB e validar codigo.</span>
                </button>
                <button type="button" className="academy-ops-method" onClick={() => openCheckin('nfc')}>
                  <strong>NFC USB</strong>
                  <span>Usar leitor NFC por cabo para cartao ou tag.</span>
                </button>
                <button type="button" className="academy-ops-method" onClick={() => openCheckin('foto')}>
                  <strong>Foto com webcam</strong>
                  <span>Compara o rosto na entrada com a foto de identificacao.</span>
                </button>
              </div>
              <p className="academy-ops-help">
                A foto em credenciais e usada apenas para identificacao no check-in e nao altera a foto de
                perfil do aluno.
              </p>
              <div className="academy-ops-actions">
                <Link href="/academy/access" className="button secondary sm">
                  Configurar credenciais
                </Link>
                <Link href="/academy/checkins" className="button secondary sm">
                  Historico de entrada
                </Link>
              </div>
            </article>
            <article className="academy-ops-card academy-ops-card-status">
              <header className="academy-ops-card-head">
                <h3>Status da configuracao</h3>
                <p className="subtle">
                  {loadingAcademy
                    ? 'Carregando status...'
                    : `${accessSetup.withAnyMethod}/${accessSetup.totalProfiles} perfis prontos`}
                </p>
              </header>
              <div className="academy-ops-progress">
                <span style={{ width: `${accessSetup.completion}%` }} />
              </div>
              <div className="academy-ops-mini-grid">
                <div>
                  <span>Biometria</span>
                  <strong>{loadingAcademy ? '...' : accessSetup.withBiometric}</strong>
                </div>
                <div>
                  <span>NFC</span>
                  <strong>{loadingAcademy ? '...' : accessSetup.withNfc}</strong>
                </div>
                <div>
                  <span>Foto ID</span>
                  <strong>{loadingAcademy ? '...' : accessSetup.withPhoto}</strong>
                </div>
                <div>
                  <span>Sem metodo</span>
                  <strong>{loadingAcademy ? '...' : accessSetup.withoutMethod}</strong>
                </div>
              </div>
              <ul className="academy-ops-list-status">
                <li className={!loadingAcademy && accessSetup.withoutMethod === 0 ? 'is-ok' : ''}>
                  <span>Pendencias de credencial</span>
                  <strong>{loadingAcademy ? '...' : accessSetup.withoutMethod}</strong>
                </li>
                <li className={!loadingAcademy && summary.unassignedStudents === 0 ? 'is-ok' : ''}>
                  <span>Alunos sem personal</span>
                  <strong>{loadingAcademy ? '...' : summary.unassignedStudents}</strong>
                </li>
                <li className={!loadingInvoices && pendingInvoicesCount === 0 ? 'is-ok' : ''}>
                  <span>Pendencias financeiras</span>
                  <strong>{loadingInvoices ? '...' : pendingInvoicesCount}</strong>
                </li>
                <li className={hasOpenRouter ? 'is-ok' : ''}>
                  <span>Comparacao facial IA</span>
                  <strong>{hasOpenRouter ? 'Ativa' : 'Inativa'}</strong>
                </li>
              </ul>
              <div className="academy-ops-code">
                <span>Codigo da academia</span>
                <strong>{academyCode || '--'}</strong>
              </div>
            </article>
          </section>
          <section className="academy-ops-grid">
            <article className="academy-ops-card academy-ops-card-finance">
              <header className="academy-ops-card-head">
                <h3>Financeiro</h3>
                <p className="subtle">Resumo de caixa, pendencias e ultimas cobrancas.</p>
              </header>
              {invoicesError && (
                <div className="academy-alert">
                  <div>
                    <strong>Indice pendente</strong>
                    <span>{invoiceErrorMessage}</span>
                  </div>
                  {invoiceErrorLink && (
                    <a className="button secondary sm" href={invoiceErrorLink} target="_blank" rel="noreferrer">
                      Criar indice
                    </a>
                  )}
                </div>
              )}
              <div className="academy-ops-money-grid">
                <div>
                  <span>Recebido</span>
                  <strong>{loadingInvoices ? '...' : formatCurrency(paidTotal)}</strong>
                </div>
                <div>
                  <span>Pendente</span>
                  <strong>{loadingInvoices ? '...' : formatCurrency(pendingTotal)}</strong>
                </div>
                <div>
                  <span>Planos ativos</span>
                  <strong>{loadingPlans ? '...' : activePlans.length}</strong>
                </div>
              </div>
              {loadingInvoices ? (
                <p className="subtle">Carregando faturas...</p>
              ) : recentInvoices.length ? (
                <div className="academy-ops-feed">
                  {recentInvoices.map((invoice) => (
                    <div key={invoice.id} className="academy-ops-feed-row">
                      <div>
                        <strong>{invoice.planName || invoice.descricao || 'Cobranca'}</strong>
                        <span>
                          {invoice.studentId ? studentNameById.get(invoice.studentId) || 'Aluno' : 'Aluno'}
                        </span>
                      </div>
                      <div>
                        <span className={`academy-pill ${invoice.pago ? 'is-paid' : 'is-pending'}`}>
                          {invoice.pago ? 'Pago' : 'Pendente'}
                        </span>
                        <strong>{formatCurrency(invoice.valorDaCombranca || 0)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="subtle">Nenhuma fatura cadastrada.</p>
              )}
              <div className="academy-ops-actions">
                <Link href="/academy/billing" className="button secondary sm">
                  Abrir faturamento
                </Link>
              </div>
            </article>
            <article className="academy-ops-card academy-ops-card-activity">
              <header className="academy-ops-card-head">
                <h3>Atividade recente</h3>
                <p className="subtle">Ultimos acessos de alunos e personais.</p>
              </header>
              {loadingAcademy ? (
                <p className="subtle">Carregando atividade...</p>
              ) : (
                <div className="academy-ops-columns">
                  <div className="academy-ops-column">
                    <strong>Alunos</strong>
                    <div className="academy-ops-simple-list">
                      {recentStudents.length ? (
                        recentStudents.map((student) => {
                          const activity = getStudentActivity(student);
                          return (
                            <div key={student.id}>
                              <span>{student.name}</span>
                              <span>{activity ? formatDate(activity) : 'Sem acesso'}</span>
                            </div>
                          );
                        })
                      ) : (
                        <p className="subtle">Sem alunos recentes.</p>
                      )}
                    </div>
                  </div>
                  <div className="academy-ops-column">
                    <strong>Personais</strong>
                    <div className="academy-ops-simple-list">
                      {recentPersonals.length ? (
                        recentPersonals.map((personal) => {
                          const activity = getPersonalActivity(personal);
                          return (
                            <div key={personal.id}>
                              <span>{personal.displayName}</span>
                              <span>{activity ? formatDate(activity) : 'Sem acesso'}</span>
                            </div>
                          );
                        })
                      ) : (
                        <p className="subtle">Sem personais recentes.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div className="academy-ops-actions">
                <Link href="/academy/students" className="button secondary sm">
                  Ver alunos
                </Link>
                <Link href="/academy/personals" className="button secondary sm">
                  Ver personais
                </Link>
              </div>
            </article>
          </section>
          <section className="academy-ops-card academy-ops-card-linking">
            <header className="academy-ops-card-head">
              <h3>Vinculos da academia</h3>
              <p className="subtle">Distribuicao de alunos por personal.</p>
            </header>
            {loadingAcademy ? (
              <p className="subtle">Carregando vinculos...</p>
            ) : (
              <>
                <div className="academy-ops-link-summary">
                  <div>
                    <span>Sem personal</span>
                    <strong>{summary.unassignedStudents}</strong>
                  </div>
                  <div>
                    <span>Personais ativos</span>
                    <strong>{summary.totalPersonals}</strong>
                  </div>
                  <div>
                    <span>Alunos oficiais</span>
                    <strong>{summary.registeredStudents}</strong>
                  </div>
                  <div>
                    <span>Alunos externos</span>
                    <strong>{summary.externalStudents}</strong>
                  </div>
                </div>
                {unassignedStudents.length > 0 && (
                  <div className="academy-ops-warning">
                    <strong>Alunos sem personal vinculado</strong>
                    <div className="academy-ops-simple-list">
                      {unassignedStudents.slice(0, 5).map((student) => (
                        <div key={student.id}>
                          <span>{student.name}</span>
                          <span>{student.email || 'Email nao informado'}</span>
                        </div>
                      ))}
                    </div>
                    {unassignedStudents.length > 5 ? (
                      <small>+{unassignedStudents.length - 5} alunos aguardando vinculacao.</small>
                    ) : null}
                  </div>
                )}
                <div className="academy-ops-table">
                  <div className="academy-ops-table-head">
                    <span>Personal</span>
                    <span>Codigo</span>
                    <span>Alunos</span>
                  </div>
                  {personalCards.length ? (
                    personalCards.slice(0, 8).map(({ personal, code, linkedStudents }) => (
                      <div key={personal.id} className="academy-ops-table-row">
                        <span>{personal.displayName}</span>
                        <span>{code || '--'}</span>
                        <span>{linkedStudents.length}</span>
                      </div>
                    ))
                  ) : (
                    <p className="subtle">Nenhum personal vinculado ainda.</p>
                  )}
                </div>
              </>
            )}
            <div className="academy-ops-actions">
              <Link href="/academy/linking" className="button secondary sm">
                Gerenciar vinculos
              </Link>
              <Link href="/academy/ai" className="button secondary sm">
                Vincular com IA
              </Link>
              <Link href="/academy/personals" className="button secondary sm">
                Ver personais
              </Link>
            </div>
          </section>
        </div>
      </AcademyGate>
    </PageShell>
  );
}




