"use strict";

const { FieldValue } = require("firebase-admin/firestore");
const { requireObject, requireUid, requireBoolean, requireEnum, optionalString, requireString } = require("./validation");
const { REPORT_REASONS, LIMITS } = require("./constants");
const { REASON, reject } = require("./eligibility");
const { refs } = require("./refs");
const { cancelPendingInvitationsFor } = require("./invitations");

/**
 * Block or unblock another member.
 *
 * Blocking is one sided but takes effect in both directions: neither person can
 * discover, invite or message the other afterwards. Blocking also cancels every
 * pending invitation between the two, so a block cannot be worked around by
 * accepting something that was sent earlier.
 */
async function setBlock(db, uid, payload) {
  const body = requireObject(payload, "request");
  const otherUid = requireUid(body.otherUid, "otherUid");
  const blocked = requireBoolean(body.blocked, "blocked");
  if (otherUid === uid) {
    throw reject("invalid-argument", REASON.selfTarget, "You cannot block yourself.");
  }

  const r = refs(db);
  if (!blocked) {
    await r.block(uid, otherUid).delete();
    // Invitations cancelled by a block stay cancelled; unblocking does not revive them.
    return { blocked: false, cancelledInvitations: 0 };
  }

  await r.block(uid, otherUid).set({
    blockedUid: otherUid,
    byUid: uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  const { cancelled } = await cancelPendingInvitationsFor(db, {
    uid, otherUid, reason: "blocked",
  });
  return { blocked: true, cancelledInvitations: cancelled };
}

/**
 * File a report. Reports are written by the server and are not readable by any client,
 * including the reporter. There is no triage tooling yet; see BACKEND-HANDOFF.md.
 */
async function reportUser(db, uid, payload) {
  const body = requireObject(payload, "request");
  const reportedUid = requireUid(body.reportedUid, "reportedUid");
  const reason = requireEnum(body.reason, "reason", REPORT_REASONS);
  const detail = optionalString(body.detail, "detail", LIMITS.reportDetail);
  const conversationId = body.conversationId === undefined || body.conversationId === null
    ? null
    : requireString(body.conversationId, "conversationId", 128);

  if (reportedUid === uid) {
    throw reject("invalid-argument", REASON.selfTarget, "You cannot report yourself.");
  }

  const r = refs(db);
  if (conversationId) {
    const conv = await r.conversation(conversationId).get();
    const participants = conv.exists ? (conv.get("participants") || []) : [];
    if (!conv.exists || !participants.includes(uid) || !participants.includes(reportedUid)) {
      throw reject("permission-denied", REASON.conversationNotMember, "You cannot report this conversation.");
    }
  }

  const doc = await r.reports().add({
    reporterUid: uid,
    reportedUid,
    conversationId,
    reason,
    detail,
    status: "received",
    createdAt: FieldValue.serverTimestamp(),
  });

  return { reportId: doc.id, status: "received" };
}

module.exports = { setBlock, reportUser };
