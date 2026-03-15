const functions = require("firebase-functions/v1");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const REGION = "southamerica-east1";

const toBool = (value) => value === true || value === "true" || value === 1;

function normalizeCode(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw || raw === "0") return null;
  const numeric = Number(raw);
  if (!Number.isNaN(numeric) && numeric > 0) {
    return String(Math.trunc(numeric));
  }
  return raw;
}

function buildCodeVariants(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return [];
  const variants = new Set([normalized]);
  const numeric = Number(normalized);
  if (!Number.isNaN(numeric)) {
    variants.add(numeric);
  }
  return Array.from(variants);
}

function isStudentData(data) {
  if (!data || typeof data !== "object") return false;
  if (toBool(data.admin)) return false;
  if (toBool(data.professorAccount)) return false;
  if (toBool(data.academyAccount)) return false;
  return true;
}

function getUserDisplayName(data, fallback = "Aluno") {
  const value = String(
    data?.display_name || data?.displayName || data?.name || fallback,
  ).trim();
  return value || fallback;
}

function truncateText(value, limit = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime())
      ? parsed.getTime()
      : 0;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

async function getUserData(uid) {
  if (!uid) return null;
  const db = getFirestore();
  const snap = await db.doc(`users/${uid}`).get();
  return snap.exists ? snap.data() || null : null;
}

async function findPersonalByCode(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;

  const db = getFirestore();
  const usersRef = db.collection("users");
  const variants = buildCodeVariants(normalized);

  for (const value of variants) {
    const snap = await usersRef.where("codigoPersonal", "==", value).limit(20).get();
    const match = snap.docs.find((docSnap) => {
      const data = docSnap.data() || {};
      return toBool(data.professorAccount) && !toBool(data.admin);
    });
    if (match) {
      const data = match.data() || {};
      return {
        id: match.id,
        name: getUserDisplayName(data, "Personal"),
        codigoPersonal: normalized,
      };
    }
  }

  for (const value of variants) {
    const professorSnap = await db
      .collection("professorAccount")
      .where("codigoPersonal", "==", value)
      .limit(1)
      .get();
    if (professorSnap.empty) continue;
    const profData = professorSnap.docs[0].data() || {};
    const uid = profData.uid || professorSnap.docs[0].id;
    if (!uid) continue;
    const userData = await getUserData(uid);
    if (!userData) continue;
    return {
      id: uid,
      name: getUserDisplayName(userData, "Personal"),
      codigoPersonal: normalized,
    };
  }

  return null;
}

async function notifyPersonal({
  personalId,
  title,
  description,
  tipo,
  publico,
  eventType,
  meta,
}) {
  if (!personalId || !title || !description) return;
  const db = getFirestore();
  await db.collection("notificacao").add({
    titulo: title,
    descricao: description,
    tipo: tipo || "Sistema",
    publico: publico || "sistema",
    para: personalId,
    paraTodos: false,
    data: FieldValue.serverTimestamp(),
    unread: true,
    readBy: [],
    autoEvent: true,
    eventType: eventType || "auto_event",
    meta: meta || {},
    soundHint: "soft_ping",
  });
}

async function notifyStudent({
  studentId,
  title,
  description,
  tipo,
  publico,
  eventType,
  meta,
  workoutId,
  evaluationId,
  evaluationType,
}) {
  if (!studentId || !title || !description) return;
  const db = getFirestore();
  const payload = {
    titulo: title,
    descricao: description,
    tipo: tipo || "Sistema",
    publico: publico || "sistema",
    para: studentId,
    paraTodos: false,
    data: FieldValue.serverTimestamp(),
    unread: true,
    readBy: [],
    autoEvent: true,
    eventType: eventType || "auto_event",
    meta: meta || {},
    soundHint: "soft_ping",
  };

  if (workoutId) {
    payload.treino = { id: workoutId };
  }

  if (evaluationId) {
    payload.avaliacao = {
      id: evaluationId,
      type: evaluationType || null,
      userId: studentId,
    };
  }

  await db.collection("notificacao").add(payload);
}

function getExplicitPersonalId(data) {
  const candidate =
    data?.personalId || data?.professorId || data?.personal || data?.uidPersonal;
  return candidate ? String(candidate).trim() : "";
}

function getExplicitPersonalCode(data) {
  const candidates = [
    data?.codigoDoPersonal,
    data?.codigoPersonal,
    data?.codigoProfessor,
    data?.codigoDoProfessor,
    data?.personalCode,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeCode(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function hasAnyMeaningfulField(data, fields) {
  return fields.some((field) => hasMeaningfulValue(data?.[field]));
}

function isLegacyWorkoutAssignment(data) {
  if (!data || typeof data !== "object") return false;
  if (getExplicitPersonalCode(data)) return true;
  if (hasMeaningfulValue(data.createdAt) || hasMeaningfulValue(data.updatedAt)) {
    return false;
  }
  return hasAnyMeaningfulField(data, [
    "nomeDoTreino",
    "treino",
    "treinoNoList",
    "uidTreinos",
    "yourName",
    "imgUser",
    "codigoDoPersonal",
  ]);
}

function isLegacyPersonalizedEvaluationAssignment(data) {
  if (!data || typeof data !== "object") return false;
  if (hasMeaningfulValue(data.status)) return false;
  if (hasMeaningfulValue(data.createdAt) || hasMeaningfulValue(data.updatedAt)) {
    return false;
  }
  if (
    hasMeaningfulValue(data.prazoResposta) ||
    hasMeaningfulValue(data.perguntas) ||
    hasMeaningfulValue(data.respostas)
  ) {
    return false;
  }
  return hasAnyMeaningfulField(data, [
    "nomeDaAvaliacao",
    "categoriaDaAvaliacao",
    "observacao",
    "dataDaAvaliacao",
  ]);
}

function isLegacyPosturalEvaluationAssignment(data) {
  if (!data || typeof data !== "object") return false;
  if (hasMeaningfulValue(data.status)) return false;
  if (hasMeaningfulValue(data.createdAt) || hasMeaningfulValue(data.updatedAt)) {
    return false;
  }
  return hasAnyMeaningfulField(data, [
    "dateForAvaliacaoPostural",
    "fotoFrontal",
    "fotoLateral",
    "fotoPosterior",
    "obsFotoFrontal",
    "obsFotoLateral",
    "obsFotoPosterior",
  ]);
}

function isLegacyPhysicalEvaluationAssignment(data) {
  if (!data || typeof data !== "object") return false;
  if (hasMeaningfulValue(data.status)) return false;
  if (hasMeaningfulValue(data.createdAt) || hasMeaningfulValue(data.updatedAt)) {
    return false;
  }
  return hasAnyMeaningfulField(data, [
    "protocoloDeAvaliacao",
    "dataDaAvaliacao",
    "proxAvaliacao",
    "feita",
    "idade",
    "peso",
    "estatura",
    "observacoes",
  ]);
}

async function resolveExplicitPersonal(uid, data) {
  const studentData = await getUserData(uid);
  if (!studentData || !isStudentData(studentData)) {
    return { studentData, personal: null };
  }

  const personalId = getExplicitPersonalId(data);
  if (!personalId || personalId === uid) {
    return { studentData, personal: null };
  }

  const personalData = await getUserData(personalId);
  if (!personalData || !toBool(personalData.professorAccount) || toBool(personalData.admin)) {
    return { studentData, personal: null };
  }

  return {
    studentData,
    personal: {
      id: personalId,
      name: getUserDisplayName(personalData, "Personal"),
      codigoPersonal: normalizeCode(personalData.codigoPersonal),
    },
  };
}

async function resolveAssignedPersonal(uid, data, options = {}) {
  const explicit = await resolveExplicitPersonal(uid, data);
  if (explicit.personal) {
    return explicit;
  }

  if (!options.allowLegacyFallback) {
    return explicit;
  }

  if (typeof options.shouldFallback === "function" && !options.shouldFallback(data || {})) {
    return explicit;
  }

  return resolveStudentPersonal(uid, getExplicitPersonalCode(data));
}

async function resolveStudentPersonal(uid, fallbackCode) {
  const userData = await getUserData(uid);
  if (!isStudentData(userData)) {
    return { studentData: userData, personal: null };
  }
  const code = normalizeCode(fallbackCode || userData?.codigoPersonal);
  if (!code) {
    return { studentData: userData, personal: null };
  }
  const personal = await findPersonalByCode(code);
  return { studentData: userData, personal };
}

exports.notifyPersonalOnStudentLinkChange = functions
  .region(REGION)
  .firestore.document("users/{uid}")
  .onWrite(async (change, context) => {
    const beforeData = change.before.exists ? change.before.data() || {} : {};
    const afterData = change.after.exists ? change.after.data() || {} : {};
    const studentId = context.params.uid;

    const wasStudent = isStudentData(beforeData);
    const isStudent = isStudentData(afterData);
    if (!wasStudent && !isStudent) return null;

    const beforeCode = normalizeCode(beforeData.codigoPersonal);
    const afterCode = normalizeCode(afterData.codigoPersonal);
    if (beforeCode === afterCode) return null;

    const studentName = getUserDisplayName(afterData, getUserDisplayName(beforeData));
    const tasks = [];

    if (afterCode) {
      const nextPersonal = await findPersonalByCode(afterCode);
      if (nextPersonal && nextPersonal.id !== studentId) {
        tasks.push(
          notifyPersonal({
            personalId: nextPersonal.id,
            title: "Novo aluno no seu codigo",
            description: `${studentName} entrou com seu codigo e agora esta no seu painel.`,
            tipo: "Alunos",
            publico: "alunos",
            eventType: "student_joined_code",
            meta: {
              studentId,
              studentName,
              codigoPersonal: afterCode,
            },
          }),
        );
      }
    }

    if (beforeCode && beforeCode !== afterCode) {
      const previousPersonal = await findPersonalByCode(beforeCode);
      if (previousPersonal && previousPersonal.id !== studentId) {
        tasks.push(
          notifyPersonal({
            personalId: previousPersonal.id,
            title: "Perda de aluno",
            description: `${studentName} nao esta mais vinculado ao seu codigo.`,
            tipo: "Alunos",
            publico: "alunos",
            eventType: "student_lost_link",
            meta: {
              studentId,
              studentName,
              codigoPersonal: beforeCode,
            },
          }),
        );
      }
    }

    if (tasks.length) {
      await Promise.all(tasks);
    }
    return null;
  });

exports.notifyPersonalOnWorkoutCompletion = functions
  .region(REGION)
  .firestore.document("users/{uid}/createTreinos/{workoutId}")
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data() || {};
    const afterData = change.after.data() || {};
    const beforeMs = toMillis(beforeData.lastCompletedAt);
    const afterMs = toMillis(afterData.lastCompletedAt);

    if (!afterMs || beforeMs === afterMs) return null;

    const uid = context.params.uid;
    const workoutId = context.params.workoutId;
    const { studentData, personal } = await resolveStudentPersonal(uid);
    if (!studentData || !personal || personal.id === uid) return null;

    const studentName = getUserDisplayName(studentData);
    const workoutName = truncateText(
      afterData.nomeDoTreino || beforeData.nomeDoTreino || "Treino",
      70,
    );

    await notifyPersonal({
      personalId: personal.id,
      title: "Treino concluido",
      description: `${studentName} concluiu o treino "${workoutName}".`,
      tipo: "Treinos",
      publico: "treinos",
      eventType: "student_workout_completed",
      meta: {
        studentId: uid,
        studentName,
        workoutId,
        workoutName,
      },
    });

    return null;
  });

exports.notifyPersonalOnFeedbackCreated = functions
  .region(REGION)
  .firestore.document("users/{uid}/feedback/{feedbackId}")
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data() || {};
    const uid = context.params.uid;
    const feedbackId = context.params.feedbackId;
    const { studentData, personal } = await resolveStudentPersonal(
      uid,
      data.codigoDoPersonal,
    );
    if (!studentData || !personal || personal.id === uid) return null;

    const studentName = truncateText(
      data.yourName || getUserDisplayName(studentData),
      50,
    );
    const workoutName = truncateText(data.nomeDoTreino, 60);
    const feedbackSummary = truncateText(data.comentarioDoAluno, 90);
    const workoutSuffix = workoutName ? ` no treino "${workoutName}"` : "";

    await notifyPersonal({
      personalId: personal.id,
      title: "Novo feedback de aluno",
      description: feedbackSummary
        ? `${studentName} enviou feedback${workoutSuffix}: "${feedbackSummary}"`
        : `${studentName} enviou novo feedback${workoutSuffix}.`,
      tipo: "Feedback",
      publico: "feedback",
      eventType: "student_feedback_created",
      meta: {
        studentId: uid,
        studentName,
        feedbackId,
        workoutName,
      },
    });

    return null;
  });

function createEvaluationTrigger(path, label, eventType) {
  return functions
    .region(REGION)
    .firestore.document(path)
    .onCreate(async (snapshot, context) => {
      const uid = context.params.uid;
      const evaluationId = context.params.evaluationId;
      const { studentData, personal } = await resolveStudentPersonal(uid);
      if (!studentData || !personal || personal.id === uid) return null;

      const studentName = getUserDisplayName(studentData);
      const data = snapshot.data() || {};
      const status = String(data.status || "").toLowerCase();
      const createdLabel =
        status === "concluida" || status === "concluída" ? "concluiu" : "registrou";

      await notifyPersonal({
        personalId: personal.id,
        title: "Nova avaliacao do aluno",
        description: `${studentName} ${createdLabel} uma avaliacao ${label}.`,
        tipo: "Avaliacoes",
        publico: "avaliacoes",
        eventType,
        meta: {
          studentId: uid,
          studentName,
          evaluationId,
          evaluationType: label,
        },
      });

      return null;
    });
}

exports.notifyPersonalOnOnlineEvaluationCreated = createEvaluationTrigger(
  "users/{uid}/avaliacaoOnline/{evaluationId}",
  "online",
  "student_evaluation_online",
);

exports.notifyPersonalOnPersonalizedEvaluationCreated = createEvaluationTrigger(
  "users/{uid}/avaliacaoPersonalizada/{evaluationId}",
  "personalizada",
  "student_evaluation_personalizada",
);

exports.notifyPersonalOnPosturalEvaluationCreated = createEvaluationTrigger(
  "users/{uid}/avaliacaoPostural/{evaluationId}",
  "postural",
  "student_evaluation_postural",
);

exports.notifyPersonalOnPhysicalEvaluationCreated = createEvaluationTrigger(
  "users/{uid}/avaliacoesFisicas/{evaluationId}",
  "fisica",
  "student_evaluation_fisica",
);

function createStudentWorkoutAssignedTrigger(path, config = {}) {
  return functions
    .region(REGION)
    .firestore.document(path)
    .onCreate(async (snapshot, context) => {
      const data = snapshot.data() || {};
      const uid = context.params.uid;
      const workoutId = context.params.workoutId;
      const { personal } = await resolveAssignedPersonal(uid, data, {
        allowLegacyFallback: config.allowLegacyFallback === true,
        shouldFallback: config.shouldFallback,
      });
      if (!personal) return null;

      const workoutLabel = truncateText(
        data.nomeDoTreino || data.treino || config.fallbackName || "Treino",
        70,
      );

      await notifyStudent({
        studentId: uid,
        title: config.title || "Novo treino do personal",
        description:
          config.descriptionBuilder?.(personal.name, workoutLabel) ||
          `${personal.name} enviou o treino "${workoutLabel}" para voce.`,
        tipo: "Treino",
        publico: "treinos",
        eventType: config.eventType || "personal_workout_assigned",
        workoutId,
        meta: {
          studentId: uid,
          personalId: personal.id,
          personalName: personal.name,
          workoutId,
          workoutName: workoutLabel,
          workoutKind: config.workoutKind || "musculacao",
        },
      });

      return null;
    });
}

function createStudentEvaluationAssignedTrigger(path, label, typeId, eventType) {
  return functions
    .region(REGION)
    .firestore.document(path)
    .onCreate(async (snapshot, context) => {
      const data = snapshot.data() || {};
      const uid = context.params.uid;
      const evaluationId = context.params.evaluationId;
      const legacyFallbackMatcher =
        typeId === "personalizada"
          ? isLegacyPersonalizedEvaluationAssignment
          : typeId === "postural"
            ? isLegacyPosturalEvaluationAssignment
            : typeId === "fisica"
              ? isLegacyPhysicalEvaluationAssignment
              : null;
      const { personal } = await resolveAssignedPersonal(uid, data, {
        allowLegacyFallback: typeof legacyFallbackMatcher === "function",
        shouldFallback: legacyFallbackMatcher,
      });
      if (!personal) return null;

      const actionSuffix =
        typeId === "personalizada" || String(data.status || "").toLowerCase() === "pendente"
          ? " para voce responder."
          : " para voce.";

      await notifyStudent({
        studentId: uid,
        title: "Nova avaliacao do personal",
        description: `${personal.name} enviou uma avaliacao ${label}${actionSuffix}`,
        tipo: "Avaliacao",
        publico: "avaliacoes",
        eventType,
        evaluationId,
        evaluationType: typeId,
        meta: {
          studentId: uid,
          personalId: personal.id,
          personalName: personal.name,
          evaluationId,
          evaluationType: typeId,
          evaluationLabel: label,
        },
      });

      return null;
    });
}

exports.notifyStudentOnWorkoutAssigned = createStudentWorkoutAssignedTrigger(
  "users/{uid}/createTreinos/{workoutId}",
  {
    eventType: "personal_workout_assigned",
    workoutKind: "musculacao",
    allowLegacyFallback: true,
    shouldFallback: isLegacyWorkoutAssignment,
  },
);

exports.notifyStudentOnAerobicWorkoutAssigned = createStudentWorkoutAssignedTrigger(
  "users/{uid}/treinoaerobico/{workoutId}",
  {
    title: "Novo treino aerobico do personal",
    eventType: "personal_aerobic_workout_assigned",
    workoutKind: "aerobico",
    fallbackName: "Treino aerobico",
    descriptionBuilder: (personalName, workoutLabel) =>
      `${personalName} enviou o treino aerobico "${workoutLabel}" para voce.`,
  },
);

exports.notifyStudentOnOnlineEvaluationAssigned = createStudentEvaluationAssignedTrigger(
  "users/{uid}/avaliacaoOnline/{evaluationId}",
  "online",
  "online",
  "personal_evaluation_online_assigned",
);

exports.notifyStudentOnPersonalizedEvaluationAssigned = createStudentEvaluationAssignedTrigger(
  "users/{uid}/avaliacaoPersonalizada/{evaluationId}",
  "personalizada",
  "personalizada",
  "personal_evaluation_personalizada_assigned",
);

exports.notifyStudentOnPosturalEvaluationAssigned = createStudentEvaluationAssignedTrigger(
  "users/{uid}/avaliacaoPostural/{evaluationId}",
  "postural",
  "postural",
  "personal_evaluation_postural_assigned",
);

exports.notifyStudentOnPhysicalEvaluationAssigned = createStudentEvaluationAssignedTrigger(
  "users/{uid}/avaliacoesFisicas/{evaluationId}",
  "fisica",
  "fisica",
  "personal_evaluation_fisica_assigned",
);

exports.notifyPersonalOnStudentMessage = functions
  .region(REGION)
  .firestore.document("conversations/{conversationId}/messages/{messageId}")
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data() || {};
    const senderId = String(data.senderId || "").trim();
    if (!senderId) return null;

    const senderData = await getUserData(senderId);
    if (!isStudentData(senderData)) return null;

    const conversationRef = snapshot.ref.parent.parent;
    if (!conversationRef) return null;
    const conversationSnap = await conversationRef.get();
    if (!conversationSnap.exists) return null;

    const conversationData = conversationSnap.data() || {};
    const participants = Array.isArray(conversationData.participants)
      ? conversationData.participants
      : [];
    const targetIds = participants.filter(
      (participantId) =>
        participantId && participantId !== senderId && participantId !== "support",
    );
    if (!targetIds.length) return null;

    const senderName = getUserDisplayName(senderData);
    const content = truncateText(data.content || "Nova mensagem do aluno.", 120);
    const tasks = [];

    for (const targetId of targetIds) {
      const targetData = await getUserData(targetId);
      if (!targetData || !toBool(targetData.professorAccount)) continue;
      tasks.push(
        notifyPersonal({
          personalId: targetId,
          title: `Mensagem de ${senderName}`,
          description: content,
          tipo: "Chat",
          publico: "chat",
          eventType: "student_chat_message",
          meta: {
            senderId,
            senderName,
            conversationId: context.params.conversationId,
            messageId: context.params.messageId,
          },
        }),
      );
    }

    if (tasks.length) {
      await Promise.all(tasks);
    }
    return null;
  });
