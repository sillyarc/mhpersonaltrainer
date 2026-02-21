const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const kFcmTokensCollection = "fcm_tokens";
const kPushNotificationsCollection = "ff_push_notifications";
const kUserPushNotificationsCollection = "ff_user_push_notifications";
const firestore = admin.firestore();
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const nodemailer = require("nodemailer");

const EMAIL_DOMAIN = "mhpersonaltrainer.com.br";

function resolveEmailConfig(accountId) {
  const config = typeof functions.config === "function" ? functions.config().email || {} : {};
  const isSecondary = accountId === "secondary";
  const user = isSecondary
    ? process.env.EMAIL_SECONDARY_USER || config.secondary_user || ""
    : process.env.EMAIL_USER || config.user || "";
  const pass = isSecondary
    ? process.env.EMAIL_SECONDARY_PASS || config.secondary_pass || ""
    : process.env.EMAIL_PASS || config.pass || "";
  const imapHost = isSecondary
    ? process.env.EMAIL_SECONDARY_IMAP_HOST || config.secondary_imap_host || "imap.umbler.com"
    : process.env.EMAIL_IMAP_HOST || config.imap_host || "imap.umbler.com";
  const imapPort = Number(
    isSecondary
      ? process.env.EMAIL_SECONDARY_IMAP_PORT || config.secondary_imap_port || 993
      : process.env.EMAIL_IMAP_PORT || config.imap_port || 993
  );
  const imapSecure = String(
    isSecondary
      ? process.env.EMAIL_SECONDARY_IMAP_SECURE || config.secondary_imap_secure || "true"
      : process.env.EMAIL_IMAP_SECURE || config.imap_secure || "true"
  ).toLowerCase() === "true";
  const smtpHost = isSecondary
    ? process.env.EMAIL_SECONDARY_SMTP_HOST || config.secondary_smtp_host || "smtp.umbler.com"
    : process.env.EMAIL_SMTP_HOST || config.smtp_host || "smtp.umbler.com";
  const smtpPort = Number(
    isSecondary
      ? process.env.EMAIL_SECONDARY_SMTP_PORT || config.secondary_smtp_port || 587
      : process.env.EMAIL_SMTP_PORT || config.smtp_port || 587
  );
  const smtpSecure = String(
    isSecondary
      ? process.env.EMAIL_SECONDARY_SMTP_SECURE || config.secondary_smtp_secure || "false"
      : process.env.EMAIL_SMTP_SECURE || config.smtp_secure || "false"
  ).toLowerCase() === "true";

  if (!user || !pass) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Email credentials are not configured."
    );
  }

  return { user, pass, imapHost, imapPort, imapSecure, smtpHost, smtpPort, smtpSecure };
}

async function ensureAdmin(context) {
  if (!context?.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
  }
  const userSnap = await firestore.doc(`users/${context.auth.uid}`).get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError("permission-denied", "Admin access required.");
  }
  const data = userSnap.data() || {};
  const email = String(data.email || "").trim().toLowerCase();
  const isAdmin = data.admin === true || email.endsWith(`@${EMAIL_DOMAIN}`);
  if (!isAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Admin access required.");
  }
  return data;
}

async function ensureAcademy(context) {
  if (!context?.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
  }
  const userSnap = await firestore.doc(`users/${context.auth.uid}`).get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError("permission-denied", "Academy access required.");
  }
  const data = userSnap.data() || {};
  const email = String(data.email || "").trim().toLowerCase();
  const isAdmin = data.admin === true || email.endsWith(`@${EMAIL_DOMAIN}`);
  const isAcademy = data.academyAccount === true || data.academyAccount === "true";
  if (!isAcademy && !isAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Academy access required.");
  }
  return data;
}

const mapAddressList = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => ({ name: item.name || "", address: item.address || "" }))
    .filter((item) => item.address);
};

const mapSingleAddress = (list) => mapAddressList(list)[0] || { name: "", address: "" };

async function withImapClient(accountId, handler) {
  const config = resolveEmailConfig(accountId);
  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapSecure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    logger: false,
  });

  await client.connect();
  try {
    return await handler(client, config);
  } finally {
    try {
      await client.logout();
    } catch (error) {
      console.log("Failed to close IMAP connection", error);
    }
  }
}

const kPushNotificationRuntimeOpts = {
  timeoutSeconds: 540,
  memory: "2GB",
};

exports.addFcmToken = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      return "Failed: Unauthenticated calls are not allowed.";
    }
    const userDocPath = data.userDocPath;
    const fcmToken = data.fcmToken;
    const deviceType = data.deviceType;
    if (
      typeof userDocPath === "undefined" ||
      typeof fcmToken === "undefined" ||
      typeof deviceType === "undefined" ||
      userDocPath.split("/").length <= 1 ||
      fcmToken.length === 0 ||
      deviceType.length === 0
    ) {
      return "Invalid arguments encoutered when adding FCM token.";
    }
    if (context.auth.uid != userDocPath.split("/")[1]) {
      return "Failed: Authenticated user doesn't match user provided.";
    }
    const existingTokens = await firestore
      .collectionGroup(kFcmTokensCollection)
      .where("fcm_token", "==", fcmToken)
      .get();
    var userAlreadyHasToken = false;
    for (var doc of existingTokens.docs) {
      const user = doc.ref.parent.parent;
      if (user.path != userDocPath) {
        // Should never have the same FCM token associated with multiple users.
        await doc.ref.delete();
      } else {
        userAlreadyHasToken = true;
      }
    }
    if (userAlreadyHasToken) {
      return "FCM token already exists for this user. Ignoring...";
    }
    await getUserFcmTokensCollection(userDocPath).doc().set({
      fcm_token: fcmToken,
      device_type: deviceType,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return "Successfully added FCM token!";
  });

exports.sendPushNotificationsTrigger = functions
  .region("southamerica-east1")
  .runWith(kPushNotificationRuntimeOpts)
  .firestore.document(`${kPushNotificationsCollection}/{id}`)
  .onCreate(async (snapshot, _) => {
    try {
      // Ignore scheduled push notifications on create
      const scheduledTime = snapshot.data().scheduled_time || "";
      if (scheduledTime) {
        return;
      }

      await sendPushNotifications(snapshot);
    } catch (e) {
      console.log(`Error: ${e}`);
      await snapshot.ref.update({ status: "failed", error: `${e}` });
    }
  });

exports.sendUserPushNotificationsTrigger = functions
  .region("southamerica-east1")
  .runWith(kPushNotificationRuntimeOpts)
  .firestore.document(`${kUserPushNotificationsCollection}/{id}`)
  .onCreate(async (snapshot, _) => {
    try {
      // Ignore scheduled push notifications on create
      const scheduledTime = snapshot.data().scheduled_time || "";
      if (scheduledTime) {
        return;
      }

      // Don't let user-triggered notifications to be sent to all users.
      const userRefsStr = snapshot.data().user_refs || "";
      if (userRefsStr) {
        await sendPushNotifications(snapshot);
      }
    } catch (e) {
      console.log(`Error: ${e}`);
      await snapshot.ref.update({ status: "failed", error: `${e}` });
    }
  });

async function sendPushNotifications(snapshot) {
  const notificationData = snapshot.data();
  const title = notificationData.notification_title || "";
  const body = notificationData.notification_text || "";
  const imageUrl = notificationData.notification_image_url || "";
  const sound = notificationData.notification_sound || "";
  const parameterData = notificationData.parameter_data || "";
  const targetAudience = notificationData.target_audience || "";
  const initialPageName = notificationData.initial_page_name || "";
  const userRefsStr = notificationData.user_refs || "";
  const batchIndex = notificationData.batch_index || 0;
  const numBatches = notificationData.num_batches || 0;
  const status = notificationData.status || "";

  if (status !== "" && status !== "started") {
    console.log(`Already processed ${snapshot.ref.path}. Skipping...`);
    return;
  }

  if (title === "" || body === "") {
    await snapshot.ref.update({ status: "failed" });
    return;
  }

  const userRefs = userRefsStr === "" ? [] : userRefsStr.trim().split(",");
  var tokens = new Set();
  if (userRefsStr) {
    for (var userRef of userRefs) {
      const userTokens = await firestore
        .doc(userRef)
        .collection(kFcmTokensCollection)
        .get();
      userTokens.docs.forEach((token) => {
        if (typeof token.data().fcm_token !== undefined) {
          tokens.add(token.data().fcm_token);
        }
      });
    }
  } else {
    var userTokensQuery = firestore.collectionGroup(kFcmTokensCollection);
    // Handle batched push notifications by splitting tokens up by document
    // id.
    if (numBatches > 0) {
      userTokensQuery = userTokensQuery
        .orderBy(admin.firestore.FieldPath.documentId())
        .startAt(getDocIdBound(batchIndex, numBatches))
        .endBefore(getDocIdBound(batchIndex + 1, numBatches));
    }
    const userTokens = await userTokensQuery.get();
    userTokens.docs.forEach((token) => {
      const data = token.data();
      const audienceMatches =
        targetAudience === "All" || data.device_type === targetAudience;
      if (audienceMatches && typeof data.fcm_token !== undefined) {
        tokens.add(data.fcm_token);
      }
    });
  }

  const tokensArr = Array.from(tokens);
  var messageBatches = [];
  for (let i = 0; i < tokensArr.length; i += 500) {
    const tokensBatch = tokensArr.slice(i, Math.min(i + 500, tokensArr.length));
    const messages = {
      notification: {
        title,
        body,
        ...(imageUrl && { imageUrl: imageUrl }),
      },
      data: {
        initialPageName,
        parameterData,
      },
      android: {
        notification: {
          ...(sound && { sound: sound }),
        },
      },
      apns: {
        payload: {
          aps: {
            ...(sound && { sound: sound }),
          },
        },
      },
      tokens: tokensBatch,
    };
    messageBatches.push(messages);
  }

  var numSent = 0;
  await Promise.all(
    messageBatches.map(async (messages) => {
      const response = await admin.messaging().sendEachForMulticast(messages);
      numSent += response.successCount;
    }),
  );

  await snapshot.ref.update({ status: "succeeded", num_sent: numSent });
}

function getUserFcmTokensCollection(userDocPath) {
  return firestore.doc(userDocPath).collection(kFcmTokensCollection);
}

function getDocIdBound(index, numBatches) {
  if (index <= 0) {
    return "users/(";
  }
  if (index >= numBatches) {
    return "users/}";
  }
  const numUidChars = 62;
  const twoCharOptions = Math.pow(numUidChars, 2);

  var twoCharIdx = (index * twoCharOptions) / numBatches;
  var firstCharIdx = Math.floor(twoCharIdx / numUidChars);
  var secondCharIdx = Math.floor(twoCharIdx % numUidChars);
  const firstChar = getCharForIndex(firstCharIdx);
  const secondChar = getCharForIndex(secondCharIdx);
  return "users/" + firstChar + secondChar;
}

function getCharForIndex(charIdx) {
  if (charIdx < 10) {
    return String.fromCharCode(charIdx + "0".charCodeAt(0));
  } else if (charIdx < 36) {
    return String.fromCharCode("A".charCodeAt(0) + charIdx - 10);
  } else {
    return String.fromCharCode("a".charCodeAt(0) + charIdx - 36);
  }
}

exports.adminEmailInbox = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    await ensureAdmin(context);
    const limitRaw = Number(data?.limit || 40);
    const limit = Math.min(Math.max(limitRaw, 1), 60);

    const accountId = data?.account === "secondary" ? "secondary" : "primary";
    return await withImapClient(accountId, async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uids = await client.search({ all: true });
        const slice = uids.slice(-limit);
        if (!slice.length) {
          return { items: [] };
        }
        const items = [];
        for await (const message of client.fetch(slice, {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
        })) {
          const uid = message.uid || message.seq || 0;
          const from = mapSingleAddress(message.envelope?.from);
          const subject = message.envelope?.subject || "";
          const seen = Array.isArray(message.flags) ? message.flags.includes("\\Seen") : false;
          const date =
            message.internalDate && typeof message.internalDate.toISOString === "function"
              ? message.internalDate.toISOString()
              : "";
          items.push({
            uid,
            subject,
            from,
            date,
            seen,
            snippet: "",
          });
        }
        items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        return { items };
      } finally {
        lock.release();
      }
    });
  });

exports.adminEmailMessage = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    await ensureAdmin(context);
    const uid = Number(data?.uid || 0);
    if (!uid) {
      throw new functions.https.HttpsError("invalid-argument", "UID is required.");
    }

    const accountId = data?.account === "secondary" ? "secondary" : "primary";
    return await withImapClient(accountId, async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        let target = null;
        for await (const message of client.fetch([uid], {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
          source: true,
        })) {
          target = message;
          break;
        }

        if (!target) {
          throw new functions.https.HttpsError("not-found", "Email not found.");
        }

        const parsed = await simpleParser(target.source);
        const from = mapSingleAddress(parsed.from?.value || target.envelope?.from);
        const to = mapAddressList(parsed.to?.value || target.envelope?.to);
        const cc = mapAddressList(parsed.cc?.value || target.envelope?.cc);
        const dateValue = parsed.date || target.internalDate;
        const date =
          dateValue && typeof dateValue.toISOString === "function" ? dateValue.toISOString() : "";
        const referencesRaw = parsed.references || [];
        const references = Array.isArray(referencesRaw) ? referencesRaw : [referencesRaw];
        const html = parsed.html ? String(parsed.html) : "";

        return {
          message: {
            uid: target.uid || uid,
            subject: parsed.subject || target.envelope?.subject || "",
            from,
            to,
            cc,
            date,
            seen: Array.isArray(target.flags) ? target.flags.includes("\\Seen") : false,
            text: parsed.text || "",
            html,
            messageId: parsed.messageId || "",
            references: references.filter(Boolean),
          },
        };
      } finally {
        lock.release();
      }
    });
  });

exports.adminEmailSend = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    await ensureAdmin(context);
    const to = data?.to;
    if (!to) {
      throw new functions.https.HttpsError("invalid-argument", "Recipient is required.");
    }

    const accountId = data?.account === "secondary" ? "secondary" : "primary";
    const config = resolveEmailConfig(accountId);
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });

    const payload = {
      from: config.user,
      to,
      subject: data?.subject || "",
      text: data?.text || "",
      ...(data?.html ? { html: data.html } : {}),
      ...(data?.inReplyTo ? { inReplyTo: data.inReplyTo } : {}),
      ...(Array.isArray(data?.references) && data.references.length
        ? { references: data.references }
        : {}),
    };

    const info = await transporter.sendMail(payload);
    return { success: true, messageId: info.messageId || "" };
  });

exports.academySendStudentInvite = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    const academy = await ensureAcademy(context);
    const to = data?.to;
    const text = data?.text;
    if (!to || !text) {
      throw new functions.https.HttpsError("invalid-argument", "Recipient and text are required.");
    }

    const config = resolveEmailConfig("primary");
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });

    const payload = {
      from: config.user,
      to,
      subject: data?.subject || "Seu acesso ao MH Personal Trainer",
      text,
      ...(data?.html ? { html: data.html } : {}),
      ...(academy?.email ? { replyTo: academy.email } : {}),
    };

    const info = await transporter.sendMail(payload);
    return { success: true, messageId: info.messageId || "" };
  });

const stripeModule = require("stripe");

// Credentials
const kStripeProdSecretKey = process.env.STRIPE_LIVE_SECRET_KEY || "";
const kStripeTestSecretKey = process.env.STRIPE_TEST_SECRET_KEY || "";

const secretKey = (isProd) =>
  isProd ? kStripeProdSecretKey : kStripeTestSecretKey;

/**
 *
 */
exports.initStripePayment = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      return "Unauthenticated calls are not allowed.";
    }
    return await initPayment(data, true);
  });

/**
 *
 */
exports.initStripeTestPayment = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      return "Unauthenticated calls are not allowed.";
    }
    return await initPayment(data, false);
  });

async function initPayment(data, isProd) {
  try {
    const stripe = new stripeModule.Stripe(secretKey(isProd), {
      apiVersion: "2020-08-27",
    });

    const customers = await stripe.customers.list({
      email: data.email,
      limit: 1,
    });
    var customer = customers.data[0];
    if (!customer) {
      customer = await stripe.customers.create({
        email: data.email,
        ...(data.name && { name: data.name }),
      });
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: "2020-08-27" },
    );
    const paymentIntent = await stripe.paymentIntents.create({
      amount: data.amount,
      currency: data.currency,
      customer: customer.id,
      ...(data.description && { description: data.description }),
    });

    return {
      paymentId: paymentIntent.id,
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customer.id,
      success: true,
    };
  } catch (error) {
    console.log(`Error: ${error}`);
    return { success: false, error: userFacingMessage(error) };
  }
}

/**
 * Sanitize the error message for the user.
 */
function userFacingMessage(error) {
  return error.type
    ? error.message
    : "An error occurred, developers have been alerted";
}
exports.onUserDeleted = functions
  .region("southamerica-east1")
  .auth.user()
  .onDelete(async (user) => {
    let firestore = admin.firestore();
    let userRef = firestore.doc("users/" + user.uid);
  });
