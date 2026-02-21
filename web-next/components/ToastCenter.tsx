'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { addNotificationReceivedListener } from '@/lib/services/notifications';
import { listenToConversations, listenToSupportConversations } from '@/lib/services/chat';
import { isNotificationFresh, listenToNotificationsForUser } from '@/lib/services/notificationCenter';
import type { Conversation } from '@/lib/types/chat';
import type { NotificationItem } from '@/lib/types/notification';

interface ToastItem {
  id: string;
  title: string;
  message: string;
  meta?: string;
  tone?: 'info' | 'success' | 'warning';
}

const MAX_TOASTS = 4;
const TOAST_TTL = 5000;
const SUPPORT_ID = 'support';

const formatTime = (value?: Date) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
};

const normalizeDate = (value?: any) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default function ToastCenter() {
  const { user, role } = useAuth();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());
  const initializedChatRef = useRef(false);
  const lastChatTimeRef = useRef<Map<string, number>>(new Map());
  const initializedNotificationsRef = useRef(false);
  const seenNotificationRef = useRef<Set<string>>(new Set());
  const lastSoundAtRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const askedPermissionRef = useRef(false);
  const askedTauriPermissionRef = useRef(false);
  const isAdmin = role === 'admin';

  const playToastSound = useCallback(() => {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    if (now - lastSoundAtRef.current < 1200) return;
    lastSoundAtRef.current = now;

    const AudioContextConstructor =
      window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContextConstructor();
    }
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const play = () => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const startAt = ctx.currentTime;

      oscillator.type = 'sine';
      oscillator.frequency.value = 740;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.09, startAt + 0.016);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.12);

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.13);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  }, []);

  const showDesktopNotification = useCallback((toast: ToastItem) => {
    if (typeof window === 'undefined') return;
    const isTauri = '__TAURI__' in window;
    if (!isTauri && !('Notification' in window)) return;
    const shouldShow = document.visibilityState !== 'visible' || !document.hasFocus();
    if (!shouldShow) return;

    const createNotification = () => {
      const notification = new Notification(toast.title, {
        body: toast.message,
        tag: toast.id,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    };

    const tryTauriNotification = async () => {
      if (!isTauri) return false;
      try {
        const { isPermissionGranted, requestPermission, sendNotification } = await import(
          '@tauri-apps/api/notification'
        );
        let granted = await isPermissionGranted();
        if (!granted && !askedTauriPermissionRef.current) {
          askedTauriPermissionRef.current = true;
          const permission = await requestPermission();
          granted = permission === 'granted';
        }
        if (granted) {
          sendNotification({ title: toast.title, body: toast.message });
          return true;
        }
      } catch (_) {
        return false;
      }
      return false;
    };

    void (async () => {
      const usedTauri = await tryTauriNotification();
      if (usedTauri) return;
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') {
        createNotification();
        return;
      }
      if (Notification.permission === 'default' && !askedPermissionRef.current) {
        askedPermissionRef.current = true;
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            createNotification();
          }
        });
      }
    })();

  }, []);

  const pushToast = useCallback((toast: ToastItem) => {
    setToasts((prev) => {
      const next = [toast, ...prev].slice(0, MAX_TOASTS);
      return next;
    });
    const timeoutId = window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== toast.id));
      timersRef.current.delete(toast.id);
    }, TOAST_TTL);
    timersRef.current.set(toast.id, timeoutId);
    playToastSound();
    showDesktopNotification(toast);
  }, [playToastSound, showDesktopNotification]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timersRef.current.clear();
    };
  }, []);

  const handleConversations = useCallback(
    (items: Conversation[]) => {
      const selfId = isAdmin ? SUPPORT_ID : user?.uid;
      if (!selfId) return;
      if (!initializedChatRef.current) {
        const seed = new Map<string, number>();
        items.forEach((convo) => {
          const time = convo.lastMessageAt?.getTime?.() || 0;
          seed.set(convo.id, time);
        });
        lastChatTimeRef.current = seed;
        initializedChatRef.current = true;
        return;
      }

      items.forEach((convo) => {
        const lastTime = convo.lastMessageAt?.getTime?.() || 0;
        const previous = lastChatTimeRef.current.get(convo.id) || 0;
        if (lastTime <= previous) return;
        lastChatTimeRef.current.set(convo.id, lastTime);
        const senderId = convo.lastMessage?.senderId;
        if (!senderId || senderId === selfId) return;
        const otherId = convo.participants.find((item) => item !== selfId) || 'usuario';
        const info = convo.participantInfo?.[otherId];
        const name = info?.name || 'Usuario';
        const message = convo.lastMessage?.content || 'Nova mensagem';
        pushToast({
          id: `${convo.id}-${lastTime}`,
          title: `Nova mensagem de ${name}`,
          message,
          meta: formatTime(convo.lastMessageAt),
          tone: 'info',
        });
      });
    },
    [isAdmin, pushToast, user?.uid]
  );

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = isAdmin
      ? listenToSupportConversations(handleConversations)
      : listenToConversations(user.uid, handleConversations);
    return () => unsubscribe();
  }, [handleConversations, isAdmin, user?.uid]);

  const handleNotificationItems = useCallback(
    (items: NotificationItem[]) => {
      if (!user?.uid) return;
      if (!initializedNotificationsRef.current) {
        items.forEach((item) => seenNotificationRef.current.add(item.id));
        initializedNotificationsRef.current = true;
        return;
      }
      items.forEach((item) => {
        if (seenNotificationRef.current.has(item.id)) return;
        if (!isNotificationFresh(item)) return;
        if ((item.publico || '').toLowerCase() === 'chat') return;
        seenNotificationRef.current.add(item.id);
        const date = normalizeDate(item.data);
        pushToast({
          id: `notif-${item.id}`,
          title: item.titulo || 'Notificacao',
          message: item.descricao || 'Nova atualizacao no app.',
          meta: date ? formatTime(date) : undefined,
          tone: 'success',
        });
      });
    },
    [pushToast, user?.uid]
  );

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = listenToNotificationsForUser(user.uid, handleNotificationItems);
    return () => unsubscribe();
  }, [handleNotificationItems, user?.uid]);

  useEffect(() => {
    const subscription = addNotificationReceivedListener((notification) => {
      pushToast({
        id: `browser-${notification.tag || Date.now()}`,
        title: notification.title || 'Notificacao',
        message: notification.body || 'Nova atualizacao.',
        tone: 'warning',
      });
    });
    return () => subscription.remove();
  }, [pushToast]);

  if (!toasts.length) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-card ${toast.tone || 'info'}`}>
          <div>
            <strong>{toast.title}</strong>
            <p>{toast.message}</p>
          </div>
          {toast.meta ? <span>{toast.meta}</span> : null}
        </div>
      ))}
    </div>
  );
}
