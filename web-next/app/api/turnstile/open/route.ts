import { NextResponse } from 'next/server';
import { getTurnstileAdapter } from '@/lib/turnstileAdapter';
import {
  applyTurnstileResult,
  getEntryById,
  isBiometricApproved,
  isValidStudentId,
  markEntryTurnstileBlocked,
} from '@/lib/db';

export const runtime = 'nodejs';

type OpenTurnstileRequestBody = {
  studentId?: string;
  entryId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OpenTurnstileRequestBody;
    const studentId = String(body?.studentId || '').trim();
    const entryId = String(body?.entryId || '').trim();

    if (!isValidStudentId(studentId) || !entryId) {
      return NextResponse.json(
        { error: 'studentId e entryId sao obrigatorios para abrir a catraca.' },
        { status: 400 }
      );
    }

    const entry = getEntryById(entryId);
    if (!entry) {
      return NextResponse.json({ error: 'Registro de entrada nao encontrado.' }, { status: 404 });
    }

    if (entry.studentId !== studentId) {
      return NextResponse.json({ error: 'entryId nao pertence ao studentId informado.' }, { status: 409 });
    }

    if (!isBiometricApproved(entry.biometricResult)) {
      const blocked = markEntryTurnstileBlocked(
        entryId,
        'Catraca bloqueada: biometria nao aprovada.'
      );
      return NextResponse.json(
        {
          opened: false,
          reason: blocked?.turnstileResult?.reason || 'Biometria reprovada.',
          entryStatus: blocked?.status || 'denied',
          turnstileStatus: blocked?.turnstileStatus || 'blocked',
        },
        { status: 403 }
      );
    }

    const adapter = getTurnstileAdapter();
    const result = await adapter.open({ studentId, entryId });
    const updatedEntry = applyTurnstileResult(entryId, result);

    return NextResponse.json({
      opened: result.opened,
      reason: result.reason,
      providerRequestId: result.providerRequestId,
      openedAt: result.openedAt,
      entryStatus: updatedEntry?.status || (result.opened ? 'completed' : 'turnstile_failed'),
      turnstileStatus: updatedEntry?.turnstileStatus || (result.opened ? 'opened' : 'failed'),
    });
  } catch (error) {
    console.error('[api/turnstile/open] error', error);
    return NextResponse.json({ error: 'Falha ao acionar catraca.' }, { status: 500 });
  }
}
