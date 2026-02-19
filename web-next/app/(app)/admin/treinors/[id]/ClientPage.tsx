'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PageShell from '@/components/PageShell';
import AdminGate from '@/components/AdminGate';
import { useCollectionData } from '@/lib/firestoreHooks';
import { fetchExerciseById, updateExercise } from '@/lib/services/workouts';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebaseClient';
import { getStorageErrorMessage } from '@/lib/services/firebaseErrors';

type FieldState = {
  nomeDoTreino: string;
  treinosNoLIst: string;
  colecao: string;
  videoUrl: string;
};

const toStringValue = (value: any) => (value === null || value === undefined ? '' : String(value));
const toNullableString = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export default function AdminTreinorDetailPage({ params }: { params: { id: string } }) {
  const pathname = usePathname();
  const exerciseId = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    return last && last !== 'treinors' ? last : params.id;
  }, [pathname, params.id]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [initialName, setInitialName] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const { data: collectionsData } = useCollectionData(['treinors']);
  const [form, setForm] = useState<FieldState>({
    nomeDoTreino: '',
    treinosNoLIst: '',
    colecao: 'geral',
    videoUrl: '',
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      const result = await fetchExerciseById(exerciseId);
      if (!active) return;
      if (!result.data) {
        setError(result.error || 'Treino nao encontrado.');
        setLoading(false);
        return;
      }
      const data = result.data;
      const nome = data.nomeDoTreino || '';
      setInitialName(nome);
      setVideoFile(null);
      setForm({
        nomeDoTreino: nome,
        treinosNoLIst: nome,
        colecao: data.colecao || 'geral',
        videoUrl: toStringValue(data.videoUrl),
      });
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [exerciseId]);

  useEffect(() => {
    if (!videoFile) {
      setVideoPreviewUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(videoFile);
    setVideoPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [videoFile]);

  const title = useMemo(() => {
    if (initialName) return initialName;
    if (form.nomeDoTreino) return form.nomeDoTreino;
    return `Treino ${exerciseId}`;
  }, [form.nomeDoTreino, initialName, exerciseId]);

  const updateField = (key: keyof FieldState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const collectionOptions = useMemo(() => {
    const entries = new Set<string>();
    collectionsData.forEach((item: any) => {
      const normalized = String(item?.colecao || 'geral').trim();
      if (normalized) entries.add(normalized);
    });

    const current = form.colecao.trim();
    if (current) entries.add(current);

    if (!entries.size) {
      entries.add('geral');
    }

    return Array.from(entries).sort((a, b) => a.localeCompare(b));
  }, [collectionsData, form.colecao]);

  const buildFileMeta = (file: File | null) => {
    if (!file) return '';
    const sizeMb = (file.size / 1024 / 1024).toFixed(2);
    return `${file.name} - ${sizeMb} MB`;
  };

  const uploadVideoFile = async (exerciseId: string, file: File, label: string) => {
    const safeLabel = label.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'video';
    const storageRef = ref(
      storage,
      `treinors/${exerciseId}/videos/${safeLabel}-${Date.now()}-${file.name}`
    );
    const upload = await uploadBytes(storageRef, file);
    return getDownloadURL(upload.ref);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!form.nomeDoTreino.trim()) {
        setError('Informe o nome do treino.');
        setSaving(false);
        return;
      }
      let videoUrl = form.videoUrl.trim();

      try {
        if (videoFile) {
          videoUrl = await uploadVideoFile(exerciseId, videoFile, 'principal');
        }
      } catch (uploadError: any) {
        throw new Error(getStorageErrorMessage(uploadError, 'Erro ao enviar video.'));
      }

      const updates = {
        nomeDoTreino: form.nomeDoTreino.trim(),
        treinosNoLIst: form.treinosNoLIst.trim() || form.nomeDoTreino.trim(),
        colecao: form.colecao.trim() || 'geral',
        videoUrl: toNullableString(videoUrl),
        videoUrl1080: null,
        videoUrl720: null,
      };
      const result = await updateExercise(exerciseId, updates);
      if (result.error) {
        throw new Error(result.error);
      }
      setSuccess('Treino atualizado com sucesso.');
      setForm((prev) => ({
        ...prev,
        videoUrl,
      }));
      setVideoFile(null);
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar treino.');
    } finally {
      setSaving(false);
    }
  };

  const activeVideoPreview = videoPreviewUrl || form.videoUrl;

  return (
    <PageShell
      title={title}
      description="Edite dados do treino na colecao treinors."
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Treinors', href: '/admin/treinors' },
      ]}
    >
      <AdminGate>
        {loading && <p className="subtle">Carregando treino...</p>}
        {error && <p style={{ color: '#c0392b' }}>{error}</p>}
        {success && <p style={{ color: '#1b7f3b' }}>{success}</p>}
        {!loading && !error && (
          <form className="card" onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
            <label>
              Nome do treino
              <input
                type="text"
                value={form.nomeDoTreino}
                onChange={(event) => updateField('nomeDoTreino', event.target.value)}
                placeholder="Nome do treino"
                style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
              />
            </label>
            <label>
              Colecao
              <select
                value={form.colecao}
                onChange={(event) => updateField('colecao', event.target.value)}
                style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
              >
                {collectionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <div className="treinor-field">
              <label htmlFor="treinor-detail-main-video-input">Video principal</label>
              <input
                id="treinor-detail-main-video-input"
                className="treinor-file-input"
                type="file"
                accept="video/*"
                onChange={(event) => setVideoFile(event.target.files?.[0] || null)}
                style={{ marginTop: 6, width: '100%' }}
                disabled={saving}
              />
              <p className="treinor-file-meta">
                {videoFile ? buildFileMeta(videoFile) : 'Nenhum arquivo selecionado.'}
              </p>
              {activeVideoPreview && (
                <div className="treinor-video-preview-wrap">
                  <span className="treinor-video-preview-label">
                    {videoPreviewUrl ? 'Pre-visualizacao do arquivo selecionado' : 'Video atual'}
                  </span>
                  <video
                    key={activeVideoPreview}
                    className="treinor-video-preview"
                    src={activeVideoPreview}
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  />
                </div>
              )}
              <div className="treinor-file-status">
                <span className={`treinor-chip ${form.videoUrl ? 'is-ready' : 'is-empty'}`}>
                  Atual: {form.videoUrl ? 'carregado' : 'nenhum'}
                </span>
                {form.videoUrl && (
                  <button
                    type="button"
                    className="button secondary sm"
                    onClick={() => updateField('videoUrl', '')}
                    disabled={saving}
                  >
                    Remover
                  </button>
                )}
              </div>
            </div>
            <label>
              Campo legacy (treinosNoLIst)
              <input
                type="text"
                value={form.treinosNoLIst}
                onChange={(event) => updateField('treinosNoLIst', event.target.value)}
                placeholder="Nome antigo"
                style={{ marginTop: 6, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
              />
              <p className="subtle" style={{ marginTop: 6 }}>
                Mantem compatibilidade com dados antigos.
              </p>
            </label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="button" type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar alteracoes'}
              </button>
              <Link href="/admin/treinors" className="button secondary">
                Voltar
              </Link>
            </div>
          </form>
        )}
      </AdminGate>
    </PageShell>
  );
}
