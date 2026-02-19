const functions = require("firebase-functions/v1");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
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
  process.env.OPENROUTER_HTTP_REFERER || "https://mhpersonal.app";
const OPENROUTER_APP_TITLE = process.env.OPENROUTER_APP_TITLE || "MH Personal";
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);
const EVALUATION_COLLECTIONS = [
  "avaliacaoOnline",
  "avaliacaoPersonalizada",
  "avaliacaoPostural",
  "avaliacoesFisicas",
];
const WEEKLY_REVIEW_DAYS = 7;

const toBool = (value) => value === true || value === "true" || value === 1;
const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value?.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isPremiumUser(userData) {
  if (!userData || typeof userData !== "object") return false;
  if (toBool(userData.assinatura)) return true;
  if (toBool(userData.planoChatGPT)) return true;
  const statusCandidates = [
    userData.stripeSubscriptionStatus,
    userData.subscriptionStatus,
    userData.statusAssinatura,
    userData.assinaturaStatus,
  ];
  return statusCandidates.some((status) =>
    ACTIVE_SUBSCRIPTION_STATUSES.has(normalizeStatus(status)),
  );
}

function isStudentUser(userData) {
  if (!userData || typeof userData !== "object") return false;
  if (toBool(userData.admin)) return false;
  if (toBool(userData.professorAccount)) return false;
  return true;
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
  const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `OpenRouter request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
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

async function fetchStudentContext(uid) {
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    return { eligible: false, reason: "user-not-found" };
  }
  const userData = userSnap.data() || {};
  if (!isStudentUser(userData)) {
    return { eligible: false, reason: "not-student", userData };
  }
  if (!isPremiumUser(userData)) {
    return { eligible: false, reason: "not-premium", userData };
  }
  if (toBool(userData.acessoSuspenso)) {
    return { eligible: false, reason: "suspended", userData };
  }

  const workoutsRef = db.collection(`users/${uid}/createTreinos`);
  let workoutsSnap;
  try {
    workoutsSnap = await workoutsRef.orderBy("updatedAt", "desc").limit(30).get();
  } catch (_) {
    workoutsSnap = await workoutsRef.limit(30).get();
  }
  const workouts = workoutsSnap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    const completedAt = toDate(data.lastCompletedAt);
    return {
      id: docSnap.id,
      nome: data.nomeDoTreino || data.nome || "Treino",
      diasDaSemana: Array.isArray(data.diasDaSemana) ? data.diasDaSemana : [],
      completedAt,
      concluido: Boolean(data.concluido || completedAt),
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  });

  const evaluationSnapshots = await Promise.all(
    EVALUATION_COLLECTIONS.map((collectionName) =>
      db.collection(`users/${uid}/${collectionName}`).limit(50).get(),
    ),
  );
  const totalEvaluations = evaluationSnapshots.reduce(
    (sum, snap) => sum + snap.size,
    0,
  );

  const completedWorkouts = workouts.filter((item) => item.concluido).length;
  const completionRate = workouts.length
    ? Math.round((completedWorkouts / workouts.length) * 100)
    : 0;
  const lastCompletedAt = workouts
    .map((item) => item.completedAt)
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;

  return {
    eligible: true,
    userData,
    workouts,
    totalEvaluations,
    stats: {
      totalWorkouts: workouts.length,
      completedWorkouts,
      completionRate,
      lastCompletedAt,
    },
  };
}

function normalizeOffset(raw, fallback) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(6, Math.round(parsed)));
}

function buildFallbackSuggestions({ reason }) {
  const now = new Date();
  const treinoDate = addDays(now, reason === "weekly" ? 1 : 0);
  const avaliacaoDate = addDays(now, reason === "weekly" ? 3 : 2);
  return [
    {
      type: "treino",
      title: "Treino ajustado pela IA",
      summary: "Ajuste de treino com base no seu ritmo mais recente.",
      scheduledDate: treinoDate,
      reason,
    },
    {
      type: "avaliacao",
      title: "Avaliacao de acompanhamento",
      summary: "Registrar evolucao para atualizar o proximo ciclo.",
      scheduledDate: avaliacaoDate,
      reason,
    },
  ];
}

async function buildAiSuggestions({ uid, reason, context }) {
  const prompt = [
    "Voce eh o assistente MH Personal.",
    "Crie 2 sugestoes para o aluno: uma de treino e uma de avaliacao.",
    "Retorne apenas JSON valido com a estrutura:",
    "{",
    '  "treino": { "titulo": "...", "resumo": "...", "offsetDias": 0-6 },',
    '  "avaliacao": { "titulo": "...", "resumo": "...", "offsetDias": 0-6 }',
    "}",
    "Resumo deve ser curto e pratico.",
    "",
    `uid: ${uid}`,
    `motivo: ${reason === "weekly" ? "revisao semanal" : "treino concluido"}`,
    `objetivo: ${context.objetivo}`,
    `nivel: ${context.nivel}`,
    `treinosTotais: ${context.totalWorkouts}`,
    `treinosConcluidos: ${context.completedWorkouts}`,
    `taxaConclusao: ${context.completionRate}%`,
    `avaliacoes: ${context.totalEvaluations}`,
  ].join("\n");

  try {
    const response = await openRouterChatCompletions({
      messages: [
        {
          role: "system",
          content:
            "Voce e um personal trainer especialista em progressao de treino. Responda somente JSON valido.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      response_format: { type: "json_object" },
    });

    const raw = response?.choices?.[0]?.message?.content || "";
    const parsed = extractFirstJsonObject(raw) || {};
    const now = new Date();

    const treinoOffset = normalizeOffset(parsed?.treino?.offsetDias, reason === "weekly" ? 1 : 0);
    const avaliacaoOffset = normalizeOffset(
      parsed?.avaliacao?.offsetDias,
      reason === "weekly" ? 3 : 2,
    );

    return [
      {
        type: "treino",
        title: String(parsed?.treino?.titulo || "Treino ajustado pela IA").slice(0, 80),
        summary: String(
          parsed?.treino?.resumo || "Treino atualizado conforme seu progresso recente.",
        ).slice(0, 180),
        scheduledDate: addDays(now, treinoOffset),
        reason,
      },
      {
        type: "avaliacao",
        title: String(parsed?.avaliacao?.titulo || "Avaliacao sugerida pela IA").slice(0, 80),
        summary: String(
          parsed?.avaliacao?.resumo || "Avaliacao para calibrar o proximo ciclo de treino.",
        ).slice(0, 180),
        scheduledDate: addDays(now, avaliacaoOffset),
        reason,
      },
    ];
  } catch (error) {
    console.error("Falha ao gerar sugestoes via IA, usando fallback:", error);
    return buildFallbackSuggestions({ reason });
  }
}

async function createSuggestionsForStudent({
  uid,
  reason,
  triggerKey,
}) {
  const db = getFirestore();
  const plannerRef = db.doc(`users/${uid}/automation/aiPlanner`);
  const plannerSnap = await plannerRef.get();
  const plannerData = plannerSnap.exists ? plannerSnap.data() || {} : {};

  if (reason === "weekly") {
    const lastReviewAt = toDate(plannerData.lastReviewAt);
    if (lastReviewAt) {
      const elapsedMs = Date.now() - lastReviewAt.getTime();
      const requiredMs = WEEKLY_REVIEW_DAYS * 24 * 60 * 60 * 1000;
      if (elapsedMs < requiredMs) {
        return { skipped: true, reason: "weekly-not-due" };
      }
    }
  }

  if (reason === "workout" && triggerKey) {
    const previousTriggerKey = String(plannerData.lastWorkoutTriggerKey || "");
    if (previousTriggerKey && previousTriggerKey === triggerKey) {
      return { skipped: true, reason: "duplicate-workout-trigger" };
    }
  }

  const context = await fetchStudentContext(uid);
  if (!context.eligible) {
    return { skipped: true, reason: context.reason || "not-eligible" };
  }

  const suggestions = await buildAiSuggestions({
    uid,
    reason,
    context: {
      objetivo: context.userData.objetivoNoApp || "condicionamento geral",
      nivel: context.userData.experiencia || "iniciante",
      totalWorkouts: context.stats.totalWorkouts,
      completedWorkouts: context.stats.completedWorkouts,
      completionRate: context.stats.completionRate,
      totalEvaluations: context.totalEvaluations,
    },
  });

  const batch = db.batch();
  const now = new Date();

  suggestions.forEach((item) => {
    const suggestionRef = db
      .collection(`users/${uid}/aiPlannerSuggestions`)
      .doc(randomUUID());
    batch.set(suggestionRef, {
      type: item.type,
      title: item.title,
      summary: item.summary,
      reason: item.reason,
      source: "backend",
      status: "pending",
      unread: true,
      dateKey: toDateKey(item.scheduledDate),
      scheduledDate: item.scheduledDate,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  batch.set(
    plannerRef,
    {
      lastReviewAt: FieldValue.serverTimestamp(),
      lastReason: reason,
      lastWorkoutCompletedAt: context.stats.lastCompletedAt || null,
      lastWorkoutTriggerKey: triggerKey || null,
      updatedAt: FieldValue.serverTimestamp(),
      generatedCount: FieldValue.increment(suggestions.length),
      lastGeneratedAtClientHint: now.toISOString(),
    },
    { merge: true },
  );

  await batch.commit();
  return { skipped: false, created: suggestions.length };
}

async function collectPremiumStudentIds() {
  const db = getFirestore();
  const usersRef = db.collection("users");
  const merged = new Set();

  const [chatPlanSnap, assinaturaSnap, activeSnap, trialingSnap, pastDueSnap] =
    await Promise.all([
      usersRef.where("planoChatGPT", "==", true).get(),
      usersRef.where("assinatura", "==", true).get(),
      usersRef.where("stripeSubscriptionStatus", "==", "active").get(),
      usersRef.where("stripeSubscriptionStatus", "==", "trialing").get(),
      usersRef.where("stripeSubscriptionStatus", "==", "past_due").get(),
    ]);

  [
    chatPlanSnap,
    assinaturaSnap,
    activeSnap,
    trialingSnap,
    pastDueSnap,
  ].forEach((snap) => {
    snap.forEach((docSnap) => merged.add(docSnap.id));
  });

  return Array.from(merged);
}

exports.reviewPremiumStudentsWeekly = functions
  .region("southamerica-east1")
  .pubsub.schedule("every 24 hours")
  .timeZone("America/Sao_Paulo")
  .onRun(async () => {
    const uids = await collectPremiumStudentIds();
    let processed = 0;
    let created = 0;
    let skipped = 0;

    for (const uid of uids) {
      try {
        const result = await createSuggestionsForStudent({
          uid,
          reason: "weekly",
        });
        processed += 1;
        if (result.skipped) {
          skipped += 1;
        } else {
          created += Number(result.created || 0);
        }
      } catch (error) {
        console.error(`Erro na revisao semanal do aluno ${uid}:`, error);
      }
    }

    console.log(
      `reviewPremiumStudentsWeekly finalizado. processed=${processed}, created=${created}, skipped=${skipped}`,
    );
    return null;
  });

exports.reviewProgressOnWorkoutCompletion = functions
  .region("southamerica-east1")
  .firestore.document("users/{uid}/createTreinos/{workoutId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const beforeCompletedAt = toDate(before.lastCompletedAt);
    const afterCompletedAt = toDate(after.lastCompletedAt);

    if (!afterCompletedAt) {
      return null;
    }

    const beforeMs = beforeCompletedAt ? beforeCompletedAt.getTime() : 0;
    const afterMs = afterCompletedAt.getTime();
    if (beforeMs === afterMs) {
      return null;
    }

    const uid = context.params.uid;
    const workoutId = context.params.workoutId;
    const triggerKey = `${workoutId}:${afterMs}`;

    try {
      const result = await createSuggestionsForStudent({
        uid,
        reason: "workout",
        triggerKey,
      });
      if (result.skipped) {
        console.log(
          `reviewProgressOnWorkoutCompletion skip uid=${uid} reason=${result.reason}`,
        );
      } else {
        console.log(
          `reviewProgressOnWorkoutCompletion ok uid=${uid} created=${result.created}`,
        );
      }
    } catch (error) {
      console.error(
        `Erro ao gerar sugestoes apos treino. uid=${uid} workoutId=${workoutId}`,
        error,
      );
    }

    return null;
  });
