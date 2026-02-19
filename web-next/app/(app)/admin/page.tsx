'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PageShell from '@/components/PageShell';
import AdminGate from '@/components/AdminGate';
import DataTable from '@/components/data/DataTable';
import AdminUserSheet, { type AdminUserSheetSeed } from '@/components/admin/AdminUserSheet';
import { formatDate, useCollectionData } from '@/lib/firestoreHooks';
import { useAdminDashboardData } from '@/lib/hooks/useAdminDashboardData';
import { limit, orderBy } from 'firebase/firestore';

const hasToDate = (value: unknown): value is { toDate: () => Date } => {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'toDate' in value &&
      typeof (value as { toDate?: unknown }).toDate === 'function'
  );
};

const parseDate = (value?: Date | string | number | { toDate?: () => Date } | null) => {
  if (!value) return null;
  if (hasToDate(value)) {
    return value.toDate();
  }
  const date = value instanceof Date ? value : new Date(value as Date | string | number);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

type AppErrorRow = {
  id: string;
  message?: string;
  name?: string;
  code?: string;
  source?: string;
  createdAt?: any;
  url?: string;
  type?: string;
};

type NotificationRow = {
  id: string;
  titulo?: string;
  descricao?: string;
  data?: any;
  para?: string;
  paraTodos?: boolean;
  tipo?: string;
  publico?: string;
};

type DailySeriesPoint = {
  day: string;
  total: number;
  timestamp: number;
};

const buildDailySeries = (
  items: Array<{ date: Date | null }>,
  days: number
): DailySeriesPoint[] => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const buckets = new Map<string, DailySeriesPoint>();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const key = day.toISOString().slice(0, 10);
    buckets.set(key, {
      day: day.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      total: 0,
      timestamp: day.getTime(),
    });
  }

  items.forEach((item) => {
    if (!item.date) return;
    if (item.date < start) return;
    const key = item.date.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.total += 1;
    }
  });

  return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
};

const buildErrorTitle = (message?: string, code?: string) => {
  const raw = message?.trim() || 'Erro desconhecido';
  const title = code ? `${code}: ${raw}` : raw;
  return title.length > 90 ? `${title.slice(0, 87)}...` : title;
};

const extractErrorSource = (row: AppErrorRow) => {
  if (row.source) return row.source;
  if (row.url) {
    try {
      const parsed = new URL(row.url);
      return parsed.pathname || row.url;
    } catch (error) {
      return row.url;
    }
  }
  return 'Sem origem';
};

export default function AdminIndexPage() {
  const { overview, loading, error } = useAdminDashboardData(true);
  const recentUsers = overview?.recentUsers || [];
  const [sheetUser, setSheetUser] = useState<AdminUserSheetSeed | null>(null);
  const [isThemeDark, setIsThemeDark] = useState(false);
  const errorConstraints = useMemo(() => [orderBy('createdAt', 'desc'), limit(160)], []);
  const notificationConstraints = useMemo(() => [orderBy('data', 'desc'), limit(240)], []);
  const {
    data: errorRows,
    loading: errorsLoading,
    error: errorsError,
  } = useCollectionData<AppErrorRow>(['appErrors'], errorConstraints);
  const {
    data: notificationRows,
    loading: notificationsLoading,
    error: notificationsError,
  } = useCollectionData<NotificationRow>(['notificacao'], notificationConstraints);

  const roleChartData = useMemo(() => {
    if (!overview) return [];
    return [
      { name: 'Admins', total: overview.totalAdmins },
      { name: 'Personals', total: overview.totalPersonals },
      { name: 'Academias', total: overview.totalAcademies },
      { name: 'Alunos', total: overview.totalAlunos },
    ];
  }, [overview]);

  const signupsChartData = useMemo(() => {
    const grouped = new Map<string, { day: string; total: number; timestamp: number }>();
    recentUsers.forEach((user) => {
      const date = parseDate(user.createdAt);
      if (!date) return;
      const key = date.toISOString().slice(0, 10);
      const label = date.toLocaleDateString('pt-BR');
      const timestamp = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      const existing = grouped.get(key);
      if (existing) {
        existing.total += 1;
      } else {
        grouped.set(key, { day: label, total: 1, timestamp });
      }
    });
    return Array.from(grouped.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [recentUsers]);

  const signupsSummary = useMemo(() => {
    const now = new Date();
    const last7 = new Date(now);
    last7.setDate(now.getDate() - 7);
    const last30 = new Date(now);
    last30.setDate(now.getDate() - 30);
    let count7 = 0;
    let count30 = 0;
    recentUsers.forEach((user) => {
      const date = parseDate(user.createdAt);
      if (!date) return;
      if (date >= last30) count30 += 1;
      if (date >= last7) count7 += 1;
    });
    return { count7, count30 };
  }, [recentUsers]);

  const totalUsers = overview?.totalUsers ?? 0;
  const totalAdmins = overview?.totalAdmins ?? 0;
  const totalPersonals = overview?.totalPersonals ?? 0;
  const totalAcademies = overview?.totalAcademies ?? 0;
  const totalAlunos = overview?.totalAlunos ?? 0;

  const hasOpenRouter = Boolean(
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY
  );
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_URL || '';
  const stripeFunctionsUrl =
    process.env.NEXT_PUBLIC_STRIPE_FUNCTIONS_URL || process.env.EXPO_PUBLIC_STRIPE_FUNCTIONS_URL || '';
  const stripeReady = Boolean(stripeFunctionsUrl) || (Boolean(apiUrl) && !apiUrl.includes('api.stripe.com'));

  const adminShare = totalUsers ? Math.round((totalAdmins / totalUsers) * 100) : 0;
  const personalShare = totalUsers ? Math.round((totalPersonals / totalUsers) * 100) : 0;
  const academyShare = totalUsers ? Math.round((totalAcademies / totalUsers) * 100) : 0;
  const alunoShare = totalUsers ? Math.round((totalAlunos / totalUsers) * 100) : 0;

  const normalizedErrors = useMemo(() => {
    return errorRows.map((row) => ({
      ...row,
      date: parseDate(row.createdAt),
    }));
  }, [errorRows]);

  const errorChartData = useMemo(() => buildDailySeries(normalizedErrors, 14), [normalizedErrors]);

  const errorSummary = useMemo(() => {
    const now = new Date();
    const last24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7 = new Date(now);
    last7.setDate(now.getDate() - 7);
    let count24 = 0;
    let count7 = 0;
    normalizedErrors.forEach((row) => {
      if (!row.date) return;
      if (row.date >= last7) count7 += 1;
      if (row.date >= last24) count24 += 1;
    });
    return { count24, count7 };
  }, [normalizedErrors]);

  const topErrors = useMemo(() => {
    const map = new Map<
      string,
      { key: string; message: string; count: number; lastAt: Date | null; source: string }
    >();
    normalizedErrors.forEach((row) => {
      const key = `${row.code || ''}-${row.message || row.name || ''}`;
      const existing = map.get(key);
      const source = extractErrorSource(row);
      if (existing) {
        existing.count += 1;
        if (row.date && (!existing.lastAt || row.date > existing.lastAt)) {
          existing.lastAt = row.date;
        }
      } else {
        map.set(key, {
          key,
          message: buildErrorTitle(row.message || row.name, row.code),
          count: 1,
          lastAt: row.date || null,
          source,
        });
      }
    });
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [normalizedErrors]);

  const normalizedNotifications = useMemo(() => {
    return notificationRows.map((row) => ({
      ...row,
      date: parseDate(row.data),
      paraTodos: Boolean(row.paraTodos),
    }));
  }, [notificationRows]);

  const estimateRecipients = useMemo(() => {
    return (row: NotificationRow) => {
      if (row.paraTodos) {
        const publico = (row.publico || 'Todos').toLowerCase();
        if (publico === 'alunos') return totalAlunos;
        if (publico === 'personals') return totalPersonals;
        if (publico === 'academias') return totalAcademies;
        if (publico === 'admins') return totalAdmins;
        if (publico === 'direto') return row.para ? 1 : 0;
        return totalUsers;
      }
      if (row.para) return 1;
      return 0;
    };
  }, [totalAcademies, totalAdmins, totalAlunos, totalPersonals, totalUsers]);

  const notificationChartData = useMemo(
    () => buildDailySeries(normalizedNotifications, 14),
    [normalizedNotifications]
  );

  const notificationSummary = useMemo(() => {
    const now = new Date();
    const last7 = new Date(now);
    last7.setDate(now.getDate() - 7);
    const last30 = new Date(now);
    last30.setDate(now.getDate() - 30);
    let count7 = 0;
    let count30 = 0;
    let broadcast30 = 0;
    let direct30 = 0;
    let recipients30 = 0;
    normalizedNotifications.forEach((row) => {
      if (!row.date) return;
      if (row.date >= last7) count7 += 1;
      if (row.date >= last30) {
        count30 += 1;
        recipients30 += estimateRecipients(row);
        if (row.paraTodos) {
          broadcast30 += 1;
        } else if (row.para) {
          direct30 += 1;
        }
      }
    });
    return { count7, count30, broadcast30, direct30, recipients30 };
  }, [estimateRecipients, normalizedNotifications]);

  const errorStatusLabel = errorSummary.count24 > 0 ? 'Atencao' : 'Estavel';
  const errorStatusClass = errorSummary.count24 > 0 ? 'is-danger' : 'is-info';
  const recipientsLabel =
    loading || notificationsLoading ? '...' : String(notificationSummary.recipients30);

  const chartAxisColor = isThemeDark ? '#aebad1' : '#5f6b7a';
  const signupLineColor = isThemeDark ? '#72b2ee' : '#2563eb';
  const roleBarColor = isThemeDark ? '#3a88d4' : '#0f1f33';
  const errorLineColor = isThemeDark ? '#f87171' : '#ef4444';
  const notificationLineColor = isThemeDark ? '#fbbf24' : '#f59e0b';
  const tooltipContentStyle: CSSProperties = isThemeDark
    ? {
        background: 'rgba(10, 17, 30, 0.96)',
        border: '1px solid rgba(148, 163, 184, 0.3)',
        borderRadius: 10,
        color: '#e8eef9',
      }
    : {
        background: '#ffffff',
        border: '1px solid rgba(15, 23, 42, 0.12)',
        borderRadius: 10,
        color: '#0b1624',
      };
  const tooltipLabelStyle: CSSProperties = { color: chartAxisColor, fontWeight: 600 };
  const tooltipItemStyle: CSSProperties = { color: isThemeDark ? '#e8eef9' : '#0b1624' };

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

  return (
    <PageShell title="Resumo admin" description="Indicadores gerais, integracoes e atividade do painel.">
      <AdminGate>
        <section className={`admin-overview${isThemeDark ? ' is-theme-dark' : ''}`}>
          <header className="admin-overview-hero">
            <div className="admin-overview-hero-copy">
              <span className="admin-overview-kicker">Central admin</span>
              <h1>Visao geral do MH Personal</h1>
              <p>
                Monitore a base, os riscos e o volume de envios com um painel direto e facil de ler.
              </p>
              <div className="admin-overview-actions">
                <Link href="/admin/users" className="button">
                  Gerenciar usuarios
                </Link>
                <Link href="/admin/support" className="button secondary">
                  Suporte
                </Link>
                <Link href="/notifications/admin" className="button secondary">
                  Notificar usuarios
                </Link>
                <Link href="/ai/assistant" className="button secondary">
                  Abrir IA
                </Link>
              </div>
            </div>
            <div className="admin-overview-hero-side">
              <div className="admin-overview-status">
                <div className="admin-overview-status-card">
                  <div>
                    <strong>OpenRouter IA</strong>
                    <span className="subtle">Assistente e recomendacoes</span>
                  </div>
                  <span className={`admin-overview-chip ${hasOpenRouter ? 'is-on' : 'is-off'}`}>
                    {hasOpenRouter ? 'Ativo' : 'Pendente'}
                  </span>
                </div>
                <div className="admin-overview-status-card">
                  <div>
                    <strong>Pagamentos</strong>
                    <span className="subtle">Checkouts e conectados</span>
                  </div>
                  <span className={`admin-overview-chip ${stripeReady ? 'is-on' : 'is-off'}`}>
                    {stripeReady ? 'Ativo' : 'Pendente'}
                  </span>
                </div>
                <div className="admin-overview-status-card">
                  <div>
                    <strong>Portal web</strong>
                    <span className="subtle">Painel administrativo</span>
                  </div>
                  <span className="admin-overview-chip is-on">Online</span>
                </div>
              </div>
              <div className="admin-overview-signal">
                <div>
                  <span>Erros 24h</span>
                  <strong>{errorSummary.count24}</strong>
                </div>
                <div>
                  <span>Notificacoes 30 dias</span>
                  <strong>{notificationSummary.count30}</strong>
                </div>
                <div>
                  <span>Destinos estimados</span>
                  <strong>{recipientsLabel}</strong>
                </div>
              </div>
            </div>
          </header>

          {error && (
            <div className="admin-overview-alert">
              <p>{error}</p>
            </div>
          )}

          <div className="admin-overview-kpis">
            <div className="admin-overview-kpi is-primary">
              <span>Total de usuarios</span>
              <strong>{loading ? '...' : totalUsers}</strong>
              <small>Base ativa</small>
            </div>
            <div className="admin-overview-kpi">
              <span>Personals</span>
              <strong>{loading ? '...' : totalPersonals}</strong>
              <small>{personalShare}% da base</small>
            </div>
            <div className="admin-overview-kpi">
              <span>Academias</span>
              <strong>{loading ? '...' : totalAcademies}</strong>
              <small>{academyShare}% da base</small>
            </div>
            <div className="admin-overview-kpi">
              <span>Alunos</span>
              <strong>{loading ? '...' : totalAlunos}</strong>
              <small>{alunoShare}% da base</small>
            </div>
            <div className="admin-overview-kpi">
              <span>Admins</span>
              <strong>{loading ? '...' : totalAdmins}</strong>
              <small>{adminShare}% do total</small>
            </div>
          </div>

          <div className="admin-overview-grid">
            <div className="admin-overview-card">
              <div className="admin-overview-card-header">
                <div>
                  <h3>Cadastros recentes</h3>
                  <p className="subtle">Tendencia dos ultimos registros carregados.</p>
                </div>
                <span className="admin-overview-pill">Ultimos 30 dias</span>
              </div>
              <div className="admin-overview-chart">
                {signupsChartData.length ? (
                  <ResponsiveContainer>
                    <LineChart data={signupsChartData}>
                      <XAxis dataKey="day" hide />
                      <YAxis
                        allowDecimals={false}
                        axisLine={{ stroke: chartAxisColor }}
                        tickLine={{ stroke: chartAxisColor }}
                        tick={{ fill: chartAxisColor, fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={tooltipContentStyle}
                        labelStyle={tooltipLabelStyle}
                        itemStyle={tooltipItemStyle}
                      />
                      <Line type="monotone" dataKey="total" stroke={signupLineColor} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="subtle">Sem dados para exibir.</p>
                )}
              </div>
              <div className="admin-overview-foot">
                <div>
                  <span>Ultimos 7 dias</span>
                  <strong>{signupsSummary.count7}</strong>
                </div>
                <div>
                  <span>Ultimos 30 dias</span>
                  <strong>{signupsSummary.count30}</strong>
                </div>
              </div>
            </div>

            <div className="admin-overview-card">
              <div className="admin-overview-card-header">
                <div>
                  <h3>Distribuicao de perfis</h3>
                  <p className="subtle">Admins, personals, academias e alunos.</p>
                </div>
                <span className="admin-overview-pill">Base total</span>
              </div>
              <div className="admin-overview-chart">
                {roleChartData.length ? (
                  <ResponsiveContainer>
                    <BarChart data={roleChartData}>
                      <XAxis
                        dataKey="name"
                        axisLine={{ stroke: chartAxisColor }}
                        tickLine={{ stroke: chartAxisColor }}
                        tick={{ fill: chartAxisColor, fontSize: 12 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        axisLine={{ stroke: chartAxisColor }}
                        tickLine={{ stroke: chartAxisColor }}
                        tick={{ fill: chartAxisColor, fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={tooltipContentStyle}
                        labelStyle={tooltipLabelStyle}
                        itemStyle={tooltipItemStyle}
                      />
                      <Bar dataKey="total" fill={roleBarColor} radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="subtle">Sem dados para exibir.</p>
                )}
              </div>
              <div className="admin-overview-bars">
                <div>
                  <span>Personals</span>
                  <div>
                    <span style={{ width: `${personalShare}%` }} />
                  </div>
                  <strong>{personalShare}%</strong>
                </div>
                <div>
                  <span>Academias</span>
                  <div>
                    <span style={{ width: `${academyShare}%` }} />
                  </div>
                  <strong>{academyShare}%</strong>
                </div>
                <div>
                  <span>Alunos</span>
                  <div>
                    <span style={{ width: `${alunoShare}%` }} />
                  </div>
                  <strong>{alunoShare}%</strong>
                </div>
                <div>
                  <span>Admins</span>
                  <div>
                    <span style={{ width: `${adminShare}%` }} />
                  </div>
                  <strong>{adminShare}%</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="admin-overview-grid">
            <div className="admin-overview-card admin-overview-card--alert">
              <div className="admin-overview-card-header">
                <div>
                  <h3>Alertas de erro</h3>
                  <p className="subtle">Falhas do app e firebase registradas no painel.</p>
                </div>
                <span className={`admin-overview-pill ${errorStatusClass}`}>{errorStatusLabel}</span>
              </div>
              <div className="admin-overview-chart">
                {errorsLoading ? (
                  <p className="subtle">Carregando alertas...</p>
                ) : (
                  <ResponsiveContainer>
                    <LineChart data={errorChartData}>
                      <XAxis dataKey="day" hide />
                      <YAxis
                        allowDecimals={false}
                        axisLine={{ stroke: chartAxisColor }}
                        tickLine={{ stroke: chartAxisColor }}
                        tick={{ fill: chartAxisColor, fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={tooltipContentStyle}
                        labelStyle={tooltipLabelStyle}
                        itemStyle={tooltipItemStyle}
                      />
                      <Line type="monotone" dataKey="total" stroke={errorLineColor} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              {errorsError && (
                <p className="admin-overview-inline-alert">
                  {errorsError.message || 'Erro ao carregar alertas.'}
                </p>
              )}
              {topErrors.length ? (
                <div className="admin-overview-alert-list">
                  {topErrors.map((item) => (
                    <div key={item.key} className="admin-overview-alert-item">
                      <div>
                        <strong>{item.message}</strong>
                        <span>{item.source}</span>
                      </div>
                      <div className="admin-overview-alert-meta">
                        <strong>{item.count}x</strong>
                        <span>{formatDate(item.lastAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                !errorsLoading && <p className="subtle">Sem erros registrados.</p>
              )}
              <div className="admin-overview-foot">
                <div>
                  <span>Ultimas 24h</span>
                  <strong>{errorSummary.count24}</strong>
                </div>
                <div>
                  <span>Ultimos 7 dias</span>
                  <strong>{errorSummary.count7}</strong>
                </div>
              </div>
            </div>

            <div className="admin-overview-card">
              <div className="admin-overview-card-header">
                <div>
                  <h3>Notificacoes disparadas</h3>
                  <p className="subtle">Envios recentes e alcance estimado.</p>
                </div>
                <span className="admin-overview-pill">Ultimos 30 dias</span>
              </div>
              <div className="admin-overview-chart">
                {notificationsLoading ? (
                  <p className="subtle">Carregando notificacoes...</p>
                ) : (
                  <ResponsiveContainer>
                    <LineChart data={notificationChartData}>
                      <XAxis dataKey="day" hide />
                      <YAxis
                        allowDecimals={false}
                        axisLine={{ stroke: chartAxisColor }}
                        tickLine={{ stroke: chartAxisColor }}
                        tick={{ fill: chartAxisColor, fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={tooltipContentStyle}
                        labelStyle={tooltipLabelStyle}
                        itemStyle={tooltipItemStyle}
                      />
                      <Line
                        type="monotone"
                        dataKey="total"
                        stroke={notificationLineColor}
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              {notificationsError && (
                <p className="admin-overview-inline-alert">
                  {notificationsError.message || 'Erro ao carregar notificacoes.'}
                </p>
              )}
              <div className="admin-overview-note">
                Para todos: <strong>{notificationSummary.broadcast30}</strong> | Diretos:{' '}
                <strong>{notificationSummary.direct30}</strong>
              </div>
              <div className="admin-overview-foot">
                <div>
                  <span>Ultimos 7 dias</span>
                  <strong>{notificationSummary.count7}</strong>
                </div>
                <div>
                  <span>Ultimos 30 dias</span>
                  <strong>{notificationSummary.count30}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="admin-overview-card admin-overview-card--table">
            <div className="admin-overview-card-header">
              <div>
                <h3>Usuarios recentes</h3>
                <p className="subtle">Ultimos cadastros no painel.</p>
              </div>
              <Link href="/admin/users" className="button secondary">
                Ver todos
              </Link>
            </div>
            <DataTable
              rows={recentUsers}
              columns={[
                {
                  key: 'name',
                  label: 'Usuario',
                  render: (row) => {
                    const name = row.name || 'Usuario';
                    const initial = String(name).trim().charAt(0).toUpperCase() || 'U';
                    return (
                      <div className="admin-overview-user">
                        <span className="admin-overview-avatar">{initial}</span>
                        <div>
                          <strong className="admin-overview-user-name">{name}</strong>
                        </div>
                      </div>
                    );
                  },
                },
                { key: 'email', label: 'Email', render: (row) => row.email || '-' },
                {
                  key: 'role',
                  label: 'Perfil',
                  render: (row) => <span className="admin-overview-role">{row.role || '-'}</span>,
                },
                {
                  key: 'createdAt',
                  label: 'Criado em',
                  render: (row) => (
                    <span className="admin-overview-date">{formatDate(row.createdAt)}</span>
                  ),
                },
              ]}
              emptyMessage={loading ? 'Carregando...' : 'Nenhum usuario recente.'}
              onRowClick={(row) =>
                setSheetUser({
                  id: row.id,
                  name: row.name,
                  email: row.email,
                  role: row.role,
                })
              }
            />
          </div>
          <AdminUserSheet
            open={Boolean(sheetUser?.id)}
            userId={sheetUser?.id || null}
            seed={sheetUser}
            onClose={() => setSheetUser(null)}
            onSelectUser={(userId) => setSheetUser({ id: userId })}
          />
        </section>
      </AdminGate>
    </PageShell>
  );
}
