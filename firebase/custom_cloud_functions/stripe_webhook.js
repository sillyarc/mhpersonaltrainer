const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { getConfigValue } = require("./runtime_config");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

const stripeSecret =
  process.env.STRIPE_SECRET_KEY ||
  getConfigValue(["stripe", "secret"], "") ||
  "";

const stripeWebhookSecret =
  process.env.STRIPE_WEBHOOK_SECRET ||
  getConfigValue(["stripe", "webhook_secret"], "") ||
  "";

const stripe = require("stripe")(stripeSecret, {
  apiVersion: "2022-11-15",
});

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

const PRICE_PLAN_MAP = {
  price_1RjKmIP3w93hGHYvwnQ25m13: "Mensal",
  price_1RQ5T8P3w93hGHYvCfnTTdnp: "Bimestral",
  price_1RQ5T8P3w93hGHYve8VegKff: "Semestral",
  price_1RQ5T8P3w93hGHYvld6PCdaY: "Anual",
};

const uniqRefs = (refs) => {
  const map = new Map();
  refs.forEach((ref) => {
    if (!ref || !ref.id) return;
    map.set(ref.id, ref);
  });
  return Array.from(map.values());
};

const getEmailFromSession = (session) => {
  return (
    session?.customer_details?.email ||
    session?.customer_email ||
    session?.metadata?.email ||
    ""
  );
};

const toPlanName = (price) => {
  const priceId = price?.id || "";
  if (priceId && PRICE_PLAN_MAP[priceId]) return PRICE_PLAN_MAP[priceId];
  return price?.nickname || price?.product?.name || "Premium";
};

const findUsersForStripe = async ({ userId, email, customerId, accountId }) => {
  const refs = [];

  if (userId) {
    const byId = firestore.doc(`users/${userId}`);
    const snap = await byId.get();
    if (snap.exists) refs.push(byId);
  }

  if (customerId) {
    const [byCustomer, byCustomerId] = await Promise.all([
      firestore.collection("users").where("customer", "==", customerId).limit(10).get(),
      firestore.collection("users").where("customerId", "==", customerId).limit(10).get(),
    ]);
    byCustomer.docs.forEach((docSnap) => refs.push(docSnap.ref));
    byCustomerId.docs.forEach((docSnap) => refs.push(docSnap.ref));
  }

  if (accountId) {
    const [byStripeAccountId, byStripeAccountLegacy] = await Promise.all([
      firestore.collection("users").where("stripeAccountId", "==", accountId).limit(10).get(),
      firestore.collection("users").where("stripe_account_id", "==", accountId).limit(10).get(),
    ]);
    byStripeAccountId.docs.forEach((docSnap) => refs.push(docSnap.ref));
    byStripeAccountLegacy.docs.forEach((docSnap) => refs.push(docSnap.ref));
  }

  if (email) {
    const byEmail = await firestore.collection("users").where("email", "==", email).limit(10).get();
    byEmail.docs.forEach((docSnap) => refs.push(docSnap.ref));
  }

  return uniqRefs(refs);
};

const storeWebhookAudit = async (event, status, details) => {
  try {
    await firestore.collection("payment_webhook_events").doc(String(event.id || Date.now())).set(
      {
        eventId: event.id || null,
        type: event.type || null,
        account: event.account || null,
        livemode: Boolean(event.livemode),
        status,
        details: details || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Falha ao registrar log de webhook:", error);
  }
};

const updateConnectStatusOnUsers = async ({ userRefs, account, source }) => {
  if (!userRefs.length || !account?.id) return;

  const requirements = account.requirements || {};
  const currentlyDue = Array.isArray(requirements.currently_due) ? requirements.currently_due : [];
  const eventuallyDue = Array.isArray(requirements.eventually_due) ? requirements.eventually_due : [];
  const active = Boolean(account.charges_enabled) && Boolean(account.payouts_enabled);

  const payload = {
    stripeAccountId: account.id,
    stripeAtivo: active,
    stripeChargesEnabled: Boolean(account.charges_enabled),
    stripePayoutsEnabled: Boolean(account.payouts_enabled),
    stripeDetailsSubmitted: Boolean(account.details_submitted),
    stripeRequirementsDueCount: currentlyDue.length,
    stripeRequirementsEventuallyDueCount: eventuallyDue.length,
    stripeDisabledReason: requirements.disabled_reason || null,
    stripeCurrentDeadline: requirements.current_deadline || null,
    stripeLastWebhookEvent: source || "account.updated",
    stripeUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await Promise.all(userRefs.map((ref) => ref.set(payload, { merge: true })));
};

const updateSubscriptionOnUsers = async ({ userRefs, subscription, source }) => {
  if (!userRefs.length || !subscription) return;

  const item = subscription?.items?.data?.[0];
  const price = item?.price || null;
  const status = String(subscription?.status || "").toLowerCase();
  const isActive = ACTIVE_SUBSCRIPTION_STATUSES.has(status);
  const payload = {
    customer: subscription.customer || null,
    customerId: subscription.customer || null,
    subscribeId: subscription.id || null,
    subscriptionId: subscription.id || null,
    assinatura: isActive,
    planoChatGPT: isActive,
    tipoDeAssinatura: toPlanName(price),
    stripeSubscriptionStatus: status || null,
    stripePriceId: price?.id || null,
    stripePlanAmount: price?.unit_amount ?? null,
    stripePlanCurrency: price?.currency || null,
    stripeCurrentPeriodEnd: subscription.current_period_end || null,
    stripeCancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    stripeSyncedFromWebhook: source || "unknown",
    stripeUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await Promise.all(userRefs.map((ref) => ref.set(payload, { merge: true })));
};

const markInvoicePaymentAsPaid = async ({ studentId, paymentId, stripeStatus, sessionId, paymentIntentId }) => {
  if (!studentId || !paymentId) return;
  const ref = firestore.doc(`users/${studentId}/pagamentos/${paymentId}`);
  const snap = await ref.get();
  if (!snap.exists) return;

  await ref.set(
    {
      Pago: true,
      pago: true,
      stripeStatus: stripeStatus || "paid",
      stripeSessionId: sessionId || null,
      stripePaymentIntentId: paymentIntentId || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      datas: admin.firestore.FieldValue.arrayUnion(new Date()),
    },
    { merge: true }
  );
};

const handleCheckoutSessionCompleted = async (session) => {
  const mode = String(session?.mode || "").toLowerCase();

  if (mode === "payment") {
    const metadata = session?.metadata || {};
    await markInvoicePaymentAsPaid({
      studentId: metadata.studentId,
      paymentId: metadata.paymentId,
      stripeStatus: session?.payment_status || session?.status || "paid",
      sessionId: session?.id,
      paymentIntentId: session?.payment_intent || null,
    });
    return;
  }

  if (mode !== "subscription") return;

  const subscriptionId = session?.subscription || null;
  const customerId = session?.customer || null;
  const userId = session?.metadata?.userId || null;
  const email = getEmailFromSession(session);
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });

  const userRefs = await findUsersForStripe({ userId, email, customerId });
  await updateSubscriptionOnUsers({
    userRefs,
    subscription,
    source: "checkout.session.completed",
  });
};

const handleSubscriptionEvent = async (subscription, source) => {
  if (!subscription?.id) return;
  const customerId = subscription?.customer || null;
  const userRefs = await findUsersForStripe({ customerId });
  await updateSubscriptionOnUsers({ userRefs, subscription, source });
};

const handleInvoiceEvent = async (invoice, source) => {
  const subscriptionId = invoice?.subscription || null;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });
  await handleSubscriptionEvent(subscription, source);
};

const handleConnectedAccountEvent = async (event, source) => {
  const rawAccount =
    event?.type === "account.application.deauthorized"
      ? {
          id: event?.data?.object?.account || event?.account || null,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
          requirements: {
            disabled_reason: "application.deauthorized",
            currently_due: [],
            eventually_due: [],
            current_deadline: null,
          },
          metadata: event?.data?.object?.metadata || {},
        }
      : event?.data?.object;

  const accountId = rawAccount?.id || null;
  if (!accountId) return;

  const metadataUserId = rawAccount?.metadata?.userId || null;
  const refs = await findUsersForStripe({
    userId: metadataUserId,
    accountId,
  });
  await updateConnectStatusOnUsers({
    userRefs: refs,
    account: rawAccount,
    source,
  });
};

exports.stripeWebhook = functions
  .region("southamerica-east1")
  .https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method not allowed");
    }

    if (!stripeSecret || !stripeWebhookSecret) {
      return res.status(500).json({
        error: "Stripe webhook nao configurado",
        details:
          "Defina STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET (ou functions config stripe.secret / stripe.webhook_secret).",
      });
    }

    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return res.status(400).send("Missing stripe signature");
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        stripeWebhookSecret
      );
    } catch (err) {
      console.error("Falha ao validar assinatura do webhook Stripe:", err);
      return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutSessionCompleted(event.data.object);
          break;
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          await handleSubscriptionEvent(event.data.object, event.type);
          break;
        case "invoice.paid":
        case "invoice.payment_succeeded":
        case "invoice.payment_failed":
          await handleInvoiceEvent(event.data.object, event.type);
          break;
        case "account.updated":
        case "account.application.deauthorized":
          await handleConnectedAccountEvent(event, event.type);
          break;
        default:
          break;
      }

      await storeWebhookAudit(event, "processed", null);
      return res.status(200).json({ received: true });
    } catch (err) {
      console.error("Erro ao processar webhook Stripe:", event.type, err);
      await storeWebhookAudit(event, "failed", err.message || String(err));
      return res.status(500).json({
        error: "Erro ao processar webhook Stripe",
        details: err.message,
      });
    }
  });
