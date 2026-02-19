'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import PageShell from '@/components/PageShell';
import DataTable from '@/components/data/DataTable';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import { formatDate } from '@/lib/firestoreHooks';
import type { Aluno } from '@/lib/services/firestoreService';

type StatusFilter = 'todos' | 'ativo' | 'inativo' | 'pendente';
type ActivityFilter = 'todos' | 'ok' | 'atencao' | 'critico';

const normalize = (value?: string) => (value || '').toLowerCase().trim();

const daysSince = (value?: Date) => {
  if (!value) return null;
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - start.getTime()) / 86400000);
};

const statusLabel = (status: Aluno['status']) => {
  if (status === 'ativo') return 'Ativo';
  if (status === 'inativo') return 'Inativo';
  return 'Pendente';
};

const getStudentSignal = (aluno: Aluno) => {
  const inactivityDays = daysSince(aluno.ultimoTreino);
  if (aluno.status !== 'ativo') {
    return { label: 'Base inativa', tone: 'critico' as const };
  }
  if (inactivityDays === null || inactivityDays > 30) {
    return { label: 'Sem treino ha 30+ dias', tone: 'critico' as const };
  }
  if (inactivityDays > 7) {
    return { label: 'Sem treino ha 7+ dias', tone: 'atencao' as const };
  }
  return { label: 'Em dia', tone: 'ok' as const };
};

export default function PersonalSummaryPage() {
  const dashboard = useDashboardData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('todos');

  const totalAlunos = dashboard.stats.totalAlunos ?? dashboard.alunos.length;
  const alunosAtivos =
    dashboard.stats.alunosAtivos ??
    dashboard.alunos.filter((aluno) => aluno.status === 'ativo').length;
  const alunosInativos = dashboard.alunos.filter((aluno) => aluno.status === 'inativo').length;
  const alunosPendentes = dashboard.alunos.filter((aluno) => aluno.status === 'pendente').length;
  const treinosHoje = dashboard.stats.treinosHoje ?? 0;
  const semEmail = dashboard.alunos.filter((aluno) => !normalize(aluno.email).includes('@')).length;

  const startOfMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, []);

  const novosNoMes = dashboard.alunos.filter(
    (aluno) => aluno.alunoDesde && aluno.alunoDesde >= startOfMonth
  ).length;

  const alunosSemTreino7 = dashboard.alunos.filter((aluno) => {
    const inactivityDays = daysSince(aluno.ultimoTreino);
    return inactivityDays === null || inactivityDays > 7;
  }).length;

  const alunosSemTreino30 = dashboard.alunos.filter((aluno) => {
    const inactivityDays = daysSince(aluno.ultimoTreino);
    return inactivityDays === null || inactivityDays > 30;
  }).length;

  const taxaAtivos = totalAlunos > 0 ? Math.round((alunosAtivos / totalAlunos) * 100) : 0;
  const taxaAtividadeRecente =
    totalAlunos > 0 ? Math.max(0, Math.round(((totalAlunos - alunosSemTreino7) / totalAlunos) * 100)) : 0;

  const priorityStudents = useMemo(() => {
    const score = (aluno: Aluno) => {
      const inactivityDays = daysSince(aluno.ultimoTreino);
      let points = 0;
      if (aluno.status !== 'ativo') points += 100;
      if (inactivityDays === null) points += 80;
      else if (inactivityDays > 30) points += 70;
      else if (inactivityDays > 14) points += 45;
      else if (inactivityDays > 7) points += 20;
      if (!normalize(aluno.email).includes('@')) points += 8;
      return points;
    };

    return [...dashboard.alunos]
      .sort((a, b) => score(b) - score(a))
      .slice(0, 6);
  }, [dashboard.alunos]);

  const filteredStudents = useMemo(() => {
    const query = normalize(search);
    return dashboard.alunos.filter((aluno) => {
      const bySearch =
        !query ||
        normalize(aluno.nome).includes(query) ||
        normalize(aluno.email).includes(query);
      const byStatus = statusFilter === 'todos' || aluno.status === statusFilter;
      const signal = getStudentSignal(aluno);
      const byActivity = activityFilter === 'todos' || signal.tone === activityFilter;
      return bySearch && byStatus && byActivity;
    });
  }, [dashboard.alunos, search, statusFilter, activityFilter]);

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      }).format(new Date()),
    []
  );

  return (
    <PageShell
      title="Resumo do personal"
      description="Visao de operacao, riscos e prioridades dos seus alunos."
      breadcrumbs={[{ label: 'Painel', href: '/app' }]}
    >
      <section className="personal-summary-page">
        {dashboard.error ? <p className="personal-summary-alert">{dashboard.error}</p> : null}

        <div className="personal-summary-hero card">
          <div>
            <p className="personal-summary-eyebrow">Visao diaria</p>
            <h2>O que precisa da sua atencao hoje?</h2>
            <p className="subtle">
              {todayLabel}. Priorize alunos sem treino recente, base inativa e entradas novas para manter retencao.
            </p>
          </div>
          <div className="personal-summary-hero-actions">
            <Link href="/students" className="button secondary sm">
              Gerir alunos
            </Link>
            <Link href="/schedule" className="button secondary sm">
              Abrir agenda
            </Link>
            <Link href="/workout/create" className="button sm">
              Criar treino
            </Link>
          </div>
        </div>

        <div className="personal-summary-kpis">
          <article className="personal-summary-kpi card">
            <span>Total de alunos</span>
            <strong>{totalAlunos}</strong>
            <small>{alunosAtivos} ativos na base</small>
          </article>
          <article className="personal-summary-kpi card">
            <span>Treinos hoje</span>
            <strong>{treinosHoje}</strong>
            <small>{alunosSemTreino7} sem atividade ha 7+ dias</small>
          </article>
          <article className="personal-summary-kpi card">
            <span>Base ativa</span>
            <strong>{taxaAtivos}%</strong>
            <small>{alunosInativos} inativos e {alunosPendentes} pendentes</small>
          </article>
          <article className="personal-summary-kpi card">
            <span>Entrada no mes</span>
            <strong>{novosNoMes}</strong>
            <small>{semEmail} alunos sem email valido</small>
          </article>
        </div>

        <div className="personal-summary-questions">
          <article className="personal-summary-question card">
            <p className="personal-summary-question-title">Quem precisa de contato hoje?</p>
            <strong>{alunosSemTreino7} alunos</strong>
            <span>Sem treino recente (7+ dias).</span>
          </article>
          <article className="personal-summary-question card">
            <p className="personal-summary-question-title">Onde esta o risco de evasao?</p>
            <strong>{alunosSemTreino30 + alunosInativos} alunos</strong>
            <span>Sem treino 30+ dias ou com status inativo.</span>
          </article>
          <article className="personal-summary-question card">
            <p className="personal-summary-question-title">Como esta o ritmo da base?</p>
            <strong>{taxaAtividadeRecente}% em ritmo</strong>
            <span>Alunos com atividade recente (ultimos 7 dias).</span>
          </article>
        </div>

        <div className="personal-summary-panels">
          <article className="personal-summary-priority card">
            <div className="personal-summary-panel-head">
              <div>
                <h3>Prioridades de acompanhamento</h3>
                <p className="subtle">Alunos ordenados por risco de inatividade.</p>
              </div>
            </div>
            <ul className="personal-summary-priority-list">
              {priorityStudents.length ? (
                priorityStudents.map((aluno) => {
                  const inactivityDays = daysSince(aluno.ultimoTreino);
                  const signal = getStudentSignal(aluno);
                  return (
                    <li key={aluno.id} className="personal-summary-priority-item">
                      <div>
                        <strong>{aluno.nome}</strong>
                        <span>{inactivityDays === null ? 'Sem historico de treino' : `${inactivityDays} dias sem treino`}</span>
                      </div>
                      <div className="personal-summary-priority-badges">
                        <span className={`personal-summary-badge is-${aluno.status}`}>{statusLabel(aluno.status)}</span>
                        <span className={`personal-summary-signal is-${signal.tone}`}>{signal.label}</span>
                      </div>
                    </li>
                  );
                })
              ) : (
                <li className="personal-summary-priority-item is-empty">
                  <span className="subtle">Nenhum aluno para priorizar no momento.</span>
                </li>
              )}
            </ul>
          </article>

          <article className="personal-summary-distribution card">
            <div className="personal-summary-panel-head">
              <div>
                <h3>Composicao da base</h3>
                <p className="subtle">Distribuicao por status e atividade.</p>
              </div>
            </div>
            <div className="personal-summary-bars">
              <div>
                <span>Ativos</span>
                <div><i style={{ width: `${totalAlunos ? (alunosAtivos / totalAlunos) * 100 : 0}%` }} /></div>
                <strong>{alunosAtivos}</strong>
              </div>
              <div>
                <span>Inativos</span>
                <div><i style={{ width: `${totalAlunos ? (alunosInativos / totalAlunos) * 100 : 0}%` }} /></div>
                <strong>{alunosInativos}</strong>
              </div>
              <div>
                <span>Pendentes</span>
                <div><i style={{ width: `${totalAlunos ? (alunosPendentes / totalAlunos) * 100 : 0}%` }} /></div>
                <strong>{alunosPendentes}</strong>
              </div>
              <div>
                <span>Sem treino 30+ dias</span>
                <div><i style={{ width: `${totalAlunos ? (alunosSemTreino30 / totalAlunos) * 100 : 0}%` }} /></div>
                <strong>{alunosSemTreino30}</strong>
              </div>
            </div>
          </article>
        </div>

        <article className="personal-summary-table card">
          <div className="personal-summary-panel-head">
            <div>
              <h3>Base completa de alunos</h3>
              <p className="subtle">Filtre por status, atividade e localize rapidamente quem atender primeiro.</p>
            </div>
            <span className="personal-summary-total">{filteredStudents.length} de {dashboard.alunos.length}</span>
          </div>

          <div className="personal-summary-filters">
            <label>
              Buscar aluno
              <input
                type="text"
                placeholder="Nome ou email"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              >
                <option value="todos">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="pendente">Pendente</option>
              </select>
            </label>
            <label>
              Sinal de atividade
              <select
                value={activityFilter}
                onChange={(event) => setActivityFilter(event.target.value as ActivityFilter)}
              >
                <option value="todos">Todos</option>
                <option value="ok">Em dia</option>
                <option value="atencao">Atencao</option>
                <option value="critico">Critico</option>
              </select>
            </label>
          </div>

          <DataTable
            rows={filteredStudents}
            columns={[
              { key: 'nome', label: 'Aluno', render: (row) => <strong>{row.nome}</strong> },
              {
                key: 'email',
                label: 'Email',
                render: (row) => (
                  <span className={normalize(row.email).includes('@') ? '' : 'personal-summary-muted'}>
                    {normalize(row.email).includes('@') ? row.email : 'Nao informado'}
                  </span>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                render: (row) => (
                  <span className={`personal-summary-badge is-${row.status}`}>{statusLabel(row.status)}</span>
                ),
              },
              {
                key: 'ultimoTreino',
                label: 'Ultimo treino',
                render: (row) => {
                  const inactivityDays = daysSince(row.ultimoTreino);
                  if (inactivityDays === null) return 'Sem registro';
                  return `${formatDate(row.ultimoTreino)} (${inactivityDays}d)`;
                },
              },
              {
                key: 'alunoDesde',
                label: 'Aluno desde',
                render: (row) => formatDate(row.alunoDesde),
              },
              {
                key: 'sinal',
                label: 'Sinal',
                render: (row) => {
                  const signal = getStudentSignal(row);
                  return (
                    <span className={`personal-summary-signal is-${signal.tone}`}>{signal.label}</span>
                  );
                },
              },
            ]}
            rowClassName={(row) => {
              const signal = getStudentSignal(row);
              return `personal-summary-row is-${signal.tone}`;
            }}
            emptyMessage="Nenhum aluno encontrado com esses filtros."
          />
        </article>
      </section>
    </PageShell>
  );
}
