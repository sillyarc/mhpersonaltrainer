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
const STRIPE_CHECKOUT_SUCCESS_URL =
  process.env.EXPO_PUBLIC_STRIPE_CHECKOUT_SUCCESS_URL ||
  'https://southamerica-east1-profissions-2746d.cloudfunctions.net/stripeCheckoutRedirect?status=success&session_id={CHECKOUT_SESSION_ID}';
const STRIPE_CHECKOUT_CANCEL_URL =
  process.env.EXPO_PUBLIC_STRIPE_CHECKOUT_CANCEL_URL ||
  'https://southamerica-east1-profissions-2746d.cloudfunctions.net/stripeCheckoutRedirect?status=cancel';
const STRIPE_CANCEL_SUBSCRIPTION_ENDPOINT =
  process.env.EXPO_PUBLIC_STRIPE_CANCEL_SUBSCRIPTION_ENDPOINT || 'cancelSubscription';
const STRIPE_SUBSCRIPTION_STATUS_FUNCTION_ENDPOINT =
  process.env.EXPO_PUBLIC_STRIPE_SUBSCRIPTION_STATUS_ENDPOINT || 'subscriptionStatus';
const STRIPE_INVOICES_ENDPOINT =
  process.env.EXPO_PUBLIC_STRIPE_INVOICES_ENDPOINT || '';
const STRIPE_PAYMENT_LINK_MENSAL = process.env.EXPO_PUBLIC_STRIPE_PAYMENT_LINK_MENSAL || '';
const STRIPE_PAYMENT_LINK_BIMESTRAL = process.env.EXPO_PUBLIC_STRIPE_PAYMENT_LINK_BIMESTRAL || '';
const STRIPE_PAYMENT_LINK_SEMESTRAL = process.env.EXPO_PUBLIC_STRIPE_PAYMENT_LINK_SEMESTRAL || '';
const STRIPE_PAYMENT_LINK_ANUAL = process.env.EXPO_PUBLIC_STRIPE_PAYMENT_LINK_ANUAL || '';
const WEB_APP_BASE_URL =
  process.env.EXPO_PUBLIC_WEB_PAYMENT_BASE_URL ||
  process.env.EXPO_PUBLIC_WEB_APP_URL ||
  process.env.EXPO_PUBLIC_WEB_LANDING_URL ||
  'https://mhpersonaltrainer.com.br';
const WEB_STRIPE_PAYMENT_LAUNCHER_PATH =
  process.env.EXPO_PUBLIC_WEB_PAYMENT_LAUNCHER_PATH || '/stripe/mobile-checkout';
const STRIPE_PRICE_ID_MENSAL =
  process.env.EXPO_PUBLIC_STRIPE_PRICE_ID_MENSAL || 'price_1R5Bvz00hfXDRSJ7GQVCLUO2';
const STRIPE_PRICE_ID_BIMESTRAL =
  process.env.EXPO_PUBLIC_STRIPE_PRICE_ID_BIMESTRAL || 'price_1R5Bvz00hfXDRSJ7fe8G4TtZ';
const STRIPE_PRICE_ID_SEMESTRAL =
  process.env.EXPO_PUBLIC_STRIPE_PRICE_ID_SEMESTRAL || 'price_1R5Bvz00hfXDRSJ7SqLAi5oG';
const STRIPE_PRICE_ID_ANUAL =
  process.env.EXPO_PUBLIC_STRIPE_PRICE_ID_ANUAL || 'price_1R5Bvz00hfXDRSJ7rgHUdZNm';

type StripeCheckoutRedirectSource = 'subscription' | 'payment';

export type StripeWebCheckoutLauncherPayload =
  | {
      checkoutUrl: string;
      paymentId?: string;
      studentId?: string;
      returnPath?: string;
    }
  | {
      amount: number;
      currency?: string;
      studentId: string;
      personalId: string;
      paymentId: string;
      destinationAccountId?: string;
      applicationFeeAmount?: number;
      description?: string;
      returnPath?: string;
    };

function resolveStripeMode(): 'test' | 'live' | undefined {
  const explicitMode = String(process.env.EXPO_PUBLIC_STRIPE_MODE || '')
    .trim()
    .toLowerCase();
  if (explicitMode === 'test' || explicitMode === 'live') {
    return explicitMode;
  }
  if (STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_')) {
    return 'test';
  }
  if (STRIPE_PUBLISHABLE_KEY.startsWith('pk_live_')) {
    return 'live';
  }
  return undefined;
}

const STRIPE_MODE = resolveStripeMode();

function buildStripeFunctionUrl(endpoint: string): string {
  const base = STRIPE_FUNCTIONS_BASE_URL.replace(/\/+$/, '');
  const path = endpoint.replace(/^\/+/, '');
  return `${base}/${path}`;
}

function resolveWebAppBaseUrl(): string {
  const rawBaseUrl = String(WEB_APP_BASE_URL || '').trim();
  if (!rawBaseUrl) {
    return 'https://mhpersonaltrainer.com.br';
  }
  try {
    const parsed = new URL(rawBaseUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // Ignore invalid custom base URLs and fall back to the public site.
  }
  return 'https://mhpersonaltrainer.com.br';
}

function buildStripeHostedCheckoutReturnUrl(
  status: 'success' | 'cancel',
  options?: {
    source?: StripeCheckoutRedirectSource;
    paymentId?: string;
    returnPath?: string;
  }
): string {
  const fallback =
    status === 'success' ? STRIPE_CHECKOUT_SUCCESS_URL : STRIPE_CHECKOUT_CANCEL_URL;
  if (!STRIPE_FUNCTIONS_BASE_URL) {
    return fallback;
  }

  try {
    const url = new URL(buildStripeFunctionUrl('stripeCheckoutRedirect'));
    url.searchParams.set('status', status);
    if (status === 'success') {
      url.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
    }
    if (options?.source) {
      url.searchParams.set('source', options.source);
    }
    if (options?.paymentId) {
      url.searchParams.set('payment_id', options.paymentId);
    }
    if (options?.returnPath) {
      url.searchParams.set('return_path', options.returnPath);
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

export function buildStripeWebCheckoutLauncherUrl(
  payload: StripeWebCheckoutLauncherPayload
): string {
  const url = new URL(WEB_STRIPE_PAYMENT_LAUNCHER_PATH, resolveWebAppBaseUrl());
  url.searchParams.set('source', 'payment');
  if ('checkoutUrl' in payload) {
    url.searchParams.set('checkoutUrl', payload.checkoutUrl);
    if (payload.paymentId) {
      url.searchParams.set('paymentId', payload.paymentId);
    }
    if (payload.studentId) {
      url.searchParams.set('studentId', payload.studentId);
    }
    if (payload.returnPath) {
      url.searchParams.set('returnPath', payload.returnPath);
    }
  } else {
    url.searchParams.set('amount', String(payload.amount));
    url.searchParams.set('currency', payload.currency || 'brl');
    url.searchParams.set('studentId', payload.studentId);
    url.searchParams.set('personalId', payload.personalId);
    url.searchParams.set('paymentId', payload.paymentId);
    if (payload.destinationAccountId) {
      url.searchParams.set('destinationAccountId', payload.destinationAccountId);
    }
    if (payload.applicationFeeAmount !== undefined) {
      url.searchParams.set('applicationFeeAmount', String(payload.applicationFeeAmount));
    }
    if (payload.description) {
      url.searchParams.set('description', payload.description);
    }
    if (payload.returnPath) {
      url.searchParams.set('returnPath', payload.returnPath);
    }
  }
  if (STRIPE_MODE) {
    url.searchParams.set('stripeMode', STRIPE_MODE);
  }
  return url.toString();
}

function buildSubscriptionPayload(
  userId: string,
  email: string,
  name: string,
  priceId: string,
  planId?: string
) {
  const normalizedPlanId = String(planId || '').trim();
  const normalizedPriceId = String(priceId || '').trim();
  const sharedPayload = {
    userId,
    email,
    name,
    ...(normalizedPriceId ? { priceId: normalizedPriceId, price_id: normalizedPriceId } : {}),
    ...(normalizedPlanId ? { planId: normalizedPlanId, plan_id: normalizedPlanId } : {}),
    stripeMode: STRIPE_MODE,
    stripe_mode: STRIPE_MODE,
  };
  const useAlunoPayload = STRIPE_SUBSCRIPTION_ENDPOINT.toLowerCase().includes('aluno');
  if (useAlunoPayload) {
    return { ...sharedPayload, nome: name };
  }
  return sharedPayload;
}

function buildStripeModePayload<T extends Record<string, any>>(payload: T): T & {
  stripeMode: 'test' | 'live' | undefined;
  stripe_mode: 'test' | 'live' | undefined;
} {
  return {
    ...payload,
    stripeMode: STRIPE_MODE,
    stripe_mode: STRIPE_MODE,
  };
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
  message?: string;
  details?: string;
  error?: string;
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

function extractInvoicesFromPayload(data: any): any[] {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data;
  }

  const directCandidates = [
    data.invoices,
    data.invoiceHistory,
    data.latestInvoices,
    data.items,
    data.data,
    data.subscription?.invoices,
    data.subscription?.invoiceHistory,
    data.subscription?.latestInvoices,
    data.subscription?.data,
  ];

  for (const candidate of directCandidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
    if (candidate && Array.isArray(candidate.data)) {
      return candidate.data;
    }
  }

  const latestInvoice =
    data.latest_invoice ??
    data.latestInvoice ??
    data.subscription?.latest_invoice ??
    data.subscription?.latestInvoice;

  if (latestInvoice && typeof latestInvoice === 'object') {
    return [latestInvoice];
  }

  if (data.id && (data.amount_paid !== undefined || data.hosted_invoice_url || data.status)) {
    return [data];
  }

  return [];
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

interface SubscriptionCheckoutResult {
  checkoutUrl?: string;
  sessionId?: string;
  status?: string;
  customerId?: string;
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

function normalizeSubscriptionIdentity(email: string, name: string) {
  const normalizedEmail = String(email || '').trim();
  const fallbackName = normalizedEmail.includes('@') ? normalizedEmail.split('@')[0] : '';
  const normalizedName = String(name || '').trim() || fallbackName;
  return {
    email: normalizedEmail,
    name: normalizedName,
  };
}

function normalizeSubscriptionPlanInput(priceId: string, planId?: string) {
  const normalizedPriceId = String(priceId || '').trim();
  const normalizedPlanId = String(planId || '').trim();
  return {
    priceId: normalizedPriceId,
    planId: normalizedPlanId || undefined,
  };
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
    body: JSON.stringify(buildStripeModePayload(payload)),
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
  priceId: string,
  planId?: string
): Promise<{ data: SubscriptionResult | null; error: string | null }> {
  try {
    const identity = normalizeSubscriptionIdentity(email, name);
    const planInput = normalizeSubscriptionPlanInput(priceId, planId);
    if (!identity.email) {
      return {
        data: null,
        error: 'Complete seu perfil com um email valido antes de assinar.',
      };
    }
    if (!planInput.priceId && !planInput.planId) {
      return {
        data: null,
        error: 'O plano selecionado ainda nao esta configurado para assinatura.',
      };
    }
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
      ? buildSubscriptionPayload(
          userId,
          identity.email,
          identity.name,
          planInput.priceId,
          planInput.planId
        )
      : buildStripeModePayload({
          userId,
          email: identity.email,
          name: identity.name,
          ...(planInput.priceId ? { priceId: planInput.priceId } : {}),
          ...(planInput.planId ? { planId: planInput.planId } : {}),
        });
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
    if (!STRIPE_FUNCTIONS_BASE_URL && !API_BASE_URL) {
      throw new Error('API URL not configured');
    }
    if (!STRIPE_FUNCTIONS_BASE_URL && API_BASE_URL.includes('api.stripe.com')) {
      throw new Error('Stripe functions URL not configured');
    }
    const cancelUrl = STRIPE_FUNCTIONS_BASE_URL
      ? buildStripeFunctionUrl(STRIPE_CANCEL_SUBSCRIPTION_ENDPOINT)
      : `${API_BASE_URL}/api/payments/cancel-subscription`;
    const response = await fetch(cancelUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildStripeModePayload({
          subscriptionId,
        })
      ),
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
    if (!STRIPE_FUNCTIONS_BASE_URL && !API_BASE_URL) {
      throw new Error('API URL not configured');
    }
    if (!STRIPE_FUNCTIONS_BASE_URL && API_BASE_URL.includes('api.stripe.com')) {
      throw new Error('Stripe functions URL not configured');
    }
    const response = STRIPE_FUNCTIONS_BASE_URL
      ? await fetch(buildStripeFunctionUrl(STRIPE_SUBSCRIPTION_STATUS_FUNCTION_ENDPOINT), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            buildStripeModePayload({
              userId,
            })
          ),
        })
      : await fetch(`${API_BASE_URL}/api/payments/subscription/${userId}`);

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
    if (STRIPE_FUNCTIONS_BASE_URL) {
      const normalizedInvoicesEndpoint = STRIPE_INVOICES_ENDPOINT.trim();
      if (normalizedInvoicesEndpoint) {
        const invoicesResponse = await fetch(buildStripeFunctionUrl(normalizedInvoicesEndpoint), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            buildStripeModePayload({
              userId,
            })
          ),
        });

        if (invoicesResponse.ok) {
          const invoicesData = await invoicesResponse.json();
          return { data: extractInvoicesFromPayload(invoicesData), error: null };
        }
      }

      const statusResult = await getSubscriptionStatus(userId);
      if (statusResult.error) {
        return { data: null, error: statusResult.error };
      }
      return { data: extractInvoicesFromPayload(statusResult.data), error: null };
    }

    if (!API_BASE_URL) {
      throw new Error('API URL not configured');
    }
    if (API_BASE_URL.includes('api.stripe.com')) {
      throw new Error('Invoice endpoint not configured');
    }
    const response = await fetch(`${API_BASE_URL}/api/payments/invoices/${userId}`);

    if (!response.ok) throw new Error('Failed to fetch invoices');

    const data = await response.json();
    return { data: extractInvoicesFromPayload(data), error: null };
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
      body: JSON.stringify(
        buildStripeModePayload({
          userId,
          accountId,
        })
      ),
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
  successUrl?: string;
  cancelUrl?: string;
  returnPath?: string;
}): Promise<{ data: StripeCheckoutResult | null; error: string | null }> {
  try {
    if (!STRIPE_FUNCTIONS_BASE_URL && !API_BASE_URL) {
      throw new Error('API URL not configured');
    }
    if (!STRIPE_FUNCTIONS_BASE_URL && API_BASE_URL.includes('api.stripe.com')) {
      throw new Error('Stripe functions URL not configured');
    }
    const {
      successUrl,
      cancelUrl,
      returnPath,
      ...requestPayload
    } = payload;
    const resolvedSuccessUrl =
      successUrl ||
      buildStripeHostedCheckoutReturnUrl('success', {
        source: 'payment',
        paymentId: payload.paymentId,
        returnPath,
      });
    const resolvedCancelUrl =
      cancelUrl ||
      buildStripeHostedCheckoutReturnUrl('cancel', {
        source: 'payment',
        paymentId: payload.paymentId,
        returnPath,
      });
    const checkoutUrl = STRIPE_FUNCTIONS_BASE_URL
      ? buildStripeFunctionUrl(STRIPE_CHECKOUT_ENDPOINT)
      : `${API_BASE_URL}/api/payments/create-checkout`;
    const response = await fetch(checkoutUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildStripeModePayload({
          ...requestPayload,
          successUrl: resolvedSuccessUrl,
          cancelUrl: resolvedCancelUrl,
        })
      ),
    });

    if (!response.ok) {
      throw new Error(await getHttpErrorMessage(response, 'Failed to create checkout session'));
    }

    const data = await response.json();
    if (data?.error) {
      return {
        data: null,
        error: extractErrorMessageFromPayload(data, 'Failed to create checkout session'),
      };
    }
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

export async function createSubscriptionCheckoutSession(
  userId: string,
  email: string,
  name: string,
  priceId: string,
  planId?: string
): Promise<{ data: SubscriptionCheckoutResult | null; error: string | null }> {
  try {
    const identity = normalizeSubscriptionIdentity(email, name);
    const planInput = normalizeSubscriptionPlanInput(priceId, planId);
    if (!identity.email) {
      return {
        data: null,
        error: 'Complete seu perfil com um email valido antes de assinar.',
      };
    }
    if (!planInput.priceId && !planInput.planId) {
      return {
        data: null,
        error: 'O plano selecionado ainda nao esta configurado para assinatura.',
      };
    }
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
      body: JSON.stringify(
        buildStripeModePayload({
          userId,
          email: identity.email,
          name: identity.name,
          ...(planInput.priceId
            ? { priceId: planInput.priceId, price_id: planInput.priceId }
            : {}),
          ...(planInput.planId
            ? { planId: planInput.planId, plan_id: planInput.planId }
            : {}),
          successUrl: STRIPE_CHECKOUT_SUCCESS_URL,
          cancelUrl: STRIPE_CHECKOUT_CANCEL_URL,
        })
      ),
    });

    if (!response.ok) {
      throw new Error(await getHttpErrorMessage(response, 'Failed to create subscription checkout'));
    }

    const data = await response.json();
    if (data?.error) {
      return {
        data: null,
        error: extractErrorMessageFromPayload(data, 'Failed to create subscription checkout'),
      };
    }

    return {
      data: {
        checkoutUrl: data.checkoutUrl || data.url,
        sessionId: data.sessionId || data.id,
        status: data.status,
        customerId: data.customerId || data.customer_id,
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
    priceId: STRIPE_PRICE_ID_MENSAL,
    paymentLink: STRIPE_PAYMENT_LINK_MENSAL,
    highlight: true,
    features: [
      'Acesso completo ao app',
      'Histórico de treinos',
      'Suporte por email',
      'Chat IA ilimitado',
      'Insights de IA premium',
      'Avaliação postural com IA',
    ],
  },
  {
    id: 'bimestral',
    name: 'Bimestral',
    price: 54,
    interval: '/bimestre',
    priceId: STRIPE_PRICE_ID_BIMESTRAL,
    paymentLink: STRIPE_PAYMENT_LINK_BIMESTRAL,
    features: [
      'Acesso completo ao app',
      'Histórico de treinos',
      'Suporte por email',
      'Chat IA ilimitado',
      'Insights de IA premium',
      'Avaliação postural com IA',
    ],
  },
  {
    id: 'semestral',
    name: 'Semestral',
    price: 150,
    interval: '/6 meses',
    priceId: STRIPE_PRICE_ID_SEMESTRAL,
    paymentLink: STRIPE_PAYMENT_LINK_SEMESTRAL,
    features: [
      'Acesso completo ao app',
      'Histórico de treinos',
      'Suporte por email',
      'Chat IA ilimitado',
      'Insights de IA premium',
      'Avaliação postural com IA',
    ],
  },
  {
    id: 'anual',
    name: 'Anual',
    price: 300,
    interval: '/ano',
    priceId: STRIPE_PRICE_ID_ANUAL,
    paymentLink: STRIPE_PAYMENT_LINK_ANUAL,
    features: [
      'Acesso completo ao app',
      'Histórico de treinos',
      'Suporte por email',
      'Chat IA ilimitado',
      'Insights de IA premium',
      'Avaliação postural com IA',
    ],
  },
];

export function formatCurrency(value: number, currency: string = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(value);
}
