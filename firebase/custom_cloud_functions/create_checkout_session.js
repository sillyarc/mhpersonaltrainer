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

const resolveBaseUrl = (req) => {
  const origin = req.headers.origin;
  if (origin) return origin;
  const referer = req.headers.referer || "";
  try {
    const parsed = new URL(referer);
    return parsed.origin;
  } catch (error) {
    return "";
  }
};

const optionalString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const appendStripeStatus = (url, status) => {
  const normalized = optionalString(url);
  if (!normalized) return "";
  const separator = normalized.includes("?") ? "&" : "?";
  return `${normalized}${separator}stripe=${status}`;
};

exports.createCheckoutSession = functions
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

        const payload = req.body || {};
        const amount = Number(payload.amount);
        const currency = (payload.currency || "brl").toLowerCase();
        const description = payload.description || "Pagamento";

        if (!Number.isFinite(amount) || amount <= 0) {
          return res.status(400).json({
            error: "Valor invalido",
          });
        }

        const returnUrl = optionalString(payload.returnUrl);
        const successUrl =
          optionalString(payload.successUrl) ||
          (returnUrl ? appendStripeStatus(returnUrl, "success") : "");
        const cancelUrl =
          optionalString(payload.cancelUrl) ||
          (returnUrl ? appendStripeStatus(returnUrl, "cancel") : "");

        let resolvedSuccessUrl = successUrl;
        let resolvedCancelUrl = cancelUrl;

        if (!resolvedSuccessUrl || !resolvedCancelUrl) {
          const baseUrl = resolveBaseUrl(req);
          if (baseUrl) {
            resolvedSuccessUrl =
              resolvedSuccessUrl ||
              `${baseUrl}/financeiro/personal?stripe=success`;
            resolvedCancelUrl =
              resolvedCancelUrl ||
              `${baseUrl}/financeiro/personal?stripe=cancel`;
          }
        }

        if (!resolvedSuccessUrl || !resolvedCancelUrl) {
          return res.status(400).json({
            error: "URLs de retorno nao identificadas",
            details:
              "Envie returnUrl/successUrl/cancelUrl no payload ou chame a function a partir de um browser com origin/referer.",
          });
        }

        const metadata = {};
        if (payload.studentId) metadata.studentId = String(payload.studentId);
        if (payload.personalId) metadata.personalId = String(payload.personalId);
        if (payload.paymentId) metadata.paymentId = String(payload.paymentId);

        const paymentIntentData = {};
        if (payload.destinationAccountId) {
          paymentIntentData.transfer_data = {
            destination: payload.destinationAccountId,
          };
          if (payload.applicationFeeAmount) {
            paymentIntentData.application_fee_amount = Number(
              payload.applicationFeeAmount
            );
          }
        }

        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency,
                unit_amount: amount,
                product_data: {
                  name: description,
                },
              },
            },
          ],
          success_url: resolvedSuccessUrl,
          cancel_url: resolvedCancelUrl,
          ...(Object.keys(metadata).length ? { metadata } : {}),
          ...(Object.keys(paymentIntentData).length
            ? { payment_intent_data: paymentIntentData }
            : {}),
        });

        return res.status(200).json({
          checkoutUrl: session.url,
          sessionId: session.id,
          paymentIntentId: session.payment_intent,
          status: session.status,
        });
      } catch (err) {
        console.error("Erro ao criar Checkout Session:", err);
        return res.status(500).json({
          error: "Erro ao criar Checkout Session",
          details: err.message,
        });
      }
    });
  });
