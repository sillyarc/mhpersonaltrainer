import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  addDoc,
  Timestamp,
  onSnapshot,
  limit,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { NotificationItem } from '../types/notification';

interface QueryResult<T> {
  data: T | null;
  error: string | null;
}

interface NotificationQueryOptions {
  freshOnly?: boolean;
  maxAgeMs?: number;
}

export const PANEL_NOTIFICATION_MAX_AGE_MS = 2 * 60 * 1000;

const mapNotification = (id: string, data: any): NotificationItem => ({
  id,
  titulo: data.titulo || 'Notificacao',
  descricao: data.descricao || '',
  data: data.data?.toDate ? data.data.toDate() : data.data ? new Date(data.data) : undefined,
  expiresAt: data.expiresAt?.toDate
    ? data.expiresAt.toDate()
    : data.expiresAt
      ? new Date(data.expiresAt)
      : undefined,
  para: data.para,
  paraTodos: data.paraTodos || false,
  tipo: data.tipo,
  publico: data.publico,
  autoEvent: Boolean(data.autoEvent),
  eventType: data.eventType,
  meta: data.meta,
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

const isValidDate = (value?: Date | null) =>
  Boolean(value && value instanceof Date && !Number.isNaN(value.getTime()));

export const isNotificationFresh = (
  item: NotificationItem,
  maxAgeMs = PANEL_NOTIFICATION_MAX_AGE_MS,
  nowMs = Date.now()
) => {
  if (!item) return false;
  if (item.securityEvent && (!item.securityStatus || item.securityStatus === 'pending')) {
    return true;
  }
  if (isValidDate(item.expiresAt)) {
    return (item.expiresAt as Date).getTime() > nowMs;
  }
  if (!isValidDate(item.data)) {
    return true;
  }
  return nowMs - (item.data as Date).getTime() <= maxAgeMs;
};

const maybeFilterFresh = (
  items: NotificationItem[],
  options?: NotificationQueryOptions
) => {
  if (!options?.freshOnly) return items;
  const maxAgeMs = typeof options.maxAgeMs === 'number' ? options.maxAgeMs : PANEL_NOTIFICATION_MAX_AGE_MS;
  const nowMs = Date.now();
  return items.filter((item) => isNotificationFresh(item, maxAgeMs, nowMs));
};

const formatSecurityDate = (value: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);

const getWebDeviceLabel = () => {
  if (typeof window === 'undefined') return 'Web';
  const ua = (window.navigator?.userAgent || '').toLowerCase();
  if (ua.includes('android')) return 'Web Android';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'Web iOS';
  if (ua.includes('windows')) return 'Web Windows';
  if (ua.includes('mac os')) return 'Web macOS';
  if (ua.includes('linux')) return 'Web Linux';
  return 'Web';
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

export async function notifyUserLoginSecurityAlert(payload: {
  userId: string;
  userName?: string;
  loginMethod?: string;
}) {
  if (!payload.userId) return;
  try {
    const now = new Date();
    const ip = await getPublicIpAddress();
    const device = getWebDeviceLabel();
    const method = payload.loginMethod || 'Nao informado';
    const userName = payload.userName?.trim() || 'Usuario';
    const title = 'Novo login detectado';
    const description =
      `Ola ${userName}, identificamos um novo login no seu acesso Web.\n` +
      `IP: ${ip}\n` +
      `Dispositivo: ${device}\n` +
      `Metodo: ${method}\n` +
      `Horario: ${formatSecurityDate(now)}\n` +
      `Foi voce que efetuou este login? Se nao foi, altere sua senha agora.`;

    await addDoc(collection(db, 'notificacao'), {
      titulo: title,
      descricao: description,
      tipo: 'Seguranca',
      publico: 'seguranca',
      para: payload.userId,
      paraTodos: false,
      data: Timestamp.now(),
      securityEvent: true,
      securityStatus: 'pending',
      loginMeta: {
        ip,
        device,
        method,
        platform: 'web-next',
        userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent || '' : '',
        occurredAt: now.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error notifying user login security event (web):', error);
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

export async function fetchNotificationsForUser(
  userId: string,
  options?: NotificationQueryOptions
): Promise<QueryResult<NotificationItem[]>> {
  const resolvedOptions: NotificationQueryOptions = {
    freshOnly: options?.freshOnly ?? true,
    maxAgeMs: options?.maxAgeMs ?? PANEL_NOTIFICATION_MAX_AGE_MS,
  };
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

    return { data: maybeFilterFresh(result, resolvedOptions), error: null };
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
      return { data: maybeFilterFresh(filtered, resolvedOptions), error: null };
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
      publico: payload.publico || null,
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

export function listenToNotificationsForUser(
  userId: string,
  callback: (items: NotificationItem[]) => void,
  options?: NotificationQueryOptions
) {
  if (!userId) {
    callback([]);
    return () => {};
  }
  const resolvedOptions: NotificationQueryOptions = {
    freshOnly: options?.freshOnly ?? true,
    maxAgeMs: options?.maxAgeMs ?? PANEL_NOTIFICATION_MAX_AGE_MS,
  };

  const ref = collection(db, 'notificacao');
  const userQuery = query(
    ref,
    where('para', '==', userId),
    orderBy('data', 'desc'),
    limit(20)
  );
  const allQuery = query(
    ref,
    where('paraTodos', '==', true),
    orderBy('data', 'desc'),
    limit(20)
  );

  const userItems = new Map<string, NotificationItem>();
  const allItems = new Map<string, NotificationItem>();
  const update = () => {
    const merged = new Map<string, NotificationItem>([...allItems, ...userItems]);
    const items = Array.from(merged.values()).sort((a, b) => {
      const aTime = a.data ? a.data.getTime() : 0;
      const bTime = b.data ? b.data.getTime() : 0;
      return bTime - aTime;
    });
    callback(maybeFilterFresh(items, resolvedOptions));
  };

  const unsubscribeUser = onSnapshot(
    userQuery,
    (snapshot) => {
      userItems.clear();
      snapshot.docs.forEach((docItem) => {
        userItems.set(docItem.id, mapNotification(docItem.id, docItem.data()));
      });
      update();
    },
    (error) => {
      console.error('Erro ao ouvir notificacoes por usuario:', error);
      callback([]);
    }
  );

  const unsubscribeAll = onSnapshot(
    allQuery,
    (snapshot) => {
      allItems.clear();
      snapshot.docs.forEach((docItem) => {
        allItems.set(docItem.id, mapNotification(docItem.id, docItem.data()));
      });
      update();
    },
    (error) => {
      console.error('Erro ao ouvir notificacoes gerais:', error);
      callback([]);
    }
  );

  const pruneInterval = globalThis.setInterval(() => {
    update();
  }, 20 * 1000);

  return () => {
    unsubscribeUser();
    unsubscribeAll();
    globalThis.clearInterval(pruneInterval);
  };
}
