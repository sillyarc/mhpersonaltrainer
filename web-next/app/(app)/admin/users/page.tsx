'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import AdminGate from '@/components/AdminGate';
import DataTable from '@/components/data/DataTable';
import AdminUserSheet, { type AdminUserSheetSeed } from '@/components/admin/AdminUserSheet';
import { formatDate, useCollectionData } from '@/lib/firestoreHooks';
import { useAdminDashboardData } from '@/lib/hooks/useAdminDashboardData';
import { firestoreService } from '@/lib/services/firestoreService';

interface RawUserRow {
  id: string;
  display_name?: string;
  displayName?: string;
  email?: string;
  admin?: boolean | string | number;
  professorAccount?: boolean | string | number;
  created_time?: any;
  createdTime?: any;
  last_active_time?: any;
  lastActiveTime?: any;
  acessoSuspenso?: boolean | string | number;
}

interface UserRow {
  id: string;
  displayName: string;
  email: string;
  role: 'admin' | 'personal' | 'aluno';
  status: 'ativo' | 'suspenso';
  createdTime?: any;
  lastActiveTime?: any;
}

const toBool = (value: any) => value === true || value === 'true' || value === 1;

export default function AdminUsersPage() {
  const { data } = useCollectionData<RawUserRow>(['users']);
  const { overview } = useAdminDashboardData(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRow['role']>('all');
  const [savingId, setSavingId] = useState('');
  const [actionError, setActionError] = useState('');
  const [sheetUser, setSheetUser] = useState<AdminUserSheetSeed | null>(null);

  const rows = useMemo<UserRow[]>(() => {
    return data.map((item) => {
      const email = item.email || '';
      const displayName =
        item.displayName || item.display_name || (email ? email.split('@')[0] : 'Usuario');
      const role = toBool(item.admin) ? 'admin' : toBool(item.professorAccount) ? 'personal' : 'aluno';
      const status = toBool(item.acessoSuspenso) ? 'suspenso' : 'ativo';
      return {
        id: item.id,
        displayName,
        email,
        role,
        status,
        createdTime: item.created_time || item.createdTime,
        lastActiveTime: item.last_active_time || item.lastActiveTime,
      };
    });
  }, [data]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (roleFilter !== 'all' && row.role !== roleFilter) return false;
      if (!term) return true;
      return (
        row.displayName.toLowerCase().includes(term) ||
        row.email.toLowerCase().includes(term) ||
        row.id.toLowerCase().includes(term)
      );
    });
  }, [rows, search, roleFilter]);

  const counts = useMemo(() => {
    const base = { total: rows.length, admins: 0, personals: 0, alunos: 0, suspensos: 0 };
    rows.forEach((row) => {
      if (row.role === 'admin') base.admins += 1;
      if (row.role === 'personal') base.personals += 1;
      if (row.role === 'aluno') base.alunos += 1;
      if (row.status === 'suspenso') base.suspensos += 1;
    });
    return base;
  }, [rows]);

  const totalUsers = overview?.totalUsers ?? counts.total;
  const totalAdmins = overview?.totalAdmins ?? counts.admins;
  const totalPersonals = overview?.totalPersonals ?? counts.personals;
  const totalAlunos = overview?.totalAlunos ?? counts.alunos;

  const handleToggleStatus = async (row: UserRow) => {
    const willActivate = row.status === 'suspenso';
    if (!willActivate) {
      const confirmed = window.confirm('Deseja bloquear este usuario?');
      if (!confirmed) return;
    }
    setSavingId(row.id);
    setActionError('');
    try {
      await firestoreService.updateStudentStatus(row.id, willActivate);
    } catch (error: any) {
      setActionError(error?.message || 'Erro ao atualizar status do usuario.');
    } finally {
      setSavingId('');
    }
  };

  return (
    <PageShell
      title="Usuarios"
      description="Visao completa de cadastros, perfil e status."
      breadcrumbs={[{ label: 'Admin', href: '/admin' }]}
    >
      <AdminGate>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="card">
            <h3>Total</h3>
            <p className="subtle" style={{ marginTop: 8 }}>{totalUsers}</p>
          </div>
          <div className="card">
            <h3>Admins</h3>
            <p className="subtle" style={{ marginTop: 8 }}>{totalAdmins}</p>
          </div>
          <div className="card">
            <h3>Personals</h3>
            <p className="subtle" style={{ marginTop: 8 }}>{totalPersonals}</p>
          </div>
          <div className="card">
            <h3>Alunos</h3>
            <p className="subtle" style={{ marginTop: 8 }}>{totalAlunos}</p>
          </div>
          <div className="card">
            <h3>Suspensos</h3>
            <p className="subtle" style={{ marginTop: 8 }}>{counts.suspensos}</p>
          </div>
        </div>

        <div className="card" style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h3>Usuarios cadastrados</h3>
              <p className="subtle" style={{ marginTop: 6 }}>
                Pesquise por nome, email ou UID.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar usuario"
                style={{ minWidth: 220, padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
              />
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}
                style={{ minWidth: 160, padding: 10, borderRadius: 10, border: '1px solid var(--border)' }}
              >
                <option value="all">Todos os perfis</option>
                <option value="admin">Admin</option>
                <option value="personal">Personal</option>
                <option value="aluno">Aluno</option>
              </select>
            </div>
          </div>
          <p className="subtle" style={{ marginTop: 12 }}>
            Mostrando {filteredRows.length} de {rows.length} usuarios.
          </p>
          {actionError && (
            <p style={{ marginTop: 12, color: '#c0392b' }}>{actionError}</p>
          )}
          <DataTable
            rows={filteredRows}
            columns={[
              {
                key: 'displayName',
                label: 'Usuario',
                render: (row) => (
                  <div>
                    <strong>{row.displayName}</strong>
                    <p className="subtle" style={{ marginTop: 4 }}>{row.email || row.id}</p>
                  </div>
                ),
              },
              { key: 'role', label: 'Perfil' },
              { key: 'status', label: 'Status' },
              { key: 'createdTime', label: 'Criado em', render: (row) => formatDate(row.createdTime) },
              { key: 'lastActiveTime', label: 'Ultimo acesso', render: (row) => formatDate(row.lastActiveTime) },
              {
                key: 'actions',
                label: 'Acoes',
                render: (row) => (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link
                      href={`/notifications/admin?userId=${row.id}`}
                      className="button secondary sm"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Mensagem
                    </Link>
                    <button
                      type="button"
                      className={`button ${row.status === 'suspenso' ? 'secondary' : 'danger'} sm`}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleToggleStatus(row);
                      }}
                      disabled={savingId === row.id}
                    >
                      {savingId === row.id ? 'Salvando...' : row.status === 'suspenso' ? 'Ativar' : 'Bloquear'}
                    </button>
                  </div>
                ),
              },
            ]}
            emptyMessage="Nenhum usuario encontrado."
            onRowClick={(row) =>
              setSheetUser({
                id: row.id,
                name: row.displayName,
                email: row.email,
                role: row.role,
                status: row.status,
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
      </AdminGate>
    </PageShell>
  );
}
