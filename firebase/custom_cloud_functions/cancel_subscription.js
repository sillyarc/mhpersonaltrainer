const functions = require("firebase-functions/v1");
const cors = require("cors")({ origin: true });
const { getConfigValue } = require("./runtime_config");

const stripeSecret =
  process.env.STRIPE_SECRET_KEY ||
  getConfigValue(["stripe", "secret"], "") ||
  "";

const stripe = require("stripe")(stripeSecret, {
  apiVersion: "2022-11-15",
});

exports.cancelSubscription = functions
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

        const { subscriptionId } = req.body || {};
        if (!subscriptionId) {
          return res.status(400).json({ error: "subscriptionId ausente." });
        }

        const subscription = await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });

        return res.status(200).json({
          success: true,
          subscriptionId: subscription.id,
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        });
      } catch (err) {
        console.error("Erro ao cancelar assinatura:", err);
        return res.status(500).json({
          error: "Erro ao cancelar assinatura",
          details: err.message,
        });
      }
    });
  });
