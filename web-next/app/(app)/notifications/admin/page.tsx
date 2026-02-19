'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import AdminGate from '@/components/AdminGate';
import DataTable from '@/components/data/DataTable';
import { formatDate, useCollectionData } from '@/lib/firestoreHooks';
import { useAuth } from '@/lib/auth';
import { isPremiumUserRecord } from '@/lib/services/aiAccess';
import { createNotification } from '@/lib/services/notificationCenter';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';

interface NotificationRow {
  id: string;
  titulo?: string;
  descricao?: string;
  data?: any;
  para?: string;
  paraTodos?: boolean;
  tipo?: string;
  publico?: string;
}

interface AssistantDraft {
  id: string;
  titulo: string;
  descricao: string;
  publico: string;
  tipo: string;
  foco: string;
}

interface AssistantSmartState {
  status?: 'idle' | 'running' | 'paused' | 'error';
  nextRunAt?: any;
  nextAudience?: string;
  nextObjective?: string;
  nextTitle?: string;
  lastSentAt?: any;
  lastAudience?: string;
  lastObjective?: string;
  lastTitle?: string;
  lastError?: string;
}

interface AssistantSettingsDoc {
  assistantEnabled?: boolean;
  assistantSmart?: boolean;
  assistantPremiumOnly?: boolean;
  assistantEngine?: string;
  smartState?: AssistantSmartState;
}

const audienceOptions = [
  { value: 'Todos', label: 'Todos' },
  { value: 'Alunos', label: 'Alunos' },
  { value: 'Personals', label: 'Personals' },
  { value: 'Academias', label: 'Academias' },
  { value: 'Direto', label: 'Direto' },
];

const campaignOptions = [
  { value: 'Sistema', label: 'Sistema' },
  { value: 'Treino', label: 'Treino' },
  { value: 'Agenda', label: 'Agenda' },
  { value: 'Promocoes', label: 'Promocoes' },
  { value: 'Chamada pro app', label: 'Chamada pro app' },
];

const assistantDrafts: AssistantDraft[] = [
  {
    id: 'app-volta-rotina',
    titulo: 'Seu treino esta te esperando',
    descricao:
      'Treino do dia liberado com ajustes recentes. Abra o app, confira a serie e marque como concluido.',
    publico: 'Alunos',
    tipo: 'Chamada pro app',
    foco: 'retencao',
  },
  {
    id: 'app-desafio-semana',
    titulo: 'Desafio da semana no app',
    descricao:
      'Nova rotina rapida com tempo cronometrado. Entre no app, registre a execucao e mantenha o ritmo.',
    publico: 'Alunos',
    tipo: 'Chamada pro app',
    foco: 'engajamento',
  },
  {
    id: 'treino-ajuste',
    titulo: 'Treino ajustado no painel',
    descricao:
      'Series e cargas foram atualizadas. Confira o treino no app e confirme a presenca de hoje.',
    publico: 'Alunos',
    tipo: 'Treino',
    foco: 'qualidade',
  },
  {
    id: 'agenda-personal',
    titulo: 'Agenda otimizada para hoje',
    descricao:
      'Horarios com menor conflito e intervalo inteligente. Revise os atendimentos e confirme slots.',
    publico: 'Personals',
    tipo: 'Agenda',
    foco: 'organizacao',
  },
  {
    id: 'promo-academia',
    titulo: 'Campanha pronta para divulgar',
    descricao:
      'Pacote promocional com bonus de avaliacao e desconto inicial. Compartilhe com novos leads.',
    publico: 'Academias',
    tipo: 'Promocoes',
    foco: 'vendas',
  },
  {
    id: 'sistema-alerta',
    titulo: 'Manutencao programada',
    descricao:
      'Aviso rapido para reduzir cancelamentos: hoje as 22:00 o app pode ficar instavel por 20 min.',
    publico: 'Todos',
    tipo: 'Sistema',
    foco: 'operacional',
  },
];

type TableScope = 'all' | 'broadcast' | 'direct';

export default function AdminNotificationsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const { data, loading } = useCollectionData<NotificationRow>(['notificacao']);
  const [isThemeDark, setIsThemeDark] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [para, setPara] = useState('');
  const [paraTodos, setParaTodos] = useState(true);
  const [publico, setPublico] = useState('Todos');
  const [tipo, setTipo] = useState('Sistema');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [tableScope, setTableScope] = useState<TableScope>('all');
  const [assistantEnabled, setAssistantEnabled] = useState(false);
  const [assistantSmart, setAssistantSmart] = useState(false);
  const [assistantPremiumOnly, setAssistantPremiumOnly] = useState(true);
  const [smartState, setSmartState] = useState<AssistantSmartState | null>(null);
  const assistantSettingsLoadedRef = useRef(false);
  const applyingRemoteSettingsRef = useRef(false);
  const assistantSettingsRef = useMemo(
    () => doc(db, 'adminSettings', 'notificationsAssistant'),
    []
  );

  const assistantAiReady = Boolean(
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY
  );

  const hasPremium = useMemo(() => {
    const isAdmin = Boolean((user as any)?.admin);
    if (isAdmin) return true;
    return isPremiumUserRecord((user || {}) as Record<string, any>);
  }, [user]);

  const toDate = useCallback((value: any) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value?.toDate === 'function') {
      const parsed = value.toDate();
      return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, []);

  useEffect(() => {
    const userId = searchParams.get('userId');
    if (userId) {
      setPara(userId);
      setParaTodos(false);
      setPublico('Direto');
    }
  }, [searchParams]);

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

  useEffect(() => {
    if (!assistantEnabled) {
      setAssistantSmart(false);
    }
  }, [assistantEnabled]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      assistantSettingsRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          assistantSettingsLoadedRef.current = true;
          return;
        }
        const data = (snapshot.data() || {}) as AssistantSettingsDoc;
        applyingRemoteSettingsRef.current = true;
        setAssistantEnabled(Boolean(data.assistantEnabled));
        setAssistantSmart(Boolean(data.assistantSmart));
        setAssistantPremiumOnly(data.assistantPremiumOnly !== false);
        setSmartState(data.smartState || null);
        assistantSettingsLoadedRef.current = true;
        setTimeout(() => {
          applyingRemoteSettingsRef.current = false;
        }, 0);
      },
      (error) => {
        console.error('Erro ao carregar configuracoes do assistente:', error);
        assistantSettingsLoadedRef.current = true;
      }
    );

    return () => unsubscribe();
  }, [assistantSettingsRef]);

  useEffect(() => {
    if (!assistantSettingsLoadedRef.current || applyingRemoteSettingsRef.current) return;
    void setDoc(
      assistantSettingsRef,
      {
        assistantEnabled,
        assistantSmart,
        assistantPremiumOnly,
        assistantEngine: 'cloud-v1',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [assistantEnabled, assistantPremiumOnly, assistantSmart, assistantSettingsRef]);

  useEffect(() => {
    if (!hasPremium && assistantSmart) {
      setAssistantSmart(false);
    }
  }, [assistantSmart, hasPremium]);

  useEffect(() => {
    if (paraTodos && publico === 'Direto') {
      setPublico('Todos');
    }
  }, [paraTodos, publico]);

  const recentCutoff = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date;
  }, []);

  const normalizedRows = useMemo(() => {
    const rows = data ?? [];
    return rows.map((row) => {
      const date =
        row.data instanceof Date
          ? row.data
          : row.data?.toDate
          ? row.data.toDate()
          : row.data
          ? new Date(row.data)
          : null;
      return {
        ...row,
        date,
      };
    });
  }, [data]);

  const totalCount = normalizedRows.length;
  const recentCount = useMemo(() => {
    return normalizedRows.filter((row) => row.date && row.date >= recentCutoff).length;
  }, [normalizedRows, recentCutoff]);

  const broadcastCount = useMemo(() => {
    return normalizedRows.filter((row) => row.paraTodos).length;
  }, [normalizedRows]);

  const directCount = useMemo(() => {
    return normalizedRows.filter((row) => row.para && !row.paraTodos).length;
  }, [normalizedRows]);

  const sortedRows = useMemo(() => {
    return [...normalizedRows].sort((a, b) => {
      const aTime = a.date ? a.date.getTime() : 0;
      const bTime = b.date ? b.date.getTime() : 0;
      return bTime - aTime;
    });
  }, [normalizedRows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sortedRows.filter((row) => {
      if (tableScope === 'broadcast' && !row.paraTodos) return false;
      if (tableScope === 'direct' && row.paraTodos) return false;
      if (!term) return true;
      return (
        (row.titulo || '').toLowerCase().includes(term) ||
        (row.descricao || '').toLowerCase().includes(term) ||
        (row.tipo || '').toLowerCase().includes(term) ||
        (row.publico || '').toLowerCase().includes(term) ||
        (row.para || '').toLowerCase().includes(term)
      );
    });
  }, [sortedRows, search, tableScope]);

  const handleApplyDraft = (draft: AssistantDraft) => {
    setTitulo(draft.titulo);
    setDescricao(draft.descricao);
    setPublico(draft.publico);
    setTipo(draft.tipo);
  };

  const handleAssistantEnabledChange = (checked: boolean) => {
    if (!hasPremium) return;
    setAssistantEnabled(checked);
  };

  const handleAssistantSmartChange = (checked: boolean) => {
    if (!hasPremium) return;
    setAssistantSmart(checked);
  };

  const handlePublicoChange = (value: string) => {
    setPublico(value);
    if (value === 'Direto') {
      setParaTodos(false);
    }
  };

  const handleClear = () => {
    setTitulo('');
    setDescricao('');
    setPara('');
    setParaTodos(true);
    setPublico('Todos');
    setTipo('Sistema');
  };

  const formatSmartTime = useCallback((date: Date) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    let dayLabel = date.toLocaleDateString('pt-BR');
    if (startOfDate.getTime() === startOfToday.getTime()) {
      dayLabel = 'Hoje';
    } else if (startOfDate.getTime() === startOfTomorrow.getTime()) {
      dayLabel = 'Amanha';
    }
    const timeLabel = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${dayLabel} ${timeLabel}`;
  }, []);

  const smartStatus = smartState?.status || 'idle';
  const smartStatusLabel =
    smartStatus === 'running'
      ? 'Disparando'
      : smartStatus === 'paused'
      ? 'Pausado'
      : smartStatus === 'error'
      ? 'Erro'
      : 'Agendado';
  const nextAutoAt = toDate(smartState?.nextRunAt);
  const lastAutoAt = toDate(smartState?.lastSentAt);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!hasPremium) return;
    if (!titulo || !descricao) return;
    if (!paraTodos && !para) return;
    setSaving(true);
    await createNotification({
      titulo,
      descricao,
      para: paraTodos ? undefined : para || undefined,
      paraTodos,
      tipo,
      publico,
    });
    handleClear();
    setSaving(false);
  };

  return (
    <PageShell
      title="Notificacoes admin"
      description="Central de comunicados, campanhas e historico de envio."
      breadcrumbs={[{ label: 'Notificacoes', href: '/notifications' }]}
    >
      <AdminGate>
        <section className={`notifications-admin${isThemeDark ? ' is-theme-dark' : ''}`}>
          <header className="notifications-admin-hero">
            <div className="notifications-admin-hero-copy">
              <span className="notifications-admin-kicker">Central de comunicados</span>
              <h2>Notifique a base com campanhas mais inteligentes.</h2>
              <p className="subtle">
                Organize publico, estilo e frequencia. Use rascunhos do assistente e acompanhe o
                historico de envios no painel.
              </p>
              <div className="notifications-admin-pill-row">
                <span className="notifications-admin-pill">Push</span>
                <span className="notifications-admin-pill">In-app</span>
                <span className="notifications-admin-pill">Operacional</span>
                <span className="notifications-admin-pill">Promocoes</span>
              </div>
            </div>
            <div className="notifications-admin-hero-stats">
              <div className="notifications-admin-stat is-primary">
                <span>Total</span>
                <strong>{loading ? '...' : totalCount}</strong>
                <small>Envios registrados</small>
              </div>
              <div className="notifications-admin-stat">
                <span>Ultimos 7 dias</span>
                <strong>{loading ? '...' : recentCount}</strong>
                <small>Campanhas recentes</small>
              </div>
              <div className="notifications-admin-stat">
                <span>Para todos</span>
                <strong>{loading ? '...' : broadcastCount}</strong>
                <small>Comunicados amplos</small>
              </div>
              <div className="notifications-admin-stat">
                <span>Diretos</span>
                <strong>{loading ? '...' : directCount}</strong>
                <small>Usuario unico</small>
              </div>
            </div>
          </header>

          {!hasPremium && (
            <div className="card" style={{ marginBottom: 18, border: '1px solid rgba(90, 169, 255, 0.35)' }}>
              <h3 style={{ marginBottom: 8 }}>Recurso premium</h3>
              <p className="subtle" style={{ marginBottom: 10 }}>
                O painel inteligente de notificacoes e o auto-disparo com IA sao exclusivos do Premium.
                Assine para liberar campanhas segmentadas por alunos, personais e academias.
              </p>
              <a className="button secondary" href="/profile/subscription">
                Ir para assinatura
              </a>
            </div>
          )}

          <div className="notifications-admin-grid">
            <div className="notifications-admin-column notifications-admin-main">
              <div
                className="notifications-admin-card notifications-admin-compose"
                style={{ animationDelay: '0.05s' }}
              >
                <div className="notifications-admin-card-header">
                  <div>
                    <h3>Nova notificacao</h3>
                    <p className="subtle">Defina titulo, mensagem e publico alvo.</p>
                  </div>
                  <span className="notifications-admin-pill">Envio rapido</span>
                </div>
                <form className="notifications-admin-form" onSubmit={handleSubmit}>
                  <fieldset
                    disabled={!hasPremium || saving}
                    style={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}
                  >
                  <div className="notifications-admin-row">
                    <label className="notifications-admin-field">
                      Titulo
                      <input
                        className="notifications-admin-input"
                        type="text"
                        value={titulo}
                        onChange={(event) => setTitulo(event.target.value)}
                        placeholder="Ex: Treino liberado hoje"
                      />
                    </label>
                    <label className="notifications-admin-field">
                      Publico (tag)
                      <div className="notifications-admin-chips">
                        {audienceOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`notifications-admin-chip ${publico === option.value ? 'is-active' : ''}`}
                            onClick={() => handlePublicoChange(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </label>
                  </div>

                  <label className="notifications-admin-field">
                    Mensagem
                    <textarea
                      className="notifications-admin-textarea"
                      rows={4}
                      value={descricao}
                      onChange={(event) => setDescricao(event.target.value)}
                      placeholder="Explique rapidamente o que muda ou qual acao o usuario precisa tomar."
                    />
                  </label>

                  <div className="notifications-admin-row">
                    <label className="notifications-admin-field">
                      Campanha
                      <div className="notifications-admin-chips">
                        {campaignOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`notifications-admin-chip ${tipo === option.value ? 'is-active' : ''}`}
                            onClick={() => setTipo(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </label>
                    <label className="notifications-admin-field">
                      Destino real
                      <div className="notifications-admin-toggle">
                        <button
                          type="button"
                          className={paraTodos ? 'is-active' : ''}
                          onClick={() => setParaTodos(true)}
                        >
                          Para todos
                        </button>
                        <button
                          type="button"
                          className={!paraTodos ? 'is-active' : ''}
                          onClick={() => setParaTodos(false)}
                        >
                          UID unico
                        </button>
                      </div>
                    </label>
                  </div>

                  <label className="notifications-admin-field">
                    UID do usuario (opcional)
                    <input
                      className="notifications-admin-input"
                      type="text"
                      value={para}
                      onChange={(event) => setPara(event.target.value)}
                      disabled={paraTodos}
                      placeholder="Cole o UID do usuario"
                    />
                    <span className="notifications-admin-hint">
                      Selecione UID unico para envio individual.
                    </span>
                  </label>

                  <div className="notifications-admin-actions">
                    <button className="button" type="submit" disabled={saving || !hasPremium}>
                      {saving ? 'Enviando...' : 'Enviar notificacao'}
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={handleClear}
                      disabled={saving || !hasPremium}
                    >
                      Limpar
                    </button>
                  </div>
                  </fieldset>
                </form>
              </div>

              <div
                className="notifications-admin-card notifications-admin-table"
                style={{ animationDelay: '0.2s' }}
              >
                <div className="notifications-admin-table-header">
                  <div>
                    <h3>Historico de envios</h3>
                    <p className="subtle">Ultimas notificacoes registradas no sistema.</p>
                  </div>
                  <div className="notifications-admin-table-actions">
                    <input
                      className="notifications-admin-input"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar por titulo, mensagem ou publico"
                    />
                    <div className="notifications-admin-toggle">
                      <button
                        type="button"
                        className={tableScope === 'all' ? 'is-active' : ''}
                        onClick={() => setTableScope('all')}
                      >
                        Todas
                      </button>
                      <button
                        type="button"
                        className={tableScope === 'broadcast' ? 'is-active' : ''}
                        onClick={() => setTableScope('broadcast')}
                      >
                        Para todos
                      </button>
                      <button
                        type="button"
                        className={tableScope === 'direct' ? 'is-active' : ''}
                        onClick={() => setTableScope('direct')}
                      >
                        Diretos
                      </button>
                    </div>
                  </div>
                </div>
                <DataTable
                  rows={filteredRows}
                  columns={[
                    {
                      key: 'titulo',
                      label: 'Titulo',
                      render: (row) => (
                        <div className="notifications-admin-title">
                          <strong>{row.titulo || 'Notificacao'}</strong>
                          <span>{row.publico || (row.paraTodos ? 'Todos' : 'Direto')}</span>
                        </div>
                      ),
                    },
                    {
                      key: 'descricao',
                      label: 'Mensagem',
                      render: (row) => (
                        <span className="notifications-admin-table-desc">{row.descricao || '-'}</span>
                      ),
                    },
                    {
                      key: 'tipo',
                      label: 'Campanha',
                      render: (row) => (
                        <span className="notifications-admin-tag">{row.tipo || 'Sistema'}</span>
                      ),
                    },
                    {
                      key: 'data',
                      label: 'Data',
                      render: (row) => formatDate(row.date || row.data),
                    },
                  ]}
                  emptyMessage={loading ? 'Carregando...' : 'Nenhuma notificacao encontrada.'}
                />
              </div>
            </div>

            <div className="notifications-admin-column notifications-admin-side">
              <div
                className="notifications-admin-card notifications-admin-ai"
                style={{ animationDelay: '0.1s' }}
              >
                <div className="notifications-admin-card-header">
                  <div>
                    <h3>Assistente</h3>
                    <p className="subtle">
                      Rascunhos com IA e auto-disparo diario segmentado por tipo de usuario.
                    </p>
                  </div>
                  <span className={`notifications-admin-pill ${assistantAiReady ? 'is-active' : 'is-pending'}`}>
                    {assistantAiReady ? 'IA online' : 'Modo fallback'}
                  </span>
                </div>

                <div className="notifications-admin-switches">
                  <label className="notifications-admin-switch">
                    <span className="notifications-admin-switch-control">
                      <input
                        type="checkbox"
                        checked={assistantEnabled}
                        onChange={(event) => handleAssistantEnabledChange(event.target.checked)}
                        disabled={!hasPremium}
                      />
                      <span className="notifications-admin-switch-slider" />
                    </span>
                    <span className="notifications-admin-switch-text">
                      <strong>Assistente criar notificacoes</strong>
                      <span className="subtle">
                        Gera rascunhos completos e chamadas pro app sob demanda.
                      </span>
                    </span>
                  </label>
                  <label className={`notifications-admin-switch ${assistantEnabled ? '' : 'is-disabled'}`}>
                    <span className="notifications-admin-switch-control">
                      <input
                        type="checkbox"
                        checked={assistantSmart}
                        onChange={(event) => handleAssistantSmartChange(event.target.checked)}
                        disabled={!assistantEnabled || !hasPremium}
                      />
                      <span className="notifications-admin-switch-slider" />
                    </span>
                    <span className="notifications-admin-switch-text">
                      <strong>Assistente inteligente (auto-disparo)</strong>
                      <span className="subtle">
                        Dispara em nuvem, diariamente, com segmentacao separada para alunos, personais
                        e academias usando horarios de maior engajamento.
                      </span>
                    </span>
                  </label>
                </div>

                {!hasPremium && (
                  <p className="subtle" style={{ marginTop: 10 }}>
                    Premium necessario para ativar automacao e campanhas com IA.
                  </p>
                )}

                <div className="notifications-admin-drafts">
                  <div className="notifications-admin-drafts-header">
                    <strong>Sugestoes do assistente</strong>
                    <span className="subtle">Clique para aplicar no formulario.</span>
                  </div>
                  <div className="notifications-admin-drafts-grid">
                    {assistantDrafts.map((draft) => (
                      <button
                        key={draft.id}
                        type="button"
                        className="notifications-admin-draft"
                        onClick={() => handleApplyDraft(draft)}
                        disabled={!assistantEnabled || !hasPremium}
                      >
                        <div className="notifications-admin-draft-copy">
                          <strong>{draft.titulo}</strong>
                          <p className="subtle">{draft.descricao}</p>
                          <span className="notifications-admin-draft-meta">
                            {draft.publico} - {draft.tipo}
                          </span>
                        </div>
                        <span className="notifications-admin-draft-tag">{draft.foco}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {assistantSmart && (
                  <div className="notifications-admin-smart">
                    <div className="notifications-admin-smart-header">
                      <strong>Auto-disparo ativo</strong>
                      <span
                        className={`notifications-admin-smart-badge ${smartStatus === 'running' ? 'is-live' : ''}`}
                      >
                        {smartStatusLabel}
                      </span>
                    </div>
                    <p className="subtle">
                      {nextAutoAt
                        ? `Proximo ciclo: ${smartState?.nextAudience || 'Publico'} (${smartState?.nextObjective || 'engajamento'})`
                        : 'Aguardando o backend calcular a proxima janela de envio.'}
                    </p>
                    {nextAutoAt && (
                      <div className="notifications-admin-smart-line">
                        <span>{formatSmartTime(nextAutoAt)}</span>
                        <span>{smartState?.nextTitle || 'Campanha inteligente'}</span>
                      </div>
                    )}
                    {lastAutoAt && (
                      <div className="notifications-admin-smart-line is-muted">
                        <span>Ultimo disparo</span>
                        <span>{formatSmartTime(lastAutoAt)}</span>
                      </div>
                    )}
                    {smartState?.lastAudience && (
                      <div className="notifications-admin-smart-line is-muted">
                        <span>Publico</span>
                        <span>{smartState.lastAudience}</span>
                      </div>
                    )}
                    {smartState?.lastError && (
                      <div className="notifications-admin-smart-line is-muted">
                        <span>Ultimo erro</span>
                        <span>{smartState.lastError}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                className="notifications-admin-card notifications-admin-preview"
                style={{ animationDelay: '0.15s' }}
              >
                <div className="notifications-admin-card-header">
                  <div>
                    <h3>Preview</h3>
                    <p className="subtle">Como chega no app.</p>
                  </div>
                  <span className="notifications-admin-pill">Simulacao</span>
                </div>
                <div className="notifications-admin-preview-card">
                  <span className="notifications-admin-preview-type">{tipo || 'Sistema'}</span>
                  <h4>{titulo || 'Titulo da notificacao'}</h4>
                  <p>{descricao || 'Mensagem principal da notificacao aparece aqui.'}</p>
                  <div className="notifications-admin-preview-meta">
                    <span>{publico || 'Todos'}</span>
                    <span>{paraTodos ? 'Para todos' : 'UID unico'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </AdminGate>
    </PageShell>
  );
}
