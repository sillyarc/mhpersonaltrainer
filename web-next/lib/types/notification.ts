export interface NotificationItem {
  id: string;
  titulo: string;
  descricao: string;
  data?: Date;
  expiresAt?: Date;
  para?: string;
  paraTodos?: boolean;
  tipo?: string;
  publico?: string;
  autoEvent?: boolean;
  eventType?: string;
  meta?: Record<string, any>;
  treinoId?: string;
  avOnlineId?: string;
  securityEvent?: boolean;
  securityStatus?: 'pending' | 'confirmed' | 'denied';
  securityResolvedAt?: Date;
  securityResolvedBy?: string;
  loginMeta?: {
    ip?: string;
    device?: string;
    method?: string;
    platform?: string;
    userAgent?: string;
    occurredAt?: string;
  };
}
