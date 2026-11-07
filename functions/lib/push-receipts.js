"use strict";

const logger = require("firebase-functions/logger");
const { refs } = require("./refs");
const { resolveTransport, getExpo, retireToken } = require("./notifier");

/**
 * Push receipt sweep.
 *
 * Expo answers a send with a ticket, and only later knows whether Apple or Google took
 * the message. Each successful ticket is stored at pushTickets/{ticketId} by the
 * notifier; this sweep fetches the receipts once they are old enough and retires any
 * token the platform reports as DeviceNotRegistered (the app was uninstalled, or the
 * token was rotated). Without it, dead tokens accumulate and Expo eventually throttles
 * the sender for addressing them.
 *
 * Driven by sweepPushReceipts, run hourly beside the other sweeps. Idempotent: a ticket
 * is deleted once its receipt has been read, so a repeated run finds nothing to do.
 */

/** Expo asks senders to wait at least 15 minutes before fetching a receipt. */
const RECEIPT_DELAY_MS = 15 * 60 * 1000;

/** Expo keeps receipts for about a day. A ticket older than this will never be answered. */
const TICKET_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Bounded so one sweep cannot run away, and so the batch stays under Firestore's 500
 * writes: each ticket is at most three deletes. The next sweep picks up the rest.
 */
const SWEEP_LIMIT = 150;

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
}

/**
 * `transport` and `expo` can be supplied by a test; by default the transport is resolved
 * the same way the notifier resolves it. Under the stub transport nothing was ever sent,
 * so there is nothing to check and the counts are all zero.
 */
async function sweepPushReceipts(db, now, { transport = resolveTransport(), expo = null } = {}) {
  const result = { transport, tickets: 0, checked: 0, dead: 0, removed: 0, expired: 0 };
  if (transport === "stub") return result;

  const r = refs(db);
  const cutoff = new Date(now.getTime() - RECEIPT_DELAY_MS);
  const snap = await r.pushTickets()
    .where("createdAt", "<=", cutoff).orderBy("createdAt").limit(SWEEP_LIMIT).get();
  result.tickets = snap.size;
  if (snap.empty) return result;

  const client = expo || getExpo();
  const receipts = {};
  for (const chunk of client.chunkPushNotificationReceiptIds(snap.docs.map((doc) => doc.id))) {
    try {
      Object.assign(receipts, await client.getPushNotificationReceiptsAsync(chunk));
    } catch (error) {
      // The tickets stay for the next sweep; nothing is lost by waiting.
      logger.error("Push receipts could not be fetched", { error: String(error) });
    }
  }

  // Deletes are keyed by path so two tickets for one dead device queue one delete.
  const deletes = new Map();
  const queue = { delete: (ref) => deletes.set(ref.path, ref) };

  for (const doc of snap.docs) {
    const receipt = receipts[doc.id];
    if (!receipt) {
      const createdAt = toMillis(doc.get("createdAt"));
      if (createdAt !== null && now.getTime() - createdAt > TICKET_TTL_MS) {
        queue.delete(doc.ref);
        result.expired += 1;
      }
      continue;
    }
    result.checked += 1;
    if (receipt.status === "error") {
      const code = receipt.details && receipt.details.error;
      const { toUid, token, deviceId } = doc.data();
      if (code === "DeviceNotRegistered") {
        result.dead += 1;
        // The legacy document is checked again now: the phone may have rotated its token
        // and written a newer one since the ticket was issued.
        const legacy = await r.pushToken(toUid).get();
        result.removed += retireToken(queue, r, {
          toUid, deviceId, legacy: legacy.exists && legacy.get("token") === token,
        });
      } else {
        logger.warn("Push receipt error", { toUid, error: code, message: receipt.message });
      }
    }
    queue.delete(doc.ref);
  }

  if (deletes.size > 0) {
    const batch = db.batch();
    for (const ref of deletes.values()) batch.delete(ref);
    await batch.commit();
  }
  return result;
}

module.exports = { sweepPushReceipts, RECEIPT_DELAY_MS, TICKET_TTL_MS, SWEEP_LIMIT };
