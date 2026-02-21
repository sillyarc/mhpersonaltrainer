const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const nodemailer = require("nodemailer");
const { getConfigValue } = require("./runtime_config");

const firestore = admin.firestore();
const EMAIL_DOMAIN = "mhpersonaltrainer.com.br";

function resolveEmailConfig(accountId) {
  const isSecondary = accountId === "secondary";
  const user = isSecondary
    ? process.env.EMAIL_SECONDARY_USER ||
      getConfigValue(["email", "secondary_user"], "")
    : process.env.EMAIL_USER || getConfigValue(["email", "user"], "");
  const pass = isSecondary
    ? process.env.EMAIL_SECONDARY_PASS ||
      getConfigValue(["email", "secondary_pass"], "")
    : process.env.EMAIL_PASS || getConfigValue(["email", "pass"], "");
  const imapHost = isSecondary
    ? process.env.EMAIL_SECONDARY_IMAP_HOST ||
      getConfigValue(["email", "secondary_imap_host"], "imap.umbler.com")
    : process.env.EMAIL_IMAP_HOST ||
      getConfigValue(["email", "imap_host"], "imap.umbler.com");
  const imapPort = Number(
    isSecondary
      ? process.env.EMAIL_SECONDARY_IMAP_PORT ||
          getConfigValue(["email", "secondary_imap_port"], 993) ||
          993
      : process.env.EMAIL_IMAP_PORT ||
          getConfigValue(["email", "imap_port"], 993) ||
          993
  );
  const imapSecure = String(
    isSecondary
      ? process.env.EMAIL_SECONDARY_IMAP_SECURE ||
          getConfigValue(["email", "secondary_imap_secure"], "true") ||
          "true"
      : process.env.EMAIL_IMAP_SECURE ||
          getConfigValue(["email", "imap_secure"], "true") ||
          "true"
  ).toLowerCase() === "true";
  const smtpHost = isSecondary
    ? process.env.EMAIL_SECONDARY_SMTP_HOST ||
      getConfigValue(["email", "secondary_smtp_host"], "smtp.umbler.com")
    : process.env.EMAIL_SMTP_HOST ||
      getConfigValue(["email", "smtp_host"], "smtp.umbler.com");
  const smtpPort = Number(
    isSecondary
      ? process.env.EMAIL_SECONDARY_SMTP_PORT ||
          getConfigValue(["email", "secondary_smtp_port"], 587) ||
          587
      : process.env.EMAIL_SMTP_PORT ||
          getConfigValue(["email", "smtp_port"], 587) ||
          587
  );
  const smtpSecure = String(
    isSecondary
      ? process.env.EMAIL_SECONDARY_SMTP_SECURE ||
          getConfigValue(["email", "secondary_smtp_secure"], "false") ||
          "false"
      : process.env.EMAIL_SMTP_SECURE ||
          getConfigValue(["email", "smtp_secure"], "false") ||
          "false"
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

const adminEmailInbox = functions
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

const adminEmailMessage = functions
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

const adminEmailSend = functions
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

module.exports = {
  adminEmailInbox,
  adminEmailMessage,
  adminEmailSend,
};
