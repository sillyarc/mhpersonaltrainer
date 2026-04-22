const functions = require("firebase-functions/v1");
const {
  FieldValue,
  Timestamp,
  getFirestore,
} = require("firebase-admin/firestore");

exports.mirrorPresenceStatus = functions
  .region("southamerica-east1")
  .database.ref("/status/{uid}")
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    const after = change.after.val();
    const statusRef = getFirestore().collection("status").doc(uid);

    if (!after) {
      await statusRef.delete().catch(() => null);
      return null;
    }

    const lastChanged =
      typeof after.last_changed === "number"
        ? Timestamp.fromMillis(after.last_changed)
        : FieldValue.serverTimestamp();

    await statusRef.set(
      {
        uid,
        state: after.state || "offline",
        role: after.role || null,
        platform: after.platform || null,
        displayName: after.displayName || null,
        app: after.app || "mh-personal-trainer",
        lastChanged,
        mirroredAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return null;
  });
