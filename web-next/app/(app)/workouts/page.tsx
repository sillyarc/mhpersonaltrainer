'use client';

import { useEffect, useMemo, useState } from 'react';
import PageShell from '@/components/PageShell';
import DataTable from '@/components/data/DataTable';
import UserScopePicker from '@/components/data/UserScopePicker';
import { firestoreHelpers, formatDate, useCollectionData, useUserScope } from '@/lib/firestoreHooks';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import { fetchAerobicWorkouts, fetchUserWorkouts } from '@/lib/services/workouts';
import type { AerobicWorkout, UserWorkout } from '@/lib/types/workout';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchFeedbacksByPersonalCode } from '@/lib/services/feedback';
import type { FeedbackItem } from '@/lib/types/feedback';

interface WorkoutRow {
  id: string;
  nomeDoTreino?: string;
  nome?: string;
  createdAt?: any;
  updatedAt?: any;
  uid?: string;
}

const IconBarbell = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M3 10v4" />
    <path d="M7 6v12" />
    <path d="M17 6v12" />
    <path d="M21 10v4" />
    <path d="M7 12h10" />
  </svg>
);

const IconBicycle = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <circle cx="6" cy="17" r="3" />
    <circle cx="18" cy="17" r="3" />
    <path d="M6 17l4-7h4l-3 5h4" />
    <path d="M10 10h4" />
  </svg>
);

const IconList = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <circle cx="4" cy="6" r="1" />
    <circle cx="4" cy="12" r="1" />
    <circle cx="4" cy="18" r="1" />
    <path d="M8 6h12" />
    <path d="M8 12h12" />
    <path d="M8 18h12" />
  </svg>
);

const IconTime = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

const IconFlame = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M12 3c3 3 4 5 4 7a4 4 0 1 1-8 0c0-2 1-4 4-7z" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="student-icon">
    <path d="M5 12l4 4 10-10" />
  </svg>
);

export default function WorkoutsPage() {
  const { role, user } = useAuth();
  const { userId } = useUserScope();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: publicWorkouts } = useCollectionData<WorkoutRow>(['treinos'], [firestoreHelpers.limit(20)]);
  const { data: userWorkouts } = useCollectionData<WorkoutRow>(['users', userId, 'createTreinos'], [firestoreHelpers.limit(20)]);
  const dashboard = useDashboardData();
  const isPersonal = role === 'personal' || role === 'professor';
  const isStudent = role === 'aluno';
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [studentWorkouts, setStudentWorkouts] = useState<UserWorkout[]>([]);
  const [loadingWorkouts, setLoadingWorkouts] = useState(false);
  const [studentAerobicWorkouts, setStudentAerobicWorkouts] = useState<AerobicWorkout[]>([]);
  const [studentLoading, setStudentLoading] = useState(true);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
  const paramStudentId = searchParams.get('studentId') || '';
  const assistantPrompts = [
    'Treino para emagrecimento 4x na semana',
    'Treino funcional para iniciantes (30 min)',
  ];
  const normalizedStudentQuery = studentQuery.trim().toLowerCase();
  const activeStudents = useMemo(
    () => dashboard.alunos.filter((aluno) => aluno.status === 'ativo'),
    [dashboard.alunos]
  );

  useEffect(() => {
    if (!isPersonal) return;
    if (!activeStudents.length) {
      setSelectedStudentId('');
      return;
    }
    const isSelectedActive = activeStudents.some((aluno) => aluno.id === selectedStudentId);
    if (!selectedStudentId || !isSelectedActive) {
      setSelectedStudentId(activeStudents[0].id);
    }
  }, [isPersonal, activeStudents, selectedStudentId]);

  useEffect(() => {
    if (!isPersonal) return;
    if (!paramStudentId) return;
    const exists = activeStudents.some((aluno) => aluno.id === paramStudentId);
    if (exists) {
      setSelectedStudentId(paramStudentId);
    }
  }, [activeStudents, isPersonal, paramStudentId]);

  useEffect(() => {
    if (!isPersonal) return;
    if (!selectedStudentId) {
      setStudentWorkouts([]);
      return;
    }
    let active = true;
    const load = async () => {
      setLoadingWorkouts(true);
      const result = await fetchUserWorkouts(selectedStudentId, false);
      if (!active) return;
      setStudentWorkouts(result.data || []);
      setLoadingWorkouts(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [isPersonal, selectedStudentId]);

  useEffect(() => {
    if (!isStudent) return;
    if (!user?.uid) {
      setStudentWorkouts([]);
      setStudentAerobicWorkouts([]);
      setStudentLoading(false);
      return;
    }
    let active = true;
    const load = async () => {
      setStudentLoading(true);
      const [strengthResult, aerobicResult] = await Promise.all([
        fetchUserWorkouts(user.uid, false),
        fetchAerobicWorkouts(user.uid),
      ]);
      if (!active) return;
      setStudentWorkouts(strengthResult.data || []);
      setStudentAerobicWorkouts(aerobicResult.data || []);
      setStudentLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [isStudent, user?.uid]);

  useEffect(() => {
    const rawCode = user?.codigoPersonal;
    const personalCode = typeof rawCode === 'number' ? rawCode : Number(rawCode);
    if (!isPersonal || !personalCode) {
      setFeedbacks([]);
      return;
    }
    let active = true;
    setLoadingFeedbacks(true);
    fetchFeedbacksByPersonalCode(personalCode).then((result) => {
      if (!active) return;
      setFeedbacks(result.data || []);
      setLoadingFeedbacks(false);
    });
    return () => {
      active = false;
    };
  }, [isPersonal, user?.codigoPersonal]);

  const filteredStudents = useMemo(() => {
    if (!normalizedStudentQuery) return activeStudents;
    return activeStudents.filter((aluno) => {
      const name = aluno.nome || '';
      const email = aluno.email || '';
      return (
        name.toLowerCase().includes(normalizedStudentQuery) ||
        email.toLowerCase().includes(normalizedStudentQuery)
      );
    });
  }, [activeStudents, normalizedStudentQuery]);

  const visibleStudents = useMemo(() => {
    if (!normalizedStudentQuery) return activeStudents;
    const hasSelected = filteredStudents.some((aluno) => aluno.id === selectedStudentId);
    if (hasSelected) return filteredStudents;
    const selected = activeStudents.find((aluno) => aluno.id === selectedStudentId);
    if (!selected) return filteredStudents;
    return [selected, ...filteredStudents];
  }, [activeStudents, filteredStudents, normalizedStudentQuery, selectedStudentId]);

  const selectedStudent = useMemo(
    () => activeStudents.find((aluno) => aluno.id === selectedStudentId) || null,
    [activeStudents, selectedStudentId]
  );

  const recentCompletions = useMemo(() => {
    return [...activeStudents]
      .filter((aluno) => aluno.ultimoTreino)
      .sort((a, b) => {
        const timeA = a.ultimoTreino?.getTime?.() || 0;
        const timeB = b.ultimoTreino?.getTime?.() || 0;
        return timeB - timeA;
      })
      .slice(0, 3);
  }, [activeStudents]);

  const recentFeedbacks = useMemo(() => feedbacks.slice(0, 3), [feedbacks]);

  const handleAssistantPrompt = (prompt: string) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('mh-assistant-prompt', prompt);
    }
    router.push('/ai/assistant');
  };

  const isCompletedToday = (workout: UserWorkout) => {
    if (!workout.lastCompletedAt) return false;
    const completed = new Date(workout.lastCompletedAt);
    const today = new Date();
    return (
      completed.getFullYear() === today.getFullYear() &&
      completed.getMonth() === today.getMonth() &&
      completed.getDate() === today.getDate()
    );
  };

  type StudentListItem =
    | { kind: 'strength'; data: UserWorkout }
    | { kind: 'aerobic'; data: AerobicWorkout };

  const studentItems = useMemo<StudentListItem[]>(() => {
    if (!isStudent) return [];
    const items: StudentListItem[] = [
      ...studentWorkouts.map((item) => ({ kind: 'strength' as const, data: item })),
      ...studentAerobicWorkouts.map((item) => ({ kind: 'aerobic' as const, data: item })),
    ];
    const getName = (item: StudentListItem) => {
      if (item.kind === 'strength') {
        return item.data.nomeDoTreino || 'Treino';
      }
      const treinos = item.data.treinos?.length
        ? item.data.treinos
        : item.data.treino
        ? [item.data.treino]
        : [];
      return treinos[0] || 'Treino aerobico';
    };
    return items.sort((a, b) => getName(a).localeCompare(getName(b), 'pt-BR'));
  }, [isStudent, studentAerobicWorkouts, studentWorkouts]);

  if (isStudent) {
    return (
      <section className="student-workouts">
        <header className="student-workouts-header">
          <div>
            <p className="student-home-kicker">Treinos</p>
            <h1>Meus treinos</h1>
            <p className="student-home-sub">Acompanhe suas rotinas liberadas.</p>
          </div>
        </header>

        <div className="student-workouts-list">
          {studentLoading ? (
            <div className="student-loading">
              <p className="student-home-kicker">Carregando treinos</p>
              <p className="student-home-sub">Buscando suas rotinas.</p>
            </div>
          ) : studentItems.length ? (
            studentItems.map((item) => {
              if (item.kind === 'strength') {
                const workout = item.data;
                const completedToday = isCompletedToday(workout);
                const intervalCount = Array.isArray(workout.intervalo) ? workout.intervalo.length : 0;
                const exerciseCount = Array.isArray(workout.treino) ? workout.treino.length : 0;
                return (
                  <Link key={workout.id} href={`/workout/${workout.id}`} className="student-workout-card">
                    <div className="student-workout-header">
                      <div className="student-workout-badge">
                        <IconBarbell />
                      </div>
                      {completedToday && (
                        <span className="student-workout-status">
                          <IconCheck />
                          Concluido hoje
                        </span>
                      )}
                    </div>
                    <div>
                      <strong className="student-workout-title">
                        {workout.nomeDoTreino || 'Treino'}
                      </strong>
                      <p className="student-workout-desc">
                        {workout.obsInstrucao || 'Treino personalizado'}
                      </p>
                    </div>
                    <div className="student-workout-meta">
                      <div className="student-meta-item">
                        <IconList />
                        <span>{exerciseCount} exercicios</span>
                      </div>
                      <div className="student-meta-item">
                        <IconTime />
                        <span>{intervalCount ? `${intervalCount * 2} min` : 'Tempo livre'}</span>
                      </div>
                    </div>
                  </Link>
                );
              }
              const workout = item.data;
              const treinos = workout.treinos?.length
                ? workout.treinos
                : workout.treino
                ? [workout.treino]
                : [];
              return (
                <Link key={workout.id} href="/workout/aerobico" className="student-workout-card">
                  <div className="student-workout-header">
                    <div className="student-workout-badge is-aerobic">
                      <IconBicycle />
                    </div>
                  </div>
                  <div>
                    <strong className="student-workout-title">{treinos[0] || 'Treino aerobico'}</strong>
                    <p className="student-workout-desc">
                      {workout.observacoes || workout.aquecimento || 'Treino aerobico'}
                    </p>
                  </div>
                  <div className="student-workout-meta">
                    <div className="student-meta-item">
                      <IconList />
                      <span>{treinos.length} atividade(s)</span>
                    </div>
                    {workout.aquecimento ? (
                      <div className="student-meta-item">
                        <IconFlame />
                        <span>Aquecimento</span>
                      </div>
                    ) : (
                      <div className="student-meta-item">
                        <IconFlame />
                        <span>Sem aquecimento</span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="student-workouts-empty">
              <p>Nenhum treino encontrado.</p>
              <Link href="/chat" className="student-link">
                Falar com personal
              </Link>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (isPersonal) {
    return (
      <PageShell
        title="Treinos dos alunos"
        description="Acompanhe treinos criados para cada aluno."
        actions={[{ label: 'Criar treino', href: '/workout/create' }]}
      >
        <div className="workouts-personal">
          <div className="workouts-personal-top">
            <div className="card workouts-student-picker">
              <h3>Selecionar aluno</h3>
              <p className="subtle" style={{ marginTop: 6 }}>
                Escolha um aluno para ver treinos e progresso.
              </p>
              {activeStudents.length ? (
                <>
                  <div className="students-search" style={{ marginTop: 12 }}>
                    <input
                      type="search"
                      value={studentQuery}
                      onChange={(event) => setStudentQuery(event.target.value)}
                      placeholder="Pesquisar aluno"
                    />
                    {studentQuery && (
                      <button type="button" className="students-clear" onClick={() => setStudentQuery('')}>
                        Limpar
                      </button>
                    )}
                  </div>
                  {normalizedStudentQuery && !filteredStudents.length && (
                    <p className="subtle" style={{ marginTop: 12 }}>
                      Nenhum aluno encontrado para essa pesquisa.
                    </p>
                  )}
                  <select
                    value={selectedStudentId}
                    onChange={(event) => setSelectedStudentId(event.target.value)}
                  >
                    {visibleStudents.map((aluno) => (
                      <option key={aluno.id} value={aluno.id}>
                        {aluno.nome}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <p className="subtle" style={{ marginTop: 12 }}>
                  Nenhum aluno ativo encontrado.
                </p>
              )}
              {selectedStudent && (
                <div className="workouts-student-mini">
                  <div className="students-card-avatar">
                    {selectedStudent.photoUrl ? (
                      <img src={selectedStudent.photoUrl} alt={selectedStudent.nome} />
                    ) : (
                      <span>{selectedStudent.nome.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <strong>{selectedStudent.nome}</strong>
                    <p className="subtle">{selectedStudent.email || 'Email nao informado'}</p>
                    <span className={`students-status is-${selectedStudent.status}`}>
                      {selectedStudent.status}
                    </span>
                  </div>
                </div>
              )}
              <div className="workouts-mini-metrics">
                <span>Ativos: {dashboard.stats.alunosAtivos ?? 0}</span>
                <span>Treinos hoje: {dashboard.stats.treinosHoje ?? 0}</span>
              </div>
            </div>

            <div className="card workouts-assistant">
              <div>
                <p className="pill">MH Assistente</p>
                <h3>Crie treinos com IA</h3>
                <p className="subtle" style={{ marginTop: 6 }}>
                  Gere rotinas prontas e personalize o plano em segundos.
                </p>
              </div>
              <div className="workouts-assistant-actions">
                <button type="button" className="button" onClick={() => handleAssistantPrompt('Monte um treino completo')}>
                  Abrir assistente
                </button>
                <Link href="/workout/create" className="button secondary">
                  Criar manualmente
                </Link>
              </div>
              <div className="workouts-assistant-prompts">
                {assistantPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="workouts-assistant-chip"
                    onClick={() => handleAssistantPrompt(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card workouts-table-card">
            <div className="workouts-card-header">
              <h3>Treinos do aluno</h3>
              {selectedStudent ? (
                <Link href={`/students/${selectedStudent.id}`} className="students-action">
                  Ver perfil
                </Link>
              ) : null}
            </div>
            {loadingWorkouts && <p className="subtle">Carregando treinos...</p>}
            {!loadingWorkouts && (
              <DataTable
                rows={studentWorkouts}
                columns={[
                  {
                    key: 'nomeDoTreino',
                    label: 'Treino',
                    render: (row) => (
                      <Link href={`/workout/${row.id}?studentId=${selectedStudentId}`}>
                        {row.nomeDoTreino ?? '-'}
                      </Link>
                    ),
                  },
                  { key: 'updatedAt', label: 'Atualizado', render: (row) => formatDate(row.updatedAt) },
                  { key: 'lastCompletedAt', label: 'Ultima execucao', render: (row) => formatDate(row.lastCompletedAt) },
                ]}
                emptyMessage="Nenhum treino encontrado para este aluno."
              />
            )}
          </div>

          <div className="workouts-insights-grid">
            <div className="card workouts-insight-card">
              <div className="workouts-card-header">
                <h3>Ultimos treinos</h3>
              </div>
              {recentCompletions.length ? (
                <ul className="workouts-activity-list">
                  {recentCompletions.map((aluno) => (
                    <li key={aluno.id}>
                      <strong>{aluno.nome}</strong>
                      <span>{formatDate(aluno.ultimoTreino)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="subtle">Nenhum treino recente.</p>
              )}
            </div>
            <div className="card workouts-insight-card">
              <div className="workouts-card-header">
                <h3>Feedbacks recentes</h3>
                <Link href="/feedbacks" className="students-action">
                  Ver todos
                </Link>
              </div>
              {loadingFeedbacks ? (
                <p className="subtle">Carregando...</p>
              ) : recentFeedbacks.length ? (
                <ul className="workouts-activity-list">
                  {recentFeedbacks.map((feedback) => (
                    <li key={feedback.id}>
                      <strong>{feedback.yourName || 'Aluno'}</strong>
                      <span>{feedback.estrela ? `${feedback.estrela}/5` : '-'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="subtle">Nenhum feedback recente.</p>
              )}
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Treinos"
      description="Organize treinos por aluno, objetivo e periodo."
      actions={[{ label: 'Criar treino', href: '/workout/create' }]}
    >
      <UserScopePicker />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Link href="/workout/categories" className="card">
          <h3>Categorias</h3>
          <p className="subtle" style={{ marginTop: 8 }}>Biblioteca com modelos e objetivos.</p>
        </Link>
        <Link href="/workout/archived" className="card">
          <h3>Treinos arquivados</h3>
          <p className="subtle" style={{ marginTop: 8 }}>Historico completo de ciclos.</p>
        </Link>
        <Link href="/workout/aerobico" className="card">
          <h3>Aerobico</h3>
          <p className="subtle" style={{ marginTop: 8 }}>Planos cardio e resistencia.</p>
        </Link>
        <Link href="/start-workout" className="card">
          <h3>Iniciar treino</h3>
          <p className="subtle" style={{ marginTop: 8 }}>Checklist e timer do treino atual.</p>
        </Link>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h3>Treinos gerais</h3>
        <DataTable
          rows={publicWorkouts}
          columns={[
            {
              key: 'nomeDoTreino',
              label: 'Treino',
              render: (row) => (
                <Link href={`/workout/${row.id}`}>{row.nomeDoTreino ?? row.nome ?? '-'}</Link>
              ),
            },
            { key: 'uid', label: 'Criador' },
            { key: 'createdAt', label: 'Criado em', render: (row) => formatDate(row.createdAt) },
          ]}
        />
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h3>Treinos do usuario</h3>
        {userId ? (
          <DataTable
            rows={userWorkouts}
            columns={[
              {
                key: 'nomeDoTreino',
                label: 'Treino',
                render: (row) => (
                  <Link href={`/workout/${row.id}`}>{row.nomeDoTreino ?? row.nome ?? '-'}</Link>
                ),
              },
              { key: 'updatedAt', label: 'Atualizado', render: (row) => formatDate(row.updatedAt) },
            ]}
            emptyMessage="Nenhum treino encontrado para este usuario."
          />
        ) : (
          <p className="subtle">Informe um UID para ver treinos do usuario.</p>
        )}
      </div>
    </PageShell>
  );
}
