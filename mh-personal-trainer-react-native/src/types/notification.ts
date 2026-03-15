import type { EvaluationType } from './evaluation';

export interface NotificationItem {
  id: string;
  titulo: string;
  descricao: string;
  data?: Date;
  para?: string;
  paraTodos?: boolean;
  tipo?: string;
  treinoId?: string;
  avOnlineId?: string;
  evaluationId?: string;
  evaluationType?: EvaluationType;
  evaluationUserId?: string;
  unread?: boolean;
  readBy?: string[];
  securityEvent?: boolean;
  securityStatus?: 'pending' | 'confirmed' | 'denied';
  securityResolvedAt?: Date;
  securityResolvedBy?: string;
  loginMeta?: {
    ip?: string;
    device?: string;
    method?: string;
    platform?: string;
    occurredAt?: string;
  };
}
