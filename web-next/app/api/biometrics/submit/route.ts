import { NextResponse } from 'next/server';
import { getBiometricsAdapter } from '@/lib/biometricsAdapter';
import {
  getBiometricSessionRecord,
  getStudentById,
  isValidStudentId,
  saveBiometricSessionResult,
} from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const sessionId = String(formData.get('sessionId') || '').trim();
    const studentId = String(formData.get('studentId') || '').trim();
    const selfie = formData.get('selfie');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId e obrigatorio.' }, { status: 400 });
    }

    if (!isValidStudentId(studentId)) {
      return NextResponse.json({ error: 'studentId invalido.' }, { status: 400 });
    }

    const session = getBiometricSessionRecord(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Sessao biometrica nao encontrada.' }, { status: 404 });
    }

    if (session.status === 'expired') {
      return NextResponse.json({ error: 'Sessao biometrica expirada.' }, { status: 410 });
    }

    if (session.studentId !== studentId) {
      return NextResponse.json({ error: 'Sessao nao pertence ao aluno informado.' }, { status: 409 });
    }

    const student = getStudentById(studentId);
    if (!student || !student.active) {
      return NextResponse.json({ error: 'Aluno nao encontrado ou inativo.' }, { status: 404 });
    }

    if (!(selfie instanceof Blob)) {
      return NextResponse.json({ error: 'Selfie obrigatoria no campo "selfie".' }, { status: 400 });
    }

    const arrayBuffer = await selfie.arrayBuffer();
    const selfieBuffer = Buffer.from(arrayBuffer);
    if (selfieBuffer.byteLength === 0) {
      return NextResponse.json({ error: 'Arquivo de selfie vazio.' }, { status: 400 });
    }

    const biometrics = getBiometricsAdapter();
    const result = await biometrics.verifySelfie({
      student,
      sessionId,
      selfieBuffer,
      mimeType: selfie.type || 'image/jpeg',
    });

    saveBiometricSessionResult(sessionId, result);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/biometrics/submit] error', error);
    return NextResponse.json({ error: 'Falha ao processar selfie biometrica.' }, { status: 500 });
  }
}
