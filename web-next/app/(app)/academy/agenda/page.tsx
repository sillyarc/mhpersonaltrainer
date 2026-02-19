'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import AcademyGate from '@/components/AcademyGate';
import { formatDate } from '@/lib/firestoreHooks';
import { useAcademyData } from '@/lib/hooks/useAcademyData';
import {
  fetchAppointmentsForStudents,
  getAppointmentStatusColor,
  getAppointmentTypeColor,
} from '@/lib/services/scheduling';
import { fetchUserWorkouts } from '@/lib/services/workouts';
import type { Appointment, AppointmentStatus, AppointmentType } from '@/lib/types/scheduling';
import type { UserWorkout } from '@/lib/types/workout';

type AgendaSource = 'appointment' | 'workout';

type AcademyAgendaItem = Appointment & {
  source: AgendaSource;
  route: string;
};

const TYPE_LABELS: Record<AppointmentType, string> = {
  treino: 'Treino',
  avaliacao: 'Avaliacao',
  consulta: 'Consulta',
  acompanhamento: 'Acompanhamento',
  online: 'Online',
  presencial: 'Presencial',
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  em_andamento: 'Em andamento',
  concluido: 'Concluido',
  cancelado: 'Cancelado',
  reagendado: 'Reagendado',
  nao_compareceu: 'Nao compareceu',
};

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

const normalizeWeekday = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const weekdayByIndex = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

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

const sameDay = (a?: Date, b?: Date) => {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

const buildRecurringDates = (workout: UserWorkout, horizonDays = 21) => {
  if (workout.data) return [workout.data];
  const days = (workout.diasDaSemana || []).map(normalizeWeekday);
  if (!days.length) return [];
  const now = new Date();
  const result: Date[] = [];
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const candidate = new Date(now);
    candidate.setHours(8, 0, 0, 0);
    candidate.setDate(now.getDate() + offset);
    const weekday = weekdayByIndex[candidate.getDay()];
    const matches = days.some((value) => value.includes(weekday));
    if (matches) {
      result.push(candidate);
    }
  }
  return result;
};

const buildWorkoutAgendaItems = (
  studentId: string,
  studentName: string,
  personalName: string,
  workout: UserWorkout
): AcademyAgendaItem[] => {
  const plannedDates = buildRecurringDates(workout);
  if (!plannedDates.length) return [];
  return plannedDates.map((plannedDate, index) => {
    const done = sameDay(workout.lastCompletedAt, plannedDate);
    return {
      id: `workout-${studentId}-${workout.id}-${index}`,
      alunoId: studentId,
      personalId: '',
      alunoNome: studentName,
      personalNome: personalName,
      data: plannedDate,
      horaInicio: plannedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      horaFim: '',
      tipo: 'treino',
      status: done ? 'concluido' : 'agendado',
      servico: workout.nomeDoTreino || 'Treino',
      observacoes: workout.obsInstrucao,
      createdAt: workout.createdAt || plannedDate,
      updatedAt: workout.updatedAt,
      source: 'workout',
      route: `/workouts?studentId=${studentId}`,
      valor: undefined,
      local: 'App',
    };
  });
};

export default function AcademyAgendaPage() {
  const { academyStudents, loadingAcademy, academyError } = useAcademyData();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  const parsedDateParam = useMemo(() => parseDateParam(dateParam), [dateParam]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(parsedDateParam);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const base = parsedDateParam || new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [items, setItems] = useState<AcademyAgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<AppointmentType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<AgendaSource | 'all'>('all');

  useEffect(() => {
    setSelectedDate(parsedDateParam);
    if (parsedDateParam) {
      setVisibleMonth(new Date(parsedDateParam.getFullYear(), parsedDateParam.getMonth(), 1));
    }
  }, [parsedDateParam]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!academyStudents.length) {
        setItems([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      const studentIds = academyStudents.map((student) => student.id);

      const [appointmentsResult, workoutResults] = await Promise.all([
        fetchAppointmentsForStudents(studentIds),
        Promise.all(
          academyStudents.map(async (student) => ({
            student,
            result: await fetchUserWorkouts(student.id, false),
          }))
        ),
      ]);

      if (!active) return;
      const nextErrors: string[] = [];
      if (appointmentsResult.error) nextErrors.push(appointmentsResult.error);

      const appointmentItems: AcademyAgendaItem[] = (appointmentsResult.data || []).map((appointment) => ({
        ...appointment,
        source: 'appointment',
        route: `/schedule/${appointment.id}`,
      }));

      const workoutItems = workoutResults.flatMap(({ student, result }) => {
        if (result.error) nextErrors.push(`${student.name}: ${result.error}`);
        const workouts = result.data || [];
        return workouts.flatMap((workout) =>
          buildWorkoutAgendaItems(student.id, student.name, student.personalName || 'Personal', workout)
        );
      });

      const merged = [...appointmentItems, ...workoutItems].sort(
        (a, b) => b.data.getTime() - a.data.getTime()
      );
      setItems(merged);
      setError(nextErrors.join(' | '));
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [academyStudents]);

  const scopedByFilters = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== 'all' && item.tipo !== typeFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
      if (!term) return true;
      const studentName = (item.alunoNome || '').toLowerCase();
      const personalName = (item.personalNome || '').toLowerCase();
      const serviceName = (item.servico || '').toLowerCase();
      return (
        studentName.includes(term) ||
        personalName.includes(term) ||
        serviceName.includes(term)
      );
    });
  }, [items, query, typeFilter, statusFilter, sourceFilter]);

  const filtered = useMemo(() => {
    if (!selectedDate) return scopedByFilters;
    const selectedKey = getDateKey(selectedDate);
    return scopedByFilters.filter((item) => getDateKey(item.data) === selectedKey);
  }, [scopedByFilters, selectedDate]);

  const displayItems = useMemo(() => {
    const list = [...filtered];
    if (selectedDate) {
      return list.sort((a, b) => a.data.getTime() - b.data.getTime());
    }
    const now = Date.now();
    return list.sort((a, b) => {
      const aTime = a.data.getTime();
      const bTime = b.data.getTime();
      const aFuture = aTime >= now;
      const bFuture = bTime >= now;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      return aFuture ? aTime - bTime : bTime - aTime;
    });
  }, [filtered, selectedDate]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return scopedByFilters.filter((item) => item.data >= now);
  }, [scopedByFilters]);

  const nextEvent = useMemo(() => {
    const now = new Date();
    return [...scopedByFilters]
      .filter((item) => item.data >= now)
      .sort((a, b) => a.data.getTime() - b.data.getTime())[0];
  }, [scopedByFilters]);

  const totalFromWorkouts = useMemo(
    () => items.filter((item) => item.source === 'workout').length,
    [items]
  );

  const totalAppointments = useMemo(
    () => items.filter((item) => item.source === 'appointment').length,
    [items]
  );

  const dateLabel = selectedDate ? formatDate(selectedDate) : '';

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        month: 'long',
        year: 'numeric',
      }).format(visibleMonth),
    [visibleMonth]
  );

  const eventCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    scopedByFilters.forEach((item) => {
      const key = getDateKey(item.data);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [scopedByFilters]);

  const calendarDays = useMemo(() => {
    const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const firstVisible = new Date(monthStart);
    firstVisible.setDate(monthStart.getDate() - monthStart.getDay());
    const today = new Date();

    return Array.from({ length: 42 }, (_, index) => {
      const current = new Date(firstVisible);
      current.setDate(firstVisible.getDate() + index);
      const key = getDateKey(current);
      return {
        key,
        date: current,
        inCurrentMonth:
          current.getMonth() === visibleMonth.getMonth() &&
          current.getFullYear() === visibleMonth.getFullYear(),
        isToday: sameDay(current, today),
        eventCount: eventCountByDate.get(key) || 0,
      };
    });
  }, [visibleMonth, eventCountByDate]);

  const handleShiftMonth = (step: number) => {
    setVisibleMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + step, 1)
    );
  };

  const handleSelectDay = (day: Date) => {
    setSelectedDate(day);
    if (
      day.getMonth() !== visibleMonth.getMonth() ||
      day.getFullYear() !== visibleMonth.getFullYear()
    ) {
      setVisibleMonth(new Date(day.getFullYear(), day.getMonth(), 1));
    }
  };

  const handleToday = () => {
    const now = new Date();
    setSelectedDate(now);
    setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  return (
    <PageShell
      title="Agenda da academia"
      description="Agendamentos formais e treinos planejados da base da academia."
      actions={[{ label: 'Criar agendamento', href: '/schedule/create' }]}
    >
      <AcademyGate>
        {academyError && (
          <div className="academy-alert is-danger" style={{ marginBottom: 20 }}>
            <div>
              <strong>Erro ao carregar</strong>
              <span>{academyError}</span>
            </div>
          </div>
        )}

        <div className="academy-dashboard academy-revamp academy-agenda-page">
          <section className="academy-command academy-agenda-hero">
            <div className="academy-command-left">
              <p className="academy-command-kicker">Agenda operacional</p>
              <h2 className="academy-command-title">
                Rotina completa da academia com dados de agenda e treino.
              </h2>
              <p className="academy-command-lead">
                Visibilidade restrita aos alunos registrados pela academia, sem incluir carteiras freelancers.
              </p>
              <div className="academy-command-actions">
                <Link href="/schedule/create" className="button">
                  Novo agendamento
                </Link>
                <Link href="/academy/students" className="button secondary">
                  Ver alunos da academia
                </Link>
              </div>
            </div>
            <div className="academy-command-right">
              <div className="academy-signal-grid">
                <div className="academy-signal-card">
                  <span>Total</span>
                  <strong>{loading ? '...' : items.length}</strong>
                  <small>Eventos</small>
                </div>
                <div className="academy-signal-card">
                  <span>Agendamentos</span>
                  <strong>{loading ? '...' : totalAppointments}</strong>
                  <small>Calendario</small>
                </div>
                <div className="academy-signal-card">
                  <span>Treinos</span>
                  <strong>{loading ? '...' : totalFromWorkouts}</strong>
                  <small>Planejados</small>
                </div>
                <div className="academy-signal-card">
                  <span>Proximos</span>
                  <strong>{loading ? '...' : upcoming.length}</strong>
                  <small>Em aberto</small>
                </div>
              </div>
            </div>
          </section>

          <section className="academy-agenda-workspace">
            <aside className="academy-block academy-agenda-calendar">
              <div className="academy-agenda-calendar-head">
                <div>
                  <p className="academy-block-kicker">Calendario da agenda</p>
                  <h3 className="academy-agenda-month">{monthLabel}</h3>
                  <p className="subtle">
                    {selectedDate
                      ? `Visualizando o dia ${dateLabel}.`
                      : 'Selecione um dia para filtrar compromissos e treinos.'}
                  </p>
                </div>
                <div className="academy-agenda-calendar-controls">
                  <button
                    type="button"
                    className="button secondary sm"
                    onClick={() => handleShiftMonth(-1)}
                    aria-label="Mes anterior"
                  >
                    {'<'}
                  </button>
                  <button type="button" className="button secondary sm" onClick={handleToday}>
                    Hoje
                  </button>
                  <button
                    type="button"
                    className="button secondary sm"
                    onClick={() => handleShiftMonth(1)}
                    aria-label="Proximo mes"
                  >
                    {'>'}
                  </button>
                </div>
              </div>

              <div className="academy-agenda-weekdays">
                {WEEKDAY_LABELS.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>

              <div className="academy-agenda-days">
                {calendarDays.map((day) => (
                  <button
                    key={day.key}
                    type="button"
                    className={`academy-agenda-day ${day.inCurrentMonth ? '' : 'is-outside'} ${
                      day.isToday ? 'is-today' : ''
                    } ${selectedDate && sameDay(day.date, selectedDate) ? 'is-selected' : ''}`}
                    onClick={() => handleSelectDay(day.date)}
                  >
                    <span>{day.date.getDate()}</span>
                    {day.eventCount > 0 && <small>{day.eventCount}</small>}
                  </button>
                ))}
              </div>

              <div className="academy-agenda-calendar-foot">
                <span>
                  {nextEvent
                    ? `Proximo evento: ${formatDate(nextEvent.data)}${nextEvent.horaInicio ? ` as ${nextEvent.horaInicio}` : ''}.`
                    : 'Sem proximos eventos na agenda.'}
                </span>
                {selectedDate && (
                  <button
                    type="button"
                    className="button secondary sm"
                    onClick={() => setSelectedDate(null)}
                  >
                    Limpar dia
                  </button>
                )}
              </div>
            </aside>

            <section className="academy-block academy-agenda-list">
              <div className="academy-agenda-header">
                <div>
                  <p className="academy-block-kicker">Agenda unificada</p>
                  <h3>Compromissos e treinos da base da academia</h3>
                  <p className="subtle">Busca por aluno, personal e servico.</p>
                </div>
                <div className="academy-agenda-filters">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar aluno, personal ou treino"
                  />
                  <select
                    value={sourceFilter}
                    onChange={(event) => setSourceFilter(event.target.value as AgendaSource | 'all')}
                  >
                    <option value="all">Origem</option>
                    <option value="appointment">Agenda</option>
                    <option value="workout">Treino</option>
                  </select>
                  <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value as AppointmentType | 'all')}
                  >
                    <option value="all">Tipo</option>
                    {Object.entries(TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as AppointmentStatus | 'all')}
                  >
                    <option value="all">Status</option>
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="academy-agenda-focus">
                <span>{selectedDate ? `Dia selecionado: ${dateLabel}` : 'Visao geral ativa'}</span>
                <strong>{displayItems.length} resultado(s)</strong>
              </div>

              {loadingAcademy || loading ? (
                <p className="subtle">Carregando agenda...</p>
              ) : error ? (
                <p className="academy-error">{error}</p>
              ) : displayItems.length ? (
                <div className="academy-agenda-grid">
                  {displayItems.map((item) => (
                    <div key={item.id} className={`academy-agenda-card is-${item.source}`}>
                      <div className="academy-agenda-card-header">
                        <div>
                          <strong>{item.alunoNome || 'Aluno'}</strong>
                          <span>{item.personalNome || 'Personal'}</span>
                        </div>
                        <span
                          className="academy-agenda-pill"
                          style={{ background: getAppointmentTypeColor(item.tipo) }}
                        >
                          {TYPE_LABELS[item.tipo] || item.tipo}
                        </span>
                      </div>
                      <div className="academy-agenda-meta">
                        <span>{formatDate(item.data)}</span>
                        {!!item.horaInicio && <span>{item.horaInicio}</span>}
                        <span
                          className="academy-agenda-pill"
                          style={{ background: getAppointmentStatusColor(item.status) }}
                        >
                          {STATUS_LABELS[item.status] || item.status}
                        </span>
                        <span className={`academy-agenda-source is-${item.source}`}>
                          {item.source === 'appointment' ? 'Agenda' : 'Treino'}
                        </span>
                      </div>
                      <div className="academy-agenda-actions">
                        <Link href={item.route} className="button secondary sm">
                          Abrir
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="subtle">Nenhum evento encontrado para os filtros atuais.</p>
              )}
            </section>
          </section>
        </div>
      </AcademyGate>
    </PageShell>
  );
}
