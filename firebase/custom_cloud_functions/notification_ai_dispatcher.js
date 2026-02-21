const functions = require("firebase-functions/v1");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { getConfigValue } = require("./runtime_config");

const REGION = "southamerica-east1";
const TIME_ZONE = "America/Sao_Paulo";
const MAX_AUDIENCE_USERS = 400;
const BATCH_LIMIT = 400;

const OPENROUTER_API_URL =
  process.env.OPENROUTER_API_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY ||
  process.env.OPENAI_API_KEY ||
  getConfigValue(["openrouter", "key"], "") ||
  getConfigValue(["openai", "key"], "") ||
  getConfigValue(["openai", "api_key"], "") ||
  "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const OPENROUTER_HTTP_REFERER =
  process.env.OPENROUTER_HTTP_REFERER || "https://mhpersonaltrainer.com.br";
const OPENROUTER_APP_TITLE =
  process.env.OPENROUTER_APP_TITLE || "MH Personal Notifications";

const AUDIENCE_CONFIG = [
  {
    key: "Alunos",
    objective: "engajamento no treino",
    fallbackHour: 18,
    fallbackMinute: 20,
    tipo: "Chamada pro app",
    isTarget(data) {
      return (
        !toBool(data.admin) &&
        !toBool(data.professorAccount) &&
        !toBool(data.academyAccount)
      );
    },
  },
  {
    key: "Personals",
    objective: "produtividade do painel",
    fallbackHour: 7,
    fallbackMinute: 40,
    tipo: "Agenda",
    isTarget(data) {
      return toBool(data.professorAccount) && !toBool(data.admin);
    },
  },
  {
    key: "Academias",
    objective: "retencao e vendas",
    fallbackHour: 10,
    fallbackMinute: 15,
    tipo: "Promocoes",
    isTarget(data) {
      return toBool(data.academyAccount) && !toBool(data.admin);
    },
  },
];

const FALLBACK_COPY = {
  Alunos: {
    titulo: "Seu treino de hoje ja esta pronto",
    descricao:
      "Abra o app, confirme sua rotina e mantenha a sequencia. Cada treino concluido conta.",
    tipo: "Chamada pro app",
  },
  Personals: {
    titulo: "Painel atualizado para o seu dia",
    descricao:
      "Revise agenda, alunos e ajustes de treino para manter o atendimento sem atrasos.",
    tipo: "Agenda",
  },
  Academias: {
    titulo: "Campanha ativa para gerar mais presenca",
    descricao:
      "Use o painel para divulgar ofertas e fortalecer a recorrencia dos alunos hoje.",
    tipo: "Promocoes",
  },
};

const toBool = (value) => value === true || value === "true" || value === 1;

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

function getZonedParts(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const entries = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
  return {
    year: Number(entries.year),
    month: Number(entries.month),
    day: Number(entries.day),
    hour: Number(entries.hour),
    minute: Number(entries.minute),
    dateKey: `${entries.year}-${entries.month}-${entries.day}`,
  };
}

function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map((value) => Number(value));
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function compareDateKeys(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function zonedDateTimeToUtc(dateKey, hour, minute) {
  const [year, month, day] = dateKey.split("-").map((value) => Number(value));
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  for (let index = 0; index < 5; index += 1) {
    const parts = getZonedParts(candidate);
    const dayDiff = compareDateKeys(dateKey, parts.dateKey);
    const targetMinutes = hour * 60 + minute;
    const currentMinutes = parts.hour * 60 + parts.minute;
    const totalDiff = dayDiff * 1440 + (targetMinutes - currentMinutes);
    if (totalDiff === 0) {
      return candidate;
    }
    candidate = new Date(candidate.getTime() + totalDiff * 60 * 1000);
  }
  return candidate;
}

function clampHour(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(23, Math.round(parsed)));
}

function clampMinute(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(59, Math.round(parsed)));
}

function buildAudienceUsers(snapshotDocs, audienceConfig) {
  const users = [];
  snapshotDocs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    if (!audienceConfig.isTarget(data)) return;
    if (toBool(data.acessoSuspenso)) return;
    const name = String(data.display_name || data.displayName || data.email || "Usuario").trim();
    users.push({
      id: docSnap.id,
      name: name || "Usuario",
      lastActiveAt: toDate(data.last_active_time),
    });
  });
  return users.slice(0, MAX_AUDIENCE_USERS);
}

function scoreBestHour(users, audienceState, fallbackHour) {
  const buckets = Array.from({ length: 24 }, () => 0);
  users.forEach((user) => {
    if (!user.lastActiveAt) return;
    const hour = getZonedParts(user.lastActiveAt).hour;
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) return;
    buckets[hour] += 1;
  });
  const previousWeights =
    audienceState && audienceState.hourWeights && typeof audienceState.hourWeights === "object"
      ? audienceState.hourWeights
      : {};

  let bestHour = fallbackHour;
  let bestScore = -1;

  for (let hour = 0; hour < 24; hour += 1) {
    const center = buckets[hour];
    const prev = buckets[(hour + 23) % 24];
    const next = buckets[(hour + 1) % 24];
    const historyBoost = Number(previousWeights[String(hour)] || 0);
    const score = center * 1.8 + prev * 0.45 + next * 0.45 + historyBoost;
    if (score > bestScore) {
      bestScore = score;
      bestHour = hour;
    }
  }

  return {
    hour: bestHour,
    histogram: buckets,
  };
}

function computeNextSlot({ nowParts, audienceState, scheduledHour, scheduledMinute }) {
  const nowMinute = nowParts.hour * 60 + nowParts.minute;
  const scheduledAtMinute = scheduledHour * 60 + scheduledMinute;
  const sentToday = audienceState?.dateKey === nowParts.dateKey && Boolean(audienceState.sentAt);
  const isDueNow = !sentToday && nowMinute >= scheduledAtMinute;
  const targetDateKey =
    sentToday || nowMinute >= scheduledAtMinute
      ? addDaysToDateKey(nowParts.dateKey, 1)
      : nowParts.dateKey;
  const nextRunAt = zonedDateTimeToUtc(targetDateKey, scheduledHour, scheduledMinute);

  return {
    sentToday,
    isDueNow,
    nextRunAt,
    nextDateKey: targetDateKey,
  };
}

function truncateText(value, limit = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function openRouterHeaders() {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OpenRouter API key not configured.");
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
    throw new Error(message);
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

async function generateCopyWithAi({ audience, objective, bestHour, usersCount, fallback }) {
  if (!OPENROUTER_API_KEY) {
    return fallback;
  }

  const prompt = [
    "Voce escreve notificacoes curtas para aplicativo fitness.",
    "Gere uma mensagem de alto engajamento para o publico informado.",
    "Responda apenas JSON valido:",
    '{ "titulo": "...", "descricao": "...", "tipo": "..." }',
    "Limites:",
    "- titulo com ate 52 caracteres",
    "- descricao com ate 140 caracteres",
    "- descricao deve incluir placeholder {nome} uma vez",
    "",
    `publico: ${audience}`,
    `objetivo: ${objective}`,
    `melhor_horario: ${String(bestHour).padStart(2, "0")}:00`,
    `usuarios_no_segmento: ${usersCount}`,
  ].join("\n");

  try {
    const response = await openRouterChatCompletions({
      messages: [
        {
          role: "system",
          content:
            "Voce e especialista em copy para notificacoes push. Responda somente JSON valido.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.55,
      max_tokens: 220,
      response_format: { type: "json_object" },
    });

    const raw = response?.choices?.[0]?.message?.content || "";
    const parsed = extractFirstJsonObject(raw) || {};
    const titulo = truncateText(parsed.titulo || fallback.titulo, 52);
    const descricaoRaw = truncateText(parsed.descricao || fallback.descricao, 140);
    const descricao = descricaoRaw.includes("{nome}")
      ? descricaoRaw
      : `Oi {nome}, ${descricaoRaw}`;
    return {
      titulo,
      descricao,
      tipo: truncateText(parsed.tipo || fallback.tipo || "Sistema", 32),
    };
  } catch (error) {
    console.error(`Falha IA para notificacao ${audience}:`, error);
    return fallback;
  }
}

function personalizeDescription(template, userName) {
  const firstName = String(userName || "").trim().split(/\s+/)[0] || "usuario";
  return String(template || "").replace(/\{nome\}/gi, firstName);
}

async function hasPremiumAdminAccess() {
  const db = getFirestore();
  const usersRef = db.collection("users");
  const snapshots = await Promise.all([
    usersRef.where("admin", "==", true).limit(30).get(),
    usersRef.where("admin", "==", "true").limit(30).get(),
  ]);
  const merged = new Map();
  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((docSnap) => merged.set(docSnap.id, docSnap.data() || {}));
  });
  // Admin tem acesso completo ao assistente, independente de assinatura.
  return merged.size > 0;
}

async function dispatchAudienceNotifications({ audience, copy, users, objective, hourModel }) {
  if (!users.length) {
    return { sentCount: 0 };
  }
  const db = getFirestore();
  let batch = db.batch();
  let operations = 0;
  let sentCount = 0;

  for (const user of users) {
    const ref = db.collection("notificacao").doc();
    batch.set(ref, {
      titulo: copy.titulo,
      descricao: personalizeDescription(copy.descricao, user.name),
      tipo: copy.tipo || audience.tipo,
      publico: audience.key,
      para: user.id,
      paraTodos: false,
      data: FieldValue.serverTimestamp(),
      autoEvent: true,
      eventType: "assistant_auto_dispatch",
      generatedBy: "notification-assistant-v1",
      soundHint: "soft_ping",
      meta: {
        audience: audience.key,
        objective,
        modelHour: hourModel,
      },
    });
    operations += 1;
    sentCount += 1;
    if (operations >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      operations = 0;
    }
  }

  if (operations > 0) {
    await batch.commit();
  }
  return { sentCount };
}

exports.runNotificationAssistantAutoDispatch = functions
  .region(REGION)
  .pubsub.schedule("every 15 minutes")
  .timeZone(TIME_ZONE)
  .onRun(async () => {
    const db = getFirestore();
    const settingsRef = db.doc("adminSettings/notificationsAssistant");
    const settingsSnap = await settingsRef.get();
    if (!settingsSnap.exists) {
      return null;
    }

    const settings = settingsSnap.data() || {};
    const assistantEnabled = Boolean(settings.assistantEnabled);
    const assistantSmart = Boolean(settings.assistantSmart);
    const premiumOnly = settings.assistantPremiumOnly !== false;
    if (!assistantEnabled || !assistantSmart) {
      await settingsRef.set(
        {
          smartState: {
            status: "paused",
            nextRunAt: null,
            lastError: null,
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
      return null;
    }

    if (premiumOnly) {
      const premiumAccess = await hasPremiumAdminAccess();
      if (!premiumAccess) {
        await settingsRef.set(
          {
            smartState: {
              status: "paused",
              nextRunAt: null,
              lastError: "Premium inativo para automacao.",
              updatedAt: FieldValue.serverTimestamp(),
            },
          },
          { merge: true },
        );
        return null;
      }
    }

    const now = new Date();
    const nowParts = getZonedParts(now);
    const usersSnapshot = await db.collection("users").limit(1200).get();
    const smartState =
      settings.smartState && typeof settings.smartState === "object"
        ? settings.smartState
        : {};
    const audienceStateMap =
      smartState.audiences && typeof smartState.audiences === "object"
        ? smartState.audiences
        : {};

    const candidates = [];
    const dueAudiences = [];

    for (const audience of AUDIENCE_CONFIG) {
      const users = buildAudienceUsers(usersSnapshot.docs, audience);
      const currentAudienceState =
        audienceStateMap[audience.key] && typeof audienceStateMap[audience.key] === "object"
          ? audienceStateMap[audience.key]
          : {};
      const scored = scoreBestHour(users, currentAudienceState, audience.fallbackHour);
      const scheduledHour = clampHour(currentAudienceState.hour, scored.hour);
      const scheduledMinute = clampMinute(
        currentAudienceState.minute,
        audience.fallbackMinute,
      );
      const slot = computeNextSlot({
        nowParts,
        audienceState: currentAudienceState,
        scheduledHour,
        scheduledMinute,
      });
      candidates.push({
        audience,
        users,
        scored,
        scheduledHour,
        scheduledMinute,
        slot,
      });
      if (slot.isDueNow) {
        dueAudiences.push({
          audience,
          users,
          scored,
          scheduledHour,
          scheduledMinute,
          currentAudienceState,
        });
      }
    }

    const nextCandidate = candidates
      .map((item) => ({
        at: item.slot.nextRunAt,
        audience: item.audience.key,
        objective: item.audience.objective,
      }))
      .sort((a, b) => a.at.getTime() - b.at.getTime())[0];

    const nextAudienceState = { ...audienceStateMap };
    let lastDispatch = null;

    for (const item of dueAudiences) {
      const fallbackCopy = FALLBACK_COPY[item.audience.key] || {
        titulo: "Atualizacao no app",
        descricao: "Tem novidade no seu painel. Abra o app para conferir.",
        tipo: item.audience.tipo,
      };
      const copy = await generateCopyWithAi({
        audience: item.audience.key,
        objective: item.audience.objective,
        bestHour: item.scheduledHour,
        usersCount: item.users.length,
        fallback: fallbackCopy,
      });

      const dispatchResult = await dispatchAudienceNotifications({
        audience: item.audience,
        copy,
        users: item.users,
        objective: item.audience.objective,
        hourModel: item.scheduledHour,
      });

      const hourWeights =
        item.currentAudienceState.hourWeights &&
        typeof item.currentAudienceState.hourWeights === "object"
          ? { ...item.currentAudienceState.hourWeights }
          : {};
      const previousWeight = Number(hourWeights[String(item.scheduledHour)] || 0);
      hourWeights[String(item.scheduledHour)] = Number(
        (previousWeight * 0.6 + dispatchResult.sentCount * 0.4).toFixed(2),
      );

      nextAudienceState[item.audience.key] = {
        dateKey: nowParts.dateKey,
        sentAt: FieldValue.serverTimestamp(),
        sentCount: dispatchResult.sentCount,
        title: copy.titulo,
        objective: item.audience.objective,
        hour: item.scheduledHour,
        minute: item.scheduledMinute,
        hourWeights,
      };

      lastDispatch = {
        audience: item.audience.key,
        objective: item.audience.objective,
        title: copy.titulo,
      };
    }

    await settingsRef.set(
      {
        assistantEnabled: true,
        assistantSmart: true,
        assistantPremiumOnly: premiumOnly,
        assistantEngine: "cloud-v1",
        smartState: {
          status: dueAudiences.length ? "running" : "idle",
          audiences: nextAudienceState,
          nextRunAt: nextCandidate ? nextCandidate.at : null,
          nextAudience: nextCandidate ? nextCandidate.audience : null,
          nextObjective: nextCandidate ? nextCandidate.objective : null,
          nextTitle: null,
          lastSentAt: dueAudiences.length ? FieldValue.serverTimestamp() : smartState.lastSentAt || null,
          lastAudience: lastDispatch ? lastDispatch.audience : smartState.lastAudience || null,
          lastObjective: lastDispatch ? lastDispatch.objective : smartState.lastObjective || null,
          lastTitle: lastDispatch ? lastDispatch.title : smartState.lastTitle || null,
          lastError: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return null;
  });
