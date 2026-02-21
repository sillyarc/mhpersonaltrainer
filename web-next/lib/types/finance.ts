export interface PaymentRecord {
  id: string;
  valorDaCombranca?: number;
  todoDiaDoMes?: number;
  descricao?: string;
  pago?: boolean;
  repetirPMes?: number;
  diaDoPagamento?: number;
  datas?: Date[];
  checkoutUrl?: string;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  stripeStatus?: string;
  academyCode?: string | number;
  personalCode?: string | number;
  planName?: string;
  createdByAcademy?: boolean;
  academyId?: string;
}
