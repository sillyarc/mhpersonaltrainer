import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  Appointment,
  AppointmentType,
  AppointmentStatus,
  AvailableSlot,
  TimeSlot,
} from '../types/scheduling';

const APPOINTMENTS_COLLECTION = 'agendamento_mh_agendamento';

interface FetchResult<T> {
  data?: T;
  error?: string;
}

export function convertFirebaseTimestamp(timestamp: any): Date {
  if (timestamp?.toDate) {
    return timestamp.toDate();
  }
  if (timestamp instanceof Date) {
    return timestamp;
  }
  if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    return new Date(timestamp);
  }
  return new Date();
}

export async function fetchAppointments(
  userId: string,
  isPersonal: boolean = false
): Promise<FetchResult<Appointment[]>> {
  try {
    const appointmentsRef = collection(db, APPOINTMENTS_COLLECTION);
    const fieldToQuery = isPersonal ? 'personalId' : 'alunoId';
    const q = query(
      appointmentsRef,
      where(fieldToQuery, '==', userId),
      orderBy('data', 'desc')
    );

    const snapshot = await getDocs(q);
    const appointments: Appointment[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        alunoId: data.alunoId,
        personalId: data.personalId,
        alunoNome: data.alunoNome,
        personalNome: data.personalNome,
        data: convertFirebaseTimestamp(data.data),
        horaInicio: data.horaInicio,
        horaFim: data.horaFim,
        tipo: data.tipo as AppointmentType,
        status: data.status as AppointmentStatus,
        servico: data.servico,
        valor: data.valor,
        observacoes: data.observacoes,
        local: data.local,
        createdAt: convertFirebaseTimestamp(data.createdAt),
        updatedAt: data.updatedAt ? convertFirebaseTimestamp(data.updatedAt) : undefined,
      };
    });

    return { data: appointments };
  } catch (error: any) {
    try {
      const appointmentsRef = collection(db, APPOINTMENTS_COLLECTION);
      const fieldToQuery = isPersonal ? 'personalId' : 'alunoId';
      const q = query(appointmentsRef, where(fieldToQuery, '==', userId));
      const snapshot = await getDocs(q);
      const appointments: Appointment[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          alunoId: data.alunoId,
          personalId: data.personalId,
          alunoNome: data.alunoNome,
          personalNome: data.personalNome,
          data: convertFirebaseTimestamp(data.data),
          horaInicio: data.horaInicio,
          horaFim: data.horaFim,
          tipo: data.tipo as AppointmentType,
          status: data.status as AppointmentStatus,
          servico: data.servico,
          valor: data.valor,
          observacoes: data.observacoes,
          local: data.local,
          createdAt: convertFirebaseTimestamp(data.createdAt),
          updatedAt: data.updatedAt ? convertFirebaseTimestamp(data.updatedAt) : undefined,
        };
      });
      appointments.sort((a, b) => b.data.getTime() - a.data.getTime());
      return { data: appointments };
    } catch (fallbackError: any) {
      console.error('Error fetching appointments:', fallbackError);
      return { error: fallbackError.message || error.message || 'Erro ao buscar agendamentos' };
    }
  }
}

export async function fetchAppointmentById(
  appointmentId: string
): Promise<FetchResult<Appointment>> {
  try {
    const docRef = doc(db, APPOINTMENTS_COLLECTION, appointmentId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return { error: 'Agendamento não encontrado' };
    }

    const data = docSnap.data();
    const appointment: Appointment = {
      id: docSnap.id,
      alunoId: data.alunoId,
      personalId: data.personalId,
      alunoNome: data.alunoNome,
      personalNome: data.personalNome,
      data: convertFirebaseTimestamp(data.data),
      horaInicio: data.horaInicio,
      horaFim: data.horaFim,
      tipo: data.tipo as AppointmentType,
      status: data.status as AppointmentStatus,
      servico: data.servico,
      valor: data.valor,
      observacoes: data.observacoes,
      local: data.local,
      createdAt: convertFirebaseTimestamp(data.createdAt),
      updatedAt: data.updatedAt ? convertFirebaseTimestamp(data.updatedAt) : undefined,
    };

    return { data: appointment };
  } catch (error: any) {
    console.error('Error fetching appointment:', error);
    return { error: error.message || 'Erro ao buscar agendamento' };
  }
}

export async function createAppointment(
  appointmentData: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<FetchResult<string>> {
  try {
    const appointmentsRef = collection(db, APPOINTMENTS_COLLECTION);
    const docRef = await addDoc(appointmentsRef, {
      ...appointmentData,
      data: Timestamp.fromDate(appointmentData.data),
      createdAt: Timestamp.now(),
      status: appointmentData.status || 'agendado',
    });

    return { data: docRef.id };
  } catch (error: any) {
    console.error('Error creating appointment:', error);
    return { error: error.message || 'Erro ao criar agendamento' };
  }
}

export async function updateAppointment(
  appointmentId: string,
  updates: Partial<Appointment>
): Promise<FetchResult<boolean>> {
  try {
    const docRef = doc(db, APPOINTMENTS_COLLECTION, appointmentId);
    const updateData: any = {
      ...updates,
      updatedAt: Timestamp.now(),
    };

    if (updates.data) {
      updateData.data = Timestamp.fromDate(updates.data);
    }

    await updateDoc(docRef, updateData);
    return { data: true };
  } catch (error: any) {
    console.error('Error updating appointment:', error);
    return { error: error.message || 'Erro ao atualizar agendamento' };
  }
}

export async function cancelAppointment(
  appointmentId: string
): Promise<FetchResult<boolean>> {
  return updateAppointment(appointmentId, { status: 'cancelado' });
}

export async function confirmAppointment(
  appointmentId: string
): Promise<FetchResult<boolean>> {
  return updateAppointment(appointmentId, { status: 'confirmado' });
}

export async function completeAppointment(
  appointmentId: string
): Promise<FetchResult<boolean>> {
  return updateAppointment(appointmentId, { status: 'concluido' });
}

export async function deleteAppointment(
  appointmentId: string
): Promise<FetchResult<boolean>> {
  try {
    const docRef = doc(db, APPOINTMENTS_COLLECTION, appointmentId);
    await deleteDoc(docRef);
    return { data: true };
  } catch (error: any) {
    console.error('Error deleting appointment:', error);
    return { error: error.message || 'Erro ao excluir agendamento' };
  }
}

export async function fetchAppointmentsByDate(
  userId: string,
  date: Date,
  isPersonal: boolean = false
): Promise<FetchResult<Appointment[]>> {
  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const appointmentsRef = collection(db, APPOINTMENTS_COLLECTION);
    const fieldToQuery = isPersonal ? 'personalId' : 'alunoId';
    const q = query(
      appointmentsRef,
      where(fieldToQuery, '==', userId),
      where('data', '>=', Timestamp.fromDate(startOfDay)),
      where('data', '<=', Timestamp.fromDate(endOfDay)),
      orderBy('data', 'asc')
    );

    const snapshot = await getDocs(q);
    const appointments: Appointment[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        alunoId: data.alunoId,
        personalId: data.personalId,
        alunoNome: data.alunoNome,
        personalNome: data.personalNome,
        data: convertFirebaseTimestamp(data.data),
        horaInicio: data.horaInicio,
        horaFim: data.horaFim,
        tipo: data.tipo as AppointmentType,
        status: data.status as AppointmentStatus,
        servico: data.servico,
        valor: data.valor,
        observacoes: data.observacoes,
        local: data.local,
        createdAt: convertFirebaseTimestamp(data.createdAt),
        updatedAt: data.updatedAt ? convertFirebaseTimestamp(data.updatedAt) : undefined,
      };
    });

    return { data: appointments };
  } catch (error: any) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const appointmentsRef = collection(db, APPOINTMENTS_COLLECTION);
      const fieldToQuery = isPersonal ? 'personalId' : 'alunoId';
      const q = query(appointmentsRef, where(fieldToQuery, '==', userId));
      const snapshot = await getDocs(q);
      const appointments: Appointment[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          alunoId: data.alunoId,
          personalId: data.personalId,
          alunoNome: data.alunoNome,
          personalNome: data.personalNome,
          data: convertFirebaseTimestamp(data.data),
          horaInicio: data.horaInicio,
          horaFim: data.horaFim,
          tipo: data.tipo as AppointmentType,
          status: data.status as AppointmentStatus,
          servico: data.servico,
          valor: data.valor,
          observacoes: data.observacoes,
          local: data.local,
          createdAt: convertFirebaseTimestamp(data.createdAt),
          updatedAt: data.updatedAt ? convertFirebaseTimestamp(data.updatedAt) : undefined,
        };
      });

      const filtered = appointments.filter((apt) => apt.data >= startOfDay && apt.data <= endOfDay);
      filtered.sort((a, b) => a.data.getTime() - b.data.getTime());
      return { data: filtered };
    } catch (fallbackError: any) {
      console.error('Error fetching appointments by date:', fallbackError);
      return { error: fallbackError.message || error.message || 'Erro ao buscar agendamentos por data' };
    }
  }
}

export async function fetchAppointmentsForStudents(
  studentIds: string[]
): Promise<FetchResult<Appointment[]>> {
  try {
    if (!studentIds.length) return { data: [] };
    const appointmentsRef = collection(db, APPOINTMENTS_COLLECTION);
    const chunks: string[][] = [];
    for (let i = 0; i < studentIds.length; i += 10) {
      chunks.push(studentIds.slice(i, i + 10));
    }
    const snapshots = await Promise.all(
      chunks.map((ids) => getDocs(query(appointmentsRef, where('alunoId', 'in', ids))))
    );

    const appointments: Appointment[] = [];
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        appointments.push({
          id: docSnap.id,
          alunoId: data.alunoId,
          personalId: data.personalId,
          alunoNome: data.alunoNome,
          personalNome: data.personalNome,
          data: convertFirebaseTimestamp(data.data),
          horaInicio: data.horaInicio,
          horaFim: data.horaFim,
          tipo: data.tipo as AppointmentType,
          status: data.status as AppointmentStatus,
          servico: data.servico,
          valor: data.valor,
          observacoes: data.observacoes,
          local: data.local,
          createdAt: convertFirebaseTimestamp(data.createdAt),
          updatedAt: data.updatedAt ? convertFirebaseTimestamp(data.updatedAt) : undefined,
        });
      });
    });

    appointments.sort((a, b) => b.data.getTime() - a.data.getTime());
    return { data: appointments };
  } catch (error: any) {
    console.error('Error fetching appointments for students:', error);
    return { error: error.message || 'Erro ao buscar agendamentos' };
  }
}

export function generateTimeSlots(
  startHour: number = 6,
  endHour: number = 22,
  intervalMinutes: number = 60
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  
  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += intervalMinutes) {
      const startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const endMinute = minute + intervalMinutes;
      const endHourAdjusted = hour + Math.floor(endMinute / 60);
      const endMinuteAdjusted = endMinute % 60;
      const endTime = `${endHourAdjusted.toString().padStart(2, '0')}:${endMinuteAdjusted.toString().padStart(2, '0')}`;
      
      slots.push({
        inicio: startTime,
        fim: endTime,
        disponivel: true,
      });
    }
  }
  
  return slots;
}

export async function getAvailableSlots(
  personalId: string,
  date: Date
): Promise<FetchResult<AvailableSlot>> {
  try {
    const result = await fetchAppointmentsByDate(personalId, date, true);
    
    if (result.error) {
      return { error: result.error };
    }

    const bookedAppointments = result.data || [];
    const allSlots = generateTimeSlots();

    const slotsWithAvailability = allSlots.map((slot) => {
      const isBooked = bookedAppointments.some(
        (apt) => apt.horaInicio === slot.inicio && apt.status !== 'cancelado'
      );
      return {
        ...slot,
        disponivel: !isBooked,
        appointmentId: isBooked
          ? bookedAppointments.find((apt) => apt.horaInicio === slot.inicio)?.id
          : undefined,
      };
    });

    return {
      data: {
        date,
        slots: slotsWithAvailability,
      },
    };
  } catch (error: any) {
    console.error('Error getting available slots:', error);
    return { error: error.message || 'Erro ao buscar horários disponíveis' };
  }
}

export function getAppointmentTypeLabel(type: AppointmentType): string {
  const labels: Record<AppointmentType, string> = {
    treino: 'Treino',
    avaliacao: 'Avaliação',
    consulta: 'Consulta',
    acompanhamento: 'Acompanhamento',
    online: 'Online',
    presencial: 'Presencial',
  };
  return labels[type] || type;
}

export function getAppointmentStatusLabel(status: AppointmentStatus): string {
  const labels: Record<AppointmentStatus, string> = {
    agendado: 'Agendado',
    confirmado: 'Confirmado',
    em_andamento: 'Em Andamento',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
    reagendado: 'Reagendado',
    nao_compareceu: 'Não Compareceu',
  };
  return labels[status] || status;
}

export function getAppointmentStatusColor(status: AppointmentStatus): string {
  const colors: Record<AppointmentStatus, string> = {
    agendado: '#4361ee',
    confirmado: '#06d6a0',
    em_andamento: '#ffd166',
    concluido: '#06d6a0',
    cancelado: '#ef476f',
    reagendado: '#118ab2',
    nao_compareceu: '#ef476f',
  };
  return colors[status] || '#4361ee';
}

export function getAppointmentTypeColor(type: AppointmentType): string {
  const colors: Record<AppointmentType, string> = {
    treino: '#4361ee',
    avaliacao: '#7209b7',
    consulta: '#f72585',
    acompanhamento: '#118ab2',
    online: '#06d6a0',
    presencial: '#ffd166',
  };
  return colors[type] || '#4361ee';
}
