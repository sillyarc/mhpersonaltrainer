const functions = require("firebase-functions/v1");
const cors = require("cors")({ origin: true });
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

const stripe = require("stripe")(stripeSecret, {
  apiVersion: "2022-11-15",
});

const buildNormalized = (subscription) => {
  const item = subscription?.items?.data?.[0];
  const price = item?.price || subscription?.plan || null;
  return {
    subscriptionId: subscription?.id,
    customerId: subscription?.customer,
    status: subscription?.status,
    subscriptionStatus: subscription?.status,
    currentPeriodEnd: subscription?.current_period_end,
    created: subscription?.created,
    startDate: subscription?.start_date,
    planName: price?.nickname || price?.product?.name,
    planAmount: price?.unit_amount,
    planCurrency: price?.currency,
    priceId: price?.id,
    price,
    plan: price?.nickname || price?.id,
    subscription,
  };
};

exports.subscriptionStatus = functions
  .region("southamerica-east1")
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (req.method !== "POST") {
        return res
          .status(405)
          .json({ error: "Metodo nao permitido. Use POST." });
      }

      try {
        if (!stripeSecret) {
          return res.status(500).json({
            error: "Stripe nao configurado",
            details:
              "Defina STRIPE_SECRET_KEY ou functions.config().stripe.secret no ambiente da function.",
          });
        }

        const { userId, subscriptionId, customerId } = req.body || {};
        let subId = subscriptionId;
        let custId = customerId;
        let userEmail = "";

        if (!subId && userId) {
          const userSnap = await firestore.doc(`users/${userId}`).get();
          if (userSnap.exists) {
            const data = userSnap.data() || {};
            subId = data.subscribeId || data.subscriptionId;
            custId = custId || data.customer || data.customerId;
            userEmail = data.email || "";
          }
        }

        let subscription = null;
        if (subId) {
          subscription = await stripe.subscriptions.retrieve(subId, {
            expand: ["latest_invoice.payment_intent", "items.data.price"],
          });
        } else if (custId) {
          const list = await stripe.subscriptions.list({
            customer: custId,
            status: "all",
            limit: 1,
            expand: ["data.latest_invoice.payment_intent", "data.items.data.price"],
          });
          subscription = list.data?.[0] || null;
        } else if (userEmail) {
          const customers = await stripe.customers.list({
            email: userEmail,
            limit: 1,
          });
          const customer = customers.data?.[0];
          if (customer?.id) {
            custId = customer.id;
            const list = await stripe.subscriptions.list({
              customer: customer.id,
              status: "all",
              limit: 1,
              expand: ["data.latest_invoice.payment_intent", "data.items.data.price"],
            });
            subscription = list.data?.[0] || null;
          }
        }

        if (!subscription) {
          return res.status(200).json({ status: "not_found" });
        }

        return res.status(200).json(buildNormalized(subscription));
      } catch (err) {
        console.error("Erro ao consultar assinatura:", err);
        return res.status(500).json({
          error: "Erro ao consultar assinatura",
          details: err.message,
        });
      }
    });
  });
