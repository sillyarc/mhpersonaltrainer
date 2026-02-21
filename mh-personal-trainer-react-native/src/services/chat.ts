import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  updateDoc,
  where,
  orderBy,
  limit,
  increment,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { Conversation, Message, ReplyInfo } from '../types/chat';
import { firestoreService } from './firestoreService';
import { sendPushNotificationToUser } from './notifications';

interface ParticipantInfo {
  name?: string;
  photoUrl?: string;
}

interface EnsureConversationParams {
  userId: string;
  userName?: string;
  userPhoto?: string;
  otherUserId: string;
  otherName?: string;
  otherPhoto?: string;
  type?: 'direct' | 'support' | 'ai';
}

function buildParticipantInfoEntry(name?: string, photoUrl?: string): ParticipantInfo {
  const entry: ParticipantInfo = {};
  if (name !== undefined) {
    entry.name = name;
  }
  if (photoUrl !== undefined) {
    entry.photoUrl = photoUrl;
  }
  return entry;
}

function buildKey(userId: string, otherUserId: string) {
  return [userId, otherUserId].sort().join('_');
}

function mapConversation(id: string, data: any): Conversation {
  const lastMessageAt = data.lastMessageAt?.toDate?.() || undefined;
  const lastMessageContent = typeof data.lastMessage === 'string' ? data.lastMessage : '';
  const lastMessageSenderId = data.lastMessageSenderId || '';
  return {
    id,
    participants: data.participants || [],
    lastMessage: lastMessageContent
      ? {
          id: `${id}-last`,
          conversationId: id,
          senderId: lastMessageSenderId,
          content: lastMessageContent,
          type: 'text',
          createdAt: lastMessageAt || new Date(),
          readBy: [],
        }
      : undefined,
    lastMessageAt,
    createdAt: data.createdAt?.toDate?.() || new Date(),
    unreadCount: data.unreadCount || {},
    type: data.type || 'direct',
    participantInfo: data.participantInfo || undefined,
  };
}

export async function ensureConversation(params: EnsureConversationParams): Promise<Conversation> {
  const db = getFirebaseDb();
  const key = buildKey(params.userId, params.otherUserId);
  const conversationsRef = collection(db, 'conversations');
  const q = query(conversationsRef, where('key', '==', key), limit(1));
  const existing = await getDocs(q);

  if (!existing.empty) {
    const docSnap = existing.docs[0];
    const data = docSnap.data();
    const participantInfo: Record<string, ParticipantInfo> = data.participantInfo || {};
    let shouldUpdate = false;
    if (!participantInfo[params.userId]) {
      participantInfo[params.userId] = buildParticipantInfoEntry(params.userName, params.userPhoto);
      shouldUpdate = true;
    }
    if (!participantInfo[params.otherUserId]) {
      participantInfo[params.otherUserId] = buildParticipantInfoEntry(params.otherName, params.otherPhoto);
      shouldUpdate = true;
    }
    if (shouldUpdate) {
      await setDoc(
        doc(db, 'conversations', docSnap.id),
        { participantInfo },
        { merge: true }
      );
    }
    return mapConversation(docSnap.id, data);
  }

  const fallbackSnapshot = await getDocs(
    query(conversationsRef, where('participants', 'array-contains', params.userId))
  );
  const fallbackDoc = fallbackSnapshot.docs.find((docSnap) => {
    const data = docSnap.data();
    const participants = Array.isArray(data.participants) ? data.participants : [];
    return participants.includes(params.otherUserId);
  });

  if (fallbackDoc) {
    const data = fallbackDoc.data();
    const participantInfo: Record<string, ParticipantInfo> = data.participantInfo || {};
    let shouldUpdate = false;
    if (!data.key) {
      shouldUpdate = true;
    }
    if (!participantInfo[params.userId]) {
      participantInfo[params.userId] = buildParticipantInfoEntry(params.userName, params.userPhoto);
      shouldUpdate = true;
    }
    if (!participantInfo[params.otherUserId]) {
      participantInfo[params.otherUserId] = buildParticipantInfoEntry(params.otherName, params.otherPhoto);
      shouldUpdate = true;
    }
    if (shouldUpdate) {
      await setDoc(
        doc(db, 'conversations', fallbackDoc.id),
        {
          key,
          participantInfo,
        },
        { merge: true }
      );
    }
    return mapConversation(fallbackDoc.id, data);
  }

  const participantInfo: Record<string, ParticipantInfo> = {
    [params.userId]: buildParticipantInfoEntry(params.userName, params.userPhoto),
    [params.otherUserId]: buildParticipantInfoEntry(params.otherName, params.otherPhoto),
  };

  const docRef = await addDoc(conversationsRef, {
    key,
    participants: [params.userId, params.otherUserId],
    type: params.type || 'direct',
    participantInfo,
    createdAt: serverTimestamp(),
    lastMessage: '',
    lastMessageAt: serverTimestamp(),
    lastMessageSenderId: '',
    unreadCount: {},
  });

  return {
    id: docRef.id,
    participants: [params.userId, params.otherUserId],
    type: params.type || 'direct',
    createdAt: new Date(),
    unreadCount: {},
  };
}

export async function fetchConversation(conversationId: string): Promise<Conversation | null> {
  const db = getFirebaseDb();
  const docRef = doc(db, 'conversations', conversationId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return mapConversation(snapshot.id, snapshot.data());
}

export function listenToConversations(
  userId: string,
  callback: (items: Conversation[]) => void
) {
  const db = getFirebaseDb();
  const conversationsRef = collection(db, 'conversations');
  const q = query(conversationsRef, where('participants', 'array-contains', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => mapConversation(docSnap.id, docSnap.data()));
      items.sort((a, b) => {
        const timeA = a.lastMessageAt?.getTime?.() || 0;
        const timeB = b.lastMessageAt?.getTime?.() || 0;
        return timeB - timeA;
      });
      callback(items);
    },
    (error) => {
      console.error('Erro ao escutar conversas:', error);
      callback([]);
    }
  );
}

export function listenToMessages(
  conversationId: string,
  callback: (items: Message[]) => void
) {
  const db = getFirebaseDb();
  const messagesRef = collection(db, 'conversations', conversationId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const messages = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          conversationId,
          senderId: data.senderId,
          senderName: data.senderName,
          senderPhoto: data.senderPhoto,
          content: data.content,
          type: data.type || 'text',
          mediaUrl: data.mediaUrl,
          aiGenerated: data.aiGenerated,
          workoutData: data.workoutData,
          feedbackData: data.feedbackData,
          reactions: data.reactions || undefined,
          replyTo: data.replyTo || undefined,
          action: data.action || undefined,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          readBy: data.readBy || [],
        } as Message;
      });
      callback(messages);
    },
    (error) => {
      console.error('Erro ao escutar mensagens:', error);
      callback([]);
    }
  );
}

export async function sendMessage(params: {
  conversationId: string;
  senderId: string;
  senderName?: string;
  senderPhoto?: string;
  content: string;
  type?: Message['type'];
  mediaUrl?: string;
  aiGenerated?: boolean;
  workoutData?: Message['workoutData'];
  feedbackData?: Message['feedbackData'];
  replyTo?: ReplyInfo;
  action?: Message['action'];
}) {
  const db = getFirebaseDb();
  const messagesRef = collection(db, 'conversations', params.conversationId, 'messages');
  await addDoc(messagesRef, {
    senderId: params.senderId,
    senderName: params.senderName || '',
    senderPhoto: params.senderPhoto || '',
    content: params.content,
    type: params.type || 'text',
    mediaUrl: params.mediaUrl || '',
    aiGenerated: params.aiGenerated || false,
    workoutData: params.workoutData || null,
    feedbackData: params.feedbackData || null,
    replyTo: params.replyTo || null,
    action: params.action || null,
    createdAt: serverTimestamp(),
    readBy: [params.senderId],
  });

  await setDoc(
    doc(db, 'conversations', params.conversationId),
    {
      lastMessage: params.content,
      lastMessageAt: serverTimestamp(),
      lastMessageSenderId: params.senderId,
    },
    { merge: true }
  );

  try {
    const convoRef = doc(db, 'conversations', params.conversationId);
    const snapshot = await getDoc(convoRef);
    if (snapshot.exists()) {
      const data = snapshot.data();
      const participants = Array.isArray(data.participants) ? data.participants : [];
      if (participants.length) {
        const updates: Record<string, any> = {};
        participants.forEach((participantId: string) => {
          if (!participantId) return;
          if (participantId === params.senderId) {
            updates[`unreadCount.${participantId}`] = 0;
          } else {
            updates[`unreadCount.${participantId}`] = increment(1);
          }
        });
        if (Object.keys(updates).length) {
          await updateDoc(convoRef, updates);
        }
      }
    }
  } catch (error) {
    console.warn('Nao foi possivel atualizar contador de mensagens:', error);
  }
}

export async function notifyConversationEvent(params: {
  senderId: string;
  senderName?: string;
  senderPhoto?: string;
  recipientId: string;
  recipientName?: string;
  recipientPhoto?: string;
  content: string;
  workoutData?: Message['workoutData'];
  feedbackData?: Message['feedbackData'];
  action?: Message['action'];
  type?: Message['type'];
}) {
  if (!params.senderId || !params.recipientId || !params.content) return;
  if (params.senderId === params.recipientId) return;
  const convo = await ensureConversation({
    userId: params.senderId,
    userName: params.senderName,
    userPhoto: params.senderPhoto,
    otherUserId: params.recipientId,
    otherName: params.recipientName,
    otherPhoto: params.recipientPhoto,
    type: 'direct',
  });
  await sendMessage({
    conversationId: convo.id,
    senderId: params.senderId,
    senderName: params.senderName,
    senderPhoto: params.senderPhoto,
    content: params.content,
    workoutData: params.workoutData,
    feedbackData: params.feedbackData,
    action: params.action,
    type:
      params.type ||
      (params.workoutData ? 'workout' : params.feedbackData ? 'feedback' : 'text'),
  });
  const body = params.content.length > 140 ? `${params.content.slice(0, 137).trim()}...` : params.content;
  sendPushNotificationToUser(params.recipientId, {
    title: params.senderName || 'Nova mensagem',
    body,
    data: { type: 'chat', conversationId: convo.id },
  }).catch(() => {});
}

export async function getParticipantInfo(conversationId: string) {
  const db = getFirebaseDb();
  const docRef = doc(db, 'conversations', conversationId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return snapshot.data().participantInfo as Record<string, ParticipantInfo> | undefined;
}

export async function markConversationAsRead(conversationId: string, userId: string) {
  if (!conversationId || !userId) return;
  const db = getFirebaseDb();
  try {
    await updateDoc(doc(db, 'conversations', conversationId), {
      [`unreadCount.${userId}`]: 0,
    });
  } catch (error) {
    console.warn('Nao foi possivel marcar conversa como lida:', error);
  }
}

export async function updateMessageReaction(params: {
  conversationId: string;
  messageId: string;
  userId: string;
  reaction: string | null;
}) {
  if (!params.conversationId || !params.messageId || !params.userId) return;
  const db = getFirebaseDb();
  const messageRef = doc(db, 'conversations', params.conversationId, 'messages', params.messageId);
  const field = `reactions.${params.userId}`;
  try {
    if (params.reaction) {
      await updateDoc(messageRef, { [field]: params.reaction });
    } else {
      await updateDoc(messageRef, { [field]: deleteField() });
    }
  } catch (error) {
    console.warn('Nao foi possivel atualizar reacao:', error);
  }
}

export async function findPersonalByCode(code?: number | string | null) {
  if (code === null || code === undefined) return null;
  const normalized = typeof code === 'string' ? code.trim() : code;
  if (normalized === '' || normalized === 0) return null;
  const personal = await firestoreService.getPersonalProfileByCode(normalized);
  if (!personal) return null;
  return {
    id: personal.uid,
    name: personal.displayName,
    photoUrl: personal.photoUrl,
  };
}

export async function clearConversationMessages(conversationId: string) {
  const db = getFirebaseDb();
  const messagesRef = collection(db, 'conversations', conversationId, 'messages');
  const snapshot = await getDocs(messagesRef);
  if (snapshot.empty) {
    await updateDoc(doc(db, 'conversations', conversationId), {
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
      lastMessageSenderId: '',
    });
    return;
  }

  const docs = snapshot.docs;
  const chunkSize = 400;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = writeBatch(db);
    docs.slice(i, i + chunkSize).forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  }

  await updateDoc(doc(db, 'conversations', conversationId), {
    lastMessage: '',
    lastMessageAt: serverTimestamp(),
    lastMessageSenderId: '',
  });
}
