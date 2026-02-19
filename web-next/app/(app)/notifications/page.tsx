'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { formatDate } from '@/lib/firestoreHooks';
import { useAuth } from '@/lib/auth';
import { fetchNotificationsForUser, respondToSecurityLoginAlert } from '@/lib/services/notificationCenter';

interface NotificationRow {
  id: string;
  titulo?: string;
  descricao?: string;
  data?: any;
  tipo?: string;
  securityEvent?: boolean;
  securityStatus?: 'pending' | 'confirmed' | 'denied';
  securityResolvedAt?: any;
}

export default function NotificationsPage() {
  const { user, role, resetPassword, logout } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'all' | 'recent'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const actions = role === 'admin' ? [{ label: 'Admin', href: '/notifications/admin' }] : undefined;

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const result = await fetchNotificationsForUser(user.uid);
      if (!active) return;
      setRows(result.data || []);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  const recentCutoff = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date;
  }, []);

  const normalized = useMemo(() => {
    return rows.map((row) => {
      const date = row.data instanceof Date ? row.data : row.data?.toDate?.() || row.data;
      return {
        ...row,
        date: date instanceof Date && !Number.isNaN(date.getTime()) ? date : null,
      };
    });
  }, [rows]);

  const recentCount = useMemo(() => {
    return normalized.filter((row) => row.date && row.date >= recentCutoff).length;
  }, [normalized, recentCutoff]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return normalized.filter((row) => {
      if (view === 'recent' && (!row.date || row.date < recentCutoff)) return false;
      if (!term) return true;
      return (
        (row.titulo || '').toLowerCase().includes(term) ||
        (row.descricao || '').toLowerCase().includes(term) ||
        (row.tipo || '').toLowerCase().includes(term)
      );
    });
  }, [normalized, recentCutoff, search, view]);

  const handleSecurityDecision = async (
    row: NotificationRow,
    decision: 'confirmed' | 'denied'
  ) => {
    if (!user?.uid) return;
    if (decision === 'denied') {
      const shouldContinue = window.confirm(
        'Confirmar "Nao fui eu"? Vamos encerrar sua sessao e enviar recuperacao de senha.'
      );
      if (!shouldContinue) return;
    }
    setActionLoadingId(row.id);
    try {
      await respondToSecurityLoginAlert({
        notificationId: row.id,
        userId: user.uid,
        decision,
      });

      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? { ...item, securityStatus: decision, securityResolvedAt: new Date() }
            : item
        )
      );

      if (decision === 'denied') {
        if (user.email) {
          await resetPassword(user.email);
        }
        await logout();
        window.alert('Login marcado como suspeito. Enviamos o reset de senha e encerramos sua sessao.');
        router.replace('/login');
      }
    } catch (error) {
      console.error('Erro ao responder alerta de seguranca:', error);
      window.alert('Nao foi possivel confirmar sua resposta de seguranca agora.');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <PageShell
      title="Notificacoes"
      description="Alertas de treinos, agenda e sistema."
      actions={actions}
    >
      <div className="notifications-layout">
        <section className="card notifications-panel">
          <div className="notifications-header">
            <div>
              <h3>Caixa de entrada</h3>
              <p className="subtle" style={{ marginTop: 6 }}>
                Tudo que importa do sistema e dos seus treinos.
              </p>
            </div>
            <div className="notifications-controls">
              <input
                className="notifications-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar notificacao"
              />
              <div className="notifications-toggle">
                <button
                  type="button"
                  className={view === 'all' ? 'is-active' : ''}
                  onClick={() => setView('all')}
                >
                  Todas
                </button>
                <button
                  type="button"
                  className={view === 'recent' ? 'is-active' : ''}
                  onClick={() => setView('recent')}
                >
                  Ultimos 7 dias
                </button>
              </div>
            </div>
          </div>

          <div className="notifications-stats">
            <div className="notifications-stat">
              <span>Total</span>
              <strong>{rows.length}</strong>
            </div>
            <div className="notifications-stat">
              <span>Ultimos 7 dias</span>
              <strong>{recentCount}</strong>
            </div>
          </div>

          <div className="notifications-list">
            {loading && <p className="subtle">Carregando notificacoes...</p>}
            {!loading && !filteredRows.length && (
              <div className="notifications-empty">
                <h4>Nenhuma notificacao encontrada</h4>
                <p className="subtle">Assim que houver novidades, elas aparecem aqui.</p>
              </div>
            )}
            {!loading &&
              filteredRows.map((row) => (
                <div key={row.id} className="notifications-item">
                  <div>
                    <h4>{row.titulo || 'Notificacao'}</h4>
                    <p className="notifications-item-desc">{row.descricao || 'Sem detalhes.'}</p>
                    {row.securityEvent && (
                      <div className="notifications-security-box">
                        {row.securityStatus === 'pending' || !row.securityStatus ? (
                          <div className="notifications-security-actions">
                            <button
                              type="button"
                              className="button secondary"
                              disabled={actionLoadingId === row.id}
                              onClick={() => handleSecurityDecision(row, 'confirmed')}
                            >
                              Fui eu
                            </button>
                            <button
                              type="button"
                              className="button"
                              disabled={actionLoadingId === row.id}
                              onClick={() => handleSecurityDecision(row, 'denied')}
                            >
                              Nao fui eu
                            </button>
                          </div>
                        ) : (
                          <p className="notifications-security-status">
                            {row.securityStatus === 'confirmed'
                              ? 'Login confirmado por voce.'
                              : 'Login marcado como suspeito. Sessao protegida.'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="notifications-meta">
                    <span>{row.tipo || 'Sistema'}</span>
                    <strong>{formatDate(row.date || row.data)}</strong>
                  </div>
                </div>
              ))}
          </div>
        </section>

        <aside className="notifications-side">
          <div className="card">
            <h3>Preferencias</h3>
            <p className="subtle" style={{ marginTop: 8 }}>
              Ajuste alertas no seu perfil.
            </p>
            <Link href="/settings/notifications" className="button secondary" style={{ marginTop: 12 }}>
              Configurar notificacoes
            </Link>
          </div>
          {role === 'admin' && (
            <div className="card">
              <h3>Envio admin</h3>
              <p className="subtle" style={{ marginTop: 8 }}>
                Dispare comunicados para toda a base.
              </p>
              <Link href="/notifications/admin" className="button" style={{ marginTop: 12 }}>
                Abrir painel admin
              </Link>
            </div>
          )}
        </aside>
      </div>
    </PageShell>
  );
}
