"use strict";

/**
 * Moderation: who may look, what looking is recorded as, and what stopping an account
 * actually does.
 *
 * The operator is identified by a custom auth claim that no callable can grant. These
 * tests set it with the Admin SDK, which is what scripts/set-moderator.js does.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clearEmulators, shutdown, makeActor, anonymousActor, expectFailure, expectDenied,
  futureMeeting, admin, adminAuth, where,
} = require("./helpers/env");
const { CAST } = require("./helpers/actors");

let moderator; let stranger;
let seq = 0;

async function makeModerator() {
  const actor = await makeActor("moderator");
  await adminAuth().setCustomUserClaims(actor.uid, { moderator: true });
  await actor.refreshToken();
  return actor;
}

/** A reported conversation: two members, a thread, and a report filed about it. */
async function reportedPair(reason = "harassment") {
  const suffix = ++seq;
  const accused = await makeActor(`accused${suffix}`);
  const reporter = await makeActor(`reporter${suffix}`);
  await accused.call("upsertProfile", { ...CAST.alex, displayName: `Accused ${suffix}` });
  await reporter.call("upsertProfile", { ...CAST.aiko, displayName: `Reporter ${suffix}` });

  const { invitation } = await accused.call("createInvitation", {
    toUid: reporter.uid, intent: "platonic", requestKey: `mod-${suffix}`,
    note: "Hello", meeting: futureMeeting(),
  });
  const accepted = await reporter.call("respondToInvitation", {
    invitationId: invitation.id, action: "accept",
  });
  const conversationId = accepted.conversationId;

  await accused.call("sendMessage", { conversationId, text: "Something upsetting", clientMessageId: `m${suffix}a` });
  await reporter.call("sendMessage", { conversationId, text: "Please stop", clientMessageId: `m${suffix}b` });

  const report = await reporter.call("reportUser", {
    reportedUid: accused.uid, conversationId, reason, detail: "Would like this looked at.",
  });
  return { accused, reporter, conversationId, reportId: report.reportId };
}

test.before(async () => {
  await clearEmulators();
  moderator = await makeModerator();
  stranger = anonymousActor();
});

test.after(async () => { await shutdown(); });

test("moderation is closed to ordinary members and to anonymous callers", async () => {
  const { reporter, reportId } = await reportedPair();

  for (const [name, payload] of [
    ["listReports", {}],
    ["getReportContext", { reportId }],
    ["actOnReport", { reportId, action: "dismiss" }],
  ]) {
    const error = await expectFailure(reporter.call(name, payload), "permission-denied", `${name} for a member`);
    assert.equal(error.details.reason, "moderation/not-an-operator");
    await expectFailure(stranger.call(name, payload), "unauthenticated", `${name} for an anonymous caller`);
  }
});

test("the moderator claim does not open the database directly", async () => {
  // The claim is checked by the callables. Firestore rules still deny reports to
  // everyone, so a stolen moderator token cannot be used to read the raw collection.
  await expectDenied(moderator.readAll("reports"), "a moderator listing reports directly");
  await expectDenied(moderator.readAll("moderationActions"), "a moderator reading the audit log directly");
  await expectDenied(moderator.readAll("accountStatus"), "a moderator reading suspension state directly");
});

test("a moderator sees the queue with both parties named", async () => {
  const { accused, reporter, reportId } = await reportedPair("spam");

  const result = await moderator.call("listReports", { status: "received", limit: 50 });
  const row = result.reports.find((report) => report.id === reportId);

  assert.ok(row, "the new report is in the received queue");
  assert.equal(row.reason, "spam");
  assert.equal(row.reportedUid, accused.uid);
  assert.equal(row.reporterUid, reporter.uid);
  assert.match(row.reportedName, /^Accused/);
  assert.match(row.reporterName, /^Reporter/);
  assert.equal(row.status, "received");
  assert.ok(row.createdAt, "the queue is orderable by time");
});

test("reading a conversation for context returns the thread and is itself audited", async () => {
  const { accused, reporter, conversationId, reportId } = await reportedPair();

  const context = await moderator.call("getReportContext", { reportId });

  assert.equal(context.conversation.id, conversationId);
  assert.deepEqual(context.conversation.participants, [accused.uid, reporter.uid].sort());
  assert.deepEqual(context.messages.map((message) => message.text), ["Something upsetting", "Please stop"]);
  assert.equal(context.messages[0].fromUid, accused.uid);

  const audit = await admin().collection("moderationActions")
    .where("reportId", "==", reportId).where("action", "==", "viewed-context").get();
  assert.equal(audit.size, 1, "looking at a private conversation must leave a record");
  assert.equal(audit.docs[0].get("moderatorUid"), moderator.uid);
  assert.equal(audit.docs[0].get("messagesRead"), 2);
});

test("claiming and dismissing move the report through the queue", async () => {
  const { reportId } = await reportedPair();

  const claimed = await moderator.call("actOnReport", { reportId, action: "claim" });
  assert.equal(claimed.reportStatus, "reviewing");

  const reviewing = await moderator.call("listReports", { status: "reviewing" });
  assert.ok(reviewing.reports.some((report) => report.id === reportId));

  const dismissed = await moderator.call("actOnReport", {
    reportId, action: "dismiss", note: "No breach found.",
  });
  assert.equal(dismissed.reportStatus, "dismissed");

  const stored = await admin().doc(`reports/${reportId}`).get();
  assert.equal(stored.get("status"), "dismissed");
  assert.equal(stored.get("lastActionBy"), moderator.uid);
});

test("suspending stops the account acting, and hides it from everyone else", async () => {
  const { accused, reporter, conversationId, reportId } = await reportedPair();
  const onlooker = await makeActor(`onlooker${seq}`);
  await onlooker.call("upsertProfile", { ...CAST.aiko, displayName: `Onlooker ${seq}` });

  // Visible beforehand.
  const before = await onlooker.call("discoverCandidates", { mode: "platonic", limit: 20 });
  assert.ok(before.candidates.some((candidate) => candidate.uid === accused.uid));

  const result = await moderator.call("actOnReport", {
    reportId, action: "suspend", note: "Repeated harassment.",
  });
  assert.equal(result.reportStatus, "actioned");
  assert.equal(result.subjectUid, accused.uid);

  // The account cannot act.
  for (const [name, payload] of [
    ["discoverCandidates", { mode: "platonic" }],
    ["sendMessage", { conversationId, text: "still here", clientMessageId: "sus-1" }],
    ["createInvitation", {
      toUid: reporter.uid, intent: "platonic", requestKey: "sus-2",
      note: "hi", meeting: futureMeeting(),
    }],
  ]) {
    const error = await expectFailure(accused.call(name, payload), "permission-denied", name);
    assert.equal(error.details.reason, "account/suspended");
  }

  // And it is out of discovery for everyone else.
  const after = await onlooker.call("discoverCandidates", { mode: "platonic", limit: 20 });
  assert.equal(after.candidates.some((candidate) => candidate.uid === accused.uid), false);

  const status = await admin().doc(`accountStatus/${accused.uid}`).get();
  assert.equal(status.get("suspended"), true);
  assert.equal(status.get("byModeratorUid"), moderator.uid);
  assert.equal(status.get("note"), "Repeated harassment.");

  // The other person is unaffected.
  const stillFine = await reporter.call("discoverCandidates", { mode: "platonic", limit: 20 });
  assert.ok(Array.isArray(stillFine.candidates));
});

test("reinstating restores the account", async () => {
  const { accused, reportId } = await reportedPair();

  await moderator.call("actOnReport", { reportId, action: "suspend" });
  await expectFailure(accused.call("discoverCandidates", { mode: "platonic" }), "permission-denied");

  await moderator.call("actOnReport", { reportId, action: "reinstate", note: "Appeal upheld." });

  const restored = await accused.call("discoverCandidates", { mode: "platonic", limit: 20 });
  assert.ok(Array.isArray(restored.candidates), "the account works again");

  const profile = await admin().doc(`profiles/${accused.uid}`).get();
  assert.equal(profile.get("discoverable"), true);
});

test("every action is written to the audit trail", async () => {
  const { reportId } = await reportedPair();

  await moderator.call("actOnReport", { reportId, action: "claim" });
  await moderator.call("getReportContext", { reportId });
  await moderator.call("actOnReport", { reportId, action: "warn", note: "Told them once." });

  const audit = await admin().collection("moderationActions").where("reportId", "==", reportId).get();
  const actions = audit.docs.map((doc) => doc.get("action")).sort();
  assert.deepEqual(actions, ["claim", "viewed-context", "warn"]);
  for (const doc of audit.docs) {
    assert.equal(doc.get("moderatorUid"), moderator.uid);
    assert.ok(doc.get("createdAt"), "every audit entry is timestamped by the server");
  }
});

test("acting on a report that does not exist is a clean not-found", async () => {
  await expectFailure(
    moderator.call("actOnReport", { reportId: "nope", action: "dismiss" }),
    "not-found",
  );
  await expectFailure(moderator.call("getReportContext", { reportId: "nope" }), "not-found");
  await expectFailure(
    moderator.call("actOnReport", { reportId: "nope", action: "obliterate" }),
    "invalid-argument",
  );
});

test("a report about a deleted account still opens, with the thread gone", async () => {
  const { accused, reportId } = await reportedPair();
  await accused.call("requestAccountDeletion", { confirmation: "DELETE" });

  const context = await moderator.call("getReportContext", { reportId });
  assert.equal(context.report.reportedName, null, "the profile is gone");
  assert.equal(context.conversation, null, "the conversation went with the account");
  assert.deepEqual(context.messages, []);

  const queue = await moderator.call("listReports", { status: "received", limit: 50 });
  const row = queue.reports.find((report) => report.id === reportId);
  assert.equal(row.reportedUserDeleted, true, "the queue shows the account is gone");
});
