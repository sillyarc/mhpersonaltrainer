import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { showAlert } from '@utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useResponsive } from '../../src/hooks/useResponsive';
import { useAuthStore } from '../../src/store/authStore';
import { fetchInvoices, getSubscriptionStatus, formatCurrency } from '../../src/services/payments';

interface InvoiceItem {
  id?: string;
  amount_paid?: number;
  currency?: string;
  status?: string;
  created?: number;
  hosted_invoice_url?: string;
}

const formatDateFromUnix = (unix?: number) => {
  if (!unix || Number.isNaN(unix)) return '--';
  return new Date(unix * 1000).toLocaleDateString('pt-BR');
};

const normalizePlanLabel = (plan?: string) => {
  const raw = String(plan || '').trim();
  if (!raw) return 'Plano atual';
  return raw
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeStatus = (status?: string, assinaturaAtiva?: boolean) => {
  const raw = String(status || '').toLowerCase();
  if (!raw) return assinaturaAtiva ? 'ativo' : 'inativo';
  if (['active', 'trialing', 'paid', 'ok'].includes(raw)) return 'ativo';
  if (['past_due', 'requires_payment_method', 'unpaid', 'pending'].includes(raw)) return 'pendente';
  if (['canceled', 'cancelled', 'inactive'].includes(raw)) return 'inativo';
  return raw;
};

const mapInvoiceStatus = (status?: string) => {
  const raw = String(status || '').toLowerCase();
  if (!raw) return 'aguardando';
  const labels: Record<string, string> = {
    paid: 'pago',
    open: 'aberto',
    draft: 'rascunho',
    uncollectible: 'inadimplente',
    void: 'cancelado',
  };
  return labels[raw] || raw;
};

const statusPalette = (status: string) => {
  if (status === 'ativo') {
    return { text: '#7BFFB0', border: 'rgba(123,255,176,0.45)', bg: 'rgba(11,72,44,0.45)' };
  }
  if (status === 'pendente') {
    return { text: '#FFD78A', border: 'rgba(255,215,138,0.45)', bg: 'rgba(91,60,13,0.45)' };
  }
  return { text: '#C9D7E7', border: 'rgba(201,215,231,0.34)', bg: 'rgba(37,49,64,0.45)' };
};

export default function SubscriptionDetailsScreen() {
  const { colors, spacing, borderRadius, typography } = useTheme();
  const { padding } = useResponsive();
  const { user } = useAuthStore();

  const [statusData, setStatusData] = useState<any>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'silent') => {
      if (!user?.uid) {
        setStatusData(null);
        setInvoices([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (mode === 'initial') {
        setLoading(true);
      } else if (mode === 'refresh') {
        setRefreshing(true);
      }
      try {
        const [statusResult, invoiceResult] = await Promise.all([
          getSubscriptionStatus(user.uid),
          fetchInvoices(user.uid),
        ]);
        setStatusData(statusResult.data || null);
        setInvoices(Array.isArray(invoiceResult.data) ? invoiceResult.data : []);
      } finally {
        if (mode === 'initial') setLoading(false);
        if (mode === 'refresh') setRefreshing(false);
      }
    },
    [user?.uid]
  );

  useEffect(() => {
    void loadData('initial');
  }, [loadData]);

  const handleOpenInvoice = useCallback(async (url?: string) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      showAlert('Erro', 'Nao foi possivel abrir o link da fatura.');
    }
  }, []);

  const planLabel = useMemo(
    () => normalizePlanLabel(statusData?.planName || user?.tipoDeAssinatura),
    [statusData?.planName, user?.tipoDeAssinatura]
  );

  const statusLabel = useMemo(
    () => normalizeStatus(statusData?.status, Boolean(user?.assinatura)),
    [statusData?.status, user?.assinatura]
  );

  const statusColor = useMemo(() => statusPalette(statusLabel), [statusLabel]);

  const renewalDateLabel = useMemo(() => {
    if (statusData?.current_period_end) return formatDateFromUnix(statusData.current_period_end);
    return '--';
  }, [statusData?.current_period_end]);

  const lastInvoiceDateLabel = useMemo(() => {
    const mostRecent = [...invoices].sort((a, b) => Number(b.created || 0) - Number(a.created || 0))[0];
    return formatDateFromUnix(mostRecent?.created);
  }, [invoices]);

  const paidInvoices = useMemo(
    () => invoices.filter((item) => String(item.status || '').toLowerCase() === 'paid').length,
    [invoices]
  );

  return (
    <LinearGradient
      colors={['#0A1019', '#101D2E', '#182B44']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: spacing['3xl'] }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void loadData('refresh')} />
          }
        >
          <View style={{ paddingHorizontal: padding }}>
            <View style={[styles.headerRow, { marginTop: spacing.sm }]}>
              <View style={styles.headerCopy}>
                <Text style={[{ color: '#F7FBFF' }, typography.headlineLarge]}>
                  Detalhes da assinatura
                </Text>
                <Text
                  style={[
                    { color: 'rgba(220,235,248,0.82)', marginTop: spacing.xs },
                    typography.bodySmall,
                  ]}
                >
                  Plano, status e faturas em um unico painel.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.headerAction, { borderRadius: borderRadius.full }]}
                onPress={() => void loadData('refresh')}
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color="#194784" />
                ) : (
                  <Ionicons name="refresh-outline" size={17} color="#194784" />
                )}
              </TouchableOpacity>
            </View>

            <LinearGradient
              colors={['#0A1A2D', '#13375A', '#1F4F7A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.heroCard, { borderRadius: borderRadius.lg, marginTop: spacing.md }]}
            >
              <View style={styles.heroGlow} />
              <View style={styles.heroTopRow}>
                <View style={styles.heroTitleRow}>
                  <View style={[styles.heroIconWrap, { borderRadius: borderRadius.full }]}>
                    <Ionicons name="sparkles-outline" size={18} color="#A4DBFF" />
                  </View>
                  <View style={styles.heroTitleCopy}>
                    <Text style={[styles.heroPlanTitle, typography.titleMedium]} numberOfLines={1}>
                      {planLabel}
                    </Text>
                    <Text style={[styles.heroPlanSubtitle, typography.bodySmall]}>
                      Plano atual do seu acesso
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      borderColor: statusColor.border,
                      backgroundColor: statusColor.bg,
                      borderRadius: borderRadius.full,
                    },
                  ]}
                >
                  <Text style={[styles.statusBadgeText, typography.labelSmall, { color: statusColor.text }]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>

              <View style={[styles.heroStatsRow, { marginTop: spacing.md }]}>
                <View style={[styles.heroMetricCard, { borderRadius: borderRadius.md }]}>
                  <Text style={[styles.heroMetricLabel, typography.labelSmall]}>Renovacao</Text>
                  <Text style={[styles.heroMetricValue, typography.titleSmall]}>{renewalDateLabel}</Text>
                </View>
                <View style={[styles.heroMetricCard, { borderRadius: borderRadius.md }]}>
                  <Text style={[styles.heroMetricLabel, typography.labelSmall]}>Faturas pagas</Text>
                  <Text style={[styles.heroMetricValue, typography.titleSmall]}>{paidInvoices}</Text>
                </View>
                <View style={[styles.heroMetricCard, { borderRadius: borderRadius.md }]}>
                  <Text style={[styles.heroMetricLabel, typography.labelSmall]}>Ultima fatura</Text>
                  <Text style={[styles.heroMetricValue, typography.titleSmall]}>{lastInvoiceDateLabel}</Text>
                </View>
              </View>
            </LinearGradient>

            <View style={[styles.sectionHeader, { marginTop: spacing.lg }]}>
              <Text style={[{ color: '#F2F8FD' }, typography.titleSmall]}>Historico de pagamentos</Text>
              <TouchableOpacity
                style={[styles.sectionAction, { borderRadius: borderRadius.full }]}
                onPress={() => void loadData('refresh')}
              >
                <Ionicons name="reload-outline" size={14} color="#B4DAF5" />
                <Text style={[styles.sectionActionText, typography.labelSmall]}>Atualizar</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ paddingHorizontal: padding, marginTop: spacing.sm }}>
            {loading ? (
              <View style={[styles.placeholderCard, { borderRadius: borderRadius.lg }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.placeholderText, typography.bodySmall, { marginTop: spacing.sm }]}>
                  Carregando historico...
                </Text>
              </View>
            ) : invoices.length === 0 ? (
              <View style={[styles.placeholderCard, { borderRadius: borderRadius.lg }]}>
                <Ionicons name="document-text-outline" size={52} color="rgba(189,209,228,0.7)" />
                <Text style={[styles.placeholderTitle, typography.titleSmall, { marginTop: spacing.md }]}>
                  Nenhuma fatura encontrada
                </Text>
                <Text style={[styles.placeholderText, typography.bodySmall, { marginTop: spacing.xs }]}>
                  Quando houver cobrancas, elas aparecem aqui com status e valor.
                </Text>
                <TouchableOpacity
                  style={[styles.placeholderAction, { borderRadius: borderRadius.full, marginTop: spacing.md }]}
                  onPress={() => router.push('/financeiro/plans')}
                >
                  <Ionicons name="diamond-outline" size={15} color="#E6EEF8" />
                  <Text style={[styles.placeholderActionText, typography.labelSmall]}>Ver planos</Text>
                </TouchableOpacity>
              </View>
            ) : (
              invoices
                .slice()
                .sort((a, b) => Number(b.created || 0) - Number(a.created || 0))
                .map((item) => {
                  const invoiceStatus = mapInvoiceStatus(item.status);
                  const invoicePalette = statusPalette(
                    invoiceStatus === 'pago' ? 'ativo' : invoiceStatus === 'aberto' ? 'pendente' : 'inativo'
                  );
                  const amountValue = Number(item.amount_paid || 0) / 100;

                  return (
                    <TouchableOpacity
                      key={item.id || `${item.created}-${amountValue}`}
                      style={[styles.invoiceCard, { borderRadius: borderRadius.lg }]}
                      onPress={() => handleOpenInvoice(item.hosted_invoice_url)}
                      disabled={!item.hosted_invoice_url}
                    >
                      <View style={styles.invoiceTopRow}>
                        <View style={styles.invoiceTitleWrap}>
                          <Ionicons name="receipt-outline" size={16} color="#194784" />
                          <Text style={[styles.invoiceTitle, typography.labelMedium]} numberOfLines={1}>
                            {item.id || 'Fatura Stripe'}
                          </Text>
                        </View>
                        <Text style={[styles.invoiceAmount, typography.titleSmall]}>
                          {formatCurrency(amountValue, String(item.currency || 'BRL').toUpperCase())}
                        </Text>
                      </View>

                      <View style={styles.invoiceMetaRow}>
                        <Text style={[styles.invoiceMetaText, typography.bodySmall]}>
                          Data: {formatDateFromUnix(item.created)}
                        </Text>
                        <View
                          style={[
                            styles.invoiceStatusPill,
                            {
                              borderColor: invoicePalette.border,
                              backgroundColor: invoicePalette.bg,
                              borderRadius: borderRadius.full,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.invoiceStatusText,
                              typography.labelSmall,
                              { color: invoicePalette.text },
                            ]}
                          >
                            {invoiceStatus}
                          </Text>
                        </View>
                      </View>

                      {item.hosted_invoice_url ? (
                        <View style={styles.invoiceFooter}>
                          <Text style={[styles.invoiceFooterText, typography.labelSmall]}>Abrir comprovante</Text>
                          <Ionicons name="open-outline" size={14} color="#E6EEF8" />
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerCopy: {
    flex: 1,
  },
  headerAction: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(25,71,132,0.35)',
    backgroundColor: 'rgba(19,46,73,0.55)',
  },
  heroCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(190,224,247,0.23)',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    right: -44,
    top: -48,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(123,202,255,0.17)',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  heroIconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(173,224,255,0.32)',
    backgroundColor: 'rgba(9,23,38,0.45)',
  },
  heroTitleCopy: {
    flex: 1,
  },
  heroPlanTitle: {
    color: '#F7FBFF',
    fontWeight: '800',
  },
  heroPlanSubtitle: {
    marginTop: 2,
    color: 'rgba(211,230,244,0.82)',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heroMetricCard: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(191,223,245,0.26)',
    backgroundColor: 'rgba(7,14,25,0.44)',
  },
  heroMetricLabel: {
    color: 'rgba(204,224,239,0.8)',
  },
  heroMetricValue: {
    marginTop: 4,
    color: '#F5FBFF',
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionAction: {
    borderWidth: 1,
    borderColor: 'rgba(171,220,250,0.35)',
    backgroundColor: 'rgba(13,36,58,0.56)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sectionActionText: {
    color: '#B4DAF5',
    fontWeight: '700',
  },
  placeholderCard: {
    borderWidth: 1,
    borderColor: 'rgba(180,214,236,0.18)',
    backgroundColor: 'rgba(6,14,24,0.52)',
    minHeight: 250,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  placeholderTitle: {
    color: '#F0F7FD',
    textAlign: 'center',
  },
  placeholderText: {
    color: 'rgba(201,219,234,0.86)',
    textAlign: 'center',
  },
  placeholderAction: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: 'rgba(25,71,132,0.4)',
    backgroundColor: 'rgba(21,90,140,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  placeholderActionText: {
    color: '#E6EEF8',
    fontWeight: '700',
  },
  invoiceCard: {
    borderWidth: 1,
    borderColor: 'rgba(185,219,242,0.2)',
    backgroundColor: 'rgba(8,16,29,0.6)',
    padding: 13,
    marginBottom: 10,
  },
  invoiceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  invoiceTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    paddingRight: 6,
  },
  invoiceTitle: {
    color: '#E6EEF8',
    flex: 1,
  },
  invoiceAmount: {
    color: '#194784',
    fontWeight: '800',
  },
  invoiceMetaRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  invoiceMetaText: {
    color: 'rgba(196,217,234,0.85)',
  },
  invoiceStatusPill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  invoiceStatusText: {
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  invoiceFooter: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
  },
  invoiceFooterText: {
    color: '#E6EEF8',
    fontWeight: '700',
  },
});


