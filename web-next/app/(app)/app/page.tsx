'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import DataTable from '@/components/data/DataTable';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/firestoreHooks';
import { useAdminDashboardData } from '@/lib/hooks/useAdminDashboardData';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import { generateStudentEvolutionInsights, type StudentEvolutionInsights } from '@/lib/services/ai';
import { fetchEvaluationsForStudents, getEvaluationTypeLabel } from '@/lib/services/evaluations';
import { firestoreService, type PersonalAccount, type Treino } from '@/lib/services/firestoreService';
import { fetchUserWorkouts } from '@/lib/services/workouts';
import type { PhysicalEvaluation, PersonalizedEvaluation } from '@/lib/types/evaluation';

const normalizeWeekday = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const getWeekdayKey = (date: Date) => {
  const day = date.getDay();
  const map = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  return map[day] || '';
};

const toDate = (value?: any) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isTreinoDoDia = (treino: Treino, todayKey: string) => {
  if (!treino?.diasDaSemana?.length) return false;
  return treino.diasDaSemana.some((value) => {
    const normalized = normalizeWeekday(value || '');
    if (!normalized) return false;
    if (normalized.includes(todayKey)) return true;
    if (todayKey === 'terca' && normalized.includes('ter')) return true;
    if (todayKey === 'quinta' && normalized.includes('qui')) return true;
    if (todayKey === 'sabado' && normalized.includes('sab')) return true;
    if (todayKey === 'domingo' && normalized.includes('dom')) return true;
    if (todayKey === 'segunda' && normalized.includes('seg')) return true;
    if (todayKey === 'quarta' && normalized.includes('qua')) return true;
    if (todayKey === 'sexta' && normalized.includes('sex')) return true;
    return false;
  });
};

const isTreinoConcluidoHoje = (treino: Treino) => {
  const completed = toDate(treino?.lastCompletedAt);
  if (!completed) return false;
  const today = new Date();
  return (
    completed.getFullYear() === today.getFullYear() &&
    completed.getMonth() === today.getMonth() &&
    completed.getDate() === today.getDate()
  );
};

const formatUpcomingDate = (date: Date) => {
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startTomorrow = new Date(startToday);
  startTomorrow.setDate(startTomorrow.getDate() + 1);
  const startAfterTomorrow = new Date(startTomorrow);
  startAfterTomorrow.setDate(startAfterTomorrow.getDate() + 1);

  if (date >= startToday && date < startTomorrow) {
    return `Hoje ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (date >= startTomorrow && date < startAfterTomorrow) {
    return `Amanha ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('pt-BR');
};

const getUltimoTreinoText = (ultimoTreino?: Date) => {
  if (!ultimoTreino) return 'Nunca';
  const now = new Date();
  const diff = Math.floor((now.getTime() - ultimoTreino.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return `${diff} dias`;
};

const IconBell = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
    <path d="M13.7 21a2 2 0 01-3.4 0" />
  </svg>
);

const IconClock = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M5 12l4 4 10-10" />
  </svg>
);

const IconChat = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z" />
  </svg>
);

const IconBarbell = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M3 10v4" />
    <path d="M7 6v12" />
    <path d="M17 6v12" />
    <path d="M21 10v4" />
    <path d="M7 12h10" />
  </svg>
);

const IconSpark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M12 3l1.8 4.6L18 9.3l-4.2 1.7L12 16l-1.8-5-4.2-1.7 4.2-1.7L12 3z" />
    <path d="M5 17l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
  </svg>
);

const IconChart = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M3 3v18h18" />
    <path d="M7 14l4-4 4 3 4-6" />
  </svg>
);

export default function DashboardPage() {
  const { user, role } = useAuth();
  const dashboard = useDashboardData();
  const adminDashboard = useAdminDashboardData(role === 'admin');
  const [personalAccount, setPersonalAccount] = useState<PersonalAccount | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [upcomingEvaluations, setUpcomingEvaluations] = useState<
    Array<{ id: string; nome: string; tipo: string; horario: string; photoUrl?: string }>
  >([]);
  const [recentWorkouts, setRecentWorkouts] = useState<
    Array<{
      id: string;
      workoutId: string;
      alunoId: string;
      alunoNome: string;
      treino: string;
      updatedAt?: Date;
    }>
  >([]);
  const [evolutionInsights, setEvolutionInsights] = useState<StudentEvolutionInsights | null>(null);
  const [evolutionLoading, setEvolutionLoading] = useState(false);
  const [evolutionError, setEvolutionError] = useState('');
  const [evolutionUpdatedAt, setEvolutionUpdatedAt] = useState<Date | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const hasOpenRouter = Boolean(
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY
  );

  useEffect(() => {
    if (role !== 'personal' && role !== 'professor') {
      setPersonalAccount(null);
      return;
    }
    if (!user?.uid) return;

    let active = true;
    firestoreService.getPersonalAccount(user.uid).then((account) => {
      if (active) {
        setPersonalAccount(account);
      }
    });

    return () => {
      active = false;
    };
  }, [role, user?.uid]);

  useEffect(() => {
    if (role !== 'personal' && role !== 'professor') {
      setUpcomingEvaluations([]);
      return;
    }
    let active = true;
    const loadUpcoming = async () => {
      if (!dashboard.alunos.length) {
        if (active) setUpcomingEvaluations([]);
        return;
      }
      const result = await fetchEvaluationsForStudents(dashboard.alunos.map((aluno) => aluno.id));
      if (!active) return;
      if (result.error || !result.data) {
        setUpcomingEvaluations([]);
        return;
      }

      const startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      const studentMap = new Map(dashboard.alunos.map((aluno) => [aluno.id, aluno]));

      const items = (result.data as PhysicalEvaluation[])
        .filter((evaluation) => evaluation.status !== 'cancelada')
        .map((evaluation) => {
          const student = studentMap.get(evaluation.userId);
          const date =
            evaluation.type === 'personalizada'
              ? (evaluation as PersonalizedEvaluation).prazoResposta || evaluation.date
              : evaluation.date;
          if (!date) return null;
          return {
            id: `${evaluation.type}-${evaluation.id}`,
            nome: student?.nome || 'Aluno',
            tipo: getEvaluationTypeLabel(evaluation.type),
            horario: formatUpcomingDate(date),
            photoUrl: student?.photoUrl,
            date,
          };
        })
        .filter(
          (item): item is {
            id: string;
            nome: string;
            tipo: string;
            horario: string;
            photoUrl: string | undefined;
            date: Date;
          } => !!item
        )
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      const upcoming = items.filter((item) => item.date >= startToday).slice(0, 4);
      const fallback = items.slice(-4).reverse();
      const finalItems = (upcoming.length ? upcoming : fallback).map(({ date, ...rest }) => rest);
      setUpcomingEvaluations(finalItems);
    };

    loadUpcoming();

    return () => {
      active = false;
    };
  }, [role, dashboard.alunos]);

  useEffect(() => {
    if (role !== 'personal' && role !== 'professor') {
      setRecentWorkouts([]);
      return;
    }

    let active = true;
    const loadWorkouts = async () => {
      if (!dashboard.alunos.length) {
        if (active) setRecentWorkouts([]);
        return;
      }
      const candidates = dashboard.alunos.slice(0, 4);
      const results = await Promise.all(
        candidates.map((aluno) => fetchUserWorkouts(aluno.id, false))
      );
      if (!active) return;

      const items: Array<{
        id: string;
        workoutId: string;
        alunoId: string;
        alunoNome: string;
        treino: string;
        updatedAt?: Date;
      }> = [];

      results.forEach((result, index) => {
        const aluno = candidates[index];
        const workouts = result.data || [];
        workouts.slice(0, 2).forEach((workout) => {
          items.push({
            id: `${aluno.id}-${workout.id}`,
            workoutId: workout.id,
            alunoId: aluno.id,
            alunoNome: aluno.nome,
            treino: workout.nomeDoTreino || 'Treino',
            updatedAt: workout.updatedAt || workout.createdAt,
          });
        });
      });

      items.sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0));
      setRecentWorkouts(items.slice(0, 6));
    };

    loadWorkouts();

    return () => {
      active = false;
    };
  }, [role, dashboard.alunos]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const showCopyMessage = (message: string) => {
    setCopyMessage(message);
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopyMessage('');
    }, 2000);
  };

  const handleCopy = async (text: string) => {
    if (!text) return;
    if (!navigator?.clipboard?.writeText) {
      showCopyMessage('Nao foi possivel copiar');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showCopyMessage('Copiado');
    } catch (error) {
      showCopyMessage('Nao foi possivel copiar');
    }
  };

  const recentCompletions = useMemo(() => {
    return [...dashboard.alunos]
      .filter((aluno) => aluno.ultimoTreino)
      .sort((a, b) => {
        const timeA = a.ultimoTreino?.getTime?.() || 0;
        const timeB = b.ultimoTreino?.getTime?.() || 0;
        return timeB - timeA;
      })
      .slice(0, 4);
  }, [dashboard.alunos]);

  const handleGenerateEvolution = async () => {
    if (evolutionLoading) return;
    if (!hasOpenRouter) {
      setEvolutionError('OpenRouter nao configurado.');
      return;
    }
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const totalAlunos = dashboard.stats.totalAlunos ?? dashboard.alunos.length;
    const alunosAtivos =
      dashboard.stats.alunosAtivos ??
      dashboard.alunos.filter((aluno) => aluno.status === 'ativo').length;
    const novosEsteMes = dashboard.alunos.filter(
      (aluno) => aluno.alunoDesde && aluno.alunoDesde >= startOfMonth
    ).length;

    const workoutLines = recentWorkouts.map(
      (item) => `${item.alunoNome}: ${item.treino}`
    );
    const completionLines = recentCompletions.map(
      (item) =>
        `${item.nome} (ultimo treino: ${getUltimoTreinoText(item.ultimoTreino)})`
    );
    const evaluationLines = upcomingEvaluations.map(
      (item) => `${item.nome} - ${item.tipo} - ${item.horario}`
    );

    const context = [
      `Total de alunos: ${totalAlunos}.`,
      `Alunos ativos: ${alunosAtivos}.`,
      `Novos no mes: ${novosEsteMes}.`,
      workoutLines.length ? `Treinos atualizados: ${workoutLines.join(' | ')}.` : '',
      completionLines.length
        ? `Ultimos treinos concluidos: ${completionLines.join(' | ')}.`
        : '',
      evaluationLines.length
        ? `Avaliacoes proximas: ${evaluationLines.join(' | ')}.`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    setEvolutionLoading(true);
    setEvolutionError('');
    try {
      const result = await generateStudentEvolutionInsights({ context });
      setEvolutionInsights(result);
      setEvolutionUpdatedAt(new Date());
    } catch (err: any) {
      setEvolutionError(err.message || 'Erro ao gerar resumo.');
    } finally {
      setEvolutionLoading(false);
    }
  };

  if (role === 'admin') {
    const overview = adminDashboard.overview;
    return (
      <section className="portal">
        <header className="portal-hero portal-hero--admin fade-in">
          <div>
            <p className="portal-eyebrow">Painel admin</p>
            <h1>Visao geral do sistema</h1>
            <p className="portal-lead">Indicadores de usuarios, perfis e cadastros recentes.</p>
          </div>
          <div className="portal-hero-card">
            <div className="portal-hero-stat">
              <span>Total de usuarios</span>
              <strong>{overview?.totalUsers ?? 0}</strong>
            </div>
            <div className="portal-hero-stat">
              <span>Personals ativos</span>
              <strong>{overview?.totalPersonals ?? 0}</strong>
            </div>
            <div className="portal-hero-stat">
              <span>Admins</span>
              <strong>{overview?.totalAdmins ?? 0}</strong>
            </div>
            <div className="portal-hero-stat">
              <span>Alunos</span>
              <strong>{overview?.totalAlunos ?? 0}</strong>
            </div>
          </div>
        </header>

        {adminDashboard.error && (
          <div className="portal-banner">
            <p>{adminDashboard.error}</p>
          </div>
        )}

        <div className="portal-section fade-in" style={{ animationDelay: '0.08s' }}>
          <div className="portal-card portal-card--table">
            <div className="portal-section-header">
              <h2>Usuarios recentes</h2>
              <p className="subtle">Ultimos cadastros no painel.</p>
            </div>
            <DataTable
              rows={overview?.recentUsers || []}
              columns={[
                { key: 'name', label: 'Nome' },
                { key: 'email', label: 'Email' },
                { key: 'role', label: 'Perfil' },
                { key: 'createdAt', label: 'Criado em', render: (row) => formatDate(row.createdAt) },
              ]}
              emptyMessage="Nenhum usuario recente."
            />
          </div>
        </div>
      </section>
    );
  }

  if (role === 'academy') {
    return (
      <section className="portal">
        <div className="portal-banner">
          <p>Este painel e exclusivo da academia.</p>
          <Link href="/academy" className="portal-link" style={{ marginTop: 8, display: 'inline-block' }}>
            Ir para o painel da academia
          </Link>
        </div>
      </section>
    );
  }

  if (dashboard.loading && !dashboard.hasLoadedOnce) {
    if (role === 'aluno') {
      return (
        <section className="student-home">
          <div className="student-loading">
            <p className="student-home-kicker">Carregando painel</p>
            <h2>Buscando seus dados...</h2>
          </div>
        </section>
      );
    }
    return (
      <div className="portal-loading">
        <div>
          <p className="portal-eyebrow">Carregando painel</p>
          <h2>Buscando seus dados...</h2>
        </div>
      </div>
    );
  }

  if (role === 'professor' || role === 'personal') {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const totalAlunos = dashboard.stats.totalAlunos ?? dashboard.alunos.length;
    const alunosAtivos =
      dashboard.stats.alunosAtivos ??
      dashboard.alunos.filter((aluno) => aluno.status === 'ativo').length;
    const novosEsteMes = dashboard.alunos.filter(
      (aluno) => aluno.alunoDesde && aluno.alunoDesde >= startOfMonth
    ).length;
    const personalCode = String(personalAccount?.codigoPersonal || user?.codigoPersonal || '--');
    const planName = user?.tipoDeAssinatura || 'Plano basico';
    const stripeActive = !!user?.stripeAtivo;
    const hasSubscription = !!user?.assinatura;
    const firstName = user?.displayName?.split(' ')[0] || 'Personal';
    const avatarLabel = (user?.displayName || user?.email || 'P').trim().charAt(0).toUpperCase();
    const inviteMessage = `E ai, tudo certo? Quero te convidar a usar o MH Personal Trainer para treinar comigo. Use meu codigo ${personalCode} ao criar sua conta.`;

    return (
      <section className="personal-panel">
        <div className="personal-hero-card fade-in">
          <div className="personal-hero-left">
            <p className="personal-eyebrow">Painel do personal</p>
            <h1>Ola, {firstName}!</h1>
            <p className="personal-code">
              Seu codigo de personal: <strong>{personalCode}</strong>
            </p>
            <span className="personal-plan">{planName}</span>
          </div>
          <div className="personal-hero-right">
            <div className="personal-avatar">
              {user?.photoUrl ? <img src={user.photoUrl} alt={firstName} /> : <span>{avatarLabel}</span>}
            </div>
            <div className="personal-hero-actions">
              <Link className="button secondary" href="/notifications">
                Notificacoes
              </Link>
              <Link className="button" href="/profile/personal-edit">
                Editar perfil
              </Link>
            </div>
          </div>
        </div>

        {dashboard.error && (
          <div className="personal-banner">
            <p>{dashboard.error}</p>
          </div>
        )}

        <Link href="/personal/summary" className="personal-summary-card fade-in">
          <div className="personal-summary-header">
            <div>
              <h2>Resumo</h2>
              <p className="subtle">Visao geral dos seus alunos.</p>
            </div>
            <div className="personal-summary-icon">RS</div>
          </div>
          <div className="personal-summary-stats">
            <div>
              <strong>{totalAlunos}</strong>
              <span>Total de alunos</span>
            </div>
            <div>
              <strong>{alunosAtivos}</strong>
              <span>Ativos</span>
            </div>
            <div>
              <strong>{novosEsteMes}</strong>
              <span>Novos no mes</span>
            </div>
          </div>
        </Link>

        <div className="personal-quick-card fade-in">
          <div className="personal-section-header">
            <div>
              <h2>Acoes rapidas</h2>
              <p className="subtle">Atalhos para o seu dia a dia.</p>
            </div>
          </div>
          <div className="personal-quick-grid">
            <Link href="/workout/create" className="personal-quick-item">
              <strong>Criar treino</strong>
              <span>Planos personalizados</span>
            </Link>
            <Link href="/evaluations/create" className="personal-quick-item">
              <strong>Nova avaliacao</strong>
              <span>Postural, fisica, personalizada</span>
            </Link>
            <Link href="/schedule" className="personal-quick-item">
              <strong>Agenda</strong>
              <span>Horarios e sessoes</span>
            </Link>
            <Link href="/financeiro" className="personal-quick-item">
              <strong>Financeiro</strong>
              <span>Repasses e cobrancas</span>
            </Link>
            <Link href="/students" className="personal-quick-item">
              <strong>Alunos</strong>
              <span>Gestao e status</span>
            </Link>
            <Link href="/documents" className="personal-quick-item">
              <strong>Documentos</strong>
              <span>Arquivos dos alunos</span>
            </Link>
          </div>
        </div>

        {stripeActive && (
          <Link href="/mh-agenda-fit" className="personal-stripe-card fade-in">
            <div>
              <h3>Saldo no MH Agenda Fit</h3>
              <p className="subtle">Conectado ao Stripe</p>
            </div>
            <strong>R$ --</strong>
          </Link>
        )}

        <div className="personal-code-card fade-in">
          <div>
            <h3>Codigo de afiliacao</h3>
            <p className="subtle">Compartilhe com seus alunos.</p>
          </div>
          <div className="personal-code-value">{personalCode}</div>
          <div className="personal-code-actions">
            <button className="button" type="button" onClick={() => handleCopy(personalCode)}>
              Copiar codigo
            </button>
            <button className="button secondary" type="button" onClick={() => handleCopy(inviteMessage)}>
              Copiar convite
            </button>
            {copyMessage && <span className="personal-code-feedback">{copyMessage}</span>}
          </div>
          <div className="personal-code-promo">
            <span className="personal-code-promo-title">Criar card/post com seu codigo</span>
            <div className="personal-code-promo-actions">
              <Link href="/students?promoEditor=1&promoFormat=feed" className="button secondary sm">
                Post feed
              </Link>
              <Link href="/students?promoEditor=1&promoFormat=story" className="button secondary sm">
                Post story
              </Link>
              <Link href="/students?promoEditor=1&promoFormat=square" className="button secondary sm">
                Post quadrado
              </Link>
            </div>
          </div>
        </div>

        {!hasSubscription && (
          <Link href="/profile/subscription" className="personal-premium-card fade-in">
            <div>
              <p className="personal-premium-tag">Premium</p>
              <h2>Faca upgrade e entregue mais resultados</h2>
              <p>Ferramentas completas para personal: mais alunos, mais engajamento.</p>
              <span className="personal-premium-cta">Ver planos</span>
            </div>
            <div className="personal-premium-icon">*</div>
          </Link>
        )}

        <div className="personal-section fade-in">
          <div className="personal-section-header">
            <div>
              <h2>Treinos dos alunos</h2>
              <p className="subtle">Ultimos treinos criados ou atualizados.</p>
            </div>
            <div className="personal-section-actions">
              <Link href="/workouts" className="personal-link">
                Ver treinos
              </Link>
              <Link href="/students" className="button secondary sm">
                Ver alunos
              </Link>
            </div>
          </div>
          {recentWorkouts.length ? (
            <div className="personal-workout-grid">
              {recentWorkouts.map((workout) => (
                <Link
                  key={workout.id}
                  href={`/workout/${workout.workoutId}?studentId=${workout.alunoId}`}
                  className="personal-workout-card"
                >
                  <span className="personal-workout-tag">Atualizado</span>
                  <strong>{workout.treino}</strong>
                  <div className="personal-workout-meta">
                    <span>{workout.alunoNome}</span>
                    <span>{workout.updatedAt ? formatDate(workout.updatedAt) : '-'}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="personal-empty">
              <p>Nenhum treino recente encontrado.</p>
              <Link href="/workout/create" className="personal-link">
                Criar treino
              </Link>
            </div>
          )}
        </div>

        <div className="personal-section fade-in">
          <div className="personal-section-header">
            <div>
              <h2>Atividade dos alunos</h2>
              <p className="subtle">Evolucao, treinos concluidos e agenda.</p>
            </div>
            <Link href="/evaluations" className="personal-link">
              Ver avaliacoes
            </Link>
          </div>
          <div className="personal-activity-grid">
            <div className="card personal-activity-card">
              <div className="personal-card-header">
                <div>
                  <h3>Ultimos treinos feitos</h3>
                  <p className="subtle">Concluidos recentemente.</p>
                </div>
                <Link href="/workouts" className="personal-link">
                  Ver todos
                </Link>
              </div>
              {recentCompletions.length ? (
                <ul className="personal-activity-list">
                  {recentCompletions.map((aluno) => (
                    <li key={aluno.id} className="personal-activity-item">
                      <div className="personal-activity-avatar-stack">
                        <div className="personal-activity-avatar is-personal">
                          {aluno.personalPhotoUrl ? (
                            <img src={aluno.personalPhotoUrl} alt={`${aluno.nome} personalizado`} />
                          ) : (
                            <span>{aluno.nome.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="personal-activity-avatar is-student">
                          {aluno.photoUrl ? (
                            <img src={aluno.photoUrl} alt={aluno.nome} />
                          ) : (
                            <span>{aluno.nome.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                      </div>
                      <div className="personal-activity-info">
                        <strong>{aluno.nome}</strong>
                        <span>Ultimo treino concluido</span>
                      </div>
                      <span className="personal-activity-pill">
                        {getUltimoTreinoText(aluno.ultimoTreino)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="subtle">Nenhum treino concluido recentemente.</p>
              )}
            </div>

            <div className="card personal-activity-card personal-ai-card">
              <div className="personal-card-header">
                <div>
                  <h3>Evolucao dos alunos (IA)</h3>
                  <p className="subtle">Resumo inteligente com base nos dados.</p>
                </div>
                <button
                  type="button"
                  className="button secondary sm"
                  onClick={handleGenerateEvolution}
                  disabled={evolutionLoading || !hasOpenRouter}
                >
                  {evolutionLoading ? 'Gerando...' : 'Gerar resumo'}
                </button>
              </div>
              {!hasOpenRouter && (
                <p className="personal-ai-error">OpenRouter nao configurado.</p>
              )}
              {evolutionError && <p className="personal-ai-error">{evolutionError}</p>}
              {evolutionInsights ? (
                <div className="personal-ai-content">
                  <p className="personal-ai-summary">{evolutionInsights.resumo}</p>
                  {evolutionInsights.destaques?.length ? (
                    <div className="personal-ai-tags">
                      {evolutionInsights.destaques.map((item) => (
                        <span key={item} className="personal-ai-tag">
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {evolutionInsights.alertas?.length ? (
                    <div className="personal-ai-tags">
                      {evolutionInsights.alertas.map((item) => (
                        <span key={item} className="personal-ai-tag is-alert">
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {evolutionInsights.proximosPassos?.length ? (
                    <ul className="personal-ai-list">
                      {evolutionInsights.proximosPassos.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {evolutionUpdatedAt && (
                    <span className="personal-ai-timestamp">
                      Atualizado {formatDate(evolutionUpdatedAt)}{' '}
                      {evolutionUpdatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              ) : (
                <p className="subtle">Clique em gerar para receber um resumo do progresso geral.</p>
              )}
            </div>

            <div className="card personal-activity-card">
              <div className="personal-card-header">
                <div>
                  <h3>Proximas avaliacoes</h3>
                  <p className="subtle">Organize a agenda de avaliacoes.</p>
                </div>
                <Link href="/evaluations" className="personal-link">
                  Ver todas
                </Link>
              </div>
              {upcomingEvaluations.length ? (
                <ul className="personal-activity-list">
                  {upcomingEvaluations.map((avaliacao) => (
                    <li key={avaliacao.id} className="personal-activity-item personal-activity-item--compact">
                      <div className="personal-activity-info">
                        <strong>{avaliacao.nome}</strong>
                        <span>{avaliacao.tipo}</span>
                      </div>
                      <span className="personal-activity-pill">{avaliacao.horario}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="personal-empty">
                  <p>Nenhuma avaliacao agendada no momento.</p>
                  <Link href="/evaluations/create" className="personal-link">
                    Criar avaliacao
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (role === 'aluno') {
    const todayKey = getWeekdayKey(new Date());
    const treinosDoDia = dashboard.treinos.filter((treino) => isTreinoDoDia(treino, todayKey));
    const treinoPrincipal = treinosDoDia[0] || dashboard.treinos[0] || null;
    const treinoConcluidoHoje = treinoPrincipal ? isTreinoConcluidoHoje(treinoPrincipal) : false;
    const functionTiles = [
      {
        id: 'avaliacoes',
        label: 'Avaliacoes',
        href: '/evaluations',
        badge: dashboard.avaliacoes.length,
        abbr: 'AV',
      },
      { id: 'progresso', label: 'Meu progresso', href: '/progress', abbr: 'PR' },
      {
        id: 'treinos',
        label: 'Meus treinos',
        href: '/workouts',
        badge: dashboard.treinos.length,
        abbr: 'TR',
      },
      { id: 'agenda', label: 'Agenda', href: '/schedule', abbr: 'AG' },
      { id: 'feedbacks', label: 'Meus feedbacks', href: '/feedbacks', abbr: 'FB' },
      { id: 'financeiro', label: 'Financeiro', href: '/financeiro', abbr: 'FI' },
      { id: 'arquivos', label: 'Arquivos', href: '/documents/aluno', abbr: 'AR' },
      { id: 'notificacoes', label: 'Notificacoes', href: '/notifications', abbr: 'NO' },
    ];
    const firstName = user?.displayName?.split(' ')[0] || 'Aluno';
    const displayName = user?.displayName || user?.email || 'Aluno';
    const initial = displayName.trim().charAt(0).toUpperCase() || 'A';
    const personalName = user?.nameDoSeuPersonal || 'Seu personal';
    const hasPersonal =
      user?.codigoPersonal !== undefined &&
      user?.codigoPersonal !== null &&
      String(user.codigoPersonal).trim() !== '' &&
      String(user.codigoPersonal).trim() !== '0';
    const personalLink = hasPersonal
      ? `/personal/profile?code=${user?.codigoPersonal}`
      : '/personal/change-code';
    const personalCodeLabel = hasPersonal ? user?.codigoPersonal : '-';
    const personalInitial = personalName.trim().charAt(0).toUpperCase() || 'P';
    const sortedEvaluations = [...dashboard.avaliacoes].sort(
      (a, b) => (toDate(b.data)?.getTime() || 0) - (toDate(a.data)?.getTime() || 0)
    );
    const ultimaAvaliacao = sortedEvaluations[0] || null;
    const ultimaAvaliacaoData = ultimaAvaliacao ? toDate(ultimaAvaliacao.data) : null;
    const ultimaAvaliacaoLabel = ultimaAvaliacao
      ? getEvaluationTypeLabel(ultimaAvaliacao.tipo as any)
      : '';

    return (
      <section className="student-home student-home--rn">
        <div className="student-home-hero">
          <header className="student-home-header">
            <div className="student-home-title">
              <p className="student-home-kicker">Bem-vindo de volta,</p>
              <h1>{firstName}</h1>
              <p className="student-home-sub">Seu foco de hoje esta aqui.</p>
            </div>
            <div className="student-home-actions">
              <Link className="student-home-action" href="/notifications" aria-label="Notificacoes">
                <IconBell />
              </Link>
              <Link className="student-home-avatar" href="/profile/edit" aria-label="Editar perfil">
                {user?.photoUrl ? (
                  <img src={user.photoUrl} alt={displayName} />
                ) : (
                  <span>{initial}</span>
                )}
              </Link>
            </div>
          </header>

          <div className="student-hero-card">
            {treinoPrincipal ? (
              <Link href={`/workout/${treinoPrincipal.id}`} className="student-hero-card-link">
                <div className="student-hero-content">
                  <span className="student-hero-kicker">
                    {treinosDoDia.length ? 'Treino de hoje' : 'Seu treino'}
                  </span>
                  <strong>{treinoPrincipal.nome}</strong>
                  <div className="student-hero-meta">
                    <span className="student-hero-pill">{treinoPrincipal.tipo}</span>
                    {treinoConcluidoHoje && (
                      <span className="student-hero-pill is-success">Concluido hoje</span>
                    )}
                    {treinoPrincipal.exercicios !== undefined && (
                      <span className="student-hero-meta-text">
                        {treinoPrincipal.exercicios} exercicios
                      </span>
                    )}
                    {treinoPrincipal.duracao && (
                      <span className="student-hero-meta-text">{treinoPrincipal.duracao}</span>
                    )}
                  </div>
                </div>
                <div className={`student-hero-icon${treinoConcluidoHoje ? ' is-success' : ''}`}>
                  {treinoConcluidoHoje ? <IconCheck /> : <IconClock />}
                </div>
              </Link>
            ) : (
              <Link href="/chat" className="student-hero-card-link is-empty">
                <div className="student-hero-content">
                  <span className="student-hero-kicker">Seu personal ainda nao liberou treinos.</span>
                  <strong>Abra o chat para combinar</strong>
                  <span className="student-hero-sub">Toque para abrir o chat</span>
                </div>
                <div className="student-hero-icon">
                  <IconChat />
                </div>
              </Link>
            )}
          </div>
        </div>

        {dashboard.error && (
          <div className="student-banner">
            <p>{dashboard.error}</p>
          </div>
        )}

        <section className="student-section">
          <div className="student-section-header">
            <h2>Seu personal</h2>
            <div className="student-section-actions">
              {hasPersonal ? (
                <>
                  <Link href="/personal/change-code" className="student-link">
                    Alterar
                  </Link>
                  <Link href={personalLink} className="student-link">
                    Ver perfil
                  </Link>
                </>
              ) : (
                <Link href="/personal/change-code" className="student-link">
                  Adicionar codigo
                </Link>
              )}
            </div>
          </div>
          <div className="student-section-card">
            {hasPersonal ? (
              <div className="student-personal-row">
                <div className="student-personal-avatar">{personalInitial}</div>
                <div className="student-personal-info">
                  <strong>{personalName}</strong>
                  <span>Codigo {personalCodeLabel}</span>
                </div>
                <Link href="/chat" className="student-inline-button">
                  Abrir chat
                </Link>
              </div>
            ) : (
              <div className="student-empty-state">
                <p>Voce ainda nao adicionou nenhum personal.</p>
                <Link href="/personal/change-code" className="student-inline-button">
                  Adicionar codigo
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="student-section">
          <div className="student-section-header">
            <h2>Funcoes</h2>
          </div>
          <div className="student-function-row">
            {functionTiles.map((tile) => (
              <Link key={tile.id} href={tile.href} className="student-function-tile">
                <span className={`student-function-icon is-${tile.id}`}>{tile.abbr}</span>
                <strong>{tile.label}</strong>
                {tile.badge !== undefined && tile.badge > 0 && (
                  <span className="student-function-badge">{tile.badge}</span>
                )}
              </Link>
            ))}
          </div>
        </section>

        <section className="student-section">
          <div className="student-section-header">
            <h2>Seus treinos</h2>
            <Link href="/workouts" className="student-link">
              Ver todos
            </Link>
          </div>
          {dashboard.treinos.length ? (
            <div className="student-treino-list">
              {dashboard.treinos.slice(0, 4).map((treino) => {
                const concluidoHoje = isTreinoConcluidoHoje(treino);
                return (
                  <div key={treino.id} className="student-treino-card">
                    <div className="student-treino-icon">
                      <IconBarbell />
                    </div>
                    <div className="student-treino-info">
                      <strong>{treino.nome}</strong>
                      <div className="student-treino-meta">
                        <span className="student-hero-pill">{treino.tipo}</span>
                        {concluidoHoje && (
                          <span className="student-hero-pill is-success">Concluido hoje</span>
                        )}
                        {treino.exercicios !== undefined && (
                          <span className="student-hero-meta-text">
                            {treino.exercicios} exercicios
                          </span>
                        )}
                        {treino.duracao && (
                          <span className="student-hero-meta-text">{treino.duracao}</span>
                        )}
                      </div>
                    </div>
                    <div className="student-treino-action">
                      {concluidoHoje ? (
                        <span className="student-treino-complete">
                          <IconCheck />
                        </span>
                      ) : (
                        <Link
                          href={`/start-workout?workoutId=${treino.id}`}
                          className="student-inline-button"
                        >
                          Iniciar
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="student-empty-state">
              <p>Nenhum treino disponivel ainda.</p>
              <Link href="/chat" className="student-inline-button">
                Abrir chat
              </Link>
            </div>
          )}
        </section>

        <section className="student-section">
          <div className="student-section-card student-feature-card">
            <div className="student-feature-header">
              <div>
                <strong>MH Agenda Fit</strong>
                <span>Encontre personais e marque treinos.</span>
              </div>
              <span className="student-feature-badge">Novo</span>
            </div>
            <Link href="/mh-agenda-fit" className="student-inline-button">
              Conhecer
            </Link>
          </div>
        </section>

        <section className="student-section">
          <div className="student-section-card student-feature-card is-assistant">
            <div className="student-feature-header">
              <div>
                <strong>Seu assistente de treinos</strong>
                <span>Tire duvidas, crie rotinas e ajuste treinos.</span>
              </div>
              <IconSpark />
            </div>
            <Link href="/chat/ai" className="student-inline-button is-accent">
              Falar com IA
            </Link>
          </div>
        </section>

        <section className="student-section">
          <div className="student-section-header">
            <h2>Ultima avaliacao fisica</h2>
            <Link href="/evaluations" className="student-link">
              Ver todas
            </Link>
          </div>
          {ultimaAvaliacao ? (
            <Link href="/evaluations" className="student-eval-card">
              <div className="student-eval-header">
                <div className="student-eval-icon">
                  <IconChart />
                </div>
                <div className="student-eval-info">
                  <strong>{ultimaAvaliacaoLabel}</strong>
                  <span>
                    Realizada em {ultimaAvaliacaoData ? formatDate(ultimaAvaliacaoData) : '-'}
                  </span>
                </div>
              </div>
              <div className="student-eval-stats">
                {ultimaAvaliacao.peso && (
                  <div className="student-eval-stat">
                    <strong>{ultimaAvaliacao.peso}</strong>
                    <span>Peso (kg)</span>
                  </div>
                )}
                {ultimaAvaliacao.gorduraCorporal && (
                  <div className="student-eval-stat">
                    <strong>{ultimaAvaliacao.gorduraCorporal}%</strong>
                    <span>% Gordura</span>
                  </div>
                )}
                {ultimaAvaliacao.imc && (
                  <div className="student-eval-stat">
                    <strong>{ultimaAvaliacao.imc}</strong>
                    <span>IMC</span>
                  </div>
                )}
              </div>
            </Link>
          ) : (
            <div className="student-empty-state">
              <p>Nenhuma avaliacao registrada ainda.</p>
              <Link href="/evaluations/create" className="student-inline-button">
                Fazer avaliacao
              </Link>
            </div>
          )}
        </section>
      </section>
    );
  }

  return (
    <section className="portal">
      <div className="portal-banner">
        <p>Perfil nao encontrado.</p>
      </div>
    </section>
  );
}
