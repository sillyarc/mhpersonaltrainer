import { addDoc, collection, doc, getDocs, orderBy, query, updateDoc, where, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { SupportTicket } from '../types/support';

interface QueryResult<T> {
  data: T | null;
  error: string | null;
}

const mapTicket = (id: string, data: any): SupportTicket => ({
  id,
  titulo: data.titulo || 'Ticket',
  texto: data.texto || '',
  categoria: data.categoria,
  priority: data.priority,
  data: data.d?.toDate ? data.d.toDate() : data.d ? new Date(data.d) : undefined,
  userId: data.user?.id,
  resposta: data.resposta,
  fotos: data.fotos || [],
});

export async function fetchSupportTicketsForUser(
  userId: string
): Promise<QueryResult<SupportTicket[]>> {
  try {
    const ref = collection(db, 'supporte');
    const userRef = doc(db, 'users', userId);
    const q = query(ref, where('user', '==', userRef), orderBy('d', 'desc'));
    const snapshot = await getDocs(q);
    const tickets = snapshot.docs.map((docItem) => mapTicket(docItem.id, docItem.data()));
    return { data: tickets, error: null };
  } catch (error: any) {
    try {
      const ref = collection(db, 'supporte');
      const userRef = doc(db, 'users', userId);
      const q = query(ref, where('user', '==', userRef));
      const snapshot = await getDocs(q);
      const tickets = snapshot.docs.map((docItem) => mapTicket(docItem.id, docItem.data()));
      tickets.sort((a, b) => {
        const aTime = a.data?.getTime?.() || 0;
        const bTime = b.data?.getTime?.() || 0;
        return bTime - aTime;
      });
      return { data: tickets, error: null };
    } catch (fallbackError: any) {
      return { data: null, error: fallbackError.message || error.message };
    }
  }
}

export async function fetchAllSupportTickets(): Promise<QueryResult<SupportTicket[]>> {
  try {
    const ref = collection(db, 'supporte');
    const q = query(ref, orderBy('d', 'desc'));
    const snapshot = await getDocs(q);
    const tickets = snapshot.docs.map((docItem) => mapTicket(docItem.id, docItem.data()));
    return { data: tickets, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function createSupportTicket(
  userId: string,
  ticket: Omit<SupportTicket, 'id' | 'data' | 'userId'>
): Promise<QueryResult<SupportTicket>> {
  try {
    const ref = collection(db, 'supporte');
    const userRef = doc(db, 'users', userId);
    const docRef = await addDoc(ref, {
      titulo: ticket.titulo,
      texto: ticket.texto,
      categoria: ticket.categoria || 'Outro',
      priority: ticket.priority || 'Baixa',
      d: Timestamp.now(),
      user: userRef,
      resposta: ticket.resposta || '',
      fotos: ticket.fotos || [],
    });
    return {
      data: {
        id: docRef.id,
        ...ticket,
        userId,
        data: new Date(),
      },
      error: null,
    };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function updateSupportTicketResponse(
  ticketId: string,
  responseText: string
): Promise<QueryResult<void>> {
  try {
    const ref = doc(db, 'supporte', ticketId);
    await updateDoc(ref, { resposta: responseText });
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}
