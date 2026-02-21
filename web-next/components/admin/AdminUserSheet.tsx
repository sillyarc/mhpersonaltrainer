'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDate } from '@/lib/firestoreHooks';
import { firestoreService, type Avaliacao, type PersonalProfile, type Treino } from '@/lib/services/firestoreService';
import type { User } from '@/lib/types/user';

export type AdminUserSheetSeed = {
  id: string;
  name?: string;
  email?: string;
  role?: 'admin' | 'personal' | 'aluno' | 'academy';
  status?: 'ativo' | 'suspenso';
};

type AdminUserSheetProps = {
  open: boolean;
  userId: string | null;
  seed?: AdminUserSheetSeed | null;
  onClose: () => void;
  onSelectUser?: (userId: string) => void;
};

const roleLabel = (role?: string) => {
  if (role === 'admin') return 'Admin';
  if (role === 'academy') return 'Academia';
  if (role === 'personal') return 'Personal';
  return 'Aluno';
};

const getRole = (user?: User | null, seed?: AdminUserSheetSeed | null) => {
  if (user) {
    return user.admin
      ? 'admin'
      : user.academyAccount
      ? 'academy'
      : user.professorAccount
      ? 'personal'
      : 'aluno';
  }
  return seed?.role || 'aluno';
};

const getStatusLabel = (isSuspended: boolean) => (isSuspended ? 'suspenso' : 'ativo');

export default function AdminUserSheet({
  open,
  userId,
  seed,
  onClose,
  onSelectUser,
}: AdminUserSheetProps) {
  const [user, setUser] = useState<User | null>(null);
  const [treinos, setTreinos] = useState<Treino[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [personal, setPersonal] = useState<PersonalProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [actionSaving, setActionSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const originalOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = originalOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !userId) return;
    let active = true;
    setLoading(true);
    setDetailsLoading(true);
    setError('');
    setActionError('');
    setUser(null);
    setTreinos([]);
    setAvaliacoes([]);
    setPersonal(null);

    const load = async () => {
      try {
        const doc = await firestoreService.getUserDocument(userId);
        if (!active) return;
        setUser(doc);
        setLoading(false);
        if (!doc) {
          setDetailsLoading(false);
          return;
        }
        const [treinosData, avaliacoesData] = await Promise.all([
          firestoreService.getTreinosDoAluno(userId),
          firestoreService.getAvaliacoesDoAluno(userId),
        ]);
        if (!active) return;
        setTreinos(treinosData || []);
        setAvaliacoes(avaliacoesData || []);
        if (doc.codigoPersonal) {
          const personalProfile = await firestoreService.getPersonalProfileByCode(doc.codigoPersonal);
          if (!active) return;
          setPersonal(personalProfile);
        }
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || 'Erro ao carregar dados do usuario.');
      } finally {
        if (active) {
          setLoading(false);
          setDetailsLoading(false);
        }
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [open, userId]);

  const role = getRole(user, seed);
  const isSuspended = user ? Boolean(user.acessoSuspenso) : seed?.status === 'suspenso';
  const statusLabel = getStatusLabel(isSuspended);
  const displayName = useMemo(() => {
    if (user?.displayName) return user.displayName;
    if (seed?.name) return seed.name;
    if (user?.email) return user.email.split('@')[0];
    if (seed?.email) return seed.email.split('@')[0];
    return 'Usuario';
  }, [seed?.email, seed?.name, user?.displayName, user?.email]);
  const displayEmail = user?.email || seed?.email || '';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'U';

  const metaRows = useMemo(() => {
    const rows = [
      { label: 'Perfil', value: roleLabel(role) },
      { label: 'Status', value: statusLabel },
      { label: 'UID', value: userId || '-' },
      { label: 'Criado em', value: user?.createdTime ? formatDate(user.createdTime) : '-' },
      { label: 'Ultimo acesso', value: user?.lastActiveTime ? formatDate(user.lastActiveTime) : '-' },
      { label: 'Cidade', value: user?.cidade || '-' },
      { label: 'Estado', value: user?.estado || '-' },
      { label: 'Telefone', value: user?.phoneNumber || '-' },
    ];
    if (role === 'academy') {
      rows.push({
        label: 'Codigo academia',
        value: user?.codigoAcademia ? String(user.codigoAcademia) : '-',
      });
    } else {
      rows.push({
        label: 'Codigo personal',
        value: user?.codigoPersonal ? String(user.codigoPersonal) : '-',
      });
    }
    return rows;
  }, [
    role,
    statusLabel,
    user?.cidade,
    user?.codigoAcademia,
    user?.codigoPersonal,
    user?.createdTime,
    user?.estado,
    user?.lastActiveTime,
    user?.phoneNumber,
    userId,
  ]);

  const handleToggleStatus = async () => {
    if (!userId) return;
    const willActivate = isSuspended;
    if (!willActivate) {
      const confirmed = window.confirm('Deseja bloquear este usuario?');
      if (!confirmed) return;
    }
    setActionSaving(true);
    setActionError('');
    try {
      await firestoreService.updateStudentStatus(userId, willActivate);
      setUser((prev) => (prev ? { ...prev, acessoSuspenso: !willActivate } : prev));
    } catch (err: any) {
      setActionError(err?.message || 'Erro ao atualizar status do usuario.');
    } finally {
      setActionSaving(false);
    }
  };

  if (!open || !userId) return null;

  return (
    <div className="admin-user-sheet">
      <button className="admin-user-sheet-overlay" type="button" onClick={onClose} />
      <div className="admin-user-sheet-panel" role="dialog" aria-modal="true">
        <div className="admin-user-sheet-header">
          <div className="admin-user-sheet-title">
            <span className="admin-user-sheet-kicker">Usuario</span>
            <div className="admin-user-sheet-main">
              <div className="admin-user-sheet-avatar">{initial}</div>
              <div className="admin-user-sheet-identity">
                <h3>{displayName}</h3>
                <span>{displayEmail || 'Sem email'}</span>
                <div className="admin-user-sheet-badges">
                  <span className="admin-user-sheet-pill is-role">{roleLabel(role)}</span>
                  <span className={`admin-user-sheet-pill ${isSuspended ? 'is-off' : 'is-on'}`}>
                    {statusLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="admin-user-sheet-actions">
            <Link href={`/notifications/admin?userId=${userId}`} className="button secondary sm">
              Mensagem
            </Link>
            <button
              type="button"
              className={`button ${isSuspended ? 'secondary' : 'danger'} sm`}
              onClick={handleToggleStatus}
              disabled={actionSaving}
            >
              {actionSaving ? 'Salvando...' : isSuspended ? 'Ativar' : 'Suspender'}
            </button>
            <button type="button" className="button secondary sm" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
        {error && <p className="admin-user-sheet-alert">{error}</p>}
        {actionError && <p className="admin-user-sheet-alert">{actionError}</p>}
        <div className="admin-user-sheet-body">
          {!loading && !user && !error ? (
            <p className="subtle">Usuario nao encontrado.</p>
          ) : (
            <div className="admin-user-sheet-grid">
              <div className="admin-user-sheet-card">
                <div className="admin-user-sheet-card-header">
                  <h4>Informacoes</h4>
                  <span className={`admin-user-sheet-pill ${isSuspended ? 'is-off' : 'is-on'}`}>
                    {statusLabel}
                  </span>
                </div>
                <div className="admin-user-sheet-meta">
                  {metaRows.map((item) => (
                    <div key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="admin-user-sheet-stack">
                <div className="admin-user-sheet-card">
                  <div className="admin-user-sheet-card-header">
                    <h4>Personal ativo</h4>
                    {role !== 'aluno' && <span className="admin-user-sheet-pill">Nao se aplica</span>}
                  </div>
                  {role !== 'aluno' ? (
                    <p className="subtle">Este usuario nao esta vinculado como aluno.</p>
                  ) : detailsLoading ? (
                    <p className="subtle">Carregando personal...</p>
                  ) : personal ? (
                    <button
                      type="button"
                      className="admin-user-sheet-personal"
                      onClick={() => onSelectUser?.(personal.uid)}
                    >
                      <div>
                        <strong>{personal.displayName}</strong>
                        <span>{personal.especializacao || 'Personal ativo'}</span>
                        {personal.codigoPersonal && (
                          <small>Codigo: {String(personal.codigoPersonal)}</small>
                        )}
                      </div>
                      <span className="admin-user-sheet-link">Ver personal</span>
                    </button>
                  ) : user?.nameDoSeuPersonal ? (
                    <div className="admin-user-sheet-empty">
                      <strong>{user.nameDoSeuPersonal}</strong>
                      <span>Sem dados completos do personal.</span>
                    </div>
                  ) : (
                    <p className="subtle">Sem personal vinculado.</p>
                  )}
                </div>

                <div className="admin-user-sheet-card">
                  <div className="admin-user-sheet-card-header">
                    <h4>Treinos recentes</h4>
                    <span className="admin-user-sheet-pill">{treinos.length}</span>
                  </div>
                  {detailsLoading ? (
                    <p className="subtle">Carregando treinos...</p>
                  ) : treinos.length ? (
                    <div className="admin-user-sheet-list">
                      {treinos.slice(0, 6).map((treino) => (
                        <div key={treino.id} className="admin-user-sheet-item">
                          <strong>{treino.nome}</strong>
                          <span>{treino.tipo || 'Treino'}</span>
                          <small>
                            Exercicio(s): {treino.exercicios ?? 0} · Ultimo: {formatDate(treino.lastCompletedAt)}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="subtle">Nenhum treino encontrado.</p>
                  )}
                </div>

                <div className="admin-user-sheet-card">
                  <div className="admin-user-sheet-card-header">
                    <h4>Avaliacoes recentes</h4>
                    <span className="admin-user-sheet-pill">{avaliacoes.length}</span>
                  </div>
                  {detailsLoading ? (
                    <p className="subtle">Carregando avaliacoes...</p>
                  ) : avaliacoes.length ? (
                    <div className="admin-user-sheet-list">
                      {avaliacoes.slice(0, 6).map((avaliacao) => (
                        <div key={avaliacao.id} className="admin-user-sheet-item">
                          <strong>{avaliacao.tipo || 'Avaliacao'}</strong>
                          <span>{formatDate(avaliacao.data)}</span>
                          <small>{avaliacao.observacoes || 'Sem observacoes.'}</small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="subtle">Nenhuma avaliacao encontrada.</p>
                  )}
                </div>
              </div>
            </div>
          )}
          {loading && <p className="subtle">Carregando dados do usuario...</p>}
        </div>
      </div>
    </div>
  );
}
