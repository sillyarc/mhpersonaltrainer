/**
 * Cloud Function: Create SetupIntent to collect a payment method for trials.
 */
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

exports.createSetupIntent = functions
  .region("southamerica-east1")
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
      }

      try {
        if (!stripeSecret) {
          return res.status(500).json({
            error: "Stripe not configured",
            details: "Set STRIPE_SECRET_KEY or functions.config().stripe.secret.",
          });
        }

        const { email, name, customerId } = req.body || {};
        if (!email && !customerId) {
          return res.status(400).json({
            error: "Missing required params. Provide email or customerId.",
          });
        }

        let customer = null;

        const findOrCreateCustomerByEmail = async () => {
          if (!email) {
            return null;
          }
          const existingCustomers = await stripe.customers.list({
            email,
            limit: 1,
          });
          if (existingCustomers.data.length > 0) {
            const existingCustomer = existingCustomers.data[0];
            if (name && existingCustomer.name !== name) {
              await stripe.customers.update(existingCustomer.id, { name });
            }
            return existingCustomer;
          }
          return stripe.customers.create({ email, name });
        };

        if (customerId) {
          try {
            const retrievedCustomer = await stripe.customers.retrieve(customerId);
            if (retrievedCustomer && !retrievedCustomer.deleted) {
              customer = retrievedCustomer;
              if (name && customer.name !== name) {
                await stripe.customers.update(customer.id, { name });
              }
            } else {
              console.warn("SetupIntent customer is deleted. Falling back to email lookup.", customerId);
            }
          } catch (customerError) {
            console.warn("Failed to retrieve SetupIntent customer. Falling back to email lookup.", customerError?.message || customerError);
          }
        }

        if (!customer) {
          customer = await findOrCreateCustomerByEmail();
        }

        if (!customer) {
          return res.status(400).json({
            error: "Missing customer context",
            details: "Provide a valid customerId or an email to find/create customer.",
          });
        }

        let ephemeralKey = null;
        try {
          ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customer.id },
            { apiVersion: "2020-08-27" }
          );
        } catch (ephemeralError) {
          console.warn("Failed to create ephemeral key for SetupIntent.", ephemeralError?.message || ephemeralError);
        }

        const setupIntent = await stripe.setupIntents.create({
          customer: customer.id,
          usage: "off_session",
        });

        return res.status(200).json({
          success: true,
          setupIntentClientSecret: setupIntent.client_secret,
          customerId: customer.id,
          ephemeralKey: ephemeralKey?.secret || null,
        });
      } catch (err) {
        console.error("Error creating SetupIntent:", err);
        return res.status(500).json({
          error: "Error creating SetupIntent",
          details: err.message,
        });
      }
    });
  });
