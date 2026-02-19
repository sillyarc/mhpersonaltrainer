import {
  addDoc,
  collection,
  collectionGroup,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { FeedbackItem } from '../types/feedback';
import { findPersonalByCode, notifyConversationEvent } from './chat';

interface QueryResult<T> {
  data: T | null;
  error: string | null;
}

const removeUndefinedFields = <T extends Record<string, any>>(payload: T): T =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)) as T;

const truncateText = (value?: string, limit = 160) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, Math.max(0, limit - 3)).trim()}...`;
};

const buildFeedbackMessage = (params: {
  title: string;
  rating?: number;
  commentLabel?: string;
  comment?: string;
  progresso?: string;
  dificuldade?: string;
  melhoria?: string;
  resposta?: string;
}) => {
  const lines = [params.title];
  if (typeof params.rating === 'number') {
    lines.push(`Nota: ${params.rating}/5`);
  }
  if (params.comment) {
    const label = params.commentLabel || 'Comentario';
    lines.push(`${label}: ${truncateText(params.comment)}`);
  }
  if (params.progresso) {
    lines.push(`Progresso: ${truncateText(params.progresso)}`);
  }
  if (params.dificuldade) {
    lines.push(`Dificuldade: ${truncateText(params.dificuldade)}`);
  }
  if (params.melhoria) {
    lines.push(`Melhoria: ${truncateText(params.melhoria)}`);
  }
  if (params.resposta) {
    lines.push(`Resposta: ${truncateText(params.resposta)}`);
  }
  return lines.join('\n');
};

const buildFeedbackData = (params: {
  title: string;
  rating?: number;
  comment?: string;
  progresso?: string;
  dificuldade?: string;
  melhoria?: string;
  resposta?: string;
}) => ({
  title: params.title,
  rating: typeof params.rating === 'number' ? params.rating : undefined,
  comment: params.comment ? truncateText(params.comment, 200) : undefined,
  progresso: params.progresso ? truncateText(params.progresso, 200) : undefined,
  dificuldade: params.dificuldade ? truncateText(params.dificuldade, 200) : undefined,
  melhoria: params.melhoria ? truncateText(params.melhoria, 200) : undefined,
  resposta: params.resposta ? truncateText(params.resposta, 200) : undefined,
});

const extractUserIdFromFeedbackPath = (path: string): string | null => {
  if (!path) return null;
  const parts = path.split('/');
  const userIndex = parts.indexOf('users');
  if (userIndex >= 0 && parts[userIndex + 1]) {
    return parts[userIndex + 1];
  }
  return null;
};

const mapFeedback = (id: string, data: any, refPath?: string): FeedbackItem => ({
  id,
  uid: data.uid,
  codigoDoPersonal: data.codigoDoPersonal,
  yourName: data.yourName,
  comentarioDoAluno: data.comentarioDoAluno,
  respostaDoProf: data.respostaDoProf,
  estrela: data.estrela,
  horaDeTermino: data.horaDeTermino?.toDate ? data.horaDeTermino.toDate() : data.horaDeTermino ? new Date(data.horaDeTermino) : undefined,
  melhoria: data.melhoria,
  dificuldadeDoExercicio: data.dificuldadeDoExercicio,
  progresso: data.progresso,
  imgUser: data.imgUser,
  nomeDoTreino: data.nomeDoTreino,
  obsInstrucao: data.obsInstrucao,
  refPath,
});

export async function submitAIFeedback(payload: {
  userId: string;
  rating: number;
  comentario: string;
  treino?: string;
}): Promise<QueryResult<void>> {
  try {
    const ref = collection(db, 'feedbackIA');
    await addDoc(ref, {
      userId: payload.userId,
      rating: payload.rating,
      comentario: payload.comentario,
      treino: payload.treino || '',
      createdAt: Timestamp.now(),
    });
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message || 'Erro ao enviar feedback' };
  }
}

export async function fetchFeedbacksByPersonalCode(
  codigoDoPersonal: number
): Promise<QueryResult<FeedbackItem[]>> {
  try {
    const ref = collectionGroup(db, 'feedback');
    const snapshot = await getDocs(
      query(ref, where('codigoDoPersonal', '==', codigoDoPersonal))
    );

    const items = snapshot.docs.map((docItem) =>
      mapFeedback(docItem.id, docItem.data(), docItem.ref.path)
    );

    items.sort((a, b) => {
      const aTime = a.horaDeTermino ? a.horaDeTermino.getTime() : 0;
      const bTime = b.horaDeTermino ? b.horaDeTermino.getTime() : 0;
      return bTime - aTime;
    });

    return { data: items, error: null };
  } catch (error: any) {
    return { data: null, error: error.message || 'Erro ao carregar feedbacks' };
  }
}

export async function fetchFeedbacksByUser(
  uid: string
): Promise<QueryResult<FeedbackItem[]>> {
  try {
    const ref = collectionGroup(db, 'feedback');
    const snapshot = await getDocs(query(ref, where('uid', '==', uid)));
    const items = snapshot.docs.map((docItem) =>
      mapFeedback(docItem.id, docItem.data(), docItem.ref.path)
    );

    items.sort((a, b) => {
      const aTime = a.horaDeTermino ? a.horaDeTermino.getTime() : 0;
      const bTime = b.horaDeTermino ? b.horaDeTermino.getTime() : 0;
      return bTime - aTime;
    });

    return { data: items, error: null };
  } catch (error: any) {
    return { data: null, error: error.message || 'Erro ao carregar feedbacks' };
  }
}

export async function respondToFeedback(
  feedbackPath: string,
  resposta: string
): Promise<QueryResult<void>> {
  try {
    const ref = doc(db, feedbackPath);
    const snapshot = await getDoc(ref);
    const data = snapshot.exists() ? snapshot.data() : null;
    await updateDoc(ref, {
      respostaDoProf: resposta,
      respondidoEm: Timestamp.now(),
    });
    const trimmed = String(resposta || '').trim();
    if (trimmed) {
      const userId = data?.uid || extractUserIdFromFeedbackPath(feedbackPath);
      const personal = data?.codigoDoPersonal
        ? await findPersonalByCode(data.codigoDoPersonal)
        : null;
      if (userId && personal) {
        const feedbackData = buildFeedbackData({
          title: data?.nomeDoTreino
            ? `Resposta do personal sobre ${data.nomeDoTreino}`
            : 'Resposta do personal',
          rating: typeof data?.estrela === 'number' ? data.estrela : undefined,
          comment: data?.comentarioDoAluno,
          resposta: trimmed,
        });
        const content = buildFeedbackMessage({
          title: data?.nomeDoTreino
            ? `Resposta do personal sobre ${data.nomeDoTreino}`
            : 'Resposta do personal',
          rating: typeof data?.estrela === 'number' ? data.estrela : undefined,
          commentLabel: 'Seu feedback',
          comment: data?.comentarioDoAluno,
          resposta: trimmed,
        });
        try {
          await notifyConversationEvent({
            senderId: personal.id,
            senderName: personal.name,
            senderPhoto: personal.photoUrl,
            recipientId: userId,
            recipientName: data?.yourName,
            recipientPhoto: data?.imgUser,
            content,
            feedbackData,
            action: {
              label: 'Ver feedbacks',
              route: '/feedbacks',
            },
          });
        } catch (_) {
          // Ignore chat notification failures.
        }
      }
    }
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message || 'Erro ao responder feedback' };
  }
}

export async function submitWorkoutFeedback(payload: {
  userId: string;
  codigoDoPersonal: number;
  yourName: string;
  comentarioDoAluno: string;
  estrela: number;
  nomeDoTreino?: string;
  obsInstrucao?: string;
  progresso?: string;
  dificuldadeDoExercicio?: string;
  melhoria?: string;
  imgUser?: string;
}): Promise<QueryResult<void>> {
  try {
    const ref = collection(db, 'users', payload.userId, 'feedback');
    const data = removeUndefinedFields({
      uid: payload.userId,
      codigoDoPersonal: payload.codigoDoPersonal,
      yourName: payload.yourName,
      comentarioDoAluno: payload.comentarioDoAluno,
      estrela: payload.estrela,
      nomeDoTreino: payload.nomeDoTreino,
      obsInstrucao: payload.obsInstrucao,
      progresso: payload.progresso,
      dificuldadeDoExercicio: payload.dificuldadeDoExercicio,
      melhoria: payload.melhoria,
      imgUser: payload.imgUser,
      horaDeTermino: Timestamp.now(),
    });
    await addDoc(ref, data);
    try {
      const personal = await findPersonalByCode(payload.codigoDoPersonal);
      if (personal) {
        const workoutLabel = payload.nomeDoTreino
          ? `Feedback do treino ${payload.nomeDoTreino}.`
          : 'Feedback do aluno.';
        const feedbackData = buildFeedbackData({
          title: workoutLabel,
          rating: payload.estrela,
          comment: payload.comentarioDoAluno,
          progresso: payload.progresso,
          dificuldade: payload.dificuldadeDoExercicio,
          melhoria: payload.melhoria,
        });
        const content = buildFeedbackMessage({
          title: workoutLabel,
          rating: payload.estrela,
          comment: payload.comentarioDoAluno,
          progresso: payload.progresso,
          dificuldade: payload.dificuldadeDoExercicio,
          melhoria: payload.melhoria,
        });
        await notifyConversationEvent({
          senderId: payload.userId,
          senderName: payload.yourName,
          senderPhoto: payload.imgUser,
          recipientId: personal.id,
          recipientName: personal.name,
          recipientPhoto: personal.photoUrl,
          content,
          feedbackData,
          action: {
            label: 'Ver feedbacks',
            route: '/feedbacks',
          },
        });
      }
    } catch (_) {
      // Ignore chat notification failures.
    }
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message || 'Erro ao enviar feedback' };
  }
}
