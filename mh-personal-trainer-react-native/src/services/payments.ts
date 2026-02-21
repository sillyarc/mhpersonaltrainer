const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || '';
const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
const STRIPE_FUNCTIONS_BASE_URL = process.env.EXPO_PUBLIC_STRIPE_FUNCTIONS_URL || '';
const STRIPE_SUBSCRIPTION_ENDPOINT =
  process.env.EXPO_PUBLIC_STRIPE_SUBSCRIPTION_ENDPOINT || 'createInscricao';
const STRIPE_CONNECT_STATUS_ENDPOINT =
  process.env.EXPO_PUBLIC_STRIPE_CONNECT_STATUS_ENDPOINT || 'stripeConnectStatus';
const STRIPE_CONNECT_ONBOARDING_ENDPOINT =
  process.env.EXPO_PUBLIC_STRIPE_CONNECT_ONBOARDING_ENDPOINT || 'createAndVerifyStripeAccount';
const STRIPE_CHECKOUT_ENDPOINT =
  process.env.EXPO_PUBLIC_STRIPE_CHECKOUT_ENDPOINT || 'createCheckoutSession';
const STRIPE_SETUP_INTENT_ENDPOINT =
  process.env.EXPO_PUBLIC_STRIPE_SETUP_INTENT_ENDPOINT || 'createSetupIntent';
const STRIPE_PAYMENT_LINK_MENSAL = process.env.EXPO_PUBLIC_STRIPE_PAYMENT_LINK_MENSAL || '';
const STRIPE_PAYMENT_LINK_BIMESTRAL = process.env.EXPO_PUBLIC_STRIPE_PAYMENT_LINK_BIMESTRAL || '';
const STRIPE_PAYMENT_LINK_SEMESTRAL = process.env.EXPO_PUBLIC_STRIPE_PAYMENT_LINK_SEMESTRAL || '';
const STRIPE_PAYMENT_LINK_ANUAL = process.env.EXPO_PUBLIC_STRIPE_PAYMENT_LINK_ANUAL || '';

function buildStripeFunctionUrl(endpoint: string): string {
  const base = STRIPE_FUNCTIONS_BASE_URL.replace(/\/+$/, '');
  const path = endpoint.replace(/^\/+/, '');
  return `${base}/${path}`;
}

function buildSubscriptionPayload(
  userId: string,
  email: string,
  name: string,
  priceId: string
) {
  const useAlunoPayload = STRIPE_SUBSCRIPTION_ENDPOINT.toLowerCase().includes('aluno');
  if (useAlunoPayload) {
    return { email, nome: name, price_id: priceId, userId };
  }
  return { userId, email, name, priceId };
}

interface PaymentIntent {
  clientSecret: string;
  paymentIntentId: string;
}

interface SubscriptionResult {
  subscriptionId: string;
  clientSecret?: string;
  customerId?: string;
  ephemeralKey?: string;
  status?: string;
}

export function extractSubscriptionDetails(data: any): Partial<SubscriptionResult> {
  if (!data) return {};
  const subscription = data.subscription ?? data;
  const latestInvoice = subscription.latest_invoice ?? data.latest_invoice;
  const paymentIntent =
    latestInvoice?.payment_intent ?? data.payment_intent ?? data.paymentIntent ?? data.paymentIntentId;
  const clientSecret =
    data.clientSecret ??
    data.client_secret ??
    data.paymentIntentClientSecret ??
    paymentIntent?.client_secret ??
    paymentIntent?.clientSecret;
  const subscriptionId = data.subscriptionId ?? data.subscription_id ?? subscription?.id;
  const customerId = data.customerId ?? data.customer_id ?? subscription?.customer ?? data.customer;
  const ephemeralKey = data.ephemeralKey ?? data.ephemeral_key;
  const status = data.status ?? subscription?.status;

  return { clientSecret, subscriptionId, customerId, ephemeralKey, status };
}

export interface StripeConnectStatus {
  accountId?: string;
  chargesEnabled: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  requirements?: {
    disabledReason?: string | null;
    currentDeadline?: number | null;
  };
}

export interface StripeConnectOnboardingPayload {
  email: string;
  firstName: string;
  lastName: string;
  cpf?: string;
  dobDay?: string;
  dobMonth?: string;
  dobYear?: string;
  addressLine1?: string;
  addressCity?: string;
  addressState?: string;
  addressPostalCode?: string;
  phone?: string;
  ip?: string;
  productDescription?: string;
  routingNumber?: string;
  accountNumber?: string;
  documentFront?: string;
  documentBack?: string;
  returnUrl?: string;
  refreshUrl?: string;
}

export interface StripeConnectOnboardingResult {
  accountId?: string;
  success?: boolean;
  url?: string;
}

interface StripeCheckoutResult {
  checkoutUrl?: string;
  sessionId?: string;
  paymentIntentId?: string;
  status?: string;
}

interface SetupIntentResult {
  setupIntentClientSecret: string;
  customerId?: string;
  ephemeralKey?: string;
}

function extractErrorMessageFromPayload(payload: any, fallbackMessage: string): string {
  if (!payload) return fallbackMessage;
  if (typeof payload === 'string') return payload || fallbackMessage;
  const message = payload.error || payload.message;
  const details = payload.details;
  if (message && details) return `${message}: ${details}`;
  if (message) return String(message);
  if (details) return String(details);
  return fallbackMessage;
}

async function getHttpErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const statusPrefix = `${fallbackMessage} (${response.status})`;
  try {
    const rawText = await response.text();
    if (!rawText) return statusPrefix;
    try {
      const parsed = JSON.parse(rawText);
      return `${statusPrefix}: ${extractErrorMessageFromPayload(parsed, rawText)}`;
    } catch {
      return `${statusPrefix}: ${rawText}`;
    }
  } catch {
    return statusPrefix;
  }
}

async function requestSetupIntent(payload: {
  email: string;
  name: string;
  customerId?: string;
}): Promise<{ data: SetupIntentResult | null; error: string | null }> {
  const response = await fetch(buildStripeFunctionUrl(STRIPE_SETUP_INTENT_ENDPOINT), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return { data: null, error: await getHttpErrorMessage(response, 'Failed to create setup intent') };
  }

  const data = await response.json();
  if (data?.error) {
    return { data: null, error: extractErrorMessageFromPayload(data, 'Failed to create setup intent') };
  }

  return { data, error: null };
}

export async function createPaymentIntent(
  amount: number,
  currency: string = 'brl',
  customerId?: string
): Promise<{ data: PaymentIntent | null; error: string | null }> {
  try {
    if (!API_BASE_URL) {
      throw new Error('API URL not configured');
    }
    const response = await fetch(`${API_BASE_URL}/api/payments/create-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency, customerId }),
    });

    if (!response.ok) throw new Error('Failed to create payment intent');

    const data = await response.json();
    if (data?.error) {
      const message = data?.details ? `${data.error}: ${data.details}` : data.error;
      return { data: null, error: message };
    }
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function createSubscription(
  userId: string,
  email: string,
  name: string,
  priceId: string
): Promise<{ data: SubscriptionResult | null; error: string | null }> {
  try {
    if (!STRIPE_FUNCTIONS_BASE_URL && !API_BASE_URL) {
      throw new Error('API URL not configured');
    }
    if (!STRIPE_FUNCTIONS_BASE_URL && API_BASE_URL.includes('api.stripe.com')) {
      throw new Error('Stripe functions URL not configured');
    }
    const subscriptionUrl = STRIPE_FUNCTIONS_BASE_URL
      ? buildStripeFunctionUrl(STRIPE_SUBSCRIPTION_ENDPOINT)
      : `${API_BASE_URL}/api/payments/create-subscription`;
    const payload = STRIPE_FUNCTIONS_BASE_URL
      ? buildSubscriptionPayload(userId, email, name, priceId)
      : { userId, email, name, priceId };
    const response = await fetch(subscriptionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await getHttpErrorMessage(response, 'Failed to create subscription'));
    }

    const data = await response.json();
    if (data?.error) {
      return { data: null, error: extractErrorMessageFromPayload(data, 'Failed to create subscription') };
    }
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function createSetupIntent(
  email: string,
  name: string,
  customerId?: string
): Promise<{ data: SetupIntentResult | null; error: string | null }> {
  try {
    if (!STRIPE_FUNCTIONS_BASE_URL) {
      throw new Error('Stripe functions URL not configured');
    }
    const firstAttempt = await requestSetupIntent({ email, name, customerId });
    if (!firstAttempt.error) {
      return firstAttempt;
    }

    // Some subscription endpoints may return a customer ID from a different Stripe context.
    // Retry without customerId to let backend resolve/create customer by email.
    if (customerId) {
      const fallbackAttempt = await requestSetupIntent({ email, name });
      if (!fallbackAttempt.error) {
        return fallbackAttempt;
      }
      return {
        data: null,
        error: `Setup intent failed with customerId and without customerId. First: ${firstAttempt.error}. Fallback: ${fallbackAttempt.error}`,
      };
    }

    return firstAttempt;
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function cancelSubscription(
  subscriptionId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!API_BASE_URL) {
      throw new Error('API URL not configured');
    }
    const response = await fetch(`${API_BASE_URL}/api/payments/cancel-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId }),
    });

    if (!response.ok) throw new Error('Failed to cancel subscription');

    return { success: true, error: null };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getSubscriptionStatus(
  userId: string
): Promise<{ data: any | null; error: string | null }> {
  try {
    if (!API_BASE_URL) {
      throw new Error('API URL not configured');
    }
    const response = await fetch(`${API_BASE_URL}/api/payments/subscription/${userId}`);

    if (!response.ok) throw new Error('Failed to get subscription status');

    const data = await response.json();
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function fetchInvoices(
  userId: string
): Promise<{ data: any[] | null; error: string | null }> {
  try {
    if (!API_BASE_URL) {
      throw new Error('API URL not configured');
    }
    const response = await fetch(`${API_BASE_URL}/api/payments/invoices/${userId}`);

    if (!response.ok) throw new Error('Failed to fetch invoices');

    const data = await response.json();
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function fetchStripeConnectStatus(
  userId: string,
  accountId?: string
): Promise<{ data: StripeConnectStatus | null; error: string | null }> {
  try {
    if (!STRIPE_FUNCTIONS_BASE_URL && !API_BASE_URL) {
      throw new Error('API URL not configured');
    }
    if (!STRIPE_FUNCTIONS_BASE_URL && API_BASE_URL.includes('api.stripe.com')) {
      throw new Error('Stripe functions URL not configured');
    }
    const statusUrl = STRIPE_FUNCTIONS_BASE_URL
      ? buildStripeFunctionUrl(STRIPE_CONNECT_STATUS_ENDPOINT)
      : `${API_BASE_URL}/api/payments/stripe-connect-status`;
    const response = await fetch(statusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, accountId }),
    });

    if (!response.ok) throw new Error('Failed to fetch Stripe status');

    const data = await response.json();
    const normalized: StripeConnectStatus = {
      accountId: data.accountId || data.id || accountId,
      chargesEnabled: Boolean(data.chargesEnabled ?? data.charges_enabled ?? false),
      payoutsEnabled: data.payoutsEnabled ?? data.payouts_enabled,
      detailsSubmitted: data.detailsSubmitted ?? data.details_submitted,
      requirements: data.requirements
        ? {
            disabledReason: data.requirements.disabledReason || data.requirements.disabled_reason || null,
            currentDeadline: data.requirements.currentDeadline || data.requirements.current_deadline || null,
          }
        : undefined,
    };
    return { data: normalized, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function submitStripeConnectOnboarding(
  payload: StripeConnectOnboardingPayload
): Promise<{ data: StripeConnectOnboardingResult | null; error: string | null }> {
  try {
    if (!API_BASE_URL && !STRIPE_FUNCTIONS_BASE_URL) {
      throw new Error('API URL not configured');
    }
    if (!STRIPE_FUNCTIONS_BASE_URL && API_BASE_URL.includes('api.stripe.com')) {
      throw new Error('Stripe functions URL not configured');
    }
    const endpoint = STRIPE_CONNECT_ONBOARDING_ENDPOINT.replace(/^\/+/, '');
    const onboardingUrl = STRIPE_FUNCTIONS_BASE_URL
      ? buildStripeFunctionUrl(endpoint)
      : `${API_BASE_URL.replace(/\/+$/, '')}/${endpoint}`;
    const body = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        body.append(key, String(value));
      }
    });

    const response = await fetch(onboardingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      return { data: null, error: await getHttpErrorMessage(response, 'Failed to submit onboarding') };
    }

    const data = await response.json();
    if (data?.error) {
      return { data: null, error: extractErrorMessageFromPayload(data, 'Failed to submit onboarding') };
    }
    return {
      data: {
        accountId: data.accountId || data.account_id,
        success: data.success ?? data.ok,
        url: data.url || data.onboardingUrl || data.accountLink,
      },
      error: null,
    };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function createStripeCheckoutSession(payload: {
  amount: number;
  currency?: string;
  studentId: string;
  personalId: string;
  paymentId: string;
  destinationAccountId?: string;
  applicationFeeAmount?: number;
  description?: string;
}): Promise<{ data: StripeCheckoutResult | null; error: string | null }> {
  try {
    if (!STRIPE_FUNCTIONS_BASE_URL && !API_BASE_URL) {
      throw new Error('API URL not configured');
    }
    if (!STRIPE_FUNCTIONS_BASE_URL && API_BASE_URL.includes('api.stripe.com')) {
      throw new Error('Stripe functions URL not configured');
    }
    const checkoutUrl = STRIPE_FUNCTIONS_BASE_URL
      ? buildStripeFunctionUrl(STRIPE_CHECKOUT_ENDPOINT)
      : `${API_BASE_URL}/api/payments/create-checkout`;
    const response = await fetch(checkoutUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error('Failed to create checkout session');

    const data = await response.json();
    return {
      data: {
        checkoutUrl: data.checkoutUrl || data.url,
        sessionId: data.sessionId || data.id,
        paymentIntentId: data.paymentIntentId || data.payment_intent,
        status: data.status,
      },
      error: null,
    };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export const subscriptionPlans = [
  {
    id: 'mensal',
    name: 'Mensal',
    price: 30,
    interval: '/mes',
    priceId: 'price_1RjKmIP3w93hGHYvwnQ25m13',
    paymentLink: STRIPE_PAYMENT_LINK_MENSAL,
    highlight: true,
    features: [
      'Acesso completo ao app',
      'Historico de treinos',
      'Suporte por email',
      'Chat IA ilimitado',
      'Insights de IA premium',
      'Avaliacao postural com IA',
    ],
  },
  {
    id: 'bimestral',
    name: 'Bimestral',
    price: 54,
    interval: '/bimestre',
    priceId: 'price_1RQ5T8P3w93hGHYvCfnTTdnp',
    paymentLink: STRIPE_PAYMENT_LINK_BIMESTRAL,
    features: [
      'Acesso completo ao app',
      'Historico de treinos',
      'Suporte por email',
      'Chat IA ilimitado',
      'Insights de IA premium',
      'Avaliacao postural com IA',
    ],
  },
  {
    id: 'semestral',
    name: 'Semestral',
    price: 150,
    interval: '/6 meses',
    priceId: 'price_1RQ5T8P3w93hGHYve8VegKff',
    paymentLink: STRIPE_PAYMENT_LINK_SEMESTRAL,
    features: [
      'Acesso completo ao app',
      'Historico de treinos',
      'Suporte por email',
      'Chat IA ilimitado',
      'Insights de IA premium',
      'Avaliacao postural com IA',
    ],
  },
  {
    id: 'anual',
    name: 'Anual',
    price: 300,
    interval: '/ano',
    priceId: 'price_1RQ5T8P3w93hGHYvld6PCdaY',
    paymentLink: STRIPE_PAYMENT_LINK_ANUAL,
    features: [
      'Acesso completo ao app',
      'Historico de treinos',
      'Suporte por email',
      'Chat IA ilimitado',
      'Insights de IA premium',
      'Avaliacao postural com IA',
    ],
  },
];

export function formatCurrency(value: number, currency: string = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(value);
}
