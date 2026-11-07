"use strict";

const logger = require("firebase-functions/logger");
const { FieldValue } = require("firebase-admin/firestore");
const { refs } = require("./refs");

/**
 * Push delivery transport.
 *
 * "stub" records what would have been sent into pushDeliveries/ and sends nothing.
 * It is the default whenever the Functions emulator is running, so a local test run
 * can never deliver a notification to a real device. Set DUODIALECT_PUSH_TRANSPORT
 * explicitly to override.
 */
function resolveTransport() {
  const explicit = process.env.DUODIALECT_PUSH_TRANSPORT;
  if (explicit === "stub" || explicit === "expo") return explicit;
  if (process.env.FUNCTIONS_EMULATOR === "true") return "stub";
  return "expo";
}

let expoClient = null;
function getExpo() {
  if (!expoClient) {
    const { Expo } = require("expo-server-sdk");
    expoClient = new Expo();
  }
  return expoClient;
}

function isValidToken(token, transport = resolveTransport()) {
  if (typeof token !== "string" || !token) return false;
  if (transport === "stub") return /^ExponentPushToken\[.+\]$/.test(token);
  const { Expo } = require("expo-server-sdk");
  return Expo.isExpoPushToken(token);
}

/**
 * Every device a person can be reached on: each pushTokens/{uid}/devices/* document, plus
 * the legacy single document when its token is not already among them. Deduplicated by
 * token, so a device that wrote both (every current client does) is sent to once.
 */
async function targetsFor(db, toUid, transport) {
  const r = refs(db);
  const [devices, legacy] = await Promise.all([r.pushDevices(toUid).get(), r.pushToken(toUid).get()]);
  const legacyToken = legacy.exists ? legacy.get("token") : null;
  const seen = new Set();
  const targets = [];
  const add = (token, deviceId) => {
    if (!isValidToken(token, transport) || seen.has(token)) return;
    seen.add(token);
    // `legacy` says whether the single document holds this same token, so retiring the
    // token later can take both documents with it.
    targets.push({ token, deviceId, legacy: token === legacyToken });
  };
  for (const doc of devices.docs) add(doc.get("token"), doc.id);
  add(legacyToken, null);
  return targets;
}

/**
 * Sends one notification to every device the person has registered. Returns a record
 * describing the attempt. Failures are logged and swallowed: a notification must never
 * fail the write that triggered it.
 */
async function deliver(db, { toUid, title, body, data }) {
  const transport = resolveTransport();
  const r = refs(db);

  const targets = await targetsFor(db, toUid, transport);
  if (targets.length === 0) {
    logger.info("Push skipped: missing or invalid token", { toUid, transport });
    return { delivered: false, transport, skipped: "invalid-token", tokens: 0 };
  }

  if (transport === "stub") {
    // One record per device, with the token, so a test can assert the fan out.
    await Promise.all(targets.map(({ token, deviceId }) => r.pushDeliveries().add({
      toUid,
      token,
      deviceId,
      title,
      body,
      data: data || {},
      transport,
      createdAt: FieldValue.serverTimestamp(),
    })));
    return { delivered: true, transport, skipped: null, tokens: targets.length };
  }

  try {
    const expo = getExpo();
    const messages = targets.map(({ token }) => ({ to: token, sound: "default", title, body, data: data || {} }));
    const tickets = [];
    for (const chunk of expo.chunkPushNotifications(messages)) {
      tickets.push(...await expo.sendPushNotificationsAsync(chunk));
    }
    await recordTickets(db, toUid, targets, tickets);
    logger.info("Push tickets", { toUid, tickets: tickets.length });
    return { delivered: true, transport, skipped: null, tokens: targets.length };
  } catch (error) {
    logger.error("Push send failed", { toUid, error: String(error) });
    return { delivered: false, transport, skipped: "send-failed", tokens: targets.length };
  }
}

/**
 * The nth ticket answers the nth message. A successful ticket is kept under its id so
 * sweepPushReceipts can fetch the receipt later; a ticket that already says the device
 * is gone retires the token straight away.
 */
async function recordTickets(db, toUid, targets, tickets) {
  const r = refs(db);
  const batch = db.batch();
  let writes = 0;
  tickets.forEach((ticket, index) => {
    const target = targets[index];
    if (!target) return;
    if (ticket.status === "ok" && ticket.id) {
      batch.set(r.pushTicket(ticket.id), {
        toUid, token: target.token, deviceId: target.deviceId, createdAt: FieldValue.serverTimestamp(),
      });
      writes += 1;
    } else if (ticket.status === "error") {
      logger.warn("Push ticket error", { toUid, error: ticket.details && ticket.details.error, message: ticket.message });
      if (ticket.details && ticket.details.error === "DeviceNotRegistered") {
        writes += retireToken(batch, r, { toUid, deviceId: target.deviceId, legacy: target.legacy });
      }
    }
  });
  if (writes > 0) await batch.commit();
}

/**
 * Queues the deletes for one dead token: its device document, and the legacy document
 * when the caller has checked it holds the same token. The device document goes
 * unconditionally because its id is derived from the token, so a new token on the same
 * phone is a different document. Returns how many deletes were queued.
 */
function retireToken(batch, r, { toUid, deviceId, legacy }) {
  let count = 0;
  if (deviceId) { batch.delete(r.pushDevice(toUid, deviceId)); count += 1; }
  if (legacy) { batch.delete(r.pushToken(toUid)); count += 1; }
  return count;
}

module.exports = { deliver, resolveTransport, getExpo, isValidToken, targetsFor, retireToken };
