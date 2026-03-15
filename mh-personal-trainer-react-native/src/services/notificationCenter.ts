import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { NotificationItem } from '../types/notification';
import { EvaluationType } from '../types/evaluation';
import { WorkoutSessionStatus } from '../types/workout';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { sendPushNotificationToUser } from './notifications';
import { firestoreService } from './firestoreService';

interface QueryResult<T> {
  data: T | null;
  error: string | null;
}

const mapNotification = (id: string, data: any): NotificationItem => ({
  id,
  titulo: data.titulo || 'Notificacao',
  descricao: data.descricao || '',
  data: data.data?.toDate ? data.data.toDate() : data.data ? new Date(data.data) : undefined,
  para: data.para,
  paraTodos: data.paraTodos || false,
  tipo: data.tipo,
  treinoId: data.treino?.id,
  workoutUserId: data.treino?.userId,
  avOnlineId: data.avOnline?.id,
  evaluationId: data.avaliacao?.id,
  evaluationType: data.avaliacao?.type,
  evaluationUserId: data.avaliacao?.userId,
  unread: data.unread !== false,
  readBy: Array.isArray(data.readBy) ? data.readBy.filter((item: unknown) => typeof item === 'string') : [],
  securityEvent: Boolean(data.securityEvent),
  securityStatus: data.securityStatus,
  securityResolvedAt: data.securityResolvedAt?.toDate
    ? data.securityResolvedAt.toDate()
    : data.securityResolvedAt
      ? new Date(data.securityResolvedAt)
      : undefined,
  securityResolvedBy: data.securityResolvedBy,
  loginMeta: data.loginMeta,
});

const formatSecurityDate = (value: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);

const getMobileDeviceLabel = () => {
  const model = Device.modelName || 'Dispositivo movel';
  const osName = Device.osName || Platform.OS;
  return `${osName} - ${model}`;
};

const hasValidPersonalCode = (value?: string | number | null) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return value > 0;
  const trimmed = String(value).trim();
  return trimmed.length > 0 && trimmed !== '0';
};

const formatEvaluationTypeLabel = (type?: EvaluationType) => {
  const labels: Record<EvaluationType, string> = {
    online: 'avaliacao online',
    personalizada: 'avaliacao personalizada',
    postural: 'avaliacao postural',
    fisica: 'avaliacao fisica',
  };
  return type ? labels[type] || 'avaliacao' : 'avaliacao';
};

async function resolvePersonalNotificationTarget(personalCode?: string | number | null) {
  if (!hasValidPersonalCode(personalCode)) return null;
  try {
    const profile = await firestoreService.getPersonalProfileByCode(personalCode as string | number);
    if (!profile?.uid) return null;
    return {
      userId: profile.uid,
      name: profile.displayName || 'Personal',
    };
  } catch (error) {
    console.error('Error resolving personal notification target:', error);
    return null;
  }
}

const formatExerciseCountLabel = (count?: number) => {
  const total = Math.max(0, Number(count || 0));
  return `${total} exercicio${total === 1 ? '' : 's'}`;
};

export const isNotificationUnreadForUser = (
  notification: Pick<NotificationItem, 'paraTodos' | 'readBy' | 'unread'>,
  userId: string
) => {
  if (!userId) return false;
  if (Array.isArray(notification.readBy) && notification.readBy.includes(userId)) {
    return false;
  }
  if (notification.unread === false && !notification.paraTodos) {
    return false;
  }
  return true;
};

export const isNotificationPendingForUser = (
  notification: Pick<
    NotificationItem,
    'paraTodos' | 'readBy' | 'unread' | 'securityEvent' | 'securityStatus'
  >,
  userId: string
) => {
  const requiresSecurityResponse =
    Boolean(notification.securityEvent) &&
    (!notification.securityStatus || notification.securityStatus === 'pending');

  return requiresSecurityResponse || (
    isNotificationUnreadForUser(notification, userId) &&
    !notification.securityEvent
  );
};

const getPublicIpAddress = async (): Promise<string> => {
  try {
    const response = await fetch('https://api64.ipify.org?format=json');
    if (!response.ok) return 'IP indisponivel';
    const payload = (await response.json()) as { ip?: string };
    return payload.ip || 'IP indisponivel';
  } catch (_) {
    return 'IP indisponivel';
  }
};

async function fetchAdminUserIds(): Promise<string[]> {
  try {
    const usersRef = collection(db, 'users');
    const [booleanAdmins, stringAdmins] = await Promise.all([
      getDocs(query(usersRef, where('admin', '==', true))),
      getDocs(query(usersRef, where('admin', '==', 'true'))),
    ]);

    const ids = new Set<string>();
    booleanAdmins.forEach((docItem) => ids.add(docItem.id));
    stringAdmins.forEach((docItem) => ids.add(docItem.id));
    return Array.from(ids);
  } catch (error) {
    console.error('Error fetching admin users:', error);
    return [];
  }
}

async function createAdminNotifications(
  payload: { titulo: string; descricao: string; tipo?: string; excludeUserId?: string }
) {
  const adminIds = await fetchAdminUserIds();
  if (!adminIds.length) return;
  const targets = payload.excludeUserId
    ? adminIds.filter((id) => id !== payload.excludeUserId)
    : adminIds;
  if (!targets.length) return;

  await Promise.all(
    targets.map((adminId) =>
      addDoc(collection(db, 'notificacao'), {
        titulo: payload.titulo,
        descricao: payload.descricao,
        tipo: payload.tipo || 'Sistema',
        para: adminId,
        paraTodos: false,
        data: Timestamp.now(),
        unread: true,
        readBy: [],
      })
    )
  );
}

export async function fetchNotificationsForUser(
  userId: string
): Promise<QueryResult<NotificationItem[]>> {
  try {
    const ref = collection(db, 'notificacao');
    const userQuery = query(ref, where('para', '==', userId), orderBy('data', 'desc'));
    const allQuery = query(ref, where('paraTodos', '==', true), orderBy('data', 'desc'));

    const [userSnapshot, allSnapshot] = await Promise.all([
      getDocs(userQuery),
      getDocs(allQuery),
    ]);

    const merged = new Map<string, NotificationItem>();
    userSnapshot.forEach((docItem) => {
      merged.set(docItem.id, mapNotification(docItem.id, docItem.data()));
    });
    allSnapshot.forEach((docItem) => {
      if (!merged.has(docItem.id)) {
        merged.set(docItem.id, mapNotification(docItem.id, docItem.data()));
      }
    });

    const result = Array.from(merged.values()).sort((a, b) => {
      const aTime = a.data ? a.data.getTime() : 0;
      const bTime = b.data ? b.data.getTime() : 0;
      return bTime - aTime;
    });

    return { data: result, error: null };
  } catch (error: any) {
    try {
      const ref = collection(db, 'notificacao');
      const snapshot = await getDocs(ref);
      const allItems = snapshot.docs.map((docItem) => mapNotification(docItem.id, docItem.data()));
      const filtered = allItems.filter(
        (item) => item.para === userId || item.paraTodos
      );
      filtered.sort((a, b) => {
        const aTime = a.data ? a.data.getTime() : 0;
        const bTime = b.data ? b.data.getTime() : 0;
        return bTime - aTime;
      });
      return { data: filtered, error: null };
    } catch (fallbackError: any) {
      return { data: null, error: fallbackError.message || error.message };
    }
  }
}

export async function createNotification(
  payload: Omit<NotificationItem, 'id' | 'data'>
): Promise<QueryResult<NotificationItem>> {
  try {
    const ref = collection(db, 'notificacao');
    const notificationData: Record<string, any> = {
      titulo: payload.titulo,
      descricao: payload.descricao,
      tipo: payload.tipo || 'Sistema',
      para: payload.para || null,
      paraTodos: payload.paraTodos || false,
      data: Timestamp.now(),
      unread: payload.unread ?? true,
      readBy: Array.isArray(payload.readBy) ? payload.readBy : [],
    };
    if (payload.treinoId) {
      notificationData.treino = {
        id: payload.treinoId,
        userId: payload.workoutUserId || payload.para || null,
      };
    }
    if (payload.avOnlineId) {
      notificationData.avOnline = { id: payload.avOnlineId };
    }
    if (payload.evaluationId) {
      notificationData.avaliacao = {
        id: payload.evaluationId,
        type: payload.evaluationType,
        userId: payload.evaluationUserId || payload.para || null,
      };
    }
    if (payload.securityEvent) {
      notificationData.securityEvent = true;
    }
    if (payload.securityStatus) {
      notificationData.securityStatus = payload.securityStatus;
    }
    if (payload.loginMeta) {
      notificationData.loginMeta = payload.loginMeta;
    }

    const docRef = await addDoc(ref, notificationData);
    return {
      data: {
        id: docRef.id,
        ...payload,
        data: new Date(),
      },
      error: null,
    };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function notifyAdminsUserOnline(payload: {
  userId: string;
  userName?: string;
  userEmail?: string;
  isPersonal?: boolean;
}) {
  try {
    const name = payload.userName?.trim() || payload.userEmail?.trim() || 'Usuario';
    const hasRole = typeof payload.isPersonal === 'boolean';
    const roleLabel = payload.isPersonal ? 'Personal' : 'Aluno';
    const roleSuffix = hasRole ? ` (${roleLabel})` : '';
    await createAdminNotifications({
      titulo: 'App aberto',
      descricao: `${name}${roleSuffix} abriu o app.`,
      tipo: 'Sistema',
      excludeUserId: payload.userId,
    });
  } catch (error) {
    console.error('Error notifying admins about app open:', error);
  }
}

export async function notifyUserLoginSecurityAlert(payload: {
  userId: string;
  userName?: string;
  loginMethod?: string;
}) {
  if (!payload.userId) return;
  try {
    const now = new Date();
    const ip = await getPublicIpAddress();
    const device = getMobileDeviceLabel();
    const method = payload.loginMethod || 'Nao informado';
    const userName = payload.userName?.trim() || 'Usuario';
    const title = 'Novo login detectado';
    const description =
      `Ola ${userName}, identificamos um novo login no aplicativo.\n` +
      `IP: ${ip}\n` +
      `Dispositivo: ${device}\n` +
      `Metodo: ${method}\n` +
      `Horario: ${formatSecurityDate(now)}\n` +
      `Foi voce que efetuou este login? Se nao foi, altere sua senha agora.`;

    await addDoc(collection(db, 'notificacao'), {
      titulo: title,
      descricao: description,
      tipo: 'Seguranca',
      para: payload.userId,
      paraTodos: false,
      data: Timestamp.now(),
      unread: true,
      readBy: [],
      securityEvent: true,
      securityStatus: 'pending',
      loginMeta: {
        ip,
        device,
        method,
        platform: Platform.OS,
        occurredAt: now.toISOString(),
      },
    });

    await sendPushNotificationToUser(payload.userId, {
      title,
      body: 'Novo login detectado. Foi voce que efetuou este acesso?',
      data: {
        type: 'security_login',
        ip,
        method,
      },
    });
  } catch (error) {
    console.error('Error notifying user login security event:', error);
  }
}

export async function respondToSecurityLoginAlert(payload: {
  notificationId: string;
  userId: string;
  decision: 'confirmed' | 'denied';
}) {
  if (!payload.notificationId || !payload.userId) return;
  await updateDoc(doc(db, 'notificacao', payload.notificationId), {
    unread: false,
    readBy: arrayUnion(payload.userId),
    securityStatus: payload.decision,
    securityResolvedAt: Timestamp.now(),
    securityResolvedBy: payload.userId,
  });
}

export async function markNotificationsAsRead(
  userId: string,
  notifications: Array<Pick<NotificationItem, 'id' | 'paraTodos'>>
): Promise<QueryResult<number>> {
  if (!userId || notifications.length === 0) {
    return { data: 0, error: null };
  }

  try {
    await Promise.all(
      notifications.map((notification) =>
        updateDoc(doc(db, 'notificacao', notification.id), {
          ...(notification.paraTodos ? {} : { unread: false }),
          readBy: arrayUnion(userId),
        })
      )
    );

    return { data: notifications.length, error: null };
  } catch (error: any) {
    return { data: null, error: error.message || 'Nao foi possivel atualizar as notificacoes.' };
  }
}

export async function countPendingNotificationsForUser(
  userId: string
): Promise<QueryResult<number>> {
  if (!userId) {
    return { data: 0, error: null };
  }

  const result = await fetchNotificationsForUser(userId);
  if (result.error || !result.data) {
    return { data: null, error: result.error || 'Nao foi possivel contar notificacoes.' };
  }

  const total = result.data.filter((item) => isNotificationPendingForUser(item, userId)).length;
  return { data: total, error: null };
}

export async function sendWorkoutCompletionReminder(payload: {
  studentId: string;
  workoutId: string;
  workoutName?: string;
  remainingExercises?: number;
  senderName?: string;
}): Promise<QueryResult<NotificationItem>> {
  if (!payload.studentId || !payload.workoutId) {
    return { data: null, error: 'Aluno ou treino invalido.' };
  }

  const senderLabel = payload.senderName?.trim() || 'Seu personal';
  const workoutLabel = payload.workoutName?.trim() || 'seu treino';
  const remainingCount = Math.max(0, Number(payload.remainingExercises || 0));
  const description =
    remainingCount > 0
      ? `${senderLabel} pediu para voce concluir "${workoutLabel}". Ainda faltam ${formatExerciseCountLabel(remainingCount)}.`
      : `${senderLabel} pediu para voce concluir "${workoutLabel}".`;

  const result = await createNotification({
    titulo: 'Lembrete de treino',
    descricao: description,
    tipo: 'Treino',
    para: payload.studentId,
    paraTodos: false,
    treinoId: payload.workoutId,
    workoutUserId: payload.studentId,
    unread: true,
    readBy: [],
  });

  if (result.error) {
    return result;
  }

  await sendPushNotificationToUser(payload.studentId, {
    title: 'Lembrete de treino',
    body:
      remainingCount > 0
        ? `Faltam ${formatExerciseCountLabel(remainingCount)} para concluir "${workoutLabel}".`
        : `Seu personal enviou um lembrete para concluir "${workoutLabel}".`,
    data: {
      type: 'workout_reminder',
      workoutId: payload.workoutId,
      remainingExercises: remainingCount,
    },
  });

  return result;
}

export async function notifyPersonalStudentWorkoutStatus(payload: {
  personalCode?: string | number | null;
  studentId: string;
  studentName?: string;
  workoutId: string;
  workoutName?: string;
  status: WorkoutSessionStatus;
  remainingExercises?: number;
}): Promise<QueryResult<NotificationItem>> {
  if (!payload.studentId || !payload.workoutId || !payload.status) {
    return { data: null, error: 'Dados do treino invalidos.' };
  }

  const personalTarget = await resolvePersonalNotificationTarget(payload.personalCode);
  if (!personalTarget?.userId || personalTarget.userId === payload.studentId) {
    return { data: null, error: null };
  }

  const studentLabel = payload.studentName?.trim() || 'Seu aluno';
  const workoutLabel = payload.workoutName?.trim() || 'treino';
  const remainingCount = Math.max(0, Number(payload.remainingExercises || 0));

  const titleByStatus: Record<WorkoutSessionStatus, string> = {
    completed: 'Aluno concluiu treino',
    partial: 'Aluno concluiu treino com pendencias',
    not_completed: 'Aluno nao concluiu treino',
  };

  const descriptionByStatus: Record<WorkoutSessionStatus, string> = {
    completed: `${studentLabel} concluiu o treino "${workoutLabel}".`,
    partial: `${studentLabel} concluiu o treino "${workoutLabel}" com ${formatExerciseCountLabel(remainingCount)} faltando.`,
    not_completed: `${studentLabel} encerrou o treino "${workoutLabel}" sem concluir exercicios.`,
  };

  const result = await createNotification({
    titulo: titleByStatus[payload.status],
    descricao: descriptionByStatus[payload.status],
    tipo: 'Treino',
    para: personalTarget.userId,
    paraTodos: false,
    treinoId: payload.workoutId,
    workoutUserId: payload.studentId,
    unread: true,
    readBy: [],
  });

  if (result.error) {
    return result;
  }

  await sendPushNotificationToUser(personalTarget.userId, {
    title: titleByStatus[payload.status],
    body: descriptionByStatus[payload.status],
    data: {
      type: 'student_workout_status',
      workoutId: payload.workoutId,
      workoutUserId: payload.studentId,
      status: payload.status,
    },
  });

  return result;
}

export async function sendEvaluationCompletionReminder(payload: {
  studentId: string;
  evaluationId: string;
  evaluationType: EvaluationType;
  evaluationName?: string;
  pendingQuestions?: number;
  senderName?: string;
}): Promise<QueryResult<NotificationItem>> {
  if (!payload.studentId || !payload.evaluationId || !payload.evaluationType) {
    return { data: null, error: 'Aluno ou avaliacao invalida.' };
  }

  const senderLabel = payload.senderName?.trim() || 'Seu personal';
  const evaluationLabel = payload.evaluationName?.trim() || 'sua avaliacao';
  const pendingQuestions = Math.max(0, Number(payload.pendingQuestions || 0));
  const description =
    pendingQuestions > 0
      ? `${senderLabel} pediu para voce concluir ${evaluationLabel}. Ainda faltam ${pendingQuestions} pergunta${pendingQuestions === 1 ? '' : 's'}.`
      : `${senderLabel} pediu para voce concluir ${evaluationLabel}.`;

  const result = await createNotification({
    titulo: 'Lembrete de avaliacao',
    descricao: description,
    tipo: 'Avaliacao',
    para: payload.studentId,
    paraTodos: false,
    evaluationId: payload.evaluationId,
    evaluationType: payload.evaluationType,
    evaluationUserId: payload.studentId,
    unread: true,
    readBy: [],
  });

  if (result.error) {
    return result;
  }

  await sendPushNotificationToUser(payload.studentId, {
    title: 'Lembrete de avaliacao',
    body:
      pendingQuestions > 0
        ? `Faltam ${pendingQuestions} pergunta${pendingQuestions === 1 ? '' : 's'} para concluir ${evaluationLabel}.`
        : `Seu personal enviou um lembrete para concluir ${evaluationLabel}.`,
    data: {
      type: 'evaluation_reminder',
      evaluationId: payload.evaluationId,
      evaluationType: payload.evaluationType,
      pendingQuestions,
    },
  });

  return result;
}

export async function notifyPersonalStudentEvaluationStatus(payload: {
  personalCode?: string | number | null;
  studentId: string;
  studentName?: string;
  evaluationId: string;
  evaluationType: EvaluationType;
  status: 'completed' | 'not_completed';
}): Promise<QueryResult<NotificationItem>> {
  if (!payload.studentId || !payload.evaluationId || !payload.evaluationType) {
    return { data: null, error: 'Dados da avaliacao invalidos.' };
  }

  const personalTarget = await resolvePersonalNotificationTarget(payload.personalCode);
  if (!personalTarget?.userId || personalTarget.userId === payload.studentId) {
    return { data: null, error: null };
  }

  const studentLabel = payload.studentName?.trim() || 'Seu aluno';
  const evaluationLabel = formatEvaluationTypeLabel(payload.evaluationType);
  const title =
    payload.status === 'completed'
      ? 'Aluno concluiu avaliacao'
      : 'Aluno nao concluiu avaliacao';
  const description =
    payload.status === 'completed'
      ? `${studentLabel} concluiu a ${evaluationLabel}.`
      : `${studentLabel} nao concluiu a ${evaluationLabel} no prazo.`;

  const result = await createNotification({
    titulo: title,
    descricao: description,
    tipo: 'Avaliacao',
    para: personalTarget.userId,
    paraTodos: false,
    evaluationId: payload.evaluationId,
    evaluationType: payload.evaluationType,
    evaluationUserId: payload.studentId,
    unread: true,
    readBy: [],
  });

  if (result.error) {
    return result;
  }

  await sendPushNotificationToUser(personalTarget.userId, {
    title,
    body: description,
    data: {
      type: 'student_evaluation_status',
      evaluationId: payload.evaluationId,
      evaluationType: payload.evaluationType,
      evaluationUserId: payload.studentId,
      status: payload.status,
    },
  });

  return result;
}

export async function notifyPersonalStudentLinkedByCode(payload: {
  personalCode?: string | number | null;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  source?: 'register' | 'profile_update';
}): Promise<QueryResult<NotificationItem>> {
  if (!payload.studentId) {
    return { data: null, error: 'Aluno invalido.' };
  }

  const personalTarget = await resolvePersonalNotificationTarget(payload.personalCode);
  if (!personalTarget?.userId || personalTarget.userId === payload.studentId) {
    return { data: null, error: null };
  }

  const studentLabel =
    payload.studentName?.trim() ||
    payload.studentEmail?.trim() ||
    'Um aluno';
  const isRegister = payload.source !== 'profile_update';
  const title = isRegister ? 'Novo aluno com seu codigo' : 'Aluno vinculado ao seu codigo';
  const description = isRegister
    ? `${studentLabel} criou uma conta usando o seu codigo.`
    : `${studentLabel} vinculou o perfil ao seu codigo.`;

  const result = await createNotification({
    titulo: title,
    descricao: description,
    tipo: 'Sistema',
    para: personalTarget.userId,
    paraTodos: false,
    unread: true,
    readBy: [],
  });

  if (result.error) {
    return result;
  }

  await sendPushNotificationToUser(personalTarget.userId, {
    title,
    body: description,
    data: {
      type: 'student_linked_personal_code',
      studentId: payload.studentId,
      source: payload.source || 'register',
    },
  });

  return result;
}
