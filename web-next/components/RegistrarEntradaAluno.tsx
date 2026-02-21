'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AcademyGate from '@/components/AcademyGate';
import PageShell from '@/components/PageShell';
import type { BiometricResult, DeviceInfo, EntryRecord, Student, TurnstileResult } from '@/lib/checkinTypes';

type FlowStep = 1 | 2 | 3 | 4 | 5;
type LoadingState = 'nfc' | 'session' | 'camera' | 'submit' | 'register' | 'turnstile' | null;

type StudentPreview = Pick<Student, 'id' | 'name'>;

type SessionApiResponse = {
  sessionId: string;
  uploadUrlOrToken: string;
  expiresAt: string;
  student: StudentPreview;
};

type RegisterApiResponse = {
  entryId: string;
  status: EntryRecord['status'];
  decision: EntryRecord['decision'];
  allowTurnstile: boolean;
  entry: EntryRecord;
};

type TurnstileApiResponse = TurnstileResult & {
  entryStatus?: EntryRecord['status'];
  turnstileStatus?: EntryRecord['turnstileStatus'];
};

type ApiError = { error?: string };

type NdefRecordLike = {
  recordType?: string;
  data?: DataView | ArrayBuffer | null;
};

type NdefReadingEventLike = Event & {
  serialNumber?: string;
  message?: {
    records?: NdefRecordLike[];
  };
};

type WebNfcReaderLike = {
  scan: () => Promise<void>;
  onreading: ((event: NdefReadingEventLike) => void) | null;
  onreadingerror: (() => void) | null;
};

type WindowWithNfc = Window & {
  NDEFReader?: new () => WebNfcReaderLike;
};

const NUMERIC_ID_REGEX = /^\d{4,20}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FLOW_STEPS: { id: FlowStep; label: string }[] = [
  { id: 1, label: 'Ler NFC' },
  { id: 2, label: 'Selfie + Liveness' },
  { id: 3, label: 'Validar e Registrar' },
  { id: 4, label: 'Abrir Catraca' },
  { id: 5, label: 'Confirmar' },
];

function isValidStudentId(value: string) {
  const normalized = value.trim();
  return NUMERIC_ID_REGEX.test(normalized) || UUID_REGEX.test(normalized);
}

function getDeviceInfo(): DeviceInfo {
  if (typeof navigator === 'undefined') {
    return { userAgent: 'server', source: 'web-next' };
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    source: 'academy-checkin-modal',
  };
}

function decodeNdefTextRecord(record: NdefRecordLike): string {
  const raw = record.data;
  if (!raw) return '';
  const view = raw instanceof DataView ? raw : new DataView(raw);
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  if (!bytes.length) return '';

  if (record.recordType === 'text' && bytes.length > 1) {
    // Web NFC texto NDEF: byte 0 = status; proximos bytes = idioma + payload.
    const languageLength = bytes[0] & 0x3f;
    const textStart = Math.min(1 + languageLength, bytes.length);
    return new TextDecoder().decode(bytes.slice(textStart)).trim();
  }
  return new TextDecoder().decode(bytes).trim();
}

function formatScore(score: number) {
  return `${Math.round(score * 100)}%`;
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) {
    throw new Error(payload.error || 'Falha na requisicao.');
  }
  return payload as T;
}

export default function RegistrarEntradaAluno() {
  const [step, setStep] = useState<FlowStep>(1);
  const [loading, setLoading] = useState<LoadingState>(null);
  const [statusMessage, setStatusMessage] = useState('Aguardando leitura NFC ou entrada manual do studentId.');
  const [errorMessage, setErrorMessage] = useState('');

  const [nfcSupported, setNfcSupported] = useState(false);
  const [manualStudentId, setManualStudentId] = useState('');
  const [identifiedStudentId, setIdentifiedStudentId] = useState('');
  const [nfcSerialNumber, setNfcSerialNumber] = useState('');

  const [student, setStudent] = useState<StudentPreview | null>(null);
  const [biometricSession, setBiometricSession] = useState<{
    sessionId: string;
    uploadUrlOrToken: string;
    expiresAt: string;
  } | null>(null);
  const [biometricResult, setBiometricResult] = useState<BiometricResult | null>(null);
  const [entryRecord, setEntryRecord] = useState<EntryRecord | null>(null);
  const [turnstileResult, setTurnstileResult] = useState<TurnstileApiResponse | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [cameraInstruction, setCameraInstruction] = useState('');
  const [selfieBlob, setSelfieBlob] = useState<Blob | null>(null);
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const resolvedStudentId = useMemo(
    () => (identifiedStudentId || manualStudentId).trim(),
    [identifiedStudentId, manualStudentId]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setNfcSupported(Boolean((window as WindowWithNfc).NDEFReader));
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
    };
  }, [selfiePreviewUrl]);

  const stepState = (target: FlowStep) => {
    if (step > target) return 'is-done';
    if (step === target) return errorMessage ? 'is-error' : 'is-active';
    return 'is-pending';
  };

  const clearMessages = () => {
    setErrorMessage('');
    setStatusMessage('');
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const handleReadNfc = async () => {
    clearMessages();
    if (!nfcSupported || typeof window === 'undefined') {
      setErrorMessage('Web NFC nao esta disponivel neste navegador. Use o campo manual de studentId.');
      return;
    }

    try {
      setLoading('nfc');
      const NDEFReaderCtor = (window as WindowWithNfc).NDEFReader;
      if (!NDEFReaderCtor) {
        throw new Error('NDEFReader indisponivel no navegador atual.');
      }

      const reader = new NDEFReaderCtor();
      await reader.scan();
      setStatusMessage('Aproxime o cartao/tag NFC do aluno do leitor.');

      reader.onreadingerror = () => {
        setErrorMessage('Falha ao ler a tag NFC. Tente novamente ou informe studentId manualmente.');
        setLoading(null);
      };

      reader.onreading = (event) => {
        const records = event.message?.records || [];
        let parsedId = '';
        for (const record of records) {
          const text = decodeNdefTextRecord(record);
          if (text) {
            parsedId = text;
            break;
          }
        }

        if (!parsedId || !isValidStudentId(parsedId)) {
          setErrorMessage('Tag lida, mas o studentId e invalido. Esperado: numeros ou UUID.');
          setLoading(null);
          return;
        }

        setIdentifiedStudentId(parsedId);
        setManualStudentId(parsedId);
        setNfcSerialNumber(event.serialNumber || '');
        setStatusMessage(`Aluno identificado via NFC: ${parsedId}. Revise e clique em Continuar.`);
        setLoading(null);
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Nao foi possivel iniciar a leitura NFC.';
      setErrorMessage(`${message} Use studentId manual como fallback.`);
      setLoading(null);
    }
  };

  const handleConfirmStudent = async () => {
    clearMessages();
    const studentId = resolvedStudentId;
    if (!isValidStudentId(studentId)) {
      setErrorMessage('Informe um studentId valido (somente numeros ou UUID).');
      return;
    }

    try {
      setLoading('session');
      const response = await fetch('/api/biometrics/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          deviceInfo: getDeviceInfo(),
        }),
      });
      const payload = await readJsonOrThrow<SessionApiResponse>(response);

      setStudent(payload.student);
      setBiometricSession({
        sessionId: payload.sessionId,
        uploadUrlOrToken: payload.uploadUrlOrToken,
        expiresAt: payload.expiresAt,
      });
      setStep(2);
      setStatusMessage('Aluno confirmado. Prossiga para selfie e prova de vida.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao confirmar aluno.');
    } finally {
      setLoading(null);
    }
  };

  const handleCaptureSelfie = async () => {
    clearMessages();
    if (!biometricSession || !student) {
      setErrorMessage('Confirme o aluno antes de capturar selfie.');
      return;
    }

    try {
      setLoading('camera');
      if (!cameraActive) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraActive(true);
        setCameraDenied(false);
        setCameraInstruction(
          'Camera ativa. Posicione o rosto no centro, boa luz e clique novamente em "Capturar Selfie".'
        );
        setStatusMessage('Webcam ativa. Capture a selfie para liveness + face match.');
        return;
      }

      if (!videoRef.current || !canvasRef.current) {
        throw new Error('Elementos de camera nao inicializados.');
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;

      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Nao foi possivel acessar contexto do canvas.');
      }
      context.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((capturedBlob) => resolve(capturedBlob), 'image/jpeg', 0.92)
      );
      if (!blob) {
        throw new Error('Falha ao converter frame para imagem.');
      }

      if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
      setSelfieBlob(blob);
      setSelfiePreviewUrl(URL.createObjectURL(blob));
      setStatusMessage('Selfie capturada. Agora envie para analise biometrica.');
    } catch (error) {
      setCameraDenied(true);
      setCameraInstruction(
        'Permita acesso a camera no navegador. Se a camera falhar, troque de dispositivo ou navegador.'
      );
      setErrorMessage(
        error instanceof Error ? error.message : 'Nao foi possivel capturar selfie na webcam.'
      );
    } finally {
      setLoading(null);
    }
  };

  const handleSubmitSelfie = async () => {
    clearMessages();
    if (!student || !biometricSession || !selfieBlob) {
      setErrorMessage('Capture a selfie antes de enviar.');
      return;
    }

    try {
      setLoading('submit');
      const formData = new FormData();
      formData.append('sessionId', biometricSession.sessionId);
      formData.append('studentId', student.id);
      formData.append('selfie', new File([selfieBlob], `selfie-${student.id}.jpg`, { type: 'image/jpeg' }));

      const response = await fetch('/api/biometrics/submit', {
        method: 'POST',
        body: formData,
      });
      const payload = await readJsonOrThrow<BiometricResult>(response);

      setBiometricResult(payload);
      setStep(3);
      stopCamera();

      if (payload.decision === 'approved') {
        setStatusMessage('Biometria aprovada. Prossiga para registrar a entrada.');
      } else {
        setErrorMessage('Biometria reprovada. A entrada sera registrada como negada e sem catraca.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao enviar selfie para biometria.');
    } finally {
      setLoading(null);
    }
  };

  const handleRegisterEntry = async () => {
    clearMessages();
    if (!student || !biometricResult) {
      setErrorMessage('Resultado biometrico obrigatorio antes do registro.');
      return;
    }

    try {
      setLoading('register');
      const response = await fetch('/api/entry/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          biometricResult,
          deviceInfo: getDeviceInfo(),
        }),
      });

      const payload = await readJsonOrThrow<RegisterApiResponse>(response);
      setEntryRecord(payload.entry);

      if (payload.allowTurnstile) {
        setStep(4);
        setStatusMessage(`Entrada ${payload.entryId} registrada. Agora acione a catraca.`);
      } else {
        setStep(5);
        setStatusMessage(`Entrada ${payload.entryId} registrada como negada (sem liberar catraca).`);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao registrar entrada.');
    } finally {
      setLoading(null);
    }
  };

  const handleOpenTurnstile = async () => {
    clearMessages();
    if (!student || !entryRecord) {
      setErrorMessage('EntryId nao disponivel para abertura da catraca.');
      return;
    }

    try {
      setLoading('turnstile');
      const response = await fetch('/api/turnstile/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          entryId: entryRecord.id,
        }),
      });
      const payload = await readJsonOrThrow<TurnstileApiResponse>(response);

      setTurnstileResult(payload);
      setStep(5);
      setStatusMessage(payload.opened ? 'Catraca liberada com sucesso.' : payload.reason || 'Falha na catraca.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha ao acionar catraca.');
    } finally {
      setLoading(null);
    }
  };

  const handleResetFlow = () => {
    stopCamera();
    setStep(1);
    setLoading(null);
    setStatusMessage('Fluxo reiniciado. Leia o NFC ou informe o studentId manualmente.');
    setErrorMessage('');
    setManualStudentId('');
    setIdentifiedStudentId('');
    setNfcSerialNumber('');
    setStudent(null);
    setBiometricSession(null);
    setBiometricResult(null);
    setEntryRecord(null);
    setTurnstileResult(null);
    setCameraDenied(false);
    setCameraInstruction('');
    setSelfieBlob(null);
    if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
    setSelfiePreviewUrl('');
  };

  const canOpenTurnstile = Boolean(entryRecord?.status === 'awaiting_turnstile');

  return (
    <PageShell
      title="Registrar entrada"
      description="Fluxo de check-in da academia com NFC, selfie com liveness e abertura de catraca."
      breadcrumbs={[
        { label: 'Academia', href: '/academy' },
        { label: 'Registrar entrada' },
      ]}
    >
      <AcademyGate>
        <div className="academy-checkin-flow-page academy-ultra-blue-modal">
          <div className="academy-checkin-modal is-inline">
            <div className="academy-checkin-header">
              <div>
                <span>Controle de acesso</span>
                <h3>Registrar entrada com NFC + biometria</h3>
              </div>
            </div>

            <div className="academy-checkin-stepper">
              {FLOW_STEPS.map((item) => (
                <div key={item.id} className={`academy-checkin-step-chip ${stepState(item.id)}`}>
                  <strong>{item.id}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            <div className="academy-checkin-status">
              {statusMessage || 'Siga as etapas para concluir o check-in do aluno.'}
            </div>
            {errorMessage ? (
              <span className="academy-checkin-feedback academy-checkin-feedback-error">{errorMessage}</span>
            ) : null}

            <div className="academy-checkin-body">
              <section className={`academy-checkin-stage ${step === 1 ? 'is-active' : ''}`}>
                <div className="academy-checkin-stage-head">
                  <strong>1) Ler NFC</strong>
                  <span>NFC com fallback manual para studentId.</span>
                </div>
                <div className="academy-checkin-actions-inline">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={handleReadNfc}
                    disabled={loading === 'nfc'}
                  >
                    {loading === 'nfc' ? 'Lendo NFC...' : 'Ler NFC'}
                  </button>
                </div>
                {!nfcSupported ? (
                  <p className="subtle">
                    Web NFC nao suportado neste navegador. Digite o studentId manualmente para continuar.
                  </p>
                ) : null}
                <label className="academy-checkin-field">
                  <span>studentId (manual fallback)</span>
                  <input
                    value={manualStudentId}
                    onChange={(event) => {
                      setManualStudentId(event.target.value);
                      setIdentifiedStudentId('');
                    }}
                    placeholder="Ex.: 2024001 ou UUID"
                  />
                </label>
                {resolvedStudentId ? (
                  <div className="academy-checkin-stage-note">
                    <strong>Aluno identificado:</strong> {resolvedStudentId}
                    {nfcSerialNumber ? ` (tag: ${nfcSerialNumber})` : ''}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="button"
                  onClick={handleConfirmStudent}
                  disabled={!resolvedStudentId || loading === 'session'}
                >
                  {loading === 'session' ? 'Confirmando...' : 'Continuar'}
                </button>
              </section>

              <section className={`academy-checkin-stage ${step === 2 ? 'is-active' : ''}`}>
                <div className="academy-checkin-stage-head">
                  <strong>2) Capturar selfie + liveness</strong>
                  <span>Sessao biometrica temporaria (token de sessao no backend).</span>
                </div>
                {student ? (
                  <div className="academy-checkin-stage-note">
                    <strong>Aluno confirmado:</strong> {student.name} ({student.id})
                  </div>
                ) : null}
                {biometricSession ? (
                  <div className="academy-checkin-stage-note">
                    <strong>Sessao:</strong> {biometricSession.sessionId.slice(0, 12)}... expira em{' '}
                    {new Date(biometricSession.expiresAt).toLocaleTimeString('pt-BR')}
                  </div>
                ) : null}

                <div className="academy-checkin-camera">
                  <video ref={videoRef} playsInline muted />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                </div>

                {cameraInstruction ? <p className="subtle">{cameraInstruction}</p> : null}
                {cameraDenied ? (
                  <p className="subtle">
                    Se a camera foi negada: habilite permissao no navegador, recarregue a pagina e tente novamente.
                  </p>
                ) : null}

                <div className="academy-checkin-actions-inline">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={handleCaptureSelfie}
                    disabled={!biometricSession || loading === 'camera'}
                  >
                    {loading === 'camera' ? 'Processando...' : 'Capturar Selfie'}
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={handleSubmitSelfie}
                    disabled={!selfieBlob || loading === 'submit'}
                  >
                    {loading === 'submit' ? 'Enviando...' : 'Enviar Selfie'}
                  </button>
                </div>

                {selfiePreviewUrl ? (
                  <div className="academy-checkin-photo-card academy-checkin-capture-preview">
                    <span>Selfie capturada</span>
                    <img src={selfiePreviewUrl} alt="Selfie capturada para biometria" />
                  </div>
                ) : null}
              </section>

              <section className={`academy-checkin-stage ${step === 3 ? 'is-active' : ''}`}>
                <div className="academy-checkin-stage-head">
                  <strong>3) Validar/registrar</strong>
                  <span>Somente biometria aprovada permite catraca.</span>
                </div>
                {biometricResult ? (
                  <div className="academy-checkin-score-grid">
                    <div>
                      <span>Liveness</span>
                      <strong>{formatScore(biometricResult.livenessScore)}</strong>
                    </div>
                    <div>
                      <span>Face match</span>
                      <strong>{formatScore(biometricResult.matchScore)}</strong>
                    </div>
                    <div>
                      <span>Decisao</span>
                      <strong>{biometricResult.decision === 'approved' ? 'Aprovada' : 'Reprovada'}</strong>
                    </div>
                  </div>
                ) : (
                  <p className="subtle">Envie a selfie para receber o resultado biometrico.</p>
                )}
                <button
                  type="button"
                  className="button"
                  onClick={handleRegisterEntry}
                  disabled={!biometricResult || loading === 'register'}
                >
                  {loading === 'register' ? 'Registrando...' : 'Registrar Entrada'}
                </button>
              </section>

              <section className={`academy-checkin-stage ${step === 4 ? 'is-active' : ''}`}>
                <div className="academy-checkin-stage-head">
                  <strong>4) Liberar catraca</strong>
                  <span>Backend valida entryId e decisao biometrica antes do comando.</span>
                </div>
                {entryRecord ? (
                  <div className="academy-checkin-stage-note">
                    <strong>entryId:</strong> {entryRecord.id}
                  </div>
                ) : (
                  <p className="subtle">Registre a entrada para gerar entryId.</p>
                )}
                {!canOpenTurnstile && entryRecord ? (
                  <p className="subtle">Biometria nao aprovada. Catraca permanece bloqueada.</p>
                ) : null}
                <button
                  type="button"
                  className="button"
                  onClick={handleOpenTurnstile}
                  disabled={!canOpenTurnstile || loading === 'turnstile'}
                >
                  {loading === 'turnstile' ? 'Abrindo...' : 'Abrir Catraca'}
                </button>
              </section>

              <section className={`academy-checkin-stage ${step === 5 ? 'is-active' : ''}`}>
                <div className="academy-checkin-stage-head">
                  <strong>5) Confirmar</strong>
                  <span>Resultado final da entrada e auditoria.</span>
                </div>
                <div className="academy-checkin-score-grid">
                  <div>
                    <span>Aluno</span>
                    <strong>{student ? `${student.name} (${student.id})` : '--'}</strong>
                  </div>
                  <div>
                    <span>Entrada</span>
                    <strong>{entryRecord?.id || '--'}</strong>
                  </div>
                  <div>
                    <span>Catraca</span>
                    <strong>
                      {turnstileResult
                        ? turnstileResult.opened
                          ? 'Liberada'
                          : 'Nao liberada'
                        : entryRecord?.status === 'denied'
                        ? 'Bloqueada'
                        : '--'}
                    </strong>
                  </div>
                </div>
                <button type="button" className="button secondary" onClick={handleResetFlow}>
                  Nova Entrada
                </button>
              </section>
            </div>
          </div>
        </div>
      </AcademyGate>
    </PageShell>
  );
}
