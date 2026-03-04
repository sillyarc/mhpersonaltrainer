import type {
  EventSubscription,
  Notification,
  NotificationResponse,
  NotificationTriggerInput,
} from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, deleteField } from 'firebase/firestore';
import { db } from './firebase';

type NotificationsModule = typeof import('expo-notifications');

function isRunningInExpoGo(): boolean {
  const executionEnvironment = (Constants as { executionEnvironment?: string })
    .executionEnvironment;
  return Constants.appOwnership === 'expo' || executionEnvironment === 'storeClient';
}

let notificationsModulePromise: Promise<NotificationsModule> | null = null;
let notificationsModule: NotificationsModule | null = null;
let notificationHandlerConfigured = false;

function createNoopSubscription(): EventSubscription {
  return { remove: () => {} } as EventSubscription;
}

function ensureNotificationHandlerConfigured(Notifications: NotificationsModule): void {
  if (notificationHandlerConfigured) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  notificationHandlerConfigured = true;
}

async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (isRunningInExpoGo()) {
    return null;
  }

  if (notificationsModule) {
    return notificationsModule;
  }

  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications');
  }

  notificationsModule = await notificationsModulePromise;
  ensureNotificationHandlerConfigured(notificationsModule);
  return notificationsModule;
}

function getNotificationsModuleSync(): NotificationsModule | null {
  if (isRunningInExpoGo()) {
    return null;
  }

  if (!notificationsModule) {
    // Runtime require keeps Expo Go from loading this package on app startup.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    notificationsModule = require('expo-notifications') as NotificationsModule;
    ensureNotificationHandlerConfigured(notificationsModule);
  }

  return notificationsModule;
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4361ee',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }

    try {
      const projectId =
        Constants.easConfig?.projectId ??
        Constants.expoConfig?.extra?.eas?.projectId ??
        process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

      if (projectId) {
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      } else {
        console.warn(
          'Expo projectId not found. Set extra.eas.projectId in app config or EXPO_PUBLIC_EAS_PROJECT_ID in env.'
        );
        token = (await Notifications.getExpoPushTokenAsync()).data;
      }
    } catch (error) {
      console.error('Error getting push token:', error);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

export async function savePushToken(userId: string, token: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const previousOwner = await AsyncStorage.getItem('mh:pushOwner');
    const previousToken = await AsyncStorage.getItem('mh:pushToken');

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
    await AsyncStorage.setItem('mh:pushOwner', userId);
    await AsyncStorage.setItem('mh:pushToken', token);
  } catch (error) {
    console.error('Error saving push token:', error);
  }
}

export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
  trigger?: NotificationTriggerInput
): Promise<string> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return '';

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: trigger || null,
  });

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
    `Seu treino "${workoutName}" começa em 30 minutos.`,
    { type: 'workout_reminder', workoutName },
    { type: 'date', date: trigger } as any
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
    ? `Você tem uma ${appointmentType} com ${personalName} em 1 hora.`
    : `Você tem uma ${appointmentType} em 1 hora.`;

  return scheduleLocalNotification(
    'Lembrete de Agendamento',
    body,
    { type: 'appointment_reminder', appointmentType },
    { type: 'date', date: trigger } as any
  );
}

export async function cancelScheduledNotification(notificationId: string): Promise<void> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

export async function cancelAllScheduledNotifications(): Promise<void> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getBadgeCount(): Promise<number> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return 0;

  return await Notifications.getBadgeCountAsync();
}

export async function setBadgeCount(count: number): Promise<void> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  await Notifications.setBadgeCountAsync(count);
}

export function addNotificationReceivedListener(
  callback: (notification: Notification) => void
): EventSubscription {
  const Notifications = getNotificationsModuleSync();
  if (!Notifications) return createNoopSubscription();

  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseReceivedListener(
  callback: (response: NotificationResponse) => void
): EventSubscription {
  const Notifications = getNotificationsModuleSync();
  if (!Notifications) return createNoopSubscription();

  return Notifications.addNotificationResponseReceivedListener(callback);
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function isExpoPushToken(token: string): boolean {
  return token.startsWith('ExpoPushToken') || token.startsWith('ExponentPushToken');
}

export async function sendPushNotificationToUser(
  userId: string,
  payload: { title: string; body: string; data?: Record<string, any> }
): Promise<void> {
  try {
    const localToken = await AsyncStorage.getItem('mh:pushToken');
    const userRef = doc(db, 'users', userId);
    const snapshot = await getDoc(userRef);
    if (!snapshot.exists()) return;

    const data = snapshot.data() || {};
    const tokens = new Set<string>();

    if (typeof data.pushToken === 'string') {
      tokens.add(data.pushToken);
    }
    if (Array.isArray(data.fcm_tokens)) {
      data.fcm_tokens.forEach((token: any) => {
        if (typeof token === 'string') tokens.add(token);
      });
    }

    const expoTokens = Array.from(tokens)
      .filter(isExpoPushToken)
      .filter((token) => (localToken ? token !== localToken : true));
    if (expoTokens.length === 0) return;

    const messages = expoTokens.map((token) => ({
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
    }));

    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}
