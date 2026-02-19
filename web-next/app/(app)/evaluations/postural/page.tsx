'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import DataTable from '@/components/data/DataTable';
import UserScopePicker from '@/components/data/UserScopePicker';
import { formatDate, useCollectionData, useUserScope } from '@/lib/firestoreHooks';
import { useAuth } from '@/lib/auth';
import { analyzePostureImage, type AnalysisResult } from '@/lib/services/aiAnalysis';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebaseClient';
import { useAiAccessStatus } from '@/lib/hooks/useAiAccessStatus';

interface PosturalRow {
  id: string;
  createdAt?: any;
  data?: any;
  status?: string;
}

type PhotoKey = 'anterior' | 'posterior' | 'lateralDireita' | 'lateralEsquerda';

type PhotoAnalysis = {
  status: 'idle' | 'loading' | 'done' | 'error';
  data?: AnalysisResult;
  error?: string;
  url?: string;
};

const photoPositions: Array<{ key: PhotoKey; label: string }> = [
  { key: 'anterior', label: 'Anterior' },
  { key: 'posterior', label: 'Posterior' },
  { key: 'lateralDireita', label: 'Lat. dir.' },
  { key: 'lateralEsquerda', label: 'Lat. esq.' },
];

const analysisFields = [
  { label: 'Cabeca', placeholder: 'Observacoes da cabeca' },
  { label: 'Ombros', placeholder: 'Observacoes dos ombros' },
  { label: 'Coluna', placeholder: 'Observacoes da coluna' },
  { label: 'Quadril', placeholder: 'Observacoes do quadril' },
  { label: 'Joelhos', placeholder: 'Observacoes dos joelhos' },
  { label: 'Pes', placeholder: 'Observacoes dos pes' },
  { label: 'Observacoes gerais', placeholder: 'Comentarios adicionais', multiline: true },
];

const recommendationHints = ['Fortalecer core', 'Mobilidade de quadril', 'Alongar cadeia posterior'];

const captureTips = ['Fundo neutro', 'Luz frontal', 'Camera na altura do quadril'];

const analysisInitialState: Record<PhotoKey, PhotoAnalysis> = {
  anterior: { status: 'idle' },
  posterior: { status: 'idle' },
  lateralDireita: { status: 'idle' },
  lateralEsquerda: { status: 'idle' },
};

export default function PosturalEvaluationPage() {
  const { userId } = useUserScope();
  const { role } = useAuth();
  const aiAccess = useAiAccessStatus();
  const { data } = useCollectionData<PosturalRow>(['users', userId, 'avaliacaoPostural']);
  const [photos, setPhotos] = useState<Record<PhotoKey, string | null>>({
    anterior: null,
    posterior: null,
    lateralDireita: null,
    lateralEsquerda: null,
  });
  const [photoFiles, setPhotoFiles] = useState<Record<PhotoKey, File | null>>({
    anterior: null,
    posterior: null,
    lateralDireita: null,
    lateralEsquerda: null,
  });
  const [assistantDate, setAssistantDate] = useState('');
  const [analysisResults, setAnalysisResults] =
    useState<Record<PhotoKey, PhotoAnalysis>>(analysisInitialState);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const openRouterKey =
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
  const hasPremiumAi = aiAccess.premium;
  const hasAssistant = Boolean(openRouterKey) && hasPremiumAi;
  const agendaBase = role === 'academy' ? '/academy/agenda' : '/schedule';
  const photosRef = useRef(photos);

  useEffect(() => {
    const previous = photosRef.current;
    (Object.keys(photos) as PhotoKey[]).forEach((key) => {
      const prevUrl = previous[key];
      if (prevUrl && prevUrl !== photos[key]) {
        URL.revokeObjectURL(prevUrl);
      }
    });
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      Object.values(photosRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  const handlePhotoChange = (key: PhotoKey, file?: File | null) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setPhotos((prev) => ({ ...prev, [key]: previewUrl }));
    setPhotoFiles((prev) => ({ ...prev, [key]: file }));
    setAnalysisResults((prev) => ({ ...prev, [key]: { status: 'idle' } }));
    setAnalysisError('');
  };

  const photoCount = Object.values(photoFiles).filter(Boolean).length;

  const resetAnalysis = () => {
    setAnalysisResults({ ...analysisInitialState });
    setAnalysisError('');
  };

  const analyzePhotos = async () => {
    if (!photoCount) {
      setAnalysisError('Envie pelo menos uma foto para analisar.');
      return;
    }
    if (!hasPremiumAi) {
      setAnalysisError('Analise postural por IA disponivel apenas no Premium.');
      return;
    }
    if (!hasAssistant) {
      setAnalysisError('Assistente indisponivel no momento.');
      return;
    }
    setAnalysisLoading(true);
    setAnalysisError('');
    try {
      const entries = Object.entries(photoFiles) as Array<[PhotoKey, File | null]>;
      for (const [key, file] of entries) {
        if (!file) continue;
        setAnalysisResults((prev) => ({ ...prev, [key]: { status: 'loading' } }));
        const targetPath = userId || 'anon';
        const storageRef = ref(storage, `postural/${targetPath}/${Date.now()}-${key}-${file.name}`);
        const upload = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(upload.ref);
        const result = await analyzePostureImage(url);
        if (result.error) {
          setAnalysisResults((prev) => ({
            ...prev,
            [key]: { status: 'error', error: result.error || 'Erro ao analisar', url },
          }));
        } else {
          setAnalysisResults((prev) => ({
            ...prev,
            [key]: { status: 'done', data: result.data || undefined, url },
          }));
        }
      }
    } catch (err: any) {
      setAnalysisError(err?.message || 'Erro ao analisar fotos.');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const statusLabels: Record<PhotoAnalysis['status'], string> = {
    idle: 'Sem analise',
    loading: 'Analisando',
    done: 'Pronto',
    error: 'Erro',
  };

  return (
    <PageShell
      title="Avaliacao postural"
      description="Envie fotos e registre observacoes tecnicas do aluno."
      titleAddon={
        <>
          <label className="page-title-date">
            Agenda
            <input
              type="date"
              className="page-title-input"
              value={assistantDate}
              onChange={(event) => setAssistantDate(event.target.value)}
            />
          </label>
          {assistantDate ? (
            <Link href={`${agendaBase}?date=${assistantDate}`} className="button secondary sm">
              Agenda
            </Link>
          ) : null}
        </>
      }
      breadcrumbs={[{ label: 'Avaliacoes', href: '/evaluations' }]}
      actions={[{ label: 'Resultado', href: '/evaluations/personalizada/resultado' }]}
    >
      <UserScopePicker />
      <div className="postural-layout">
        <div className="postural-main">
          <div className="portal-card evaluation-section">
            <div className="postural-card-header">
              <div>
                <p className="portal-pill">Fotos</p>
                <h3>Fotos posturais</h3>
                <p className="subtle">Registre fotos alinhadas para leitura tecnica.</p>
              </div>
              <div className="evaluation-taglist">
                {captureTips.map((tip) => (
                  <span key={tip} className="evaluation-tag">
                    {tip}
                  </span>
                ))}
              </div>
            </div>
            <div className="evaluation-photo-grid">
              {photoPositions.map((position) => {
                const preview = photos[position.key];
                return (
                  <label
                    key={position.key}
                    className={`evaluation-photo-slot${preview ? ' is-filled' : ''}`}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => handlePhotoChange(position.key, event.target.files?.[0])}
                    />
                    {preview ? (
                      <img
                        src={preview}
                        alt={`Foto ${position.label}`}
                        className="evaluation-photo-preview"
                      />
                    ) : (
                      <span>{position.label}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="portal-card evaluation-section">
            <div className="postural-card-header">
              <div>
                <p className="portal-pill">Analise</p>
                <h3>Analise postural</h3>
                <p className="subtle">Detalhe pontos de atencao por regiao.</p>
              </div>
            </div>
            <div className="evaluation-field-grid evaluation-field-grid--wide">
              {analysisFields
                .filter((field) => !field.multiline)
                .map((field) => (
                  <label key={field.label}>
                    {field.label}
                    <input className="evaluation-input" placeholder={field.placeholder} />
                  </label>
                ))}
            </div>
            <label>
              Observacoes gerais
              <textarea className="evaluation-textarea" placeholder="Comentarios adicionais" />
            </label>
          </div>
        </div>

        <div className="postural-side">
          {hasPremiumAi ? (
            <div className="portal-card evaluations-assistant-card">
              <div>
                <p className="pill">Assistente</p>
                <h3>Analise postural por foto</h3>
                <p className="subtle" style={{ marginTop: 6 }}>
                  A IA analisa as fotos enviadas e gera detalhes por angulo.
                </p>
              </div>
              <div className="postural-assistant-meta">
                <span className={`postural-assistant-pill${hasAssistant ? ' is-on' : ' is-off'}`}>
                  {hasAssistant ? 'IA ativa' : 'IA indisponivel'}
                </span>
                <span className="subtle">
                  {photoCount ? `${photoCount} fotos prontas` : 'Envie fotos para iniciar.'}
                </span>
              </div>
              <div className="evaluation-inline-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => analyzePhotos()}
                  disabled={analysisLoading || !photoCount || !hasAssistant}
                >
                  {analysisLoading ? 'Analisando...' : 'Analisar fotos'}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => resetAnalysis()}
                  disabled={analysisLoading}
                >
                  Limpar analise
                </button>
              </div>
              {analysisError && <p className="ai-alert">{analysisError}</p>}
              <div className="postural-analysis-grid">
                {photoPositions.map((position) => {
                  const preview = photos[position.key];
                  const result = analysisResults[position.key];
                  return (
                    <div
                      key={position.key}
                      className={`postural-analysis-card${
                        result.status === 'error' ? ' is-error' : ''
                      }`}
                    >
                      <div className="postural-analysis-header">
                        <strong>{position.label}</strong>
                        <span className={`postural-analysis-status is-${result.status}`}>
                          {statusLabels[result.status]}
                        </span>
                      </div>
                      {preview ? (
                        <img
                          src={preview}
                          alt={`Foto ${position.label}`}
                          className="postural-analysis-preview"
                        />
                      ) : (
                        <div className="postural-analysis-empty">Sem foto</div>
                      )}
                      {result.status === 'done' && result.data ? (
                        <>
                          <div className="postural-analysis-list">
                            <div>
                              <span>Postura</span>
                              <strong>{result.data.postura || '-'}</strong>
                            </div>
                            <div>
                              <span>Descricao</span>
                              <strong>{result.data.descricaoPostura || '-'}</strong>
                            </div>
                            <div>
                              <span>Metricas</span>
                              <strong>{result.data.metricas || '-'}</strong>
                            </div>
                          </div>
                          {result.data.textoDetalhado && (
                            <p className="postural-analysis-notes">{result.data.textoDetalhado}</p>
                          )}
                        </>
                      ) : result.status === 'error' ? (
                        <p className="postural-analysis-error">{result.error || 'Erro ao analisar.'}</p>
                      ) : (
                        <p className="subtle">
                          {result.status === 'loading' ? 'Analisando foto...' : 'Aguardando analise.'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="portal-card evaluations-assistant-card">
              <div>
                <p className="pill">Premium</p>
                <h3>Analise postural por IA</h3>
                <p className="subtle" style={{ marginTop: 6 }}>
                  Este recurso esta disponivel apenas no plano Premium.
                </p>
              </div>
              <div className="evaluation-inline-actions">
                <Link href="/profile/subscription" className="button">
                  Ver assinatura
                </Link>
              </div>
            </div>
          )}

          <div className="portal-card evaluation-section">
            <div className="postural-card-header">
              <div>
                <p className="portal-pill">Plano</p>
                <h3>Recomendacoes</h3>
                <p className="subtle">Oriente o aluno com ajustes e metas.</p>
              </div>
            </div>
            <div className="evaluation-taglist">
              {recommendationHints.map((value) => (
                <span key={value} className="evaluation-tag">
                  {value}
                </span>
              ))}
            </div>
            <div className="evaluation-field-grid">
              {recommendationHints.map((value) => (
                <label key={value}>
                  Recomendacao
                  <input className="evaluation-input" placeholder={value} />
                </label>
              ))}
            </div>
            <div className="evaluation-inline-actions">
              <button className="button secondary" type="button">
                Adicionar recomendacao
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="portal-card portal-card--table" style={{ marginTop: 24 }}>
        <h3>Avaliacoes posturais</h3>
        {userId ? (
          <DataTable
            rows={data}
            columns={[
              { key: 'id', label: 'ID' },
              { key: 'status', label: 'Status' },
              { key: 'createdAt', label: 'Criado em', render: (row) => formatDate(row.createdAt ?? row.data) },
            ]}
            emptyMessage="Nenhuma avaliacao postural encontrada."
          />
        ) : (
          <p className="subtle">Informe um UID para listar avaliacoes.</p>
        )}
      </div>
    </PageShell>
  );
}
