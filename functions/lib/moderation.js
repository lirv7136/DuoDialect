"use strict";

const { FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const logger = require("firebase-functions/logger");
const { requireObject, requireString, requireEnum, requireInteger, optionalString } = require("./validation");
const { reject } = require("./eligibility");
const { refs } = require("./refs");

/**
 * Minimum moderation.
 *
 * Reports were being written to a collection nobody could read, which satisfies nothing.
 * This is the smallest path that lets a named operator see a report, look at the
 * conversation it refers to, and stop an account.
 *
 * Operator identity is the custom auth claim `moderator`, granted out of band by
 * scripts/set-moderator.js. It is deliberately not something any callable can grant.
 *
 * Reading someone's private conversation is a real power. Every read of message context
 * is written to moderationActions/ alongside the actions themselves, so the audit trail
 * covers looking as well as doing.
 */

const REPORT_STATUSES = ["received", "reviewing", "actioned", "dismissed"];
const ACTIONS = ["claim", "dismiss", "warn", "suspend", "reinstate"];

/** Throws unless the verified token carries the moderator claim. */
function assertModerator(token) {
  if (!token || token.moderator !== true) {
    throw reject("permission-denied", "moderation/not-an-operator", "This operation is for moderators.");
  }
}

async function recordAction(db, moderatorUid, entry) {
  await refs(db).moderationActions().add({
    moderatorUid,
    ...entry,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Display names for a set of uids, with a null for accounts that no longer exist. */
async function namesFor(db, uids) {
  const unique = [...new Set(uids.filter(Boolean))];
  if (unique.length === 0) return {};
  const r = refs(db);
  const snaps = await db.getAll(...unique.map((uid) => r.profile(uid)));
  return unique.reduce((acc, uid, index) => {
    acc[uid] = snaps[index].exists ? snaps[index].get("displayName") : null;
    return acc;
  }, {});
}

/** The queue. Newest first, filtered by status. */
async function listReports(db, moderatorUid, payload = {}) {
  const body = requireObject(payload || {}, "request");
  const status = body.status === undefined ? "received" : requireEnum(body.status, "status", REPORT_STATUSES);
  const limit = body.limit === undefined ? 25 : requireInteger(body.limit, "limit", 1, 100);

  const snap = await refs(db).reports()
    .where("status", "==", status)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const rows = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const names = await namesFor(db, rows.flatMap((row) => [row.reporterUid, row.reportedUid]));

  return {
    status,
    reports: rows.map((row) => ({
      id: row.id,
      reporterUid: row.reporterUid,
      reporterName: names[row.reporterUid] || null,
      reporterDeleted: row.reporterDeleted === true,
      reportedUid: row.reportedUid,
      reportedName: names[row.reportedUid] || null,
      reportedUserDeleted: row.reportedUserDeleted === true,
      reason: row.reason,
      detail: row.detail || "",
      conversationId: row.conversationId || null,
      status: row.status,
      createdAt: row.createdAt ? row.createdAt.toDate().toISOString() : null,
    })),
  };
}

/**
 * The reported conversation's recent messages, so the operator can judge rather than
 * guess. Logged as a moderationAction, because looking is itself an exercise of power.
 */
async function getReportContext(db, moderatorUid, payload) {
  const body = requireObject(payload, "request");
  const reportId = requireString(body.reportId, "reportId", 128);
  const messageLimit = body.messageLimit === undefined
    ? 50
    : requireInteger(body.messageLimit, "messageLimit", 1, 200);

  const r = refs(db);
  const reportSnap = await r.report(reportId).get();
  if (!reportSnap.exists) {
    throw reject("not-found", "moderation/report-not-found", "No such report.");
  }
  const report = reportSnap.data();

  let messages = [];
  let conversation = null;
  if (report.conversationId) {
    const convSnap = await r.conversation(report.conversationId).get();
    if (convSnap.exists) {
      conversation = {
        id: convSnap.id,
        participants: convSnap.get("participants"),
        intent: convSnap.get("intent"),
      };
      const messageSnap = await r.messagesOf(report.conversationId)
        .orderBy("createdAt", "desc").limit(messageLimit).get();
      messages = messageSnap.docs.map((doc) => ({
        id: doc.id,
        fromUid: doc.get("fromUid"),
        text: doc.get("text"),
        createdAt: doc.get("createdAt") ? doc.get("createdAt").toDate().toISOString() : null,
      })).reverse();
    }
  }

  await recordAction(db, moderatorUid, {
    action: "viewed-context",
    reportId,
    subjectUid: report.reportedUid,
    conversationId: report.conversationId || null,
    messagesRead: messages.length,
  });

  const names = await namesFor(db, [report.reporterUid, report.reportedUid]);
  return {
    report: {
      id: reportId,
      reporterUid: report.reporterUid,
      reporterName: names[report.reporterUid] || null,
      reportedUid: report.reportedUid,
      reportedName: names[report.reportedUid] || null,
      reason: report.reason,
      detail: report.detail || "",
      status: report.status,
    },
    conversation,
    messages,
  };
}

/**
 * Act on a report.
 *
 * `suspend` does three things together: marks the account, hides it from discovery, and
 * revokes its refresh tokens so the person is signed out rather than merely blocked at
 * the next write.
 */
async function actOnReport(db, moderatorUid, payload) {
  const body = requireObject(payload, "request");
  const reportId = requireString(body.reportId, "reportId", 128);
  const action = requireEnum(body.action, "action", ACTIONS);
  const note = optionalString(body.note, "note", 1000);

  const r = refs(db);
  const reportSnap = await r.report(reportId).get();
  if (!reportSnap.exists) {
    throw reject("not-found", "moderation/report-not-found", "No such report.");
  }
  const report = reportSnap.data();
  const subjectUid = report.reportedUid;

  const statusForAction = {
    claim: "reviewing",
    dismiss: "dismissed",
    warn: "actioned",
    suspend: "actioned",
    reinstate: "actioned",
  };

  if (action === "suspend" || action === "reinstate") {
    const suspended = action === "suspend";
    await r.accountStatus(subjectUid).set({
      uid: subjectUid,
      suspended,
      suspendedAt: suspended ? FieldValue.serverTimestamp() : null,
      byModeratorUid: moderatorUid,
      reportId,
      note,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Hide from, or restore to, discovery. The profile may already be gone.
    const profileSnap = await r.profile(subjectUid).get();
    if (profileSnap.exists) {
      await r.profile(subjectUid).set(
        { discoverable: !suspended, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }

    if (suspended) {
      try {
        await getAuth().revokeRefreshTokens(subjectUid);
      } catch (error) {
        logger.warn("Could not revoke refresh tokens", { subjectUid, error: String(error) });
      }
    }
  }

  await r.report(reportId).set({
    status: statusForAction[action],
    lastAction: action,
    lastActionAt: FieldValue.serverTimestamp(),
    lastActionBy: moderatorUid,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await recordAction(db, moderatorUid, {
    action,
    reportId,
    subjectUid,
    note,
  });

  return { reportId, action, reportStatus: statusForAction[action], subjectUid };
}

module.exports = {
  assertModerator, listReports, getReportContext, actOnReport, REPORT_STATUSES, ACTIONS,
};
