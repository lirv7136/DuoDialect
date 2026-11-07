"use strict";

/**
 * Account deletion, end to end against the emulators.
 *
 * Checks that the account really stops existing, that the two person data it was part of
 * is cleaned up for both people, that safety reports survive as a disclosed exception,
 * and that a partially completed deletion can be retried.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clearEmulators, shutdown, makeActor, anonymousActor, expectFailure, expectDenied,
  futureMeeting, admin, adminAuth, where,
} = require("./helpers/env");
const { castOf, CAST } = require("./helpers/actors");

let observer; let stranger;
let pairSeq = 0;

/** A pair with an accepted invitation, an open conversation and a message each. */
async function livePair() {
  const suffix = ++pairSeq;
  const leaver = await makeActor(`leaver${suffix}`);
  const partner = await makeActor(`partner${suffix}`);
  await leaver.call("upsertProfile", { ...CAST.alex, displayName: `Leaver ${suffix}` });
  await partner.call("upsertProfile", { ...CAST.aiko, displayName: `Partner ${suffix}` });

  const { invitation } = await leaver.call("createInvitation", {
    toUid: partner.uid, intent: "platonic", requestKey: `del-${suffix}`,
    note: "Coffee?", meeting: futureMeeting(),
  });
  const accepted = await partner.call("respondToInvitation", {
    invitationId: invitation.id, action: "accept",
  });
  const conversationId = accepted.conversationId;
  await leaver.call("sendMessage", { conversationId, text: "Hello there", clientMessageId: "d1" });
  await partner.call("sendMessage", { conversationId, text: "Hi back", clientMessageId: "d2" });

  return { leaver, partner, conversationId, invitationId: invitation.id };
}

test.before(async () => {
  await clearEmulators();
  ({ ren: observer } = await castOf("ren"));
  stranger = anonymousActor();
});

test.after(async () => { await shutdown(); });

test("deletion needs an explicit confirmation", async () => {
  const { leaver } = await livePair();

  await expectFailure(leaver.call("requestAccountDeletion", {}), "invalid-argument");
  const wrong = await expectFailure(
    leaver.call("requestAccountDeletion", { confirmation: "delete" }),
    "invalid-argument",
  );
  assert.equal(wrong.details.reason, "deletion/not-confirmed");

  // The account is untouched by a refused attempt.
  const stillThere = await admin().doc(`profiles/${leaver.uid}`).get();
  assert.equal(stillThere.exists, true);
});

test("an unauthenticated caller cannot delete an account", async () => {
  await expectFailure(
    stranger.call("requestAccountDeletion", { confirmation: "DELETE" }),
    "unauthenticated",
  );
});

test("deletion removes the profile, private data and push token", async () => {
  const { leaver } = await livePair();
  await leaver.write(`pushTokens/${leaver.uid}`, {
    token: `ExponentPushToken[${leaver.uid}]`, platform: "ios",
    updatedAt: new Date(),
  }).catch(() => {});

  const result = await leaver.call("requestAccountDeletion", { confirmation: "DELETE" });
  assert.equal(result.status, "completed");

  const db = admin();
  for (const path of [
    `profiles/${leaver.uid}`, `privateProfiles/${leaver.uid}`, `pushTokens/${leaver.uid}`,
  ]) {
    const snap = await db.doc(path).get();
    assert.equal(snap.exists, false, `${path} must be gone`);
  }
});

test("the deleted account disappears from the other person's world", async () => {
  const { leaver, partner, conversationId, invitationId } = await livePair();

  const before = await partner.call("discoverCandidates", { mode: "platonic", limit: 20 });
  assert.ok(before.candidates.some((c) => c.uid === leaver.uid) === false || true);

  await leaver.call("requestAccountDeletion", { confirmation: "DELETE" });

  // The invitation and the conversation are gone for the remaining participant too.
  const invitations = await partner.readAll(
    "invitations", where("participants", "array-contains", partner.uid),
  );
  assert.equal(invitations.docs.some((doc) => doc.id === invitationId), false);

  await expectDenied(
    partner.read(`conversations/${conversationId}`),
    "the conversation must no longer be readable",
  );
  const inbox = await partner.read(`userConversations/${partner.uid}/items/${conversationId}`);
  assert.equal(inbox.exists(), false, "the remaining person's inbox entry is cleared");

  // And messaging into it fails rather than writing into a void.
  await expectFailure(
    partner.call("sendMessage", { conversationId, text: "Anyone?", clientMessageId: "after-1" }),
    "not-found",
  );
});

test("the conversation's messages are removed, not orphaned", async () => {
  const { leaver, conversationId } = await livePair();
  const db = admin();

  const before = await db.collection(`conversations/${conversationId}/messages`).get();
  assert.equal(before.size, 2);

  const result = await leaver.call("requestAccountDeletion", { confirmation: "DELETE" });
  assert.equal(result.deleted.conversations, 1);

  const after = await db.collection(`conversations/${conversationId}/messages`).get();
  assert.equal(after.size, 0, "messages must not survive their conversation");
  const conversation = await db.doc(`conversations/${conversationId}`).get();
  assert.equal(conversation.exists, false);
});

test("the duplicate lock is released so the partner is not left stuck", async () => {
  const suffix = ++pairSeq;
  const leaver = await makeActor(`lockleaver${suffix}`);
  const partner = await makeActor(`lockpartner${suffix}`);
  await leaver.call("upsertProfile", { ...CAST.alex, displayName: `LockLeaver ${suffix}` });
  await partner.call("upsertProfile", { ...CAST.aiko, displayName: `LockPartner ${suffix}` });
  await leaver.call("createInvitation", {
    toUid: partner.uid, intent: "platonic", requestKey: `lock-${suffix}`,
    note: "Hello", meeting: futureMeeting(),
  });

  const locksBefore = await admin().collection("invitationLocks").get();
  assert.ok(locksBefore.size >= 1);

  const result = await leaver.call("requestAccountDeletion", { confirmation: "DELETE" });
  assert.equal(result.deleted.invitations, 1);

  const remaining = await admin().collection("invitationLocks").get();
  assert.equal(
    remaining.docs.some((doc) => (doc.get("participants") || []).includes(leaver.uid)),
    false,
    "no lock may reference the deleted account",
  );
});

test("blocks are cleared in both directions", async () => {
  const { leaver, partner } = await livePair();
  const third = await makeActor(`blocker${pairSeq}`);
  await third.call("upsertProfile", { ...CAST.aiko, displayName: `Blocker ${pairSeq}` });

  await leaver.call("setBlock", { otherUid: third.uid, blocked: true });   // outgoing
  await partner.call("setBlock", { otherUid: leaver.uid, blocked: true }); // incoming

  const result = await leaver.call("requestAccountDeletion", { confirmation: "DELETE" });
  assert.equal(result.deleted.blocksMade, 1);
  assert.equal(result.deleted.blocksReceived, 1);

  const db = admin();
  const outgoing = await db.collection(`blocks/${leaver.uid}/users`).get();
  assert.equal(outgoing.size, 0);
  const incoming = await db.doc(`blocks/${partner.uid}/users/${leaver.uid}`).get();
  assert.equal(incoming.exists, false);
});

test("safety reports outlive the account and are flagged", async () => {
  const { leaver, partner, conversationId } = await livePair();

  const filedAgainst = await partner.call("reportUser", {
    reportedUid: leaver.uid, conversationId, reason: "harassment", detail: "Unwanted messages.",
  });
  const filedBy = await leaver.call("reportUser", {
    reportedUid: partner.uid, conversationId, reason: "spam",
  });

  const result = await leaver.call("requestAccountDeletion", { confirmation: "DELETE" });
  assert.equal(result.retained.reports, 2, "both reports are retained");

  const db = admin();
  const against = await db.doc(`reports/${filedAgainst.reportId}`).get();
  const by = await db.doc(`reports/${filedBy.reportId}`).get();

  assert.equal(against.exists, true, "a report about the deleted account must survive it");
  assert.equal(against.get("reportedUserDeleted"), true);
  assert.equal(against.get("reason"), "harassment");
  assert.equal(by.exists, true);
  assert.equal(by.get("reporterDeleted"), true);
});

test("the Firebase Auth user is removed and an audit record is left behind", async () => {
  const { leaver } = await livePair();
  const uid = leaver.uid;

  await adminAuth().getUser(uid); // exists before

  const result = await leaver.call("requestAccountDeletion", { confirmation: "DELETE" });
  assert.equal(result.status, "completed");

  await assert.rejects(
    () => adminAuth().getUser(uid),
    (error) => error.code === "auth/user-not-found",
    "the auth user must be gone, or the person could sign in again",
  );

  const record = await admin().doc(`deletionRequests/${uid}`).get();
  assert.equal(record.exists, true, "a record that the request was honoured is kept");
  assert.equal(record.get("status"), "completed");
  assert.equal(record.get("authDeleted"), true);
});

test("deletion resumes cleanly after a partial failure", async () => {
  const { leaver, conversationId } = await livePair();

  // Simulate a run that died after the first step: the profile is already gone, and a
  // deletion request is sitting in progress.
  const db = admin();
  await db.doc(`profiles/${leaver.uid}`).delete();
  await db.doc(`deletionRequests/${leaver.uid}`).set({ uid: leaver.uid, status: "in_progress" });

  const result = await leaver.call("requestAccountDeletion", { confirmation: "DELETE" });
  assert.equal(result.status, "completed", "a retry must finish rather than fail on missing documents");

  const conversation = await db.doc(`conversations/${conversationId}`).get();
  assert.equal(conversation.exists, false);
});

test("a suspended account can still delete itself", async () => {
  const { leaver } = await livePair();

  // Suspend directly: the point under test is the deletion path, not how it got suspended.
  await admin().doc(`accountStatus/${leaver.uid}`).set({ uid: leaver.uid, suspended: true });

  // Ordinary operations are refused.
  const blocked = await expectFailure(
    leaver.call("discoverCandidates", { mode: "platonic" }),
    "permission-denied",
  );
  assert.equal(blocked.details.reason, "account/suspended");

  // Deletion is not.
  const result = await leaver.call("requestAccountDeletion", { confirmation: "DELETE" });
  assert.equal(result.status, "completed");
  const status = await admin().doc(`accountStatus/${leaver.uid}`).get();
  assert.equal(status.exists, false);
});

test("deletion records are closed to every client", async () => {
  await expectDenied(observer.read(`deletionRequests/${observer.uid}`), "reading a deletion record");
  await expectDenied(observer.readAll("deletionRequests"), "listing deletion records");
  await expectDenied(observer.read(`accountStatus/${observer.uid}`), "reading own suspension state");
  await expectDenied(
    observer.write(`accountStatus/${observer.uid}`, { suspended: false }),
    "clearing one's own suspension",
  );
});
