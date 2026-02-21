export interface Appointment {
  id: string;
  alunoId: string;
  personalId: string;
  alunoNome?: string;
  personalNome?: string;
  data: Date;
  horaInicio: string;
  horaFim: string;
  tipo: AppointmentType;
  status: AppointmentStatus;
  servico?: string;
  valor?: number;
  observacoes?: string;
  local?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export type AppointmentType = 
  | 'treino'
  | 'avaliacao'
  | 'consulta'
  | 'acompanhamento'
  | 'online'
  | 'presencial';

export type AppointmentStatus = 
  | 'agendado'
  | 'confirmado'
  | 'em_andamento'
  | 'concluido'
  | 'cancelado'
  | 'reagendado'
  | 'nao_compareceu';

export interface AvailableSlot {
  date: Date;
  slots: TimeSlot[];
}

export interface TimeSlot {
  inicio: string;
  fim: string;
  disponivel: boolean;
  appointmentId?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  startTime: string;
  endTime: string;
  type: AppointmentType;
  status: AppointmentStatus;
  color?: string;
}

export interface SchedulingState {
  appointments: Appointment[];
  selectedDate: Date | null;
  availableSlots: AvailableSlot[];
  isLoading: boolean;
}
