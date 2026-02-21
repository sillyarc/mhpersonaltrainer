export type BiometricDecision = 'approved' | 'rejected';

export type EntryStatus =
  | 'pending_biometric'
  | 'awaiting_turnstile'
  | 'denied'
  | 'completed'
  | 'turnstile_failed';

export type TurnstileStatus = 'not_requested' | 'opened' | 'failed' | 'blocked';

export interface Student {
  id: string;
  name: string;
  active: boolean;
  nfcTagId: string;
  biometricEnrollmentId: string;
  createdAt: string;
}

export interface DeviceInfo {
  userAgent: string;
  platform?: string;
  language?: string;
  timezone?: string;
  source?: string;
}

export interface BiometricThresholds {
  liveness: number;
  match: number;
}

export interface BiometricResult {
  provider: string;
  providerSessionId: string;
  livenessScore: number;
  matchScore: number;
  decision: BiometricDecision;
  reason?: string;
  thresholds: BiometricThresholds;
  analyzedAt: string;
}

export interface TurnstileResult {
  opened: boolean;
  reason?: string;
  providerRequestId?: string;
  openedAt: string;
}

export interface BiometricSessionRecord {
  sessionId: string;
  studentId: string;
  uploadUrlOrToken: string;
  expiresAt: string;
  createdAt: string;
  status: 'active' | 'submitted' | 'expired';
  result?: BiometricResult;
}

export interface EntryRecord {
  id: string;
  timestamp: string;
  studentId: string;
  studentName: string;
  deviceInfo: DeviceInfo;
  biometricResult: BiometricResult;
  decision: BiometricDecision;
  status: EntryStatus;
  turnstileStatus: TurnstileStatus;
  turnstileResult?: TurnstileResult;
}
