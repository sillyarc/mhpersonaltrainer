import { collection, getDocs, orderBy, query, where, addDoc, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { NotificationItem } from '../types/notification';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { sendPushNotificationToUser } from './notifications';

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
  avOnlineId: data.avOnline?.id,
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
    const docRef = await addDoc(ref, {
      titulo: payload.titulo,
      descricao: payload.descricao,
      tipo: payload.tipo || 'Sistema',
      para: payload.para || null,
      paraTodos: payload.paraTodos || false,
      data: Timestamp.now(),
    });
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
    securityStatus: payload.decision,
    securityResolvedAt: Timestamp.now(),
    securityResolvedBy: payload.userId,
  });
}
