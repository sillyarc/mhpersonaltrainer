'use client';

import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, deleteField } from 'firebase/firestore';
import { db } from './firebase';

type NotificationListener = (payload: Notification) => void;
type NotificationResponseListener = (payload: Event) => void;

const listeners = new Set<NotificationListener>();
const responseListeners = new Set<NotificationResponseListener>();

const LOCAL_OWNER_KEY = 'mh:pushOwner';
const LOCAL_TOKEN_KEY = 'mh:pushToken';

function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function emitNotification(notification: Notification) {
  listeners.forEach((listener) => listener(notification));
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!isNotificationSupported()) return null;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;
  return 'web';
}

export async function savePushToken(userId: string, token: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const previousOwner = typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_OWNER_KEY) : null;
    const previousToken = typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_TOKEN_KEY) : null;

    if (previousOwner && previousOwner !== userId && previousToken) {
      try {
        await updateDoc(doc(db, 'users', previousOwner), {
          fcm_tokens: arrayRemove(previousToken),
          pushToken: deleteField(),
        });
      } catch (_) {
        // Ignore cleanup failures.
      }
    }
    if (previousOwner === userId && previousToken && previousToken !== token) {
      try {
        await updateDoc(userRef, { fcm_tokens: arrayRemove(previousToken) });
      } catch (_) {
        // Ignore cleanup failures.
      }
    }
    await setDoc(
      userRef,
      {
        fcm_tokens: arrayUnion(token),
        pushToken: token,
      },
      { merge: true }
    );
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCAL_OWNER_KEY, userId);
      window.localStorage.setItem(LOCAL_TOKEN_KEY, token);
    }
  } catch (error) {
    console.error('Error saving push token:', error);
  }
}

export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
  trigger?: { type: 'date'; date: Date } | null
): Promise<string> {
  if (!isNotificationSupported()) return '';
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const showNotification = () => {
    if (Notification.permission !== 'granted') return;
    const notification = new Notification(title, { body, data });
    emitNotification(notification);
    notification.onclick = (event) => {
      responseListeners.forEach((listener) => listener(event));
    };
  };

  if (trigger?.type === 'date' && trigger.date) {
    const delay = Math.max(trigger.date.getTime() - Date.now(), 0);
    window.setTimeout(showNotification, delay);
  } else {
    showNotification();
  }

  return id;
}

export async function scheduleWorkoutReminder(
  workoutName: string,
  scheduledTime: Date
): Promise<string> {
  const trigger = new Date(scheduledTime);
  trigger.setMinutes(trigger.getMinutes() - 30);

  return scheduleLocalNotification(
    'Hora do Treino!',
    `Seu treino "${workoutName}" comeca em 30 minutos.`,
    { type: 'workout_reminder', workoutName },
    { type: 'date', date: trigger }
  );
}

export async function scheduleAppointmentReminder(
  appointmentType: string,
  scheduledTime: Date,
  personalName?: string
): Promise<string> {
  const trigger = new Date(scheduledTime);
  trigger.setHours(trigger.getHours() - 1);

  const body = personalName
    ? `Voce tem uma ${appointmentType} com ${personalName} em 1 hora.`
    : `Voce tem uma ${appointmentType} em 1 hora.`;

  return scheduleLocalNotification(
    'Lembrete de Agendamento',
    body,
    { type: 'appointment_reminder', appointmentType },
    { type: 'date', date: trigger }
  );
}

export async function cancelScheduledNotification(_: string): Promise<void> {
  // Browser notifications do not support canceling scheduled timers after refresh.
}

export async function cancelAllScheduledNotifications(): Promise<void> {
  // Browser notifications do not support canceling scheduled timers after refresh.
}

export async function getBadgeCount(): Promise<number> {
  return 0;
}

export async function setBadgeCount(_: number): Promise<void> {
  // No-op for web.
}

export function addNotificationReceivedListener(
  callback: NotificationListener
): { remove: () => void } {
  listeners.add(callback);
  return {
    remove: () => listeners.delete(callback),
  };
}

export function addNotificationResponseReceivedListener(
  callback: NotificationResponseListener
): { remove: () => void } {
  responseListeners.add(callback);
  return {
    remove: () => responseListeners.delete(callback),
  };
}

export async function sendPushNotificationToUser(
  userId: string,
  payload: { title: string; body: string; data?: Record<string, any> }
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const snapshot = await getDoc(userRef);
    if (!snapshot.exists()) return;
    const data = snapshot.data() || {};
    const tokens = new Set<string>();
    if (typeof data.pushToken === 'string') tokens.add(data.pushToken);
    if (Array.isArray(data.fcm_tokens)) {
      data.fcm_tokens.forEach((token: any) => {
        if (typeof token === 'string') tokens.add(token);
      });
    }

    if (!tokens.size) return;
    console.warn('Push web requires FCM/Web Push setup. Payload:', payload);
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}
