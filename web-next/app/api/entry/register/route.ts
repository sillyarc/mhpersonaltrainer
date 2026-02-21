import { NextResponse } from 'next/server';
import {
  createEntryRecord,
  getStudentById,
  isValidStudentId,
  normalizeDeviceInfo,
  sanitizeBiometricResult,
} from '@/lib/db';

export const runtime = 'nodejs';

type RegisterRequestBody = {
  studentId?: string;
  biometricResult?: unknown;
  deviceInfo?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterRequestBody;
    const studentId = String(body?.studentId || '').trim();

    if (!isValidStudentId(studentId)) {
      return NextResponse.json({ error: 'studentId invalido.' }, { status: 400 });
    }

    const student = getStudentById(studentId);
    if (!student || !student.active) {
      return NextResponse.json({ error: 'Aluno nao encontrado ou inativo.' }, { status: 404 });
    }

    if (!student.biometricEnrollmentId || !student.nfcTagId) {
      return NextResponse.json(
        { error: 'Aluno sem cadastro completo de biometria/NFC.' },
        { status: 409 }
      );
    }

    const biometricResult = sanitizeBiometricResult(body?.biometricResult);
    if (!biometricResult) {
      return NextResponse.json(
        { error: 'Resultado biometrico ausente ou invalido para registro da entrada.' },
        { status: 400 }
      );
    }

    const entry = createEntryRecord({
      student,
      deviceInfo: normalizeDeviceInfo(body?.deviceInfo),
      biometricResult,
    });

    return NextResponse.json({
      entryId: entry.id,
      status: entry.status,
      decision: entry.decision,
      allowTurnstile: entry.status === 'awaiting_turnstile',
      entry,
    });
  } catch (error) {
    console.error('[api/entry/register] error', error);
    return NextResponse.json({ error: 'Falha ao registrar entrada.' }, { status: 500 });
  }
}
