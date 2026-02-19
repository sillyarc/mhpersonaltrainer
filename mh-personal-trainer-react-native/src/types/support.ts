export interface SupportTicket {
  id: string;
  titulo: string;
  texto: string;
  categoria?: string;
  priority?: string;
  data?: Date;
  userId?: string;
  resposta?: string;
  fotos?: string[];
}
