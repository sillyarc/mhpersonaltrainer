'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import PageShell from '@/components/PageShell';
import AdminGate from '@/components/AdminGate';
import { useCollectionData } from '@/lib/firestoreHooks';
import {
  createExercise,
  deleteCollectionExercises,
  deleteExercise,
  fetchExerciseById,
  moveExercisesToCollection,
  updateExercise,
} from '@/lib/services/workouts';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebaseClient';
import { getStorageErrorMessage } from '@/lib/services/firebaseErrors';

type FieldState = {
  nomeDoTreino: string;
  treinosNoLIst: string;
  colecao: string;
  videoUrl: string;
};

type TreinorItem = {
  id: string;
  nome: string;
  colecao: string;
  videoUrl?: string;
  adicionados?: number;
};

const emptyForm: FieldState = {
  nomeDoTreino: '',
  treinosNoLIst: '',
  colecao: 'geral',
  videoUrl: '',
};

const toStringValue = (value: any) => (value === null || value === undefined ? '' : String(value));
const toNullableString = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export default function AdminTreinorsPage() {
  const { data, loading, error } = useCollectionData(['treinors']);
  const [isThemeDark, setIsThemeDark] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedColecao, setSelectedColecao] = useState('all');
  const [videoFilter, setVideoFilter] = useState<'all' | 'with-video' | 'no-video'>('all');
  const [selectedId, setSelectedId] = useState('');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'create' | 'edit'>('edit');
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetSaving, setSheetSaving] = useState(false);
  const [sheetDeleting, setSheetDeleting] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [sheetSuccess, setSheetSuccess] = useState('');
  const [initialName, setInitialName] = useState('');
  const [form, setForm] = useState<FieldState>({ ...emptyForm });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [quickDeletingId, setQuickDeletingId] = useState('');
  const [collectionSource, setCollectionSource] = useState('');
  const [collectionTarget, setCollectionTarget] = useState('');
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [collectionError, setCollectionError] = useState('');
  const [collectionSuccess, setCollectionSuccess] = useState('');

  const treinors = useMemo<TreinorItem[]>(() => {
    return data.map((item: any) => ({
      id: item.id,
      nome: item.treinosNoLIst || item.nomeDoTreino || 'Treino',
      colecao: item.colecao || 'geral',
      videoUrl: item.videoUrl,
      adicionados: item.Adicionados,
    }));
  }, [data]);

  const colecoes = useMemo(() => {
    const entries = new Set<string>();
    treinors.forEach((item) => entries.add(item.colecao || 'geral'));
    return ['all', ...Array.from(entries).sort()];
  }, [treinors]);

  const availableCollections = useMemo(() => {
    return colecoes.filter((entry) => entry !== 'all');
  }, [colecoes]);

  const formCollectionOptions = useMemo(() => {
    const entries = new Set<string>();
    availableCollections.forEach((entry) => {
      const normalized = entry.trim();
      if (normalized) entries.add(normalized);
    });

    const current = form.colecao.trim();
    if (current) entries.add(current);

    if (!entries.size) {
      entries.add('geral');
    }

    return Array.from(entries).sort((a, b) => a.localeCompare(b));
  }, [availableCollections, form.colecao]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return treinors.filter((item) => {
      if (selectedColecao !== 'all' && item.colecao !== selectedColecao) return false;
      if (videoFilter === 'with-video' && !item.videoUrl) return false;
      if (videoFilter === 'no-video' && item.videoUrl) return false;
      if (!query) return true;
      return (
        item.nome.toLowerCase().includes(query) ||
        item.colecao.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query)
      );
    });
  }, [treinors, search, selectedColecao, videoFilter]);

  const collectionCount = useMemo(() => {
    const entries = new Set<string>();
    treinors.forEach((item) => entries.add(item.colecao || 'geral'));
    return entries.size;
  }, [treinors]);

  const missingVideoCount = useMemo(() => {
    return treinors.filter((item) => !item.videoUrl).length;
  }, [treinors]);

  const openSheet = useCallback((id: string) => {
    setSheetMode('edit');
    setSelectedId(id);
    setIsSheetOpen(true);
  }, []);

  const openCreateSheet = useCallback(() => {
    setSheetMode('create');
    setSelectedId('');
    setIsSheetOpen(true);
    setSheetLoading(false);
    setSheetSaving(false);
    setSheetDeleting(false);
    setSheetError('');
    setSheetSuccess('');
    setInitialName('');
    setForm({ ...emptyForm });
    setVideoFile(null);
  }, []);

  const closeSheet = useCallback(() => {
    setIsSheetOpen(false);
    setSelectedId('');
    setSheetMode('edit');
    setSheetError('');
    setSheetSuccess('');
    setVideoFile(null);
  }, []);

  useEffect(() => {
    if (!isSheetOpen || !selectedId) return;
    let active = true;
    const load = async () => {
      setSheetLoading(true);
      setSheetError('');
      setSheetSuccess('');
      setForm({ ...emptyForm });
      setInitialName('');
      setVideoFile(null);
      const result = await fetchExerciseById(selectedId);
      if (!active) return;
      if (!result.data) {
        setSheetError(result.error || 'Treino nao encontrado.');
        setSheetLoading(false);
        return;
      }
      const data = result.data;
      const nome = data.nomeDoTreino || '';
      setInitialName(nome);
      setForm({
        nomeDoTreino: nome,
        treinosNoLIst: nome,
        colecao: data.colecao || 'geral',
        videoUrl: toStringValue(data.videoUrl),
      });
      setSheetLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [isSheetOpen, selectedId]);

  useEffect(() => {
    if (!isSheetOpen) return;
    const body = document.body;
    const originalOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = originalOverflow;
    };
  }, [isSheetOpen]);

  useEffect(() => {
    if (!isSheetOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSheet();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSheetOpen, closeSheet]);

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

  useEffect(() => {
    if (!availableCollections.length) {
      setCollectionSource('');
      return;
    }

    if (!collectionSource || !availableCollections.includes(collectionSource)) {
      setCollectionSource(availableCollections[0]);
    }
  }, [availableCollections, collectionSource]);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => {
      const datasetTheme = root.dataset.theme;
      if (datasetTheme === 'dark' || datasetTheme === 'light') {
        setIsThemeDark(datasetTheme === 'dark');
        return;
      }

      const storedTheme = localStorage.getItem('mh-theme');
      if (storedTheme === 'dark' || storedTheme === 'light') {
        setIsThemeDark(storedTheme === 'dark');
        return;
      }

      setIsThemeDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
    };

    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMediaChange = () => syncTheme();
    media.addEventListener('change', onMediaChange);

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'mh-theme') {
        syncTheme();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      observer.disconnect();
      media.removeEventListener('change', onMediaChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const sheetTitle = useMemo(() => {
    if (sheetMode === 'create') {
      return form.nomeDoTreino || 'Novo treino';
    }
    if (initialName) return initialName;
    if (form.nomeDoTreino) return form.nomeDoTreino;
    if (selectedId) return `Treino ${selectedId}`;
    return 'Treino';
  }, [form.nomeDoTreino, initialName, selectedId, sheetMode]);

  const updateField = (key: keyof FieldState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

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
    setSheetSaving(true);
    setSheetError('');
    setSheetSuccess('');
    try {
      if (!form.nomeDoTreino.trim()) {
        setSheetError('Informe o nome do treino.');
        setSheetSaving(false);
        return;
      }
      let videoUrl = form.videoUrl.trim();

      if (sheetMode === 'create') {
        const payload = {
          nomeDoTreino: form.nomeDoTreino.trim(),
          treinosNoLIst: form.treinosNoLIst.trim() || form.nomeDoTreino.trim(),
          colecao: form.colecao.trim() || 'geral',
          videoUrl: null,
          videoUrl1080: null,
          videoUrl720: null,
          Adicionados: 0,
        };
        const createResult = await createExercise(payload);
        if (createResult.error || !createResult.data) {
          throw new Error(createResult.error || 'Erro ao criar treino.');
        }
        const newId = createResult.data.id;
        if (videoFile) {
          try {
            videoUrl = await uploadVideoFile(newId, videoFile, 'principal');
          } catch (uploadError: any) {
            throw new Error(getStorageErrorMessage(uploadError, 'Erro ao enviar video.'));
          }
        }
        if (videoUrl) {
          const videoUpdate = await updateExercise(newId, {
            videoUrl: toNullableString(videoUrl),
            videoUrl1080: null,
            videoUrl720: null,
          });
          if (videoUpdate.error) {
            throw new Error(videoUpdate.error);
          }
        }
        setSelectedId(newId);
        setSheetMode('edit');
        setInitialName(payload.nomeDoTreino);
        setForm((prev) => ({
          ...prev,
          videoUrl,
        }));
        setVideoFile(null);
        setSheetSuccess('Treino criado com sucesso.');
        return;
      }

      if (!selectedId) return;

      try {
        if (videoFile) {
          videoUrl = await uploadVideoFile(selectedId, videoFile, 'principal');
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
      const result = await updateExercise(selectedId, updates);
      if (result.error) {
        throw new Error(result.error);
      }
      setSheetSuccess('Treino atualizado com sucesso.');
      setForm((prev) => ({
        ...prev,
        videoUrl,
      }));
      setVideoFile(null);
    } catch (err: any) {
      setSheetError(
        err.message || (sheetMode === 'create' ? 'Erro ao criar treino.' : 'Erro ao atualizar treino.')
      );
    } finally {
      setSheetSaving(false);
    }
  };

  const handleDeleteTreinor = async () => {
    if (!selectedId) return;
    const confirmed = window.confirm('Deseja excluir este treino? Esta acao nao pode ser desfeita.');
    if (!confirmed) return;
    setSheetDeleting(true);
    setSheetError('');
    setSheetSuccess('');
    try {
      const result = await deleteExercise(selectedId);
      if (result.error) {
        throw new Error(result.error);
      }
      closeSheet();
    } catch (err: any) {
      setSheetError(err.message || 'Erro ao excluir treino.');
    } finally {
      setSheetDeleting(false);
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setSelectedColecao('all');
    setVideoFilter('all');
  };

  const handleQuickDeleteTreinor = async (item: TreinorItem) => {
    const confirmed = window.confirm(
      `Deseja excluir o treino "${item.nome}"? Esta acao nao pode ser desfeita.`
    );
    if (!confirmed) return;

    setQuickDeletingId(item.id);
    setCollectionError('');
    setCollectionSuccess('');

    try {
      const result = await deleteExercise(item.id);
      if (result.error) {
        throw new Error(result.error);
      }
      setCollectionSuccess(`Treino "${item.nome}" excluido com sucesso.`);
      if (selectedId === item.id) {
        closeSheet();
      }
    } catch (err: any) {
      setCollectionError(err.message || 'Erro ao excluir treino.');
    } finally {
      setQuickDeletingId('');
    }
  };

  const handleMoveCollectionExercises = async () => {
    const source = collectionSource.trim();
    const target = collectionTarget.trim();

    setCollectionError('');
    setCollectionSuccess('');

    if (!source) {
      setCollectionError('Selecione a colecao de origem.');
      return;
    }

    if (!target) {
      setCollectionError('Informe a colecao de destino.');
      return;
    }

    if (source === target) {
      setCollectionError('Origem e destino precisam ser diferentes.');
      return;
    }

    const affectedCount = treinors.filter((item) => (item.colecao || 'geral') === source).length;
    if (!affectedCount) {
      setCollectionError(`Nao ha exercicios na colecao "${source}".`);
      return;
    }

    const confirmed = window.confirm(
      `Mover ${affectedCount} exercicio(s) da colecao "${source}" para "${target}"?`
    );
    if (!confirmed) return;

    setCollectionLoading(true);
    try {
      const result = await moveExercisesToCollection(source, target);
      if (result.error) {
        throw new Error(result.error);
      }
      const moved = result.data?.moved ?? 0;
      setCollectionSuccess(
        `${moved} exercicio(s) movido(s) de "${source}" para "${target}".`
      );
      setCollectionTarget('');
      if (selectedColecao === source) {
        setSelectedColecao('all');
      }
    } catch (err: any) {
      setCollectionError(err.message || 'Erro ao mover exercicios da colecao.');
    } finally {
      setCollectionLoading(false);
    }
  };

  const handleDeleteCollection = async () => {
    const source = collectionSource.trim();

    setCollectionError('');
    setCollectionSuccess('');

    if (!source) {
      setCollectionError('Selecione a colecao que sera excluida.');
      return;
    }

    const affectedCount = treinors.filter((item) => (item.colecao || 'geral') === source).length;
    if (!affectedCount) {
      setCollectionError(`Nao ha exercicios na colecao "${source}".`);
      return;
    }

    const confirmed = window.confirm(
      `Excluir a colecao "${source}" e apagar ${affectedCount} exercicio(s)? Esta acao nao pode ser desfeita.`
    );
    if (!confirmed) return;

    setCollectionLoading(true);
    try {
      const result = await deleteCollectionExercises(source);
      if (result.error) {
        throw new Error(result.error);
      }
      const deleted = result.data?.deleted ?? 0;
      setCollectionSuccess(
        `Colecao "${source}" excluida com ${deleted} exercicio(s) removido(s).`
      );
      if (selectedColecao === source) {
        setSelectedColecao('all');
      }
      if (form.colecao === source) {
        setForm((prev) => ({ ...prev, colecao: 'geral' }));
      }
    } catch (err: any) {
      setCollectionError(err.message || 'Erro ao excluir colecao.');
    } finally {
      setCollectionLoading(false);
    }
  };

  const isLocked = sheetLoading || sheetSaving || sheetDeleting;
  const isCollectionLocked = collectionLoading || Boolean(quickDeletingId) || isLocked;
  const activeVideoPreview = videoPreviewUrl || form.videoUrl;

  return (
    <PageShell title="Colecao de treinos" description="Curadoria e edicao rapida da base treinors.">
      <AdminGate>
        <section className={`treinors-admin${isThemeDark ? ' is-theme-dark' : ''}`}>
          <header className="treinors-hero">
            <div className="treinors-hero-copy">
              <span className="treinors-kicker">Biblioteca base</span>
              <h2>Controle vivo da colecao de treinos do app</h2>
              <p>
                Filtre por colecao, busque por nome ou edite tudo em um unico painel.
                Os ajustes refletem para toda a rede.
              </p>
              <div className="treinors-hero-actions">
                <button className="button" type="button" onClick={handleClearFilters}>
                  Limpar filtros
                </button>
                <button className="button" type="button" onClick={openCreateSheet}>
                  Novo treino
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    if (filtered[0]) openSheet(filtered[0].id);
                  }}
                  disabled={!filtered.length}
                >
                  Editar treino recente
                </button>
              </div>
            </div>
            <div className="treinors-hero-metrics">
              <div className="treinors-metric">
                <span>Treinos ativos</span>
                <strong>{loading ? '...' : treinors.length}</strong>
                <small>Base principal</small>
              </div>
              <div className="treinors-metric">
                <span>Colecoes</span>
                <strong>{loading ? '...' : collectionCount}</strong>
                <small>Curadas</small>
              </div>
              <div className="treinors-metric">
                <span>Sem video</span>
                <strong>{loading ? '...' : missingVideoCount}</strong>
                <small>Falta midia</small>
              </div>
            </div>
          </header>

          {error && (
            <div className="treinors-alert">
              <p>{error.message}</p>
            </div>
          )}

          <div className="treinors-toolbar">
            <div className="treinors-filter-card">
              <div className="treinors-filter-header">
                <div>
                  <h3>Busca inteligente</h3>
                  <p className="subtle">Refine a base por nome, colecao ou ID.</p>
                </div>
                <span className="treinors-pill">Filtros</span>
              </div>
              <div className="treinors-filter-row">
                <label className="treinors-field">
                  Buscar treino
                  <input
                    className="treinors-input"
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Digite o nome ou ID"
                  />
                </label>
                <label className="treinors-field">
                  Colecao
                  <select
                    className="treinors-select"
                    value={selectedColecao}
                    onChange={(event) => setSelectedColecao(event.target.value)}
                  >
                    {colecoes.map((colecao) => (
                      <option key={colecao} value={colecao}>
                        {colecao === 'all' ? 'Todas colecoes' : colecao}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="treinors-field">
                  Video
                  <select
                    className="treinors-select"
                    value={videoFilter}
                    onChange={(event) =>
                      setVideoFilter(event.target.value as 'all' | 'with-video' | 'no-video')
                    }
                  >
                    <option value="all">Todos</option>
                    <option value="with-video">Com video</option>
                    <option value="no-video">Sem video</option>
                  </select>
                </label>
              </div>
              <div className="treinors-filter-foot">
                <span>
                  Mostrando <strong>{filtered.length}</strong> de{' '}
                  <strong>{treinors.length}</strong> treinos.
                </span>
              </div>
              <div className="treinors-collection-admin">
                <div className="treinors-filter-header">
                  <div>
                    <h3>Gestao de colecao</h3>
                    <p className="subtle">
                      Mova exercicios entre colecoes ou exclua uma colecao inteira.
                    </p>
                  </div>
                  <span className="treinors-pill">Colecoes</span>
                </div>
                <div className="treinors-filter-row">
                  <label className="treinors-field">
                    Colecao origem
                    <select
                      className="treinors-select"
                      value={collectionSource}
                      onChange={(event) => setCollectionSource(event.target.value)}
                      disabled={!availableCollections.length || isCollectionLocked}
                    >
                      {!availableCollections.length ? (
                        <option value="">Sem colecoes</option>
                      ) : (
                        availableCollections.map((colecao) => (
                          <option key={colecao} value={colecao}>
                            {colecao}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  <label className="treinors-field">
                    Colecao destino
                    <input
                      className="treinors-input"
                      type="text"
                      value={collectionTarget}
                      onChange={(event) => setCollectionTarget(event.target.value)}
                      placeholder="Digite a nova colecao"
                      disabled={isCollectionLocked}
                    />
                  </label>
                </div>
                <div className="treinors-collection-actions">
                  <button
                    className="button sm"
                    type="button"
                    onClick={handleMoveCollectionExercises}
                    disabled={isCollectionLocked || !availableCollections.length}
                  >
                    {collectionLoading ? 'Processando...' : 'Mover exercicios'}
                  </button>
                  <button
                    className="button danger sm"
                    type="button"
                    onClick={handleDeleteCollection}
                    disabled={isCollectionLocked || !availableCollections.length}
                  >
                    {collectionLoading ? 'Processando...' : 'Excluir colecao'}
                  </button>
                </div>
                {collectionError && <p className="treinors-inline-alert">{collectionError}</p>}
                {collectionSuccess && <p className="treinors-inline-success">{collectionSuccess}</p>}
              </div>
            </div>
            <div className="treinors-insights">
              <div className="treinors-insight">
                <span>Visiveis</span>
                <strong>{loading ? '...' : filtered.length}</strong>
                <small>Treinos filtrados</small>
              </div>
              <div className="treinors-insight">
                <span>Total base</span>
                <strong>{loading ? '...' : treinors.length}</strong>
                <small>Documentos ativos</small>
              </div>
              <div className="treinors-insight">
                <span>Sem video</span>
                <strong>{loading ? '...' : missingVideoCount}</strong>
                <small>Itens incompletos</small>
              </div>
            </div>
          </div>

          <div className="treinors-grid">
            {loading && !treinors.length
              ? Array.from({ length: 6 }).map((_, index) => (
                  <div key={`skeleton-${index}`} className="treinor-card is-loading">
                    <div className="treinor-card-media" />
                    <div className="treinor-card-body">
                      <div className="treinor-card-line" />
                      <div className="treinor-card-line short" />
                    </div>
                  </div>
                ))
              : filtered.map((item) => {
                  const hasVideo = Boolean(item.videoUrl);
                  return (
                    <article key={item.id} className="treinor-card">
                      <div className="treinor-card-media">
                        <span className="treinor-card-tag">{item.colecao}</span>
                      </div>
                      <div className="treinor-card-body">
                        <div className="treinor-card-header">
                          <div>
                            <h3 className="treinor-card-title">{item.nome}</h3>
                            <p className="treinor-card-id">ID {item.id}</p>
                          </div>
                          <div className="treinor-card-count">
                            <span>Adicionados</span>
                            <strong>{item.adicionados ?? 0}</strong>
                          </div>
                          </div>
                        <div className="treinor-card-tags">
                          <span className={`treinor-chip ${hasVideo ? 'is-ready' : 'is-empty'}`}>
                            Video
                          </span>
                        </div>
                        <div className="treinor-card-actions">
                          <button className="button sm" type="button" onClick={() => openSheet(item.id)}>
                            Editar treino
                          </button>
                          <button
                            className="button danger sm"
                            type="button"
                            onClick={() => handleQuickDeleteTreinor(item)}
                            disabled={isCollectionLocked || quickDeletingId === item.id}
                          >
                            {quickDeletingId === item.id ? 'Excluindo...' : 'Excluir'}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
          </div>

          {!loading && !filtered.length && (
            <div className="treinors-empty">
              <h3>Nenhum treino encontrado</h3>
              <p className="subtle">Ajuste os filtros ou limpe a busca para ver todos os treinos.</p>
              <button className="button secondary" type="button" onClick={handleClearFilters}>
                Limpar filtros
              </button>
            </div>
          )}
        </section>

        {isSheetOpen && (
          <div className={`treinor-sheet${isThemeDark ? ' is-theme-dark' : ''}`}>
            <button className="treinor-sheet-overlay" type="button" onClick={closeSheet} />
            <div className="treinor-sheet-panel" role="dialog" aria-modal="true">
              <div className="treinor-sheet-header">
                <div>
                  <span className="treinor-sheet-kicker">
                    {sheetMode === 'create' ? 'Novo treino' : 'Editar treino'}
                  </span>
                  <h3>{sheetTitle}</h3>
                  <p className="subtle">
                    {selectedId ? `ID ${selectedId} - ` : ''}
                    Colecao {form.colecao || 'geral'}
                  </p>
                </div>
                <button className="treinor-sheet-close" type="button" onClick={closeSheet}>
                  Fechar
                </button>
              </div>
              {sheetError && <p className="treinor-sheet-alert">{sheetError}</p>}
              {sheetSuccess && <p className="treinor-sheet-success">{sheetSuccess}</p>}
              <form className="treinor-sheet-body" onSubmit={handleSubmit}>
                {sheetLoading ? (
                  <p className="subtle">Carregando treino...</p>
                ) : (
                  <>
                    <div className="treinor-sheet-section">
                      <div className="treinor-sheet-section-head">
                        <h4>Identidade</h4>
                        <span className="treinor-sheet-pill">Colecao</span>
                      </div>
                      <div className="treinor-sheet-grid">
                        <label className="treinor-field">
                          Nome do treino
                          <input
                            className="treinor-input"
                            type="text"
                            value={form.nomeDoTreino}
                            onChange={(event) => updateField('nomeDoTreino', event.target.value)}
                            placeholder="Nome do treino"
                            disabled={isLocked}
                          />
                        </label>
                        <label className="treinor-field">
                          Colecao
                          <select
                            className="treinor-input"
                            value={form.colecao}
                            onChange={(event) => updateField('colecao', event.target.value)}
                            disabled={isLocked}
                          >
                            {formCollectionOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="treinor-field">
                          Campo legacy (treinosNoLIst)
                          <input
                            className="treinor-input"
                            type="text"
                            value={form.treinosNoLIst}
                            onChange={(event) => updateField('treinosNoLIst', event.target.value)}
                            placeholder="Nome antigo"
                            disabled={isLocked}
                          />
                        </label>
                      </div>
                      <p className="treinor-note">Mantem compatibilidade com dados antigos.</p>
                    </div>

                    <div className="treinor-sheet-section">
                      <div className="treinor-sheet-section-head">
                        <h4>Midia</h4>
                        <span className="treinor-sheet-pill">Videos</span>
                      </div>
                      <div className="treinor-sheet-grid">
                        <div className="treinor-field">
                          <label htmlFor="treinor-main-video-input">Video principal</label>
                          <input
                            id="treinor-main-video-input"
                            className="treinor-file-input"
                            type="file"
                            accept="video/*"
                            onChange={(event) => setVideoFile(event.target.files?.[0] || null)}
                            disabled={isLocked}
                          />
                          <span className="treinor-file-meta">
                            {videoFile ? buildFileMeta(videoFile) : 'Nenhum arquivo selecionado.'}
                          </span>
                          <div className="treinor-file-status">
                            <span className={`treinor-chip ${form.videoUrl ? 'is-ready' : 'is-empty'}`}>
                              Atual: {form.videoUrl ? 'carregado' : 'nenhum'}
                            </span>
                            {form.videoUrl && (
                              <button
                                className="button secondary sm"
                                type="button"
                                onClick={() => updateField('videoUrl', '')}
                                disabled={isLocked}
                              >
                                Remover
                              </button>
                            )}
                          </div>
                          {activeVideoPreview && (
                            <div className="treinor-video-preview-wrap">
                              <span className="treinor-video-preview-label">
                                {videoPreviewUrl
                                  ? 'Pre-visualizacao do arquivo selecionado'
                                  : 'Video atual'}
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
                        </div>
                      </div>
                    </div>
                  </>
                )}
                <div className="treinor-sheet-actions">
                  <button
                    className="button"
                    type="submit"
                    disabled={isLocked || (sheetMode === 'edit' && !selectedId)}
                  >
                    {sheetSaving
                      ? 'Salvando...'
                      : sheetMode === 'create'
                      ? 'Criar treino'
                      : 'Salvar alteracoes'}
                  </button>
                  <button className="button secondary" type="button" onClick={closeSheet} disabled={isLocked}>
                    Cancelar
                  </button>
                  {sheetMode === 'edit' && (
                    <button
                      className="button danger"
                      type="button"
                      onClick={handleDeleteTreinor}
                      disabled={isLocked}
                    >
                      {sheetDeleting ? 'Excluindo...' : 'Excluir treino'}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}
      </AdminGate>
    </PageShell>
  );
}
