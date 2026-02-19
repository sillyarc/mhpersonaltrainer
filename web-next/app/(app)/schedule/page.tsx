'use client';

import { useEffect, useMemo, useState } from 'react';
import PageShell from '@/components/PageShell';
import UserScopePicker from '@/components/data/UserScopePicker';
import { useUserScope, formatDate } from '@/lib/firestoreHooks';
import {
  fetchAppointments,
  getAppointmentStatusColor,
  getAppointmentTypeColor,
} from '@/lib/services/scheduling';
import { fetchUserWorkouts } from '@/lib/services/workouts';
import { fetchEvaluations, fetchEvaluationsForStudents, getEvaluationTypeLabel } from '@/lib/services/evaluations';
import { firestoreService, type Aluno } from '@/lib/services/firestoreService';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Appointment, AppointmentStatus, AppointmentType } from '@/lib/types/scheduling';
import type { PhysicalEvaluation } from '@/lib/types/evaluation';
import type { UserWorkout } from '@/lib/types/workout';

const FILTER_OPTIONS: { id: AppointmentType | null; label: string }[] = [
  { id: null, label: 'Todos' },
  { id: 'treino', label: 'Treino' },
  { id: 'avaliacao', label: 'Avaliacao' },
  { id: 'consulta', label: 'Consulta' },
];

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

const TYPE_LABELS: Record<AppointmentType, string> = {
  treino: 'Treino',
  avaliacao: 'Avaliacao',
  consulta: 'Consulta',
  acompanhamento: 'Acompanhamento',
  online: 'Online',
  presencial: 'Presencial',
};

const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  em_andamento: 'Em andamento',
  concluido: 'Concluido',
  cancelado: 'Cancelado',
  reagendado: 'Reagendado',
  nao_compareceu: 'Nao compareceu',
};

type AgendaSource = 'appointment' | 'workout' | 'evaluation';

type AgendaItem = Appointment & {
  source: AgendaSource;
  route?: string;
};

const mapEvaluationStatus = (status: string): AppointmentStatus => {
  const normalized = String(status || '').toLowerCase();
  switch (normalized) {
    case 'agendada':
      return 'agendado';
    case 'em_andamento':
      return 'em_andamento';
    case 'concluida':
      return 'concluido';
    case 'cancelada':
    case 'nao_realizada':
      return 'cancelado';
    default:
      return 'agendado';
  }
};

const buildWorkoutRoute = (workoutId: string, studentId?: string) =>
  studentId ? `/workout/${workoutId}?studentId=${studentId}` : `/workout/${workoutId}`;

const buildWorkoutAppointment = (
  workout: UserWorkout,
  student: Aluno | null,
  personalId: string
): AgendaItem | null => {
  const appointmentDate =
    workout.data || workout.createdAt || workout.updatedAt || workout.lastCompletedAt;
  if (!appointmentDate) return null;
  return {
    id: `workout-${student?.id ?? personalId}-${workout.id}`,
    alunoId: student?.id ?? personalId,
    personalId,
    alunoNome: student?.nome,
    personalNome: undefined,
    data: appointmentDate,
    horaInicio: '',
    horaFim: '',
    tipo: 'treino',
    status: workout.lastCompletedAt ? 'concluido' : 'agendado',
    servico: workout.nomeDoTreino || 'Treino',
    observacoes: workout.obsInstrucao,
    createdAt: workout.createdAt || appointmentDate,
    updatedAt: workout.updatedAt,
    source: 'workout',
    route: buildWorkoutRoute(workout.id, student?.id),
  };
};

const resolveEvaluationDate = (evaluation: PhysicalEvaluation): Date => {
  if (evaluation.type === 'personalizada') {
    const prazo = (evaluation as PhysicalEvaluation & { prazoResposta?: Date | null }).prazoResposta;
    if (prazo) return prazo;
  }
  return evaluation.date || evaluation.createdAt || new Date();
};

const buildEvaluationAppointment = (
  evaluation: PhysicalEvaluation,
  student: Aluno | null,
  personalId: string
): AgendaItem => {
  const appointmentDate = resolveEvaluationDate(evaluation);
  const query = new URLSearchParams({ type: evaluation.type });
  if (evaluation.userId) {
    query.set('userId', evaluation.userId);
  }
  return {
    id: `evaluation-${student?.id ?? personalId}-${evaluation.id}`,
    alunoId: student?.id ?? personalId,
    personalId,
    alunoNome: student?.nome,
    personalNome: undefined,
    data: appointmentDate,
    horaInicio: '',
    horaFim: '',
    tipo: 'avaliacao',
    status: mapEvaluationStatus(evaluation.status),
    servico: getEvaluationTypeLabel(evaluation.type),
    createdAt: evaluation.createdAt || appointmentDate,
    updatedAt: evaluation.updatedAt,
    source: 'evaluation',
    route: `/evaluations/${evaluation.id}?${query.toString()}`,
  };
};

const sortAgendaItems = (items: AgendaItem[]) =>
  [...items].sort((a, b) => {
    const dateDiff = a.data.getTime() - b.data.getTime();
    if (dateDiff !== 0) return dateDiff;
    return (a.horaInicio || '').localeCompare(b.horaInicio || '');
  });

const parseDateParam = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const isSameDay = (a: Date, b: Date) =>
  a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

const formatMonthYear = (date: Date) =>
  date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

const formatSelectedDate = (date: Date) =>
  date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

type ViewMode = 'week' | 'month';

export default function SchedulePage() {
  const { userId } = useUserScope();
  const { user, role } = useAuth();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<AppointmentType | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [loading, setLoading] = useState(true);
  const [hydrating, setHydrating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      const errors: string[] = [];
      const isPersonal = role === 'personal' || role === 'professor' || role === 'admin';
      const scopedUserId = isPersonal ? user?.uid : userId;
      if (!scopedUserId) {
        setAgendaItems([]);
        setLoading(false);
        setHydrating(false);
        return;
      }
      setLoading(true);
      setHydrating(true);
      setError('');
      const baseResult = await fetchAppointments(scopedUserId, isPersonal);
      if (baseResult.error) errors.push(baseResult.error);
      const baseItems: AgendaItem[] = (baseResult.data || []).map((appointment) => ({
        ...appointment,
        source: 'appointment',
        route: `/schedule/${appointment.id}`,
      }));

      if (!active) return;
      setAgendaItems(baseItems);
      setLoading(false);

      let workoutItems: AgendaItem[] = [];
      let evaluationItems: AgendaItem[] = [];

      if (isPersonal) {
        const students = await firestoreService.getAlunosDoPersonal(scopedUserId);
        const studentMap = new Map<string, Aluno>();
        students.forEach((student) => studentMap.set(student.id, student));
        const studentIds = students.map((student) => student.id);
        const workoutResults = await Promise.all(
          students.map(async (student) => ({
            student,
            result: await fetchUserWorkouts(student.id, false),
          }))
        );
        workoutItems = workoutResults
          .flatMap(({ student, result }) => {
            if (result.error) errors.push(result.error);
            return (result.data || [])
              .map((workout) => buildWorkoutAppointment(workout, student, scopedUserId))
              .filter(Boolean);
          })
          .filter(Boolean) as AgendaItem[];

        const evaluationsResult = await fetchEvaluationsForStudents(studentIds);
        if (evaluationsResult.error) errors.push(evaluationsResult.error);
        evaluationItems = (evaluationsResult.data || []).map((evaluation) =>
          buildEvaluationAppointment(
            evaluation,
            studentMap.get(evaluation.userId) || null,
            scopedUserId
          )
        );
      } else {
        const [workoutsResult, evaluationsResult] = await Promise.all([
          fetchUserWorkouts(scopedUserId, false),
          fetchEvaluations(scopedUserId),
        ]);
        if (workoutsResult.error) errors.push(workoutsResult.error);
        if (evaluationsResult.error) errors.push(evaluationsResult.error);
        workoutItems = (workoutsResult.data || [])
          .map((workout) => buildWorkoutAppointment(workout, null, scopedUserId))
          .filter(Boolean) as AgendaItem[];
        evaluationItems = (evaluationsResult.data || []).map((evaluation) =>
          buildEvaluationAppointment(evaluation, null, scopedUserId)
        );
      }

      if (!active) return;
      const merged = sortAgendaItems([...baseItems, ...workoutItems, ...evaluationItems]);
      setAgendaItems(merged);
      setError(errors.join(' | '));
      setHydrating(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [role, user?.uid, userId]);

  useEffect(() => {
    if (viewMode === 'month') {
      setCurrentMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [selectedDate, viewMode]);

  useEffect(() => {
    const paramDate = parseDateParam(dateParam);
    if (!paramDate) return;
    setSelectedDate(paramDate);
  }, [dateParam]);

  const appointmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    agendaItems.forEach((item) => {
      if (!item?.data) return;
      const key = getDateKey(item.data);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [agendaItems]);

  const filteredAppointments = useMemo(() => {
    const key = getDateKey(selectedDate);
    const items = agendaItems.filter((item) => {
      if (!item?.data) return false;
      if (getDateKey(item.data) !== key) return false;
      if (selectedFilter && item.tipo !== selectedFilter) return false;
      return true;
    });
    return sortAgendaItems(items);
  }, [agendaItems, selectedDate, selectedFilter]);

  const selectedLabel = isSameDay(selectedDate, new Date()) ? 'Hoje' : 'Selecionado';

  const getDayCount = (date: Date) => {
    const key = getDateKey(date);
    return appointmentCounts[key] || 0;
  };

  const getWeekDays = (date: Date) => {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const next = new Date(start);
      next.setDate(start.getDate() + index);
      return next;
    });
  };

  const getMonthDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];

    const startPadding = firstDay.getDay();
    for (let i = 0; i < startPadding; i += 1) {
      days.push(null);
    }

    for (let day = 1; day <= lastDay.getDate(); day += 1) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const handlePreviousMonth = () => {
    const next = new Date(currentMonth);
    next.setMonth(next.getMonth() - 1);
    setCurrentMonth(next);
  };

  const handleNextMonth = () => {
    const next = new Date(currentMonth);
    next.setMonth(next.getMonth() + 1);
    setCurrentMonth(next);
  };

  const handlePreviousWeek = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() - 7);
    setSelectedDate(next);
  };

  const handleNextWeek = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 7);
    setSelectedDate(next);
  };

  return (
    <PageShell
      title="Agenda"
      description="Controle aulas, horarios e lembretes automatizados."
    >
      <UserScopePicker />
      <div className="schedule-revamp">
        <div className="schedule-toolbar">
          <div className="schedule-toolbar-meta">
            <span>{selectedLabel}</span>
            <strong>{formatSelectedDate(selectedDate)}</strong>
            <span className="schedule-toolbar-count">
              {filteredAppointments.length} compromissos
            </span>
          </div>
          <div className="schedule-view-toggle">
            <button
              type="button"
              className={`schedule-view-button ${viewMode === 'week' ? 'active' : ''}`}
              onClick={() => setViewMode('week')}
            >
              Semana
            </button>
            <button
              type="button"
              className={`schedule-view-button ${viewMode === 'month' ? 'active' : ''}`}
              onClick={() => setViewMode('month')}
            >
              Mes
            </button>
          </div>
        </div>

        <div className="schedule-filters">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.id ?? 'all'}
              type="button"
              className={`schedule-filter-chip ${selectedFilter === option.id ? 'active' : ''}`}
              onClick={() => setSelectedFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="schedule-layout">
          <section className="portal-card schedule-calendar">
            <div className="schedule-month-nav">
              <button
                type="button"
                className="schedule-nav-button"
                onClick={viewMode === 'month' ? handlePreviousMonth : handlePreviousWeek}
              >
                {'<'}
              </button>
              <span className="schedule-month-label">
                {formatMonthYear(viewMode === 'month' ? currentMonth : selectedDate)}
              </span>
              <button
                type="button"
                className="schedule-nav-button"
                onClick={viewMode === 'month' ? handleNextMonth : handleNextWeek}
              >
                {'>'}
              </button>
            </div>

            {viewMode === 'week' ? (
              <div className="calendar-week">
                {getWeekDays(selectedDate).map((day) => {
                  const count = getDayCount(day);
                  return (
                    <button
                      key={getDateKey(day)}
                      type="button"
                      className={`calendar-day ${isSameDay(day, selectedDate) ? 'is-selected' : ''} ${
                        isSameDay(day, new Date()) ? 'is-today' : ''
                      }`}
                      onClick={() => setSelectedDate(day)}
                    >
                      <span className="calendar-day-label">{DAY_LABELS[day.getDay()]}</span>
                      <span className="calendar-day-number">{day.getDate()}</span>
                      {count > 0 && (
                        <span className="calendar-dots">
                          {count <= 3
                            ? Array.from({ length: count }).map((_, index) => (
                                <span key={index} className="calendar-dot" />
                              ))
                            : <span className="calendar-count">{count}</span>}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="calendar-month">
                <div className="calendar-weekdays">
                  {DAY_LABELS.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className="calendar-month-grid">
                  {getMonthDays(currentMonth).map((day, index) => {
                    if (!day) {
                      return <div key={`empty-${index}`} className="calendar-empty" />;
                    }
                    const count = getDayCount(day);
                    return (
                      <div key={getDateKey(day)} className="calendar-cell">
                        <button
                          type="button"
                          className={`calendar-day ${isSameDay(day, selectedDate) ? 'is-selected' : ''} ${
                            isSameDay(day, new Date()) ? 'is-today' : ''
                          }`}
                          onClick={() => setSelectedDate(day)}
                        >
                          <span className="calendar-day-label">{DAY_LABELS[day.getDay()]}</span>
                          <span className="calendar-day-number">{day.getDate()}</span>
                          {count > 0 && (
                            <span className="calendar-dots">
                              {count <= 3
                                ? Array.from({ length: count }).map((_, indexDot) => (
                                    <span key={indexDot} className="calendar-dot" />
                                  ))
                                : <span className="calendar-count">{count}</span>}
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="portal-card schedule-panel">
            <div className="schedule-section-title">
              <div>
                <h3>Agenda do dia</h3>
                <p className="subtle">{formatSelectedDate(selectedDate)}</p>
              </div>
              <span>{filteredAppointments.length} itens</span>
            </div>
            {loading && <p className="subtle">Carregando agenda...</p>}
            {!loading && hydrating && <p className="subtle">Atualizando compromissos...</p>}
            {error && <p style={{ color: '#c0392b' }}>{error}</p>}
            {!loading && !hydrating && filteredAppointments.length === 0 && (
              <div className="schedule-empty">
                <p>Nenhum compromisso para esta data.</p>
                <span className="subtle">
                  Selecione outra data no calendario ou ajuste os filtros.
                </span>
              </div>
            )}
            {!loading && filteredAppointments.length > 0 && (
              <div className="schedule-list">
                {filteredAppointments.map((item) => {
                  const typeLabel = TYPE_LABELS[item.tipo] ?? item.tipo;
                  const statusLabel = STATUS_LABELS[item.status] ?? item.status;
                  const typeColor = getAppointmentTypeColor(item.tipo);
                  const statusColor = getAppointmentStatusColor(item.status);
                  const name = item.alunoNome || item.personalNome || '';
                  const timeLabel =
                    item.horaInicio || item.horaFim
                      ? `${item.horaInicio || '--'} - ${item.horaFim || '--'}`
                      : '';
                  const title = item.servico || typeLabel;
                  return (
                    <Link
                      key={item.id}
                      href={item.route || `/schedule/${item.id}`}
                      className="schedule-item"
                    >
                      <div>
                        <div className="schedule-item-title">{title}</div>
                        <div className="schedule-item-meta">
                          <span>{formatDate(item.data)}</span>
                          {timeLabel ? <span>{timeLabel}</span> : null}
                          {name ? <span>{name}</span> : null}
                        </div>
                      </div>
                      <div className="schedule-badges">
                        <span
                          className="schedule-badge"
                          style={{ background: `${typeColor}22`, color: typeColor }}
                        >
                          {typeLabel}
                        </span>
                        <span
                          className="schedule-badge"
                          style={{ background: `${statusColor}22`, color: statusColor }}
                        >
                          {statusLabel}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </PageShell>
  );
}
