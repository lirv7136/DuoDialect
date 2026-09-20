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

function isValidToken(token) {
  if (typeof token !== "string" || !token) return false;
  if (resolveTransport() === "stub") return /^ExponentPushToken\[.+\]$/.test(token);
  const { Expo } = require("expo-server-sdk");
  return Expo.isExpoPushToken(token);
}

/**
 * Sends one notification. Returns a record describing the attempt. Failures are logged
 * and swallowed: a notification must never fail the write that triggered it.
 */
async function deliver(db, { toUid, title, body, data }) {
  const transport = resolveTransport();
  const r = refs(db);

  const tokenSnap = await r.pushToken(toUid).get();
  const token = tokenSnap.exists ? tokenSnap.get("token") : null;

  if (!isValidToken(token)) {
    logger.info("Push skipped: missing or invalid token", { toUid, transport, hasToken: Boolean(token) });
    return { delivered: false, transport, skipped: "invalid-token" };
  }

  if (transport === "stub") {
    await r.pushDeliveries().add({
      toUid,
      title,
      body,
      data: data || {},
      transport,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { delivered: true, transport, skipped: null };
  }

  try {
    const tickets = await getExpo().sendPushNotificationsAsync([
      { to: token, sound: "default", title, body, data: data || {} },
    ]);
    logger.info("Push tickets", { toUid, tickets });
    return { delivered: true, transport, skipped: null };
  } catch (error) {
    logger.error("Push send failed", { toUid, error: String(error) });
    return { delivered: false, transport, skipped: "send-failed" };
  }
}

module.exports = { deliver, resolveTransport };
