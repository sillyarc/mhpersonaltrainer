const functions = require("firebase-functions/v1");
const cors = require("cors")({ origin: true });
const { getFirestore } = require("firebase-admin/firestore");

const REGION = "southamerica-east1";
const FREE_PERSONAL_STUDENTS_LIMIT = 4;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

const toBool = (value) => value === true || value === "true" || value === 1;
const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

function normalizeCode(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw || raw === "0") return null;
  const numeric = Number(raw);
  if (!Number.isNaN(numeric) && numeric > 0) {
    return { numeric, string: String(Math.trunc(numeric)) };
  }
  return { numeric: null, string: raw };
}

function buildCodeVariants(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return [];
  const variants = new Set();
  if (normalized.numeric !== null) {
    variants.add(normalized.numeric);
  }
  if (normalized.string) {
    variants.add(normalized.string);
  }
  return Array.from(variants);
}

function normalizeServicos(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      servicos: item?.servicos || item?.nome || "",
      descricao: item?.descricao || "",
    }))
    .filter((item) => item.servicos);
}

function normalizeHorario(value) {
  if (!value || typeof value !== "object") return undefined;
  const normalized = {
    inicioSegSex: value.inicioSegSex || null,
    terminioSegSex: value.terminioSegSex || null,
    inicioSab: value.inicioSab || null,
    terminioSab: value.terminioSab || null,
    inicioDom: value.inicioDom || null,
    terminioDom: value.terminioDom || null,
  };
  return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

function isPremiumUser(userData) {
  if (!userData || typeof userData !== "object") return false;
  if (toBool(userData.admin)) return true;
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

function mapProfile({ id, uid, data, fallback = {} }) {
  return {
    id,
    uid: uid || id,
    displayName:
      data.display_name ||
      data.displayName ||
      fallback.display_name ||
      fallback.displayName ||
      "Personal",
    photoUrl: data.photo_url || data.photoUrl || fallback.photo_url || fallback.photoUrl,
    bio: data.bio || data.biografia || fallback.bio || fallback.biografia,
    especializacao: data.especializacao || fallback.especializacao,
    codigoPersonal: data.codigoPersonal || fallback.codigoPersonal,
    phoneNumber: data.phone_number || data.phoneNumber || fallback.phone_number || fallback.phoneNumber,
    cref: data.cref || fallback.cref,
    instagram: data.instagram || fallback.instagram,
    linkedin: data.linkedin || fallback.linkedin,
    cidade:
      data.cidade ||
      data.city ||
      data.cidadeAtual ||
      fallback.cidade ||
      fallback.city ||
      fallback.cidadeAtual,
    estado: data.estado || data.uf || data.state || fallback.estado || fallback.uf || fallback.state,
    location:
      data.location ||
      fallback.location ||
      (data.latitude && data.longitude
        ? { latitude: data.latitude, longitude: data.longitude }
        : fallback.latitude && fallback.longitude
          ? { latitude: fallback.latitude, longitude: fallback.longitude }
          : undefined),
    servicos: normalizeServicos(data.servicos || fallback.servicos),
    horarioAtendimento: normalizeHorario(data.horarioAtendimento || fallback.horarioAtendimento),
  };
}

async function findPersonalByCode(code) {
  const variants = buildCodeVariants(code);
  if (!variants.length) return null;

  const db = getFirestore();
  const usersRef = db.collection("users");

  for (const value of variants) {
    const usersSnapshot = await usersRef
      .where("codigoPersonal", "==", value)
      .limit(50)
      .get();

    const personalDoc = usersSnapshot.docs.find((docSnap) => {
      const data = docSnap.data() || {};
      return toBool(data.professorAccount) && !toBool(data.admin);
    });

    if (personalDoc) {
      return mapProfile({
        id: personalDoc.id,
        uid: personalDoc.id,
        data: personalDoc.data() || {},
      });
    }
  }

  for (const value of variants) {
    const professorSnapshot = await db
      .collection("professorAccount")
      .where("codigoPersonal", "==", value)
      .limit(1)
      .get();

    if (professorSnapshot.empty) continue;

    const professorDoc = professorSnapshot.docs[0];
    const professorData = professorDoc.data() || {};
    const uid = professorData.uid || professorDoc.id;
    if (!uid) continue;

    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.exists) {
      return mapProfile({
        id: userDoc.id,
        uid: userDoc.id,
        data: userDoc.data() || {},
        fallback: professorData,
      });
    }

    return mapProfile({
      id: uid,
      uid,
      data: professorData,
    });
  }

  for (const value of variants) {
    const personalSnapshot = await db
      .collectionGroup("personalAccount")
      .where("codigoPersonal", "==", value)
      .limit(1)
      .get();

    if (personalSnapshot.empty) continue;

    const accountDoc = personalSnapshot.docs[0];
    const data = accountDoc.data() || {};
    const parent = accountDoc.ref.parent.parent;
    const uid = parent?.id || data.uid || accountDoc.id;

    return mapProfile({
      id: uid,
      uid,
      data,
    });
  }

  return null;
}

async function getPersonalStudentCapacity({ profile, code }) {
  if (!profile?.uid) {
    return {
      allowed: false,
      premium: false,
      limit: FREE_PERSONAL_STUDENTS_LIMIT,
      currentStudents: 0,
      remainingSlots: 0,
      personalId: null,
      personalName: "Personal",
      reason: "personal_not_found",
    };
  }

  const variants = buildCodeVariants(code || profile.codigoPersonal);
  if (!variants.length) {
    return {
      allowed: false,
      premium: false,
      limit: FREE_PERSONAL_STUDENTS_LIMIT,
      currentStudents: 0,
      remainingSlots: 0,
      personalId: profile.uid,
      personalName: profile.displayName || "Personal",
      reason: "personal_not_found",
    };
  }

  const db = getFirestore();
  const personalDoc = await db.collection("users").doc(profile.uid).get();
  const personalData = personalDoc.exists ? personalDoc.data() || {} : {};
  const premium = isPremiumUser(personalData);

  const students = new Set();
  for (const value of variants) {
    const snapshot = await db
      .collection("users")
      .where("codigoPersonal", "==", value)
      .limit(200)
      .get();

    snapshot.forEach((docSnap) => {
      if (docSnap.id === profile.uid) return;
      students.add(docSnap.id);
    });
  }

  const currentStudents = students.size;
  if (premium) {
    return {
      allowed: true,
      premium: true,
      limit: null,
      currentStudents,
      remainingSlots: null,
      personalId: profile.uid,
      personalName: profile.displayName || "Personal",
    };
  }

  const remainingSlots = Math.max(0, FREE_PERSONAL_STUDENTS_LIMIT - currentStudents);
  const allowed = currentStudents < FREE_PERSONAL_STUDENTS_LIMIT;
  return {
    allowed,
    premium: false,
    limit: FREE_PERSONAL_STUDENTS_LIMIT,
    currentStudents,
    remainingSlots,
    personalId: profile.uid,
    personalName: profile.displayName || "Personal",
    reason: allowed ? undefined : "free_plan_limit_reached",
  };
}

function readCode(req) {
  if (req.method === "GET") {
    return req.query?.code;
  }
  return req.body?.code;
}

exports.normalizeCode = normalizeCode;
exports.findPersonalByCode = findPersonalByCode;
exports.getPersonalStudentCapacity = getPersonalStudentCapacity;

exports.resolveInvitePersonal = functions
  .region(REGION)
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      res.set("Cache-Control", "no-store");

      if (req.method !== "GET" && req.method !== "POST") {
        return res
          .status(405)
          .json({ error: "Metodo nao permitido. Use GET ou POST." });
      }

      try {
        const code = readCode(req);
        const normalized = normalizeCode(code);
        if (!normalized) {
          return res.status(400).json({ error: "Parametro obrigatorio: code" });
        }

        const profile = await findPersonalByCode(code);
        if (!profile) {
          return res.status(404).json({ error: "Personal nao encontrado." });
        }

        const capacity = await getPersonalStudentCapacity({ profile, code });

        return res.status(200).json({ profile, capacity });
      } catch (error) {
        console.error("resolveInvitePersonal error:", error);
        return res.status(500).json({
          error: "Falha ao resolver o convite",
          details: error?.message || String(error),
        });
      }
    });
  });
