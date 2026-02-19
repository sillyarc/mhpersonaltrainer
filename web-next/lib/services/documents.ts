import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { DocumentFile } from '../types/document';

interface QueryResult<T> {
  data: T | null;
  error: string | null;
}

const mapDocument = (id: string, data: any): DocumentFile => ({
  id,
  nome: data.nome || 'Documento',
  data: data.data?.toDate ? data.data.toDate() : data.data ? new Date(data.data) : undefined,
  arquivos: data.arquivos || '',
  fotos: data.fotos || '',
});

export async function fetchUserDocuments(userId: string): Promise<QueryResult<DocumentFile[]>> {
  try {
    const ref = collection(db, 'users', userId, 'arquivos');
    const q = query(ref, orderBy('data', 'desc'));
    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map((docItem) => mapDocument(docItem.id, docItem.data()));
    return { data: docs, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function fetchUserDocumentById(
  userId: string,
  documentId: string
): Promise<QueryResult<DocumentFile>> {
  try {
    const ref = doc(db, 'users', userId, 'arquivos', documentId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return { data: null, error: 'Documento não encontrado' };
    }
    return { data: mapDocument(snapshot.id, snapshot.data()), error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function createUserDocument(
  userId: string,
  payload: Omit<DocumentFile, 'id' | 'data'>
): Promise<QueryResult<DocumentFile>> {
  try {
    const ref = collection(db, 'users', userId, 'arquivos');
    const docRef = await addDoc(ref, {
      nome: payload.nome || 'Documento',
      arquivos: payload.arquivos || '',
      fotos: payload.fotos || '',
      data: Timestamp.now(),
    });
    return {
      data: {
        id: docRef.id,
        nome: payload.nome || 'Documento',
        arquivos: payload.arquivos || '',
        fotos: payload.fotos || '',
        data: new Date(),
      },
      error: null,
    };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function deleteUserDocument(
  userId: string,
  documentId: string
): Promise<QueryResult<void>> {
  try {
    const ref = doc(db, 'users', userId, 'arquivos', documentId);
    await deleteDoc(ref);
    return { data: undefined, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}
