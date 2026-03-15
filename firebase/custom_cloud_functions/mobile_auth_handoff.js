const crypto = require("node:crypto");
const functions = require("firebase-functions/v1");
const cors = require("cors")({ origin: true });
const { getAuth } = require("firebase-admin/auth");
const {
  FieldValue,
  Timestamp,
  getFirestore,
} = require("firebase-admin/firestore");
const {
  normalizeCode,
  findPersonalByCode,
  getPersonalStudentCapacity,
} = require("./resolve_invite_personal.js");

const REGION = "southamerica-east1";
const HANDOFF_COLLECTION = "mobileAuthHandoffs";
const HANDOFF_TTL_MS = 5 * 60 * 1000;

const toBool = (value) => value === true || value === "true" || value === 1;

function getBearerToken(req) {
  const header = String(req.headers?.authorization || "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return header.slice(7).trim() || null;
}

function readInviteCode(req) {
  if (req.method === "GET") {
    return req.query?.code;
  }
  return req.body?.code;
}

function readHandoffId(req) {
  if (req.method === "GET") {
    return req.query?.handoff;
  }
  return req.body?.handoff;
}

function getCodeVariants(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return [];

  const variants = new Set();
  if (normalized.numeric !== null) {
    variants.add(normalized.numeric);
    variants.add(String(normalized.numeric));
  }
  if (normalized.string) {
    variants.add(normalized.string);
  }
  return Array.from(variants);
}

function hasSamePersonalCode(currentCode, nextCode) {
  if (currentCode === null || currentCode === undefined) return false;
  const currentVariants = new Set(getCodeVariants(currentCode).map((item) => String(item)));
  return getCodeVariants(nextCode).some((item) => currentVariants.has(String(item)));
}

function getFriendlyCapacityMessage(reason) {
  if (reason === "personal_not_found") {
    return "Codigo do personal nao encontrado.";
  }
  return "Esse personal ja atingiu o limite de 4 alunos no plano gratuito. Peca para ele assinar o Premium para liberar alunos ilimitados.";
}

async function ensureStudentInviteLink({ uid, decodedToken, inviteCode }) {
  const normalizedCode = normalizeCode(inviteCode);
  if (!normalizedCode) {
    return null;
  }

  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};

  if (toBool(userData.professorAccount) || toBool(userData.admin) || toBool(userData.academyAccount)) {
    throw new Error("Este convite e exclusivo para contas de aluno.");
  }

  const profile = await findPersonalByCode(inviteCode);
  if (!profile) {
    throw new Error("Codigo do personal nao encontrado.");
  }

  const alreadyLinked = hasSamePersonalCode(userData.codigoPersonal, profile.codigoPersonal || inviteCode);
  if (!alreadyLinked) {
    const capacity = await getPersonalStudentCapacity({ profile, code: inviteCode });
    if (!capacity.allowed) {
      throw new Error(getFriendlyCapacityMessage(capacity.reason));
    }
  }

  const nextPersonalCode = profile.codigoPersonal || normalizedCode.numeric || normalizedCode.string;
  const basePayload = {
    uid,
    email: userData.email || decodedToken.email || "",
    display_name:
      userData.display_name ||
      decodedToken.name ||
      (decodedToken.email ? String(decodedToken.email).split("@")[0] : ""),
    photo_url: userData.photo_url || decodedToken.picture || "",
    professorAccount: false,
    admin: false,
    academyAccount: false,
    assinatura: toBool(userData.assinatura),
    planoChatGPT: toBool(userData.planoChatGPT),
    acessoSuspenso: toBool(userData.acessoSuspenso),
    last_active_time: FieldValue.serverTimestamp(),
    codigoPersonal: nextPersonalCode,
    nameDoSeuPersonal: profile.displayName || "Personal",
    personalVinculadoEm: FieldValue.serverTimestamp(),
  };

  if (!userSnap.exists) {
    basePayload.created_time = FieldValue.serverTimestamp();
  }

  await userRef.set(basePayload, { merge: true });

  return {
    codigoPersonal: nextPersonalCode,
    personalName: profile.displayName || "Personal",
  };
}

async function verifyWebSession(req) {
  const idToken = getBearerToken(req);
  if (!idToken) {
    throw Object.assign(new Error("Sessao web ausente."), { statusCode: 401 });
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw Object.assign(new Error("Sessao web invalida ou expirada."), {
      statusCode: 401,
      cause: error,
    });
  }
}

async function createHandoff(uid, inviteLinkResult) {
  const db = getFirestore();
  const handoffId = crypto.randomUUID();
  const now = Date.now();

  await db.collection(HANDOFF_COLLECTION).doc(handoffId).set({
    uid,
    createdAt: Timestamp.fromMillis(now),
    expiresAt: Timestamp.fromMillis(now + HANDOFF_TTL_MS),
    consumedAt: null,
    inviteCode: inviteLinkResult?.codigoPersonal ?? null,
    invitePersonalName: inviteLinkResult?.personalName ?? null,
  });

  return handoffId;
}

exports.startMobileAuthHandoff = functions
  .region(REGION)
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      res.set("Cache-Control", "no-store");

      if (req.method !== "POST") {
        return res.status(405).json({ error: "Metodo nao permitido. Use POST." });
      }

      try {
        const decodedToken = await verifyWebSession(req);
        const inviteCode = readInviteCode(req);
        const inviteLinkResult = await ensureStudentInviteLink({
          uid: decodedToken.uid,
          decodedToken,
          inviteCode,
        });
        const handoffId = await createHandoff(decodedToken.uid, inviteLinkResult);

        return res.status(200).json({
          handoffId,
          expiresInSeconds: Math.floor(HANDOFF_TTL_MS / 1000),
          linkedInvite: inviteLinkResult,
        });
      } catch (error) {
        const statusCode = error?.statusCode || 400;
        console.error("startMobileAuthHandoff error:", error);
        return res.status(statusCode).json({
          error: error?.message || "Falha ao preparar o login no app.",
        });
      }
    });
  });

exports.consumeMobileAuthHandoff = functions
  .region(REGION)
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      res.set("Cache-Control", "no-store");

      if (req.method !== "POST") {
        return res.status(405).json({ error: "Metodo nao permitido. Use POST." });
      }

      const handoffId = String(readHandoffId(req) || "").trim();
      if (!handoffId) {
        return res.status(400).json({ error: "Parametro obrigatorio: handoff" });
      }

      try {
        const db = getFirestore();
        const handoffRef = db.collection(HANDOFF_COLLECTION).doc(handoffId);
        let handoffData = null;

        await db.runTransaction(async (transaction) => {
          const handoffSnap = await transaction.get(handoffRef);
          if (!handoffSnap.exists) {
            throw new Error("Link de acesso ao app invalido ou expirado.");
          }

          const data = handoffSnap.data() || {};
          const expiresAtMillis = data.expiresAt?.toMillis?.() || 0;
          if (data.consumedAt) {
            throw new Error("Este link de acesso ao app ja foi usado.");
          }
          if (expiresAtMillis && expiresAtMillis < Date.now()) {
            transaction.delete(handoffRef);
            throw new Error("Link de acesso ao app expirado. Gere um novo pelo navegador.");
          }

          handoffData = data;
          transaction.update(handoffRef, {
            consumedAt: FieldValue.serverTimestamp(),
          });
        });

        if (!handoffData?.uid) {
          return res.status(400).json({ error: "Sessao de app invalida." });
        }

        const customToken = await getAuth().createCustomToken(handoffData.uid);

        return res.status(200).json({
          customToken,
          inviteCode: handoffData.inviteCode || null,
          invitePersonalName: handoffData.invitePersonalName || null,
        });
      } catch (error) {
        console.error("consumeMobileAuthHandoff error:", error);
        return res.status(400).json({
          error: error?.message || "Falha ao concluir o login no app.",
        });
      }
    });
  });
