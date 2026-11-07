"use strict";

const logger = require("firebase-functions/logger");
const { requireObject, requireString, requireUid } = require("./validation");
const { refs } = require("./refs");

/**
 * Releasing a push registration another account left behind.
 *
 * Logout deletes the phone's own token documents directly, but it cannot when the phone
 * is offline or the app is killed first. The next person to sign in on that phone must
 * still be able to stop the previous account's notifications arriving, and Firestore
 * rules rightly let nobody delete another account's documents. So the server does it,
 * taking the token itself as proof: only the phone that was issued the token knows it,
 * and a document holding any other token is left alone.
 */
async function releasePushToken(db, callerUid, payload) {
  const body = requireObject(payload || {}, "request");
  const uid = requireUid(body.uid, "uid");
  // A device id is client derived, so it is checked as a document id rather than trusted.
  const deviceId = requireUid(body.deviceId, "deviceId");
  const token = requireString(body.token, "token", 256);

  const r = refs(db);
  const [device, legacy] = await db.getAll(r.pushDevice(uid, deviceId), r.pushToken(uid));
  const batch = db.batch();
  let released = 0;
  if (device.exists && device.get("token") === token) { batch.delete(device.ref); released += 1; }
  if (legacy.exists && legacy.get("token") === token) { batch.delete(legacy.ref); released += 1; }
  if (released > 0) await batch.commit();

  logger.info("Push token released", { callerUid, uid, deviceId, released });
  return { released };
}

module.exports = { releasePushToken };
