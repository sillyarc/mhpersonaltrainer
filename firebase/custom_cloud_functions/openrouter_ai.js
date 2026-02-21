const functions = require("firebase-functions/v1");
const cors = require("cors")({ origin: true });
const { getFirestore } = require("firebase-admin/firestore");
const { randomUUID } = require("crypto");
const { getConfigValue } = require("./runtime_config");

const OPENROUTER_API_URL =
  process.env.OPENROUTER_API_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY ||
  process.env.OPENAI_API_KEY ||
  getConfigValue(["openrouter", "key"], "") ||
  getConfigValue(["openai", "key"], "") ||
  getConfigValue(["openai", "api_key"], "") ||
  "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const OPENROUTER_HTTP_REFERER =
  process.env.OPENROUTER_HTTP_REFERER || "https://flutterflow.io";
const OPENROUTER_APP_TITLE = process.env.OPENROUTER_APP_TITLE || "MH Personal";
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);
const parsedDailyCredits = Number(
  process.env.AI_DAILY_FREE_CREDITS ||
    getConfigValue(["ai", "daily_free_credits"], 20) ||
    20,
);
const FREE_DAILY_AI_CREDITS =
  Number.isFinite(parsedDailyCredits) && parsedDailyCredits > 0
    ? Math.floor(parsedDailyCredits)
    : 20;

function mustPost(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Metodo nao permitido. Use POST." });
    return false;
  }
  return true;
}

function readField(req, name) {
  if (req.body && typeof req.body === "object" && req.body[name] != null) {
    return req.body[name];
  }
  if (req.rawBody && Buffer.isBuffer(req.rawBody) && req.rawBody.length > 0) {
    try {
      const params = new URLSearchParams(req.rawBody.toString("utf8"));
      const val = params.get(name);
      if (val != null) {
        return val;
      }
    } catch (_) {
      // ignore
    }
  }
  if (typeof req.body === "string" && req.body.length > 0) {
    try {
      const params = new URLSearchParams(req.body);
      const val = params.get(name);
      if (val != null) {
        return val;
      }
    } catch (_) {
      // ignore
    }
  }
  if (req.query && req.query[name] != null) {
    return req.query[name];
  }
  return undefined;
}

function resolveUserId(req) {
  return (readField(req, "userId") ?? "").toString().trim();
}

function toBool(value) {
  return value === true || value === "true" || value === 1;
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function isPremiumUser(data) {
  if (!data || typeof data !== "object") return false;
  if (toBool(data.assinatura)) return true;
  if (toBool(data.planoChatGPT)) return true;
  const statusCandidates = [
    data.stripeSubscriptionStatus,
    data.subscriptionStatus,
    data.statusAssinatura,
    data.assinaturaStatus,
  ];
  return statusCandidates.some((status) =>
    ACTIVE_SUBSCRIPTION_STATUSES.has(normalizeStatus(status)),
  );
}

function quotaExceededError() {
  const err = new Error(
    `Limite diario de IA atingido. Voce recebe ${FREE_DAILY_AI_CREDITS} creditos por dia no plano gratuito. Assine o Premium para uso ilimitado.`,
  );
  err.code = "quota-exceeded";
  err.status = 402;
  return err;
}

function aiLeasePayload(lease) {
  return {
    premium: Boolean(lease?.premium),
    charged: Boolean(lease?.consumed),
    remaining: typeof lease?.remaining === "number" ? lease.remaining : null,
    dailyLimit: FREE_DAILY_AI_CREDITS,
  };
}

async function consumeAiCredit(userId, units = 1) {
  const safeUnits = Math.max(1, Math.floor(Number(units) || 1));
  const dateKey = currentDateKey();
  const db = getFirestore();
  const userRef = db.doc(`users/${userId}`);
  const usageRef = db.doc(`users/${userId}/usage/aiCredits`);

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) {
      const err = new Error("Usuario nao encontrado.");
      err.code = "not-found";
      err.status = 404;
      throw err;
    }

    const userData = userSnap.data() || {};
    if (isPremiumUser(userData)) {
      return {
        userId,
        units: safeUnits,
        dateKey,
        consumed: false,
        premium: true,
        remaining: null,
      };
    }

    const usageSnap = await transaction.get(usageRef);
    const usageData = usageSnap.exists ? usageSnap.data() || {} : {};
    const usedToday =
      usageData.dateKey === dateKey ? Number(usageData.usedToday || 0) : 0;
    const nextUsed = usedToday + safeUnits;
    if (nextUsed > FREE_DAILY_AI_CREDITS) {
      throw quotaExceededError();
    }

    transaction.set(
      usageRef,
      {
        dateKey,
        usedToday: nextUsed,
        dailyLimit: FREE_DAILY_AI_CREDITS,
        updatedAt: new Date(),
        lastConsumedAt: new Date(),
      },
      { merge: true },
    );

    return {
      userId,
      units: safeUnits,
      dateKey,
      consumed: true,
      premium: false,
      remaining: Math.max(0, FREE_DAILY_AI_CREDITS - nextUsed),
    };
  });
}

async function refundAiCredit(lease) {
  if (!lease?.consumed || !lease?.userId || !lease?.units) return;
  const db = getFirestore();
  const usageRef = db.doc(`users/${lease.userId}/usage/aiCredits`);
  await db.runTransaction(async (transaction) => {
    const usageSnap = await transaction.get(usageRef);
    if (!usageSnap.exists) return;

    const usageData = usageSnap.data() || {};
    if (usageData.dateKey !== lease.dateKey) return;

    const usedToday = Number(usageData.usedToday || 0);
    const nextUsed = Math.max(0, usedToday - lease.units);
    transaction.set(
      usageRef,
      {
        usedToday: nextUsed,
        updatedAt: new Date(),
      },
      { merge: true },
    );
  });
}

function sendAiAccessError(res, err) {
  const code = err?.code || "";
  const status =
    typeof err?.status === "number"
      ? err.status
      : code === "quota-exceeded"
        ? 402
        : code === "not-found"
          ? 404
          : 500;
  return res.status(status).json({
    error:
      err?.message ||
      "Nao foi possivel validar seu acesso aos recursos de IA.",
  });
}

function openRouterHeaders() {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      "OpenRouter API key not configured. Set OPENROUTER_API_KEY or functions.config().openrouter.key",
    );
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    "HTTP-Referer": OPENROUTER_HTTP_REFERER,
    "X-Title": OPENROUTER_APP_TITLE,
  };
}

async function openRouterChatCompletions({
  messages,
  model = OPENROUTER_MODEL,
  max_tokens,
  temperature,
  response_format,
}) {
  const resp = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(),
    body: JSON.stringify({
      model,
      messages,
      ...(typeof max_tokens === "number" ? { max_tokens } : {}),
      ...(typeof temperature === "number" ? { temperature } : {}),
      ...(response_format ? { response_format } : {}),
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `OpenRouter request failed (${resp.status})`;
    const err = new Error(message);
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

function extractFirstJsonObject(text) {
  if (!text || typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const maybe = text.slice(start, end + 1);
  try {
    return JSON.parse(maybe);
  } catch (_) {
    return null;
  }
}

exports.openrouterGenerateText = functions
  .region("southamerica-east1")
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (!mustPost(req, res)) return;
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(400).json({ error: "Parametro obrigatorio: userId" });
      }

      let creditLease = null;
      try {
        const prompt = (readField(req, "prompt") ?? "").toString();
        if (!prompt) {
          return res.status(400).json({ error: "Parametro obrigatorio: prompt" });
        }

        creditLease = await consumeAiCredit(userId, 1);
        const data = await openRouterChatCompletions({
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        });

        const text = data?.choices?.[0]?.message?.content ?? "";
        return res.status(200).json({
          text,
          usage: data?.usage ?? null,
          access: aiLeasePayload(creditLease),
        });
      } catch (err) {
        if (creditLease?.consumed) {
          await refundAiCredit(creditLease).catch(() => undefined);
        }
        if (err?.code === "quota-exceeded" || err?.code === "not-found") {
          return sendAiAccessError(res, err);
        }
        console.error("openrouterGenerateText error:", err);
        return res.status(500).json({
          error: "Falha ao gerar texto",
          details: err?.message || String(err),
        });
      }
    });
  });

exports.openrouterCountTokens = functions
  .region("southamerica-east1")
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (!mustPost(req, res)) return;
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(400).json({ error: "Parametro obrigatorio: userId" });
      }

      let creditLease = null;
      try {
        const prompt = (readField(req, "prompt") ?? "").toString();
        if (!prompt) {
          return res.status(400).json({ error: "Parametro obrigatorio: prompt" });
        }

        creditLease = await consumeAiCredit(userId, 1);
        const data = await openRouterChatCompletions({
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          max_tokens: 1,
        });

        return res.status(200).json({
          totalTokens: data?.usage?.prompt_tokens ?? null,
          usage: data?.usage ?? null,
          access: aiLeasePayload(creditLease),
        });
      } catch (err) {
        if (creditLease?.consumed) {
          await refundAiCredit(creditLease).catch(() => undefined);
        }
        if (err?.code === "quota-exceeded" || err?.code === "not-found") {
          return sendAiAccessError(res, err);
        }
        console.error("openrouterCountTokens error:", err);
        return res.status(500).json({
          error: "Falha ao contar tokens",
          details: err?.message || String(err),
        });
      }
    });
  });

exports.openrouterTextFromImage = functions
  .region("southamerica-east1")
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (!mustPost(req, res)) return;
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(400).json({ error: "Parametro obrigatorio: userId" });
      }

      let creditLease = null;
      try {
        const prompt = (readField(req, "prompt") ?? "").toString();
        const imageUrl = (readField(req, "imageUrl") ?? "").toString();
        const imageBase64 = (readField(req, "imageBase64") ?? "").toString();
        if (!prompt) {
          return res.status(400).json({ error: "Parametro obrigatorio: prompt" });
        }
        if (!imageUrl && !imageBase64) {
          return res
            .status(400)
            .json({ error: "Parametro obrigatorio: imageUrl ou imageBase64" });
        }

        creditLease = await consumeAiCredit(userId, 1);
        const imagePart = imageUrl
          ? { type: "image_url", image_url: { url: imageUrl } }
          : {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            };

        const data = await openRouterChatCompletions({
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: prompt }, imagePart],
            },
          ],
          temperature: 0.2,
        });

        const text = data?.choices?.[0]?.message?.content ?? "";
        return res.status(200).json({
          text,
          usage: data?.usage ?? null,
          access: aiLeasePayload(creditLease),
        });
      } catch (err) {
        if (creditLease?.consumed) {
          await refundAiCredit(creditLease).catch(() => undefined);
        }
        if (err?.code === "quota-exceeded" || err?.code === "not-found") {
          return sendAiAccessError(res, err);
        }
        console.error("openrouterTextFromImage error:", err);
        return res.status(500).json({
          error: "Falha ao processar imagem",
          details: err?.message || String(err),
        });
      }
    });
  });

exports.AIparaconversarcomosusers = functions
  .region("southamerica-east1")
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (!mustPost(req, res)) return;
      let creditLease = null;
      try {
        const userId = resolveUserId(req);
        const mensagem = (readField(req, "mensagem") ?? "").toString().trim();
        if (!userId || !mensagem) {
          return res.status(400).json({
            error: "Parametros obrigatorios: userId, mensagem",
          });
        }

        creditLease = await consumeAiCredit(userId, 1);
        const system = [
          "Voce e o MH Personal Trainer (PT-BR).",
          "Responda sempre em portugues.",
          "Se o usuario pedir um treino/rotina/ficha (ex.: 'me monta um treino', 'rotina de musculacao', 'plano de treino'), retorne um JSON com type='treino' e inclua:",
          "- nomeDaRotina (string curta)",
          "- objetivoDaRotina (string curta)",
          "- treino (lista de strings, 6 a 12 itens, formato: 'Exercicio - series x repeticoes - descanso')",
          "Caso contrario, retorne JSON com type='resposta' e inclua 'resposta' (string).",
          "Responda APENAS com JSON valido.",
        ].join("\n");

        const data = await openRouterChatCompletions({
          messages: [
            { role: "system", content: system },
            { role: "user", content: mensagem },
          ],
          temperature: 0.6,
          response_format: { type: "json_object" },
        });

        const raw = data?.choices?.[0]?.message?.content ?? "";
        const parsed = extractFirstJsonObject(raw);

        if (parsed && parsed.type === "treino" && parsed.treino) {
          const treinoUid = randomUUID();
          const treinoCompleto = {
            nomeDaRotina: (parsed.nomeDaRotina ?? "Treino sugerido").toString(),
            objetivoDaRotina: (parsed.objetivoDaRotina ?? "").toString(),
            treino: Array.isArray(parsed.treino)
              ? parsed.treino.map((t) => String(t))
              : [],
          };

          const db = getFirestore();
          const docRef = db.doc(`users/${userId}/createTreinos/${treinoUid}`);
          await docRef.set(
            {
              uidTreinos: treinoUid,
              nomeDoTreino: treinoCompleto.nomeDaRotina,
              obsInstrucao: treinoCompleto.objetivoDaRotina,
              treino: treinoCompleto.treino,
              daRotina: true,
              dosTreinos: false,
              created_at: new Date(),
            },
            { merge: true },
          );

          return res.status(200).json({
            response: {
              treinoUid,
              treinoCompleto,
            },
            access: aiLeasePayload(creditLease),
          });
        }

        const resposta =
          (parsed && parsed.type === "resposta" && parsed.resposta) ||
          (parsed && parsed.resposta) ||
          raw;

        return res.status(200).json({
          response: {
            resposta: (resposta ?? "").toString(),
          },
          access: aiLeasePayload(creditLease),
        });
      } catch (err) {
        if (creditLease?.consumed) {
          await refundAiCredit(creditLease).catch(() => undefined);
        }
        if (err?.code === "quota-exceeded" || err?.code === "not-found") {
          return sendAiAccessError(res, err);
        }
        console.error("AIparaconversarcomosusers error:", err);
        return res.status(500).json({
          error: "Falha ao processar conversa",
          details: err?.message || String(err),
        });
      }
    });
  });
