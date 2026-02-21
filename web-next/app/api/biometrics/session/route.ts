import { NextResponse } from 'next/server';
import { getBiometricsAdapter } from '@/lib/biometricsAdapter';
import {
  createBiometricSessionRecord,
  getStudentById,
  isValidStudentId,
  normalizeDeviceInfo,
} from '@/lib/db';

export const runtime = 'nodejs';

type SessionRequestBody = {
  studentId?: string;
  deviceInfo?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SessionRequestBody;
    const studentId = String(body?.studentId || '').trim();

    if (!isValidStudentId(studentId)) {
      return NextResponse.json(
        { error: 'studentId invalido. Use apenas numeros ou UUID.' },
        { status: 400 }
      );
    }

    const student = getStudentById(studentId);
    if (!student || !student.active) {
      return NextResponse.json({ error: 'Aluno nao encontrado ou inativo.' }, { status: 404 });
    }

    if (!student.biometricEnrollmentId) {
      return NextResponse.json(
        { error: 'Aluno sem biometria cadastrada. Nao e possivel registrar entrada.' },
        { status: 409 }
      );
    }

    if (!student.nfcTagId) {
      return NextResponse.json(
        { error: 'Aluno sem NFC cadastrado. Nao e possivel registrar entrada.' },
        { status: 409 }
      );
    }

    // Device info e normalizado para trilha de auditoria e troubleshooting.
    normalizeDeviceInfo(body?.deviceInfo);

    const biometrics = getBiometricsAdapter();
    const session = await biometrics.createSession({ student });

    createBiometricSessionRecord({
      sessionId: session.sessionId,
      studentId: student.id,
      uploadUrlOrToken: session.uploadUrlOrToken,
      expiresAt: session.expiresAt,
    });

    return NextResponse.json({
      sessionId: session.sessionId,
      uploadUrlOrToken: session.uploadUrlOrToken,
      expiresAt: session.expiresAt,
      student: {
        id: student.id,
        name: student.name,
      },
    });
  } catch (error) {
    console.error('[api/biometrics/session] error', error);
    return NextResponse.json({ error: 'Falha ao criar sessao biometrica.' }, { status: 500 });
  }
}
