import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { PaymentRecord } from '../types/finance';

interface QueryResult<T> {
  data: T | null;
  error: string | null;
}

const mapPayment = (id: string, data: any): PaymentRecord => ({
  id,
  valorDaCombranca: data.valorDaCombranca,
  todoDiaDoMes: data.todoDiaDoMes,
  descricao: data.descricao,
  pago: data.Pago ?? false,
  repetirPMes: data.repetirPMes,
  diaDoPagamento: data.diaDoPagamento,
  datas: (data.datas || []).map((item: any) =>
    item?.toDate ? item.toDate() : new Date(item)
  ),
  checkoutUrl: data.checkoutUrl || data.checkout_url,
  stripeSessionId: data.stripeSessionId || data.stripe_session_id,
  stripePaymentIntentId: data.stripePaymentIntentId || data.paymentIntentId,
  stripeStatus: data.stripeStatus || data.status,
  academyCode: data.academyCode ?? data.codigoAcademia,
  personalCode: data.personalCode ?? data.codigoPersonal,
  planName: data.planName ?? data.nomePlano,
  createdByAcademy: data.createdByAcademy ?? data.criadoPelaAcademia ?? false,
  academyId: data.academyId,
});

export async function fetchPaymentsForUser(
  userId: string
): Promise<QueryResult<PaymentRecord[]>> {
  try {
    const ref = collection(db, 'users', userId, 'pagamentos');
    const snapshot = await getDocs(ref);
    const payments = snapshot.docs.map((docItem) => mapPayment(docItem.id, docItem.data()));
    return { data: payments, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function createPaymentForUser(
  userId: string,
  data: Omit<PaymentRecord, 'id'>
): Promise<QueryResult<PaymentRecord>> {
  try {
    const ref = collection(db, 'users', userId, 'pagamentos');
    const docRef = await addDoc(ref, {
      valorDaCombranca: data.valorDaCombranca ?? 0,
      todoDiaDoMes: data.todoDiaDoMes ?? null,
      descricao: data.descricao ?? '',
      Pago: data.pago ?? false,
      repetirPMes: data.repetirPMes ?? 0,
      diaDoPagamento: data.diaDoPagamento ?? data.todoDiaDoMes ?? 0,
      datas: data.datas?.map((item) => Timestamp.fromDate(item)) ?? [],
      checkoutUrl: data.checkoutUrl ?? null,
      stripeSessionId: data.stripeSessionId ?? null,
      stripePaymentIntentId: data.stripePaymentIntentId ?? null,
      stripeStatus: data.stripeStatus ?? null,
      academyCode: data.academyCode ?? null,
      personalCode: data.personalCode ?? null,
      planName: data.planName ?? null,
      createdByAcademy: data.createdByAcademy ?? false,
      academyId: data.academyId ?? null,
    });
    return { data: { id: docRef.id, ...data }, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function updatePaymentForUser(
  userId: string,
  paymentId: string,
  updates: Partial<PaymentRecord>
): Promise<QueryResult<void>> {
  try {
    const ref = doc(db, 'users', userId, 'pagamentos', paymentId);
    const payload: Record<string, any> = {};
    if (updates.valorDaCombranca !== undefined) payload.valorDaCombranca = updates.valorDaCombranca;
    if (updates.todoDiaDoMes !== undefined) payload.todoDiaDoMes = updates.todoDiaDoMes;
    if (updates.descricao !== undefined) payload.descricao = updates.descricao;
    if (updates.pago !== undefined) payload.Pago = updates.pago;
    if (updates.repetirPMes !== undefined) payload.repetirPMes = updates.repetirPMes;
    if (updates.diaDoPagamento !== undefined) payload.diaDoPagamento = updates.diaDoPagamento;
    if (updates.checkoutUrl !== undefined) payload.checkoutUrl = updates.checkoutUrl;
    if (updates.stripeSessionId !== undefined) payload.stripeSessionId = updates.stripeSessionId;
    if (updates.stripePaymentIntentId !== undefined) payload.stripePaymentIntentId = updates.stripePaymentIntentId;
    if (updates.stripeStatus !== undefined) payload.stripeStatus = updates.stripeStatus;
    if (updates.academyCode !== undefined) payload.academyCode = updates.academyCode;
    if (updates.personalCode !== undefined) payload.personalCode = updates.personalCode;
    if (updates.planName !== undefined) payload.planName = updates.planName;
    if (updates.createdByAcademy !== undefined) payload.createdByAcademy = updates.createdByAcademy;
    if (updates.academyId !== undefined) payload.academyId = updates.academyId;
    await updateDoc(ref, payload);
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}
