'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { firestoreService, type Aluno } from '@/lib/services/firestoreService';
import {
  ensureConversation,
  findPersonalByCode,
  listenToConversations,
  listenToSupportConversations,
  listenToMessages,
  markConversationAsRead,
  notifyConversationEvent,
  sendMessage,
} from '@/lib/services/chat';
import { chatWithAI } from '@/lib/services/ai';
import { createUserWorkout, fetchAvailableExercises } from '@/lib/services/workouts';
import type { Conversation, Message } from '@/lib/types/chat';
import type { Exercise } from '@/lib/types/workout';

interface ContactItem {
  id: string;
  name: string;
  avatar?: string;
  personalAvatar?: string;
  conversationId?: string;
  lastMessage?: string;
  lastMessageAt?: Date;
  unreadCount?: number;
  isSupport?: boolean;
  isAssistant?: boolean;
}

const assistantContact: ContactItem = {
  id: 'ai-assistant',
  name: 'MH Assistente',
  isAssistant: true,
};

const supportContact: ContactItem = {
  id: 'support',
  name: 'Suporte MH',
  isSupport: true,
};

const ASSISTANT_HISTORY_LIMIT = 12;
const DEFAULT_YOUTUBE_VIDEO = 'https://www.youtube.com/watch?v=ml6cT4AZdqI';
const SUPPORT_AUTO_KEY = 'mh-support-auto-reply';
const WEEKDAY_OPTIONS = [
  { key: 'segunda', label: 'Seg' },
  { key: 'terca', label: 'Ter' },
  { key: 'quarta', label: 'Qua' },
  { key: 'quinta', label: 'Qui' },
  { key: 'sexta', label: 'Sex' },
  { key: 'sabado', label: 'Sab' },
  { key: 'domingo', label: 'Dom' },
];

const formatTime = (value?: Date) => {
  if (!value) return '--';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(value);
};

const buildDayKey = (value?: Date) => {
  if (!value) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDayLabel = (value?: Date) => {
  if (!value) return '';
  const now = new Date();
  const sameYear = value.getFullYear() === now.getFullYear();
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return formatter.format(value);
};

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const parseExerciseLine = (line: string) => {
  const trimmed = line.trim();
  const parts = trimmed.split('-').map((part) => part.trim()).filter(Boolean);
  const name = parts[0] || trimmed;
  let series = 3;
  let reps = 12;
  let rest = 60;

  const seriesMatch = trimmed.match(/(\d+)\s*(?:series|s[ei]ries)/i);
  if (seriesMatch) series = Number(seriesMatch[1]);

  const repsMatch = trimmed.match(/(\d+)\s*(?:reps?|repeti[cç]oes)/i);
  if (repsMatch) reps = Number(repsMatch[1]);

  const restMatch =
    trimmed.match(/descanso\s*(\d+)/i) ||
    trimmed.match(/(\d+)\s*(?:seg|segundos)\b/i);
  if (restMatch) rest = Number(restMatch[1]);

  const compactMatch = trimmed.match(/(\d+)\s*x\s*(\d+)/i);
  if (compactMatch) {
    series = Number(compactMatch[1]);
    reps = Number(compactMatch[2]);
  }

  return { name, series, reps, rest };
};

const resolveExerciseVideo = (exercise?: Exercise | null) =>
  exercise?.videoUrl1080 ||
  exercise?.videoUrl720 ||
  exercise?.videoUrl ||
  DEFAULT_YOUTUBE_VIDEO;

const buildExerciseIndex = (items: Exercise[]) => {
  const indexed = items.map((item) => ({
    item,
    name: normalizeText(item.nomeDoTreino || ''),
  }));
  const exactMap = new Map<string, Exercise>();
  indexed.forEach((entry) => {
    if (entry.name && !exactMap.has(entry.name)) {
      exactMap.set(entry.name, entry.item);
    }
  });
  return { indexed, exactMap };
};

const findExerciseMatch = (
  name: string,
  index: { indexed: { item: Exercise; name: string }[]; exactMap: Map<string, Exercise> }
) => {
  const normalized = normalizeText(name);
  const direct = index.exactMap.get(normalized);
  if (direct) return direct;
  let best: Exercise | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  index.indexed.forEach((entry) => {
    if (!entry.name) return;
    const contains = entry.name.includes(normalized) || normalized.includes(entry.name);
    if (!contains) return;
    const score = Math.abs(entry.name.length - normalized.length);
    if (score < bestScore) {
      best = entry.item;
      bestScore = score;
    }
  });
  return best;
};

const buildWorkoutRoute = (workoutId: string, studentId?: string) =>
  studentId ? `/workout/${workoutId}?studentId=${studentId}` : `/workout/${workoutId}`;

export default function ChatWidget() {
  const { user, role } = useAuth();
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeContact, setActiveContact] = useState<ContactItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [students, setStudents] = useState<Aluno[]>([]);
  const [pendingWorkout, setPendingWorkout] = useState<Message['workoutData'] | null>(null);
  const [pendingWorkoutMessageId, setPendingWorkoutMessageId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedWeekday, setSelectedWeekday] = useState<string | null>(null);
  const [workoutHint, setWorkoutHint] = useState<string | null>(null);
  const [savingWorkout, setSavingWorkout] = useState(false);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [autoReplyMap, setAutoReplyMap] = useState<Record<string, boolean>>({});
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState('');
  const [broadcastError, setBroadcastError] = useState('');
  const [broadcastDismissed, setBroadcastDismissed] = useState(false);
  const [lastBroadcastSummary, setLastBroadcastSummary] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);
  const autoReplyRef = useRef<Record<string, boolean>>({});
  const autoReplyLastRef = useRef<Record<string, string>>({});

  const isPersonal = role === 'personal' || role === 'professor' || role === 'admin';
  const isAdmin = role === 'admin';
  const supportId = supportContact.id;
  const assistantReady = Boolean(
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setStickToBottom(distanceFromBottom < 32);
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = isAdmin
      ? listenToSupportConversations((items) => {
          setConversations(items);
        })
      : listenToConversations(user.uid, (items) => {
          setConversations(items);
        });
    return () => unsubscribe();
  }, [isAdmin, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    let active = true;
    if (isAdmin) {
      setStudents([]);
      setContacts([assistantContact]);
      return () => {
        active = false;
      };
    }
    if (isPersonal) {
      firestoreService.getAlunosDoPersonal(user.uid).then((data) => {
        if (!active) return;
        setStudents(data);
        const items = data.map((aluno) => ({
          id: aluno.id,
          name: aluno.nome,
          avatar: aluno.photoUrl,
          personalAvatar: aluno.personalPhotoUrl,
        }));
        setContacts([...items, assistantContact, supportContact]);
      });
    } else {
      findPersonalByCode(user.codigoPersonal).then((personal) => {
        if (!active) return;
        setStudents([]);
        const items: ContactItem[] = [];
        if (personal) {
          items.push({
            id: personal.id,
            name: personal.name,
            avatar: personal.photoUrl,
          });
        }
        items.push(assistantContact, supportContact);
        setContacts(items);
      });
    }
    return () => {
      active = false;
    };
  }, [isAdmin, isPersonal, user?.uid, user?.codigoPersonal]);

  useEffect(() => {
    if (!isAdmin || typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(SUPPORT_AUTO_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Record<string, boolean>;
      if (parsed && typeof parsed === 'object') {
        setAutoReplyMap(parsed);
        autoReplyRef.current = parsed;
      }
    } catch (error) {
      // Ignore invalid storage payloads.
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!activeContact?.conversationId) {
      setMessages([]);
      return;
    }
    const unsubscribe = listenToMessages(activeContact.conversationId, (items) => {
      setMessages(items);
    });
    if (user?.uid) {
      const readerId = isAdmin && activeContact.isSupport ? supportId : user.uid;
      markConversationAsRead(activeContact.conversationId, readerId);
    }
    return () => unsubscribe();
  }, [activeContact?.conversationId, isAdmin, supportId, user?.uid]);

  useEffect(() => {
    if (!activeContact?.isAssistant) {
      setPendingWorkout(null);
      return;
    }
    const latestWorkout = [...messages]
      .reverse()
      .find((item) => item.workoutData && (item.senderId === assistantContact.id || item.aiGenerated));
    if (!latestWorkout) {
      setPendingWorkout(null);
      return;
    }
    if (latestWorkout.id !== pendingWorkoutMessageId) {
      setPendingWorkout(latestWorkout.workoutData || null);
      setPendingWorkoutMessageId(latestWorkout.id);
      setSelectedWeekday(null);
      if (!isPersonal) {
        setSelectedStudentId(null);
      }
      setWorkoutHint(null);
    }
  }, [activeContact?.isAssistant, isPersonal, messages, pendingWorkoutMessageId]);

  useEffect(() => {
    if (!activeContact) return;
    setStickToBottom(true);
    setBroadcastResult('');
    setBroadcastError('');
    setBroadcastDismissed(false);
    setLastBroadcastSummary('');
  }, [activeContact?.conversationId]);

  useEffect(() => {
    if (!open || !activeContact) return;
    if (stickToBottom) {
      requestAnimationFrame(() => scrollToBottom('auto'));
    }
  }, [messages, open, activeContact, stickToBottom, scrollToBottom]);

  const conversationItems = useMemo(() => {
    if (isAdmin) {
      return conversations
        .map((convo) => {
          const otherId = convo.participants.find((item) => item !== supportId);
          if (!otherId) return null;
          const info = convo.participantInfo?.[otherId];
          const personalAvatar =
            (info as { personalPhotoUrl?: string; personal_photo_url?: string } | undefined)
              ?.personalPhotoUrl ||
            (info as { personalPhotoUrl?: string; personal_photo_url?: string } | undefined)
              ?.personal_photo_url;
          return {
            id: otherId,
            conversationId: convo.id,
            name: info?.name || 'Usuario',
            avatar: info?.photoUrl,
            personalAvatar,
            lastMessage: convo.lastMessage?.content || 'Sem mensagens',
            lastMessageAt: convo.lastMessageAt,
            unreadCount: convo.unreadCount?.[supportId] || 0,
            isSupport: true,
          } as ContactItem;
        })
        .filter(Boolean) as ContactItem[];
    }
    if (!user?.uid) return [];
    return conversations
      .map((convo) => {
        const otherId = convo.participants.find((item) => item !== user.uid);
        if (!otherId) return null;
        const info = convo.participantInfo?.[otherId];
        const personalAvatar =
          (info as { personalPhotoUrl?: string; personal_photo_url?: string } | undefined)
            ?.personalPhotoUrl ||
          (info as { personalPhotoUrl?: string; personal_photo_url?: string } | undefined)
            ?.personal_photo_url;
        const convoType = convo.type as string;
        const isAssistant = convo.type === 'ai' || otherId === assistantContact.id;
        const isSupport = convoType === 'support' || otherId === supportContact.id;
        return {
          id: otherId,
          conversationId: convo.id,
          name: info?.name || (isAssistant ? assistantContact.name : isSupport ? supportContact.name : 'Conversa'),
          avatar: info?.photoUrl,
          personalAvatar,
          lastMessage: convo.lastMessage?.content || 'Sem mensagens',
          lastMessageAt: convo.lastMessageAt,
          unreadCount: convo.unreadCount?.[user.uid] || 0,
          isAssistant,
          isSupport,
        } as ContactItem;
      })
      .filter(Boolean) as ContactItem[];
  }, [conversations, isAdmin, supportId, user?.uid]);

  const updateAutoReply = useCallback(
    (conversationId: string, enabled: boolean) => {
      setAutoReplyMap((prev) => {
        const next = { ...prev, [conversationId]: enabled };
        autoReplyRef.current = next;
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(SUPPORT_AUTO_KEY, JSON.stringify(next));
        }
        return next;
      });
    },
    []
  );

  const autoReplyEnabled = activeContact?.conversationId
    ? Boolean(autoReplyMap[activeContact.conversationId])
    : false;

  useEffect(() => {
    if (!isAdmin || !assistantReady) return;
    const conversationId = activeContact?.conversationId;
    if (!activeContact?.isSupport || !conversationId) return;
    if (!autoReplyRef.current[conversationId]) return;
    if (!messages.length) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.content) return;
    if (lastMessage.senderId === supportId) return;

    const lastHandled = autoReplyLastRef.current[conversationId];
    if (lastHandled === lastMessage.id) return;
    autoReplyLastRef.current[conversationId] = lastMessage.id;

    const history = messages
      .filter((item) => item.content)
      .slice(-ASSISTANT_HISTORY_LIMIT)
      .map((item) => ({
        role: item.senderId === supportId ? 'assistant' : 'user',
        content: item.content,
      })) as Array<{ role: 'user' | 'assistant'; content: string }>;

    const runAutoReply = async () => {
      try {
        const response = await chatWithAI(lastMessage.content, history);
        if (!response?.text) return;
        await sendMessage({
          conversationId,
          senderId: supportId,
          senderName: supportContact.name,
          senderPhoto: supportContact.avatar,
          content: response.text,
          aiGenerated: true,
        });
      } catch (error) {
        console.warn('Nao foi possivel responder automaticamente:', error);
      }
    };

    runAutoReply();
  }, [activeContact?.conversationId, activeContact?.isSupport, assistantReady, isAdmin, messages, supportId]);

  const mergedContacts = useMemo(() => {
    const merged = new Map<string, ContactItem>();
    conversationItems.forEach((item) => merged.set(item.id, item));
    contacts.forEach((item) => {
      const existing = merged.get(item.id);
      if (existing) {
        merged.set(item.id, { ...item, ...existing });
      } else {
        merged.set(item.id, item);
      }
    });
    return Array.from(merged.values()).sort((a, b) => {
      const priorityA = a.isAssistant ? 0 : a.isSupport ? 1 : 2;
      const priorityB = b.isAssistant ? 0 : b.isSupport ? 1 : 2;
      if (priorityA !== priorityB) return priorityA - priorityB;
      const timeA = a.lastMessageAt?.getTime?.() || 0;
      const timeB = b.lastMessageAt?.getTime?.() || 0;
      if (timeA !== timeB) return timeB - timeA;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [contacts, conversationItems]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) || null,
    [selectedStudentId, students]
  );

  const selectedWeekdayLabel = useMemo(
    () => WEEKDAY_OPTIONS.find((day) => day.key === selectedWeekday)?.label || selectedWeekday,
    [selectedWeekday]
  );

  const lastAssistantMessage = useMemo(() => {
    if (!activeContact?.isAssistant) return '';
    const latest = [...messages].reverse().find((item) => item.content && item.senderId === assistantContact.id);
    return latest?.content?.trim() || '';
  }, [activeContact?.isAssistant, messages]);

  const broadcastPreview = useMemo(() => {
    if (!lastAssistantMessage) return '';
    const normalized = lastAssistantMessage.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 140) return normalized;
    return `${normalized.slice(0, 140)}...`;
  }, [lastAssistantMessage]);

  useEffect(() => {
    if (!activeContact?.isAssistant || !isPersonal) return;
    if (!lastAssistantMessage) return;
    if (lastBroadcastSummary && lastAssistantMessage !== lastBroadcastSummary) {
      setBroadcastDismissed(false);
    }
  }, [activeContact?.isAssistant, isPersonal, lastAssistantMessage, lastBroadcastSummary]);

  const renderContactAvatar = (item: ContactItem, compact = false) => {
    const initial = item.name?.[0] || '?';
    const showStack = !item.isAssistant && !item.isSupport && Boolean(item.personalAvatar);
    if (!showStack) {
      return (
        <div
          className={`chat-widget-avatar${item.isAssistant ? ' is-assistant' : ''}${item.isSupport ? ' is-support' : ''}`}
        >
          {item.avatar ? (
            <img src={item.avatar} alt={item.name} />
          ) : (
            <span>{item.isAssistant ? 'MH' : item.isSupport ? 'S' : initial}</span>
          )}
        </div>
      );
    }

    return (
      <div className={`chat-widget-avatar-stack${compact ? ' is-compact' : ''}`}>
        <div className="chat-widget-avatar is-base">
          {item.avatar ? (
            <img src={item.avatar} alt={item.name} />
          ) : (
            <span>{initial}</span>
          )}
        </div>
        <div className="chat-widget-avatar is-overlay">
          {item.personalAvatar ? (
            <img src={item.personalAvatar} alt={`${item.name} personalizado`} />
          ) : (
            <span>{initial}</span>
          )}
        </div>
      </div>
    );
  };

  const openConversation = useCallback(
    async (item: ContactItem) => {
      if (!user?.uid) return;
      const contactMatch = contacts.find((contact) => contact.id === item.id);
      const resolvedItem = contactMatch ? { ...contactMatch, ...item } : item;
      if (item.conversationId) {
        setActiveContact(resolvedItem);
        setOpen(true);
        return;
      }
      const convo = await ensureConversation({
        userId: user.uid,
        userName: user.displayName,
        userPhoto: user.photoUrl,
        otherUserId: resolvedItem.id,
        otherName: resolvedItem.name,
        otherPhoto: resolvedItem.avatar,
        type: item.isAssistant ? 'ai' : item.isSupport ? 'support' : 'direct',
      });
      setActiveContact({ ...resolvedItem, conversationId: convo.id });
      setOpen(true);
    },
    [contacts, user?.displayName, user?.photoUrl, user?.uid]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as
        | { userId?: string; name?: string; photoUrl?: string }
        | undefined;
      if (!detail?.userId) return;
      const item: ContactItem = {
        id: detail.userId,
        name: detail.name || 'Conversa',
        avatar: detail.photoUrl,
      };
      openConversation(item);
    };
    window.addEventListener('mh:open-chat', handler as EventListener);
    return () => window.removeEventListener('mh:open-chat', handler as EventListener);
  }, [openConversation]);

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!user?.uid || !activeContact?.conversationId || !trimmed) return;
    setSending(true);
    setMessage('');
    setStickToBottom(true);
    setWorkoutHint(null);
    const isSupportReply = isAdmin && activeContact.isSupport;
    const senderId = isSupportReply ? supportId : user.uid;
    const senderName = isSupportReply ? supportContact.name : user.displayName;
    const senderPhoto = isSupportReply ? supportContact.avatar : user.photoUrl;
    try {
      await sendMessage({
        conversationId: activeContact.conversationId,
        senderId,
        senderName,
        senderPhoto,
        content: trimmed,
      });

      if (activeContact.isAssistant) {
        try {
          const history: Array<{ role: 'user' | 'assistant'; content: string }> = messages
            .filter((item) => item.content)
            .slice(-ASSISTANT_HISTORY_LIMIT)
            .map((item) => ({
              role: item.senderId === user.uid ? 'user' : 'assistant',
              content: item.content,
            }));
          const response = await chatWithAI(trimmed, history);
          await sendMessage({
            conversationId: activeContact.conversationId,
            senderId: assistantContact.id,
            senderName: assistantContact.name,
            senderPhoto: assistantContact.avatar,
            content: response.text,
            type: response.workout ? 'workout' : 'text',
            workoutData: response.workout,
            aiGenerated: true,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : 'Nao foi possivel acionar o assistente agora.';
          await sendMessage({
            conversationId: activeContact.conversationId,
            senderId: assistantContact.id,
            senderName: assistantContact.name,
            senderPhoto: assistantContact.avatar,
            content: errorMessage,
            type: 'text',
            aiGenerated: true,
          });
        }
      }
    } finally {
      setSending(false);
    }
  };

  const buildWorkoutPayload = async (
    workout: NonNullable<Message['workoutData']>,
    weekday?: string
  ) => {
    const lines = Array.isArray(workout.treino) ? workout.treino : [];
    const parsed = lines.map(parseExerciseLine);
    const exercisesResult = await fetchAvailableExercises();
    const catalog = exercisesResult.data || [];
    const index = buildExerciseIndex(catalog);
    const resolved = parsed.map((item) => {
      const match = findExerciseMatch(item.name, index);
      return {
        ...item,
        name: match?.nomeDoTreino || item.name,
        videoUrl: resolveExerciseVideo(match),
      };
    });
    return {
      nomeDoTreino: workout.nomeDaRotina || 'Treino sugerido',
      obsInstrucao: workout.objetivoDaRotina || '',
      treino: resolved.map((item) => item.name),
      seriesRep: resolved.map((item) => item.series),
      repeticoes: resolved.map((item) => item.reps),
      carga: resolved.map(() => 0),
      intervalo: resolved.map((item) => item.rest),
      videoUrls: resolved.map((item) => item.videoUrl),
      arquivos: false,
      ...(weekday ? { diasDaSemana: [weekday] } : {}),
    };
  };

  const handleSaveWorkout = async () => {
    if (!pendingWorkout || !user?.uid || !activeContact?.conversationId) return;
    setWorkoutHint(null);
    if (isPersonal) {
      if (!selectedStudentId) {
        setWorkoutHint('Selecione um aluno antes de salvar.');
        return;
      }
      if (!selectedWeekday) {
        setWorkoutHint('Selecione o dia da semana.');
        return;
      }
    }

    setSavingWorkout(true);
    try {
      const payload = await buildWorkoutPayload(pendingWorkout, selectedWeekday || undefined);
      const targetUserId = isPersonal ? selectedStudentId! : user.uid;
      const saveResult = await createUserWorkout(targetUserId, {
        ...payload,
        personalId: isPersonal ? user.uid : undefined,
      });
      if (saveResult.error || !saveResult.data?.id) {
        throw new Error(saveResult.error || 'Falha ao salvar o treino.');
      }
      const route = buildWorkoutRoute(saveResult.data.id, isPersonal ? targetUserId : undefined);
      const successMessage = isPersonal
        ? `Treino salvo para ${selectedStudent?.nome || 'o aluno'} em ${selectedWeekdayLabel || 'um dia'}.`
        : 'Treino criado e salvo nos seus treinos.';
      await sendMessage({
        conversationId: activeContact.conversationId,
        senderId: assistantContact.id,
        senderName: assistantContact.name,
        senderPhoto: assistantContact.avatar,
        content: successMessage,
        aiGenerated: true,
        action: { label: 'Abrir treino', route },
      });
      if (isPersonal && selectedStudent) {
        try {
          await notifyConversationEvent({
            senderId: user.uid,
            senderName: user.displayName,
            senderPhoto: user.photoUrl,
            recipientId: selectedStudent.id,
            recipientName: selectedStudent.nome,
            recipientPhoto: selectedStudent.photoUrl,
            content: `Treino novo: ${payload.nomeDoTreino}.`,
            workoutData: pendingWorkout,
            action: { label: 'Abrir treino', route },
          });
        } catch (_) {
          // Ignore chat notification failures.
        }
      }
      setPendingWorkout(null);
      setSelectedWeekday(null);
      setSelectedStudentId(null);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Nao foi possivel salvar o treino.';
      await sendMessage({
        conversationId: activeContact.conversationId,
        senderId: assistantContact.id,
        senderName: assistantContact.name,
        senderPhoto: assistantContact.avatar,
        content: `Nao foi possivel salvar o treino: ${errorMessage}`,
        aiGenerated: true,
      });
    } finally {
      setSavingWorkout(false);
    }
  };

  const handleDismissPendingWorkout = () => {
    setPendingWorkout(null);
    setWorkoutHint(null);
    setSelectedWeekday(null);
    setSelectedStudentId(null);
  };

  const handleBroadcastAssistantMessage = async () => {
    if (!user?.uid || !activeContact?.conversationId || !isPersonal) return;
    if (!students.length) {
      setBroadcastError('Nenhum aluno vinculado para receber a mensagem.');
      return;
    }
    if (!lastAssistantMessage) {
      setBroadcastError('Nao ha mensagem do assistente para enviar.');
      return;
    }
    setBroadcasting(true);
    setBroadcastResult('');
    setBroadcastError('');
    const content = lastAssistantMessage;
    try {
      const results = await Promise.allSettled(
        students.map((student) =>
          notifyConversationEvent({
            senderId: user.uid,
            senderName: user.displayName,
            senderPhoto: user.photoUrl,
            recipientId: student.id,
            recipientName: student.nome,
            recipientPhoto: student.photoUrl,
            content,
            type: 'text',
          })
        )
      );
      const successCount = results.filter((item) => item.status === 'fulfilled').length;
      const failedCount = results.length - successCount;
      const summary =
        failedCount > 0
          ? `Mensagem enviada para ${successCount} alunos. ${failedCount} falharam.`
          : `Mensagem enviada para ${successCount} alunos.`;
      setBroadcastResult(summary);
      setLastBroadcastSummary(summary);
      if (successCount > 0) {
        setBroadcastDismissed(true);
      }
      await sendMessage({
        conversationId: activeContact.conversationId,
        senderId: assistantContact.id,
        senderName: assistantContact.name,
        senderPhoto: assistantContact.avatar,
        content: summary,
        aiGenerated: true,
      });
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'Nao foi possivel enviar a mensagem agora.';
      setBroadcastError(messageText);
    } finally {
      setBroadcasting(false);
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (sending) return;
    handleSend();
  };

  const showAssistantExtras =
    !!activeContact && activeContact.isAssistant && (pendingWorkout || isPersonal);

  return (
    <div className={`chat-widget ${open ? 'open' : ''}`}>
      <button
        className="chat-fab"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Abrir chat"
      >
        Chat
      </button>
      {open && (
        <div className="chat-widget-panel">
          <div className="chat-widget-header">
            {activeContact ? (
              <>
                <button
                  className="chat-back"
                  type="button"
                  onClick={() => setActiveContact(null)}
                >
                  Voltar
                </button>
                <div className="chat-widget-header-contact">
                  {renderContactAvatar(activeContact, true)}
                  <div>
                    <strong>{activeContact.name}</strong>
                    <span>
                      {activeContact.isAssistant ? 'Assistente IA' : activeContact.isSupport ? 'Suporte' : 'Conversa'}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div>
                <strong>Conversas</strong>
                <span>Selecione um contato</span>
              </div>
            )}
            <button className="chat-close" type="button" onClick={() => setOpen(false)}>
              Fechar
            </button>
          </div>

          {!activeContact && (
            <div className="chat-widget-list">
              {mergedContacts.length ? (
                mergedContacts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`chat-widget-contact${item.isAssistant ? ' is-assistant' : ''}${item.isSupport ? ' is-support' : ''}${item.isAssistant || item.isSupport ? ' is-pinned' : ''}`}
                    onClick={() => openConversation(item)}
                  >
                    {renderContactAvatar(item)}
                    <div className="chat-widget-info">
                      <strong>{item.name}</strong>
                      <span>{item.lastMessage || 'Sem mensagens'}</span>
                    </div>
                    <div className="chat-widget-meta">
                      {item.isAssistant ? (
                        <span className="chat-widget-tag is-assistant">IA</span>
                      ) : item.isSupport ? (
                        <span className="chat-widget-tag is-support">Suporte</span>
                      ) : null}
                      <span>{formatTime(item.lastMessageAt)}</span>
                      {item.unreadCount ? <span className="chat-widget-badge">{item.unreadCount}</span> : null}
                    </div>
                  </button>
                ))
              ) : (
                <div className="chat-widget-empty">
                  <p>Nenhuma conversa encontrada.</p>
                </div>
              )}
            </div>
          )}

          {activeContact && (
            <div className="chat-widget-thread">
              {isAdmin && activeContact.isSupport && activeContact.conversationId && (
                <div className="chat-widget-auto">
                  <label className={`chat-widget-switch ${assistantReady ? '' : 'is-disabled'}`}>
                    <span className="chat-widget-switch-control">
                      <input
                        type="checkbox"
                        checked={autoReplyEnabled}
                        onChange={(event) =>
                          updateAutoReply(activeContact.conversationId!, event.target.checked)
                        }
                        disabled={!assistantReady}
                      />
                      <span className="chat-widget-switch-slider" />
                    </span>
                    <span className="chat-widget-switch-text">
                      <strong>Assistente responder</strong>
                      <span className="subtle">
                        {assistantReady
                          ? 'Responde automaticamente quando o usuario envia mensagem.'
                          : 'IA indisponivel para respostas automaticas.'}
                      </span>
                    </span>
                  </label>
                </div>
              )}
              <div className="chat-widget-messages" ref={messagesRef} onScroll={handleMessagesScroll}>
                {messages.length ? (
                  messages.map((item, index) => {
                    const isOwn =
                      item.senderId === user?.uid ||
                      (isAdmin && activeContact.isSupport && item.senderId === supportId);
                    const dayKey = buildDayKey(item.createdAt);
                    const previousKey = buildDayKey(messages[index - 1]?.createdAt);
                    const showDay = index === 0 || dayKey !== previousKey;
                    return (
                      <Fragment key={item.id}>
                        {showDay && (
                          <div className="chat-widget-date">{formatDayLabel(item.createdAt)}</div>
                        )}
                        <div className={`chat-widget-message ${isOwn ? 'is-own' : ''}`}>
                          <p>{item.content}</p>
                          <span>{formatTime(item.createdAt)}</span>
                        </div>
                      </Fragment>
                    );
                  })
                ) : (
                  <p className="chat-widget-empty">Sem mensagens ainda.</p>
                )}
              </div>
              {showAssistantExtras && (
                <div className="chat-widget-actions">
                  {activeContact.isAssistant && pendingWorkout && (
                    <div className="chat-widget-quick">
                      <div className="chat-widget-quick-head">
                        <span className="chat-widget-quick-label">Treino sugerido</span>
                        <button
                          type="button"
                          className="chat-widget-quick-close"
                          onClick={handleDismissPendingWorkout}
                          aria-label="Fechar sugestao de treino"
                          title="Fechar"
                        >
                          X
                        </button>
                      </div>
                      {isPersonal && students.length > 0 && (
                        <div className="chat-widget-quick-row">
                          <span className="chat-widget-quick-label">Alunos</span>
                          <div className="chat-widget-quick-chips">
                            {students.map((student) => (
                              <button
                                key={student.id}
                                type="button"
                                className={`chat-widget-quick-chip${selectedStudentId === student.id ? ' is-active' : ''}`}
                                onClick={() => setSelectedStudentId(student.id)}
                              >
                                {student.nome}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="chat-widget-quick-row">
                        <span className="chat-widget-quick-label">Dia da semana</span>
                        <div className="chat-widget-quick-chips">
                          {WEEKDAY_OPTIONS.map((day) => (
                            <button
                              key={day.key}
                              type="button"
                              className={`chat-widget-quick-chip${selectedWeekday === day.key ? ' is-active' : ''}`}
                              onClick={() => setSelectedWeekday(day.key)}
                            >
                              {day.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {isPersonal && students.length === 0 ? (
                        <span className="chat-widget-quick-hint">
                          Nenhum aluno vinculado para salvar o treino.
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="button chat-widget-quick-action"
                          onClick={handleSaveWorkout}
                          disabled={savingWorkout}
                        >
                          {savingWorkout ? 'Salvando...' : 'Salvar treino'}
                        </button>
                      )}
                      {workoutHint ? <span className="chat-widget-quick-error">{workoutHint}</span> : null}
                    </div>
                  )}
                  {activeContact.isAssistant && isPersonal && !broadcastDismissed && (
                    <div className="chat-widget-broadcast">
                      <div className="chat-widget-broadcast-header">
                        <span className="chat-widget-quick-label">Mensagem para todos</span>
                        <span className="chat-widget-quick-hint">
                          {students.length ? `${students.length} alunos` : 'Nenhum aluno vinculado'}
                        </span>
                      </div>
                      {lastAssistantMessage ? (
                        <p className="chat-widget-broadcast-preview">"{broadcastPreview}"</p>
                      ) : (
                        <span className="chat-widget-quick-hint">
                          Gere uma resposta com o assistente para enviar.
                        </span>
                      )}
                      <button
                        type="button"
                        className="button secondary sm"
                        onClick={handleBroadcastAssistantMessage}
                        disabled={broadcasting || !students.length || !lastAssistantMessage}
                      >
                        {broadcasting ? 'Enviando...' : 'Enviar para todos'}
                      </button>
                      {broadcastResult ? <span className="chat-widget-quick-hint">{broadcastResult}</span> : null}
                      {broadcastError ? <span className="chat-widget-quick-error">{broadcastError}</span> : null}
                    </div>
                  )}
                </div>
              )}
              <div className="chat-widget-composer">
                <div className="chat-widget-input">
                  <input
                    type="text"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Digite sua mensagem"
                  />
                  <button type="button" className="button" disabled={sending || !message.trim()} onClick={handleSend}>
                    {sending ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
