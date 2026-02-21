import { randomUUID } from 'crypto';
import { Timestamp } from 'firebase/firestore';
import type {
  BiometricResult,
  BiometricSessionRecord,
  DeviceInfo,
  EntryRecord,
  Student,
  TurnstileResult,
  TurnstileStatus,
} from '@/lib/checkinTypes';

type InMemoryStore = {
  students: Map<string, Student>;
  biometricSessions: Map<string, BiometricSessionRecord>;
  entries: Map<string, EntryRecord>;
  auditLog: EntryRecord[];
};

declare global {
  var __academyCheckinStore: InMemoryStore | undefined;
}

const NUMERIC_ID_REGEX = /^\d{4,20}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const nowIso = () => Timestamp.now().toDate().toISOString();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function buildSeedStudents() {
  const now = nowIso();
  const students: Student[] = [
    {
      id: '2024001',
      name: 'Ana Lima',
      active: true,
      nfcTagId: 'NFC-ANA-2024001',
      biometricEnrollmentId: 'bio_ana_2024001',
      createdAt: now,
    },
    {
      id: '2024002',
      name: 'Bruno Souza',
      active: true,
      nfcTagId: 'NFC-BRUNO-2024002',
      biometricEnrollmentId: 'bio_bruno_2024002',
      createdAt: now,
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Carla Santos',
      active: true,
      nfcTagId: 'NFC-CARLA-UUID',
      biometricEnrollmentId: 'bio_carla_uuid',
      createdAt: now,
    },
  ];
  return new Map(students.map((student) => [student.id, student]));
}

function getStore(): InMemoryStore {
  if (!global.__academyCheckinStore) {
    global.__academyCheckinStore = {
      students: buildSeedStudents(),
      biometricSessions: new Map<string, BiometricSessionRecord>(),
      entries: new Map<string, EntryRecord>(),
      auditLog: [],
    };
  }
  return global.__academyCheckinStore;
}

export function isValidStudentId(rawStudentId: string): boolean {
  const studentId = rawStudentId.trim();
  return NUMERIC_ID_REGEX.test(studentId) || UUID_REGEX.test(studentId);
}

export function getStudentById(studentId: string): Student | null {
  const student = getStore().students.get(studentId.trim());
  return student || null;
}

export function resolveStudentByNfcPayload(nfcPayload: string): Student | null {
  const value = nfcPayload.trim();
  if (isValidStudentId(value)) {
    const byId = getStudentById(value);
    if (byId) return byId;
  }

  for (const student of getStore().students.values()) {
    if (student.nfcTagId === value) return student;
  }

  return null;
}

export function createBiometricSessionRecord(input: {
  sessionId: string;
  studentId: string;
  uploadUrlOrToken: string;
  expiresAt: string;
}): BiometricSessionRecord {
  const record: BiometricSessionRecord = {
    sessionId: input.sessionId,
    studentId: input.studentId,
    uploadUrlOrToken: input.uploadUrlOrToken,
    expiresAt: input.expiresAt,
    createdAt: nowIso(),
    status: 'active',
  };
  getStore().biometricSessions.set(record.sessionId, record);
  return record;
}

export function getBiometricSessionRecord(sessionId: string): BiometricSessionRecord | null {
  const session = getStore().biometricSessions.get(sessionId);
  if (!session) return null;

  const expired = new Date(session.expiresAt).getTime() <= Date.now();
  if (expired && session.status !== 'expired') {
    const updated: BiometricSessionRecord = { ...session, status: 'expired' };
    getStore().biometricSessions.set(sessionId, updated);
    return updated;
  }
  return session;
}

export function saveBiometricSessionResult(sessionId: string, result: BiometricResult): BiometricSessionRecord | null {
  const session = getBiometricSessionRecord(sessionId);
  if (!session) return null;

  const updated: BiometricSessionRecord = {
    ...session,
    status: 'submitted',
    result,
  };
  getStore().biometricSessions.set(sessionId, updated);
  return updated;
}

export function normalizeDeviceInfo(input: unknown): DeviceInfo {
  const maybe = (input ?? {}) as Partial<DeviceInfo>;
  return {
    userAgent: String(maybe.userAgent || 'unknown'),
    platform: maybe.platform ? String(maybe.platform) : 'unknown',
    language: maybe.language ? String(maybe.language) : 'unknown',
    timezone: maybe.timezone ? String(maybe.timezone) : 'unknown',
    source: maybe.source ? String(maybe.source) : 'web-next',
  };
}

export function sanitizeBiometricResult(input: unknown): BiometricResult | null {
  if (!input || typeof input !== 'object') return null;
  const payload = input as Partial<BiometricResult>;

  const liveness = Number(payload.livenessScore);
  const match = Number(payload.matchScore);
  const thresholds = payload.thresholds || { liveness: 0.8, match: 0.82 };
  const livenessThreshold = Number(thresholds.liveness);
  const matchThreshold = Number(thresholds.match);
  const decision = payload.decision === 'approved' ? 'approved' : payload.decision === 'rejected' ? 'rejected' : null;

  if (!decision) return null;
  if (!Number.isFinite(liveness) || !Number.isFinite(match)) return null;
  if (!Number.isFinite(livenessThreshold) || !Number.isFinite(matchThreshold)) return null;

  return {
    provider: String(payload.provider || 'mock-biometrics'),
    providerSessionId: String(payload.providerSessionId || ''),
    livenessScore: clamp(liveness, 0, 1),
    matchScore: clamp(match, 0, 1),
    decision,
    reason: payload.reason ? String(payload.reason) : undefined,
    thresholds: {
      liveness: clamp(livenessThreshold, 0, 1),
      match: clamp(matchThreshold, 0, 1),
    },
    analyzedAt: payload.analyzedAt ? String(payload.analyzedAt) : nowIso(),
  };
}

export function isBiometricApproved(result: BiometricResult): boolean {
  return (
    result.decision === 'approved' &&
    result.livenessScore >= result.thresholds.liveness &&
    result.matchScore >= result.thresholds.match
  );
}

export function createEntryRecord(input: {
  student: Student;
  deviceInfo: DeviceInfo;
  biometricResult: BiometricResult;
}): EntryRecord {
  const id = randomUUID();
  const approved = isBiometricApproved(input.biometricResult);

  const entry: EntryRecord = {
    id,
    timestamp: nowIso(),
    studentId: input.student.id,
    studentName: input.student.name,
    deviceInfo: input.deviceInfo,
    biometricResult: input.biometricResult,
    decision: approved ? 'approved' : 'rejected',
    status: approved ? 'awaiting_turnstile' : 'denied',
    turnstileStatus: approved ? 'not_requested' : 'blocked',
  };

  const store = getStore();
  store.entries.set(entry.id, entry);
  store.auditLog.push(entry);
  return entry;
}

export function getEntryById(entryId: string): EntryRecord | null {
  const entry = getStore().entries.get(entryId);
  return entry || null;
}

export function markEntryTurnstileBlocked(entryId: string, reason: string): EntryRecord | null {
  const entry = getEntryById(entryId);
  if (!entry) return null;

  const turnstileResult: TurnstileResult = {
    opened: false,
    reason,
    openedAt: nowIso(),
  };

  const updated: EntryRecord = {
    ...entry,
    status: 'denied',
    turnstileStatus: 'blocked',
    turnstileResult,
  };
  const store = getStore();
  store.entries.set(entryId, updated);
  store.auditLog.push(updated);
  return updated;
}

export function applyTurnstileResult(entryId: string, result: TurnstileResult): EntryRecord | null {
  const entry = getEntryById(entryId);
  if (!entry) return null;

  const nextTurnstileStatus: TurnstileStatus = result.opened ? 'opened' : 'failed';
  const updated: EntryRecord = {
    ...entry,
    status: result.opened ? 'completed' : 'turnstile_failed',
    turnstileStatus: nextTurnstileStatus,
    turnstileResult: result,
  };

  const store = getStore();
  store.entries.set(entryId, updated);
  store.auditLog.push(updated);
  return updated;
}

export function listAuditRecords(limit = 200): EntryRecord[] {
  const items = [...getStore().auditLog];
  return items.slice(Math.max(0, items.length - limit)).reverse();
}
