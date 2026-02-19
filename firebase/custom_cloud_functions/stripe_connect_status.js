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

exports.stripeConnectStatus = functions
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

        const { userId, accountId: bodyAccountId } = req.body || {};
        let accountId = bodyAccountId;

        if (!accountId && userId) {
          const userSnap = await firestore.doc(`users/${userId}`).get();
          if (userSnap.exists) {
            const data = userSnap.data() || {};
            accountId = data.stripeAccountId || data.stripe_account_id;
          }
        }

        if (!accountId) {
          return res.status(400).json({
            error: "Account ID ausente.",
          });
        }

        const account = await stripe.accounts.retrieve(accountId);
        return res.status(200).json({
          accountId: account.id,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          requirements: account.requirements || null,
        });
      } catch (err) {
        console.error("Erro ao consultar status do Stripe Connect:", err);
        return res.status(500).json({
          error: "Erro ao consultar status do Stripe",
          details: err.message,
        });
      }
    });
  });
