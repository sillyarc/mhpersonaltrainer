'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebaseClient';
import { useAuth } from '@/lib/auth';
import { analyzePostureImage } from '@/lib/services/aiAnalysis';
import { createPosturalEvaluation } from '@/lib/services/evaluations';
import { firestoreService, type Aluno } from '@/lib/services/firestoreService';
import { formatDate, firestoreHelpers, useCollectionData } from '@/lib/firestoreHooks';
import { useAiAccessStatus } from '@/lib/hooks/useAiAccessStatus';

type PhotoPosition = 'frontal' | 'lateral' | 'posterior';

export default function AiImageAnalysisPage() {
  const { user, role } = useAuth();
  const aiAccess = useAiAccessStatus();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [students, setStudents] = useState<Aluno[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [photoPosition, setPhotoPosition] = useState<PhotoPosition>('frontal');
  const [analysisContext, setAnalysisContext] = useState<{
    studentId: string;
    studentLabel: string;
    position: PhotoPosition;
  } | null>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  const statusLabel = loading ? 'Analisando' : result ? 'Analise pronta' : 'Aguardando';
  const statusHint = result
    ? 'Confira os detalhes antes de salvar.'
    : 'Envie a imagem para iniciar a leitura.';
  const fileMeta = useMemo(() => {
    if (!file) return null;
    const sizeMb = (file.size / 1024 / 1024).toFixed(2);
    return `${file.name} - ${sizeMb} MB`;
  }, [file]);
  const isPersonal = role === 'personal' || role === 'professor' || role === 'admin';
  const selectedStudent = useMemo(
    () =>
      students.find((student) => (student.uid || student.id) === selectedStudentId) ||
      students.find((student) => student.id === selectedStudentId) ||
      null,
    [students, selectedStudentId]
  );
  const targetUserId = isPersonal ? selectedStudentId : user?.uid || '';
  const targetLabel =
    selectedStudent?.nome ||
    selectedStudent?.email ||
    (isPersonal ? selectedStudentId : user?.displayName || user?.email) ||
    'Aluno';
  const positionLabels: Record<PhotoPosition, string> = {
    frontal: 'Frontal',
    lateral: 'Lateral',
    posterior: 'Posterior',
  };
  const recentConstraints = useMemo(
    () =>
      targetUserId
        ? [firestoreHelpers.orderBy('createdAt', 'desc'), firestoreHelpers.limit(5)]
        : [],
    [targetUserId]
  );
  const { data: savedAnalyses } = useCollectionData<any>(
    ['users', targetUserId, 'avaliacaoPostural'],
    recentConstraints
  );
  const savedSummary = useMemo(
    () =>
      savedAnalyses.map((item) => {
        const photo = item.fotoFrontal || item.fotoLateral || item.fotoPosterior || '';
        const notes =
          item.obsFotoFrontal ||
          item.obsFotoLateral ||
          item.obsFotoPosterior ||
          'Sem observacoes.';
        const createdAt = item.dateForAvaliacaoPostural || item.createdAt || item.data;
        return {
          id: item.id,
          photo,
          notes,
          status: item.status || 'concluida',
          dateLabel: formatDate(createdAt),
        };
      }),
    [savedAnalyses]
  );
  const checklist = [
    'Foto frontal e lateral do aluno.',
    'Iluminacao uniforme e sem sombras fortes.',
    'Camera na altura do quadril.',
    'Sem roupas largas para melhor leitura.',
  ];
  const captureTips = [
    'Use fundo neutro e distancia fixa.',
    'Mantenha alinhamento dos pes e joelhos.',
    'Evite movimento durante o clique.',
  ];

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!isPersonal) {
      setStudents([]);
      setSelectedStudentId(user?.uid || '');
      return;
    }
    if (!user?.uid) return;
    let active = true;
    firestoreService.getAlunosDoPersonal(user.uid).then((data) => {
      if (!active) return;
      setStudents(data);
      if (!selectedStudentId && data.length) {
        setSelectedStudentId(data[0].uid || data[0].id);
      }
    });
    return () => {
      active = false;
    };
  }, [isPersonal, selectedStudentId, user?.uid]);

  const handleClear = () => {
    setFile(null);
    setResult(null);
    setError('');
    setSaveError('');
    setSaveMessage('');
    setUploadedUrl('');
    setAnalysisContext(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    if (isPersonal && !selectedStudentId) {
      setError('Selecione um aluno para continuar.');
      return;
    }
    setLoading(true);
    setError('');
    setSaveError('');
    setSaveMessage('');
    try {
      const targetPath = targetUserId ? `${targetUserId}/` : '';
      const storageRef = ref(storage, `ai/posture/${targetPath}${Date.now()}-${file.name}`);
      const upload = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(upload.ref);
      setUploadedUrl(url);
      const analysis = await analyzePostureImage(url);
      if (analysis.error) {
        setError(analysis.error);
        setResult(null);
        setAnalysisContext(null);
      } else {
        setResult(analysis.data);
        setAnalysisContext({
          studentId: targetUserId,
          studentLabel: targetLabel,
          position: photoPosition,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao analisar imagem.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result || !uploadedUrl || !analysisContext?.studentId) return;
    setSaving(true);
    setSaveError('');
    setSaveMessage('');
    try {
      const positionLabel = positionLabels[analysisContext.position];
      const lines = [
        positionLabel ? `Foto: ${positionLabel}` : null,
        result.postura ? `Postura: ${result.postura}` : null,
        result.descricaoPostura ? `Descricao: ${result.descricaoPostura}` : null,
        result.metricas ? `Metricas: ${result.metricas}` : null,
        result.textoDetalhado ? `Detalhes: ${result.textoDetalhado}` : null,
      ].filter(Boolean) as string[];
      const observacoes = lines.join('\n') || 'Analise gerada pela IA.';

      const fotosPostura = {
        anterior: analysisContext.position === 'frontal' ? uploadedUrl : undefined,
        posterior: analysisContext.position === 'posterior' ? uploadedUrl : undefined,
        lateralDireita: analysisContext.position === 'lateral' ? uploadedUrl : undefined,
      };

      const response = await createPosturalEvaluation({
        type: 'postural',
        userId: analysisContext.studentId,
        personalId: isPersonal ? user?.uid : undefined,
        date: new Date(),
        status: 'concluida',
        fotosPostura,
        analise: { observacoes },
      });

      if (response.error) {
        setSaveError(response.error);
      } else {
        setSaveMessage(`Analise salva para ${analysisContext.studentLabel || 'aluno'}.`);
      }
    } catch (err: any) {
      setSaveError(err.message || 'Erro ao salvar analise.');
    } finally {
      setSaving(false);
    }
  };

  if (!aiAccess.loading && !aiAccess.premium) {
    return (
      <PageShell
        title="Analise de imagem"
        description="Envie fotos para analise postural com IA."
        breadcrumbs={[{ label: 'IA Hub', href: '/ai' }]}
      >
        <section className="ai-page">
          <div className="card">
            <p className="pill">Premium</p>
            <h3>Analise postural por imagem</h3>
            <p className="subtle" style={{ marginTop: 8 }}>
              Este recurso de IA esta disponivel apenas no plano Premium.
            </p>
            <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/profile/subscription" className="button">
                Ver assinatura
              </Link>
              <Link href="/ai/assistant" className="button secondary">
                Abrir chat IA
              </Link>
            </div>
          </div>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Analise de imagem"
      description="Envie fotos para analise postural com IA."
      breadcrumbs={[{ label: 'IA Hub', href: '/ai' }]}
    >
      <section className="ai-page">
        <div className="ai-image-hero">
          <div className="ai-image-hero-copy">
            <p className="pill">IA postural</p>
            <h2>Analise postural por imagem</h2>
            <p className="subtle">
              Envie fotos frontais e laterais para gerar um resumo tecnico com
              observacoes e metricas.
            </p>
            <div className="ai-status-row">
              <span className="ai-tag">Beta</span>
              <span className="ai-tag">Tempo medio: 15s</span>
              <span className="ai-tag">Formatos: JPG, PNG</span>
            </div>
          </div>
          <div className="ai-image-hero-cards">
            <div className="ai-card">
              <span>Status da analise</span>
              <strong>{statusLabel}</strong>
              <small>{statusHint}</small>
            </div>
            <div className="ai-card">
              <span>Arquivo</span>
              <strong>{file ? 'Pronto para envio' : 'Nenhum arquivo'}</strong>
              <small>{fileMeta || 'Selecione uma imagem para continuar.'}</small>
            </div>
            <div className="ai-card">
              <span>Checklist</span>
              <strong>{checklist.length} pontos</strong>
              <small>Use as dicas abaixo para melhor leitura.</small>
            </div>
          </div>
        </div>

        <div className="ai-image-layout">
          <div className="card ai-upload-card">
            <div className="ai-card-header">
              <div>
                <h3>Enviar imagem</h3>
                <p className="subtle">Carregue a foto do aluno para iniciar a avaliacao.</p>
              </div>
              <span className="ai-tag ai-tag--compact">Beta</span>
            </div>
            <form className="ai-upload-form" onSubmit={handleSubmit}>
              <div className="ai-context-grid ai-image-context">
                <label>
                  Aluno
                  {isPersonal ? (
                    <select
                      value={selectedStudentId}
                      onChange={(event) => setSelectedStudentId(event.target.value)}
                    >
                      <option value="">Selecione um aluno</option>
                      {students.map((student) => (
                        <option key={student.id} value={student.uid || student.id}>
                          {student.nome} - {student.email}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={targetLabel}
                      disabled
                    />
                  )}
                </label>
                <label>
                  Posicao da foto
                  <select
                    value={photoPosition}
                    onChange={(event) => setPhotoPosition(event.target.value as PhotoPosition)}
                  >
                    <option value="frontal">Frontal</option>
                    <option value="lateral">Lateral</option>
                    <option value="posterior">Posterior</option>
                  </select>
                </label>
              </div>
              {isPersonal && !students.length && (
                <div className="ai-context-hint">
                  <p className="subtle">
                    Nenhum aluno vinculado ao seu codigo. Convide pelo menu de alunos.
                  </p>
                  <Link className="button secondary sm" href="/students">
                    Ver alunos
                  </Link>
                </div>
              )}
              <label className={`ai-upload-drop ${file ? 'has-file' : ''}`}>
                <input
                  className="ai-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setResult(null);
                    setError('');
                    setSaveError('');
                    setSaveMessage('');
                    setUploadedUrl('');
                    setAnalysisContext(null);
                  }}
                />
                <div>
                  <strong>{file ? 'Arquivo selecionado' : 'Clique para enviar a imagem'}</strong>
                  <span>Use fotos com boa iluminacao e fundo neutro.</span>
                </div>
              </label>
              {fileMeta && <p className="ai-file-meta">{fileMeta}</p>}
              {previewUrl ? (
                <div className="ai-preview">
                  <img src={previewUrl} alt="Preview da foto enviada" />
                </div>
              ) : (
                <div className="ai-preview ai-preview--empty">
                  <span>Preview da imagem aparece aqui.</span>
                </div>
              )}
              {error && <p className="ai-alert">{error}</p>}
              <div className="ai-upload-actions">
                <button className="button" type="submit" disabled={loading || !file}>
                  {loading ? 'Analisando...' : 'Analisar'}
                </button>
                <button className="button secondary" type="button" onClick={handleClear} disabled={loading}>
                  Limpar
                </button>
              </div>
            </form>
          </div>

          <div className="ai-image-stack">
            <div className="card ai-result-card">
              <div className="ai-card-header">
                <div>
                  <h3>Resultado</h3>
                  <p className="subtle">Resumo da leitura postural.</p>
                </div>
                <span className="ai-tag">{result ? 'Analise pronta' : 'Aguardando'}</span>
              </div>
              {result ? (
                <>
                  <div className="ai-result-grid">
                    <div className="ai-result-item">
                      <span>Postura</span>
                      <strong>{result.postura || '-'}</strong>
                    </div>
                    <div className="ai-result-item">
                      <span>Descricao</span>
                      <strong>{result.descricaoPostura || '-'}</strong>
                    </div>
                    <div className="ai-result-item">
                      <span>Metricas</span>
                      <strong>{result.metricas || '-'}</strong>
                    </div>
                    <div className="ai-result-item">
                      <span>Detalhes</span>
                      <strong>{result.textoDetalhado ? 'Disponivel' : '-'}</strong>
                    </div>
                  </div>
                  {result.textoDetalhado && (
                    <div className="ai-result-notes">
                      <h4>Resumo detalhado</h4>
                      <p className="subtle">{result.textoDetalhado}</p>
                    </div>
                  )}
                  <div className="ai-result-actions">
                    <button
                      className="button"
                      type="button"
                      onClick={handleSave}
                      disabled={!analysisContext?.studentId || saving}
                    >
                      {saving ? 'Salvando...' : 'Salvar avaliacao'}
                    </button>
                    {analysisContext?.studentId ? (
                      <span className="subtle">
                        Sera salvo para {analysisContext.studentLabel || 'o aluno'}.
                      </span>
                    ) : (
                      <span className="subtle">Selecione um aluno antes de salvar.</span>
                    )}
                  </div>
                  {saveError && <p className="ai-alert">{saveError}</p>}
                  {saveMessage && <p className="ai-success">{saveMessage}</p>}
                </>
              ) : (
                <div className="ai-result-empty">
                  <h4>Aguardando imagem</h4>
                  <p className="subtle">Envie uma foto para ver a analise completa.</p>
                </div>
              )}
            </div>

            <div className="card ai-info-card">
              <h3>Checklist da foto</h3>
              <ul className="ai-checklist">
                {checklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="card ai-info-card">
              <h3>Sugestoes de captura</h3>
              <ul className="ai-checklist">
                {captureTips.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="card ai-info-card ai-analysis-card">
              <div className="ai-card-header">
                <div>
                  <h3>Analises salvas</h3>
                  <p className="subtle">
                    {targetUserId ? `Historico recente de ${targetLabel}.` : 'Selecione um aluno para ver o historico.'}
                  </p>
                </div>
                <span className="ai-tag">Historico</span>
              </div>
              {!targetUserId ? (
                <p className="subtle">Defina um aluno para carregar as avaliacoes salvas.</p>
              ) : savedSummary.length ? (
                <ul className="ai-analysis-list">
                  {savedSummary.map((item) => (
                    <li key={item.id} className="ai-analysis-item">
                      <div className="ai-analysis-preview">
                        {item.photo ? (
                          <img src={item.photo} alt="Foto da avaliacao" />
                        ) : (
                          <span>Sem foto</span>
                        )}
                      </div>
                      <div className="ai-analysis-body">
                        <div className="ai-analysis-meta">
                          <strong>{item.dateLabel}</strong>
                          <span>{item.status}</span>
                        </div>
                        <p>{item.notes}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="subtle">Nenhuma analise salva ainda.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
