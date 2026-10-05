"use strict";

/**
 * DuoDialect backend entry points.
 *
 * Every write that carries an invariant goes through a callable here. The callables
 * run with the Admin SDK, which bypasses Firestore rules entirely, so each one must
 * and does independently verify its caller and revalidate its inputs. Firestore rules
 * (firestore.rules) are the second, independent layer: they deny direct client writes
 * to everything these callables own.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2/options");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const { upsertProfile, setDatingConsent, getMyAccount } = require("./lib/profiles");
const { discoverCandidates } = require("./lib/discovery");
const { createInvitation, respondToInvitation, cancelInvitation } = require("./lib/invitations");
const { sendMessage, markConversationRead } = require("./lib/conversations");
const { setBlock, reportUser } = require("./lib/safety");
const { requestAccountDeletion, assertNotSuspended } = require("./lib/accounts");
const { assertModerator, listReports, getReportContext, actOnReport } = require("./lib/moderation");
const { deliver } = require("./lib/notifier");
const { invitationNotice, acceptedNotice } = require("./lib/notifications");
const { refs } = require("./lib/refs");
const { setProfilePhotos, screenUpload } = require("./lib/photos");
const { answerCheckIn, sweepCheckIns } = require("./lib/checkins");

setGlobalOptions({ region: "australia-southeast1", maxInstances: 10 });

initializeApp();
const db = getFirestore();

/**
 * Shared wrapper. Rejects unauthenticated callers before any handler runs, enforces
 * suspension and the moderator claim, and stops unexpected internal errors from
 * reaching the client as free text.
 *
 * `allowSuspended` exists for one operation only: a suspended account keeps the right
 * to delete itself. `moderatorOnly` checks the verified token claim, which no callable
 * can grant; see scripts/set-moderator.js.
 */
function authenticated(name, handler, options = {}) {
  return onCall(options.callOptions || {}, async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in to continue.");
    }
    try {
      if (options.moderatorOnly) assertModerator(request.auth.token);
      if (!options.allowSuspended) await assertNotSuspended(db, uid);
      return await handler(db, uid, request.data || {}, new Date());
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`${name} failed`, { uid, error: String(error && error.stack ? error.stack : error) });
      throw new HttpsError("internal", "Something went wrong. Please try again.");
    }
  });
}

exports.upsertProfile = authenticated("upsertProfile", (database, uid, data, now) =>
  upsertProfile(database, uid, data, now));

exports.getMyAccount = authenticated("getMyAccount", (database, uid, data, now) =>
  getMyAccount(database, uid, now));

exports.setDatingConsent = authenticated("setDatingConsent", (database, uid, data, now) =>
  setDatingConsent(database, uid, data, now));

exports.setProfilePhotos = authenticated("setProfilePhotos", (database, uid, data, now) =>
  setProfilePhotos(database, uid, data, now));

exports.discoverCandidates = authenticated("discoverCandidates", (database, uid, data, now) =>
  discoverCandidates(database, uid, data, now));

exports.createInvitation = authenticated("createInvitation", (database, uid, data, now) =>
  createInvitation(database, uid, data, now));

exports.respondToInvitation = authenticated("respondToInvitation", (database, uid, data, now) =>
  respondToInvitation(database, uid, data, now));

exports.cancelInvitation = authenticated("cancelInvitation", (database, uid, data) =>
  cancelInvitation(database, uid, data));

exports.sendMessage = authenticated("sendMessage", (database, uid, data) =>
  sendMessage(database, uid, data));

exports.markConversationRead = authenticated("markConversationRead", (database, uid, data) =>
  markConversationRead(database, uid, data));

exports.setBlock = authenticated("setBlock", (database, uid, data) =>
  setBlock(database, uid, data));

exports.reportUser = authenticated("reportUser", (database, uid, data) =>
  reportUser(database, uid, data));

exports.answerCheckIn = authenticated("answerCheckIn", (database, uid, data, now) =>
  answerCheckIn(database, uid, data, now));

/**
 * Account deletion. Allowed while suspended, and given a long timeout because it walks
 * the caller's whole footprint. Every step is a delete, so a retry resumes safely.
 */
exports.requestAccountDeletion = authenticated(
  "requestAccountDeletion",
  (database, uid, data) => requestAccountDeletion(database, uid, data),
  { allowSuspended: true, callOptions: { timeoutSeconds: 540, memory: "512MiB" } },
);

// Moderation. Requires the `moderator` custom claim on the verified token.
exports.listReports = authenticated("listReports", (database, uid, data) =>
  listReports(database, uid, data), { moderatorOnly: true });

exports.getReportContext = authenticated("getReportContext", (database, uid, data) =>
  getReportContext(database, uid, data), { moderatorOnly: true });

exports.actOnReport = authenticated("actOnReport", (database, uid, data) =>
  actOnReport(database, uid, data), { moderatorOnly: true });

/**
 * Message notification.
 *
 * Replaces the previous chats/{chatId}/messages trigger. That version read membership
 * from a client writable chat document and took the sender from the message payload;
 * both are now server owned, so this trigger can trust them. It still re-checks blocks
 * in both directions, because a block can be created between the send and this trigger.
 *
 * Delivery is stubbed whenever the Functions emulator is running, so tests never reach
 * a real device. See lib/notifier.js.
 */
exports.onConversationMessageCreated = onDocumentCreated(
  "conversations/{conversationId}/messages/{messageId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const message = snap.data() || {};
    const fromUid = String(message.fromUid || "");
    const toUid = String(message.toUid || "");
    const text = String(message.text || "").trim();
    if (!fromUid || !toUid || !text) return;

    const r = refs(db);
    const [blockOut, blockIn, fromProfile] = await db.getAll(
      r.block(fromUid, toUid), r.block(toUid, fromUid), r.profile(fromUid),
    );
    if (blockOut.exists || blockIn.exists) {
      logger.info("Push skipped: blocked", { conversationId: event.params.conversationId });
      return;
    }

    await deliver(db, {
      toUid,
      title: String((fromProfile.exists && fromProfile.get("displayName")) || "New message"),
      body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
      data: { type: "message", conversationId: event.params.conversationId, otherUid: fromUid },
    });
  },
);

/**
 * Plan notifications: the invitee hears about a new invitation, and the person who
 * suggested it hears when it is accepted. Declines and cancellations stay quiet.
 * Blocks are re-checked in both directions, as for messages.
 */
async function notifyAboutPlan(invitationId, invitation, { toUid, aboutUid, notice }) {
  const r = refs(db);
  const [blockOut, blockIn, aboutProfile] = await db.getAll(
    r.block(aboutUid, toUid), r.block(toUid, aboutUid), r.profile(aboutUid),
  );
  if (blockOut.exists || blockIn.exists) {
    logger.info("Push skipped: blocked", { invitationId });
    return;
  }
  const name = aboutProfile.exists ? aboutProfile.get("displayName") : null;
  await deliver(db, {
    toUid,
    ...notice(invitation, name),
    data: { type: "plan", invitationId, otherUid: aboutUid, conversationId: invitation.conversationId || null },
  });
}

exports.onInvitationCreated = onDocumentCreated("invitations/{invitationId}", async (event) => {
  const invitation = event.data && event.data.data();
  if (!invitation || invitation.status !== "pending" || !invitation.fromUid || !invitation.toUid) return;
  await notifyAboutPlan(event.params.invitationId, invitation, {
    toUid: invitation.toUid, aboutUid: invitation.fromUid, notice: invitationNotice,
  });
});

exports.onInvitationUpdated = onDocumentUpdated("invitations/{invitationId}", async (event) => {
  const before = event.data && event.data.before.data();
  const after = event.data && event.data.after.data();
  if (!before || !after || before.status === "accepted" || after.status !== "accepted") return;
  await notifyAboutPlan(event.params.invitationId, after, {
    toUid: after.fromUid, aboutUid: after.toUid, notice: acceptedNotice,
  });
});

/**
 * Profile photo screening. Runs on every object written to the default bucket and ignores
 * anything outside profilePhotos/. Approved photos are marked readable; rejected ones are
 * deleted. The verdict is written to photoScreening/{uid}_{photoId} for the owner's app.
 *
 * Screening is stubbed (approve everything, call nothing) whenever the Functions emulator
 * is running, so tests never reach Cloud Vision. See lib/photos.js.
 *
 * The trigger must be in the same location as the bucket, so the default bucket needs to
 * be created in australia-southeast1. See docs/BACKEND-CONTRACT.md.
 */
exports.onProfilePhotoUploaded = onObjectFinalized(
  { region: "australia-southeast1", memory: "512MiB", timeoutSeconds: 60 },
  async (event) => {
    await screenUpload(db, event.data);
  },
);

/**
 * Post meetup check-ins. Every hour, creates the check-ins that have come due (10:00
 * local time the day after each accepted plan, weekly for weekly plans) and notifies
 * each person privately. Idempotent, so an overlapping or repeated run is harmless.
 * See lib/checkins.js.
 */
exports.sweepCheckIns = onSchedule(
  { schedule: "every 60 minutes", timeZone: "Australia/Sydney", timeoutSeconds: 300 },
  async () => {
    const result = await sweepCheckIns(db, new Date());
    logger.info("Check-in sweep finished", result);
  },
);
