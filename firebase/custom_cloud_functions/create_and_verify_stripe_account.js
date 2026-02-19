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

const parseUrlEncoded = (req) => {
  if (!req.rawBody) return {};
  const raw = req.rawBody.toString();
  if (!raw) return {};
  const params = new URLSearchParams(raw);
  const data = {};
  params.forEach((value, key) => {
    data[key] = value;
  });
  return data;
};

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

const optionalString = (value) => {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : undefined;
};

const toValidNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildIndividualPayload = (body, email) => {
  const individual = {
    first_name: optionalString(body.firstName),
    last_name: optionalString(body.lastName),
    email: optionalString(body.email) || email,
    phone: optionalString(body.phone),
  };

  const cpf = onlyDigits(body.cpf);
  if (cpf) {
    individual.id_number = cpf;
  }

  const day = toValidNumber(body.dobDay);
  const month = toValidNumber(body.dobMonth);
  const year = toValidNumber(body.dobYear);
  if (
    day && day >= 1 && day <= 31 &&
    month && month >= 1 && month <= 12 &&
    year && year >= 1900
  ) {
    individual.dob = { day, month, year };
  }

  const addressLine1 = optionalString(body.addressLine1);
  const addressCity = optionalString(body.addressCity);
  const addressState = optionalString(body.addressState);
  const addressPostalCode = onlyDigits(body.addressPostalCode);
  if (addressLine1 || addressCity || addressState || addressPostalCode) {
    individual.address = {
      line1: addressLine1,
      city: addressCity,
      state: addressState,
      postal_code: addressPostalCode || undefined,
      country: "BR",
    };
  }

  return individual;
};

const buildBusinessProfilePayload = (body) => {
  const productDescription = optionalString(body.productDescription);
  const url = optionalString(body.website);
  const mcc = optionalString(body.mcc);
  if (!productDescription && !url && !mcc) return undefined;
  return {
    product_description: productDescription,
    url,
    mcc,
  };
};

const buildExternalAccountPayload = (body, holderName) => {
  const routingNumber = onlyDigits(body.routingNumber);
  const accountNumber = onlyDigits(body.accountNumber);
  if (!routingNumber || !accountNumber) return undefined;
  return {
    object: "bank_account",
    country: "BR",
    currency: "brl",
    account_holder_name: holderName,
    account_holder_type: "individual",
    routing_number: routingNumber,
    account_number: accountNumber,
  };
};

const sanitizeMetadata = (value) => {
  if (!value || typeof value !== "object") return {};
  const metadata = {};
  Object.entries(value).forEach(([key, item]) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return;
    const normalizedValue = optionalString(item);
    if (!normalizedValue) return;
    metadata[normalizedKey] = normalizedValue;
  });
  return metadata;
};

const resolveReturnUrl = (req) => {
  const origin = req.headers.origin;
  if (origin) {
    const referer = req.headers.referer || "";
    if (referer.includes("/academy/billing")) {
      return `${origin}/academy/billing`;
    }
    if (referer.includes("/financeiro/personal")) {
      return `${origin}/financeiro/personal`;
    }
    return `${origin}/financeiro/personal`;
  }
  return "";
};

exports.createAndVerifyStripeAccount = functions
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

        const body =
          req.is("application/x-www-form-urlencoded") && !Object.keys(req.body || {}).length
            ? parseUrlEncoded(req)
            : req.body || {};

        const email = body.email;
        const firstName = body.firstName;
        const lastName = body.lastName;
        const productDescription = optionalString(body.productDescription);

        if (!email || !firstName || !lastName) {
          return res.status(400).json({
            error: "Parametros obrigatorios ausentes.",
          });
        }

        const fullName = `${firstName} ${lastName}`.trim();
        const individual = buildIndividualPayload(body, email);
        const businessProfile = buildBusinessProfilePayload(body);
        const externalAccount = buildExternalAccountPayload(body, fullName);
        const providedAccountId = optionalString(body.accountId);
        const userId = optionalString(body.userId);
        const documentFront = optionalString(body.documentFront);
        const documentBack = optionalString(body.documentBack);
        const metadata = {
          source: "mh-app",
          profile_completed: "true",
          ...(userId ? { userId } : {}),
          ...(documentFront ? { documentFrontUrl: documentFront } : {}),
          ...(documentBack ? { documentBackUrl: documentBack } : {}),
          ...sanitizeMetadata(body.metadata),
        };
        const accountPayload = {
          email,
          business_profile:
            businessProfile ||
            (productDescription ? { product_description: productDescription } : undefined),
          individual,
          metadata,
        };

        if (externalAccount) {
          accountPayload.external_account = externalAccount;
        }

        let account;
        if (providedAccountId) {
          account = await stripe.accounts.update(providedAccountId, accountPayload);
        } else {
          try {
            account = await stripe.accounts.create({
              type: "express",
              country: "BR",
              business_type: "individual",
              capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
              },
              ...accountPayload,
            });
          } catch (createError) {
            // Fallback keeps flow working if a prefilled field is rejected by country-specific validation.
            if (createError && createError.type === "StripeInvalidRequestError") {
              account = await stripe.accounts.create({
                type: "express",
                country: "BR",
                email,
                business_type: "individual",
                business_profile: productDescription
                  ? { product_description: productDescription }
                  : undefined,
                individual: {
                  first_name: firstName,
                  last_name: lastName,
                  email,
                },
                capabilities: {
                  card_payments: { requested: true },
                  transfers: { requested: true },
                },
                metadata,
              });
            } else {
              throw createError;
            }
          }
        }

        const returnUrl = body.returnUrl || resolveReturnUrl(req);
        const refreshUrl = body.refreshUrl || returnUrl;

        if (!returnUrl) {
          return res.status(400).json({
            error: "URL de retorno nao identificada.",
          });
        }

        const accountLink = await stripe.accountLinks.create({
          account: account.id,
          refresh_url: refreshUrl,
          return_url: returnUrl,
          type: "account_onboarding",
        });

        return res.status(200).json({
          success: true,
          accountId: account.id,
          url: accountLink.url,
        });
      } catch (err) {
        console.error("Erro ao criar conta Stripe:", err);
        return res.status(500).json({
          error: "Erro ao criar conta Stripe",
          details: err.message,
        });
      }
    });
  });
