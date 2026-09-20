"use strict";

/**
 * Invitation transitions: create, accept, decline, cancel.
 *
 * Covers retries, duplicate suppression, two simultaneous acceptances, and consent or
 * blocks changing between sending an invitation and accepting it.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clearEmulators, shutdown, makeActor, expectFailure, expectDenied, futureMeeting,
  birthDateForAge, admin, where,
} = require("./helpers/env");
const { castOf, CAST } = require("./helpers/actors");

let alex; let aiko; let ren;
let key = 0;
const nextKey = () => `key-${++key}`;
let pairSeq = 0;

function invite(from, toUid, options = {}) {
  const { intent = "platonic", requestKey = nextKey(), meeting = futureMeeting(), ...rest } = options;
  return from.call("createInvitation", {
    toUid, intent, requestKey, note: "Coffee and a language swap?", meeting, ...rest,
  });
}

/** A brand new reciprocal, dating compatible pair, isolated from the standing cast. */
async function freshPair() {
  const suffix = ++pairSeq;
  const speaker = await makeActor(`speaker${suffix}`);
  const learner = await makeActor(`learner${suffix}`);
  await speaker.call("upsertProfile", { ...CAST.alex, displayName: `Speaker ${suffix}` });
  await learner.call("upsertProfile", { ...CAST.aiko, displayName: `Learner ${suffix}` });
  return { speaker, learner };
}

test.before(async () => {
  await clearEmulators();
  ({ alex, aiko, ren } = await castOf("alex", "aiko", "ren"));
});

test.after(async () => { await shutdown(); });

test("an invitation records the meeting as explicit local time, zone and recurrence", async () => {
  const meeting = futureMeeting({ days: 10, localTime: "18:30", timeZone: "Australia/Sydney", recurrence: "weekly" });
  const { invitation } = await invite(alex, aiko.uid, { meeting });

  assert.equal(invitation.status, "pending");
  assert.deepEqual(invitation.participants, [alex.uid, aiko.uid].sort());
  assert.equal(invitation.meeting.localDate, meeting.localDate);
  assert.equal(invitation.meeting.localTime, "18:30");
  assert.equal(invitation.meeting.timeZone, "Australia/Sydney");
  assert.equal(invitation.meeting.recurrence, "weekly");

  // The absolute instant is derived from the wall time in the stated zone, not from
  // the server's own clock zone.
  const startAt = new Date(invitation.meeting.startAt);
  const asSydney = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(startAt);
  assert.equal(asSydney, "18:30");

  await alex.call("cancelInvitation", { invitationId: invitation.id });
});

test("a meeting in the past or in an unknown zone is refused", async () => {
  await expectFailure(
    invite(alex, aiko.uid, { meeting: { ...futureMeeting(), localDate: "2020-01-01" } }),
    "invalid-argument",
  );
  await expectFailure(
    invite(alex, aiko.uid, { meeting: { ...futureMeeting(), timeZone: "Middle/Earth" } }),
    "invalid-argument",
  );
  await expectFailure(
    invite(alex, aiko.uid, { meeting: { ...futureMeeting(), localTime: "25:00" } }),
    "invalid-argument",
  );
});

test("a retried create with the same request key returns the same invitation", async () => {
  const { speaker, learner } = await freshPair();
  const requestKey = "retry-me";

  const first = await invite(speaker, learner.uid, { requestKey });
  const second = await invite(speaker, learner.uid, { requestKey });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.invitation.id, second.invitation.id);

  const all = await speaker.readAll("invitations", where("participants", "array-contains", speaker.uid));
  assert.equal(all.size, 1, "a retry must not create a second invitation");
});

test("a second open invitation to the same person with the same intent is refused", async () => {
  const { speaker, learner } = await freshPair();
  await invite(speaker, learner.uid, { requestKey: "first" });

  const error = await expectFailure(
    invite(speaker, learner.uid, { requestKey: "second" }),
    "already-exists",
  );
  assert.equal(error.details.reason, "invitation/duplicate-active");

  // The other direction is blocked too: the lock is held per pair, not per sender.
  const reverse = await expectFailure(
    invite(learner, speaker.uid, { requestKey: "reverse" }),
    "already-exists",
  );
  assert.equal(reverse.details.reason, "invitation/duplicate-active");
});

test("platonic and dating invitations to the same person are tracked separately", async () => {
  const { speaker, learner } = await freshPair();
  const platonic = await invite(speaker, learner.uid, { intent: "platonic" });
  const dating = await invite(speaker, learner.uid, { intent: "dating" });

  assert.notEqual(platonic.invitation.id, dating.invitation.id);
  assert.equal(platonic.invitation.intent, "platonic");
  assert.equal(dating.invitation.intent, "dating");
});

test("only the recipient may accept, and outsiders cannot respond at all", async () => {
  const { speaker, learner } = await freshPair();
  const { invitation } = await invite(speaker, learner.uid);

  const bySender = await expectFailure(
    speaker.call("respondToInvitation", { invitationId: invitation.id, action: "accept" }),
    "permission-denied",
  );
  assert.equal(bySender.details.reason, "invitation/not-recipient");

  const byOutsider = await expectFailure(
    ren.call("respondToInvitation", { invitationId: invitation.id, action: "accept" }),
    "permission-denied",
  );
  assert.equal(byOutsider.details.reason, "invitation/not-recipient");

  // An outsider cannot even read it.
  await expectDenied(ren.read(`invitations/${invitation.id}`), "outsider reading an invitation");
});

test("acceptance creates one conversation with immutable membership and two inboxes", async () => {
  const { speaker, learner } = await freshPair();
  const { invitation } = await invite(speaker, learner.uid);

  const accepted = await learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" });
  assert.equal(accepted.changed, true);
  assert.equal(accepted.invitation.status, "accepted");
  const conversationId = accepted.conversationId;
  assert.ok(conversationId);

  const conversation = await speaker.read(`conversations/${conversationId}`);
  assert.deepEqual(conversation.get("participants"), [speaker.uid, learner.uid].sort());
  assert.equal(conversation.get("intent"), "platonic");
  assert.deepEqual(conversation.get("acceptedInvitationIds"), [invitation.id]);

  for (const actor of [speaker, learner]) {
    const inbox = await actor.read(`userConversations/${actor.uid}/items/${conversationId}`);
    assert.equal(inbox.exists(), true);
    assert.equal(inbox.get("unread"), 0);
  }

  // Membership cannot be replaced by either participant or by an outsider.
  await expectDenied(
    speaker.patch(`conversations/${conversationId}`, { participants: [speaker.uid, ren.uid].sort() }),
    "a participant rewriting membership",
  );
  await expectDenied(
    ren.merge(`conversations/${conversationId}`, { participants: [ren.uid, speaker.uid].sort() }),
    "an outsider writing themselves into a conversation",
  );
  await expectDenied(ren.read(`conversations/${conversationId}`), "an outsider reading a conversation");
});

test("accepting twice is idempotent", async () => {
  const { speaker, learner } = await freshPair();
  const { invitation } = await invite(speaker, learner.uid);

  const first = await learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" });
  const second = await learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" });

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(first.conversationId, second.conversationId);
});

test("two simultaneous acceptances resolve to a single conversation", async () => {
  const { speaker, learner } = await freshPair();
  const { invitation } = await invite(speaker, learner.uid);

  const results = await Promise.all([
    learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" }),
    learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" }),
  ]);

  const changed = results.filter((result) => result.changed);
  assert.equal(changed.length, 1, "exactly one acceptance may take effect");
  assert.equal(results[0].conversationId, results[1].conversationId);

  const conversations = await speaker.readAll(
    "conversations", where("participants", "array-contains", speaker.uid),
  );
  assert.equal(conversations.size, 1, "a race must not produce two conversations");
});

test("declining ends the invitation and blocks a later acceptance", async () => {
  const { speaker, learner } = await freshPair();
  const { invitation } = await invite(speaker, learner.uid);

  const declined = await learner.call("respondToInvitation", { invitationId: invitation.id, action: "decline" });
  assert.equal(declined.invitation.status, "declined");
  assert.equal(declined.conversationId, null);

  // Repeating the decline is harmless.
  const again = await learner.call("respondToInvitation", { invitationId: invitation.id, action: "decline" });
  assert.equal(again.changed, false);

  const error = await expectFailure(
    learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" }),
    "failed-precondition",
  );
  assert.equal(error.details.reason, "invitation/not-pending");

  // No conversation was created.
  const conversations = await speaker.readAll("conversations", where("participants", "array-contains", speaker.uid));
  assert.equal(conversations.size, 0);
});

test("only the sender may cancel, and a cancelled invitation cannot be accepted", async () => {
  const { speaker, learner } = await freshPair();
  const { invitation } = await invite(speaker, learner.uid);

  const byRecipient = await expectFailure(
    learner.call("cancelInvitation", { invitationId: invitation.id }),
    "permission-denied",
  );
  assert.equal(byRecipient.details.reason, "invitation/not-sender");

  const cancelled = await speaker.call("cancelInvitation", { invitationId: invitation.id });
  assert.equal(cancelled.invitation.status, "cancelled");
  const repeat = await speaker.call("cancelInvitation", { invitationId: invitation.id });
  assert.equal(repeat.changed, false);

  const error = await expectFailure(
    learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" }),
    "failed-precondition",
  );
  assert.equal(error.details.reason, "invitation/not-pending");
});

test("cancelling releases the duplicate lock so a new invitation can be sent", async () => {
  const { speaker, learner } = await freshPair();
  const first = await invite(speaker, learner.uid, { requestKey: "one" });
  await speaker.call("cancelInvitation", { invitationId: first.invitation.id });

  const second = await invite(speaker, learner.uid, { requestKey: "two" });
  assert.equal(second.created, true);
  assert.equal(second.invitation.status, "pending");
  assert.notEqual(second.invitation.id, first.invitation.id);
});

test("blocking cancels the pending invitation in both directions", async () => {
  const { speaker, learner } = await freshPair();
  const { invitation } = await invite(speaker, learner.uid);

  // The recipient blocks the sender.
  const result = await learner.call("setBlock", { otherUid: speaker.uid, blocked: true });
  assert.equal(result.cancelledInvitations, 1);

  const stored = await admin().doc(`invitations/${invitation.id}`).get();
  assert.equal(stored.get("status"), "cancelled");
  assert.equal(stored.get("resolution").reason, "blocked");

  const error = await expectFailure(
    learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" }),
    "failed-precondition",
  );
  assert.equal(error.details.reason, "invitation/not-pending");
});

test("a block added after an invitation stops acceptance even without the cascade", async () => {
  const { speaker, learner } = await freshPair();
  const { invitation } = await invite(speaker, learner.uid);

  // Write the block directly with the Admin SDK, deliberately skipping setBlock's
  // cancellation cascade, to prove the acceptance path re-checks blocks by itself.
  await admin().doc(`blocks/${speaker.uid}/users/${learner.uid}`).set({ blockedUid: learner.uid });

  const error = await expectFailure(
    learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" }),
    "permission-denied",
  );
  assert.equal(error.details.reason, "target/unavailable");

  const stored = await admin().doc(`invitations/${invitation.id}`).get();
  assert.equal(stored.get("status"), "pending", "a refused acceptance must not change state");
  const conversations = await admin().collection("conversations")
    .where("participants", "array-contains", speaker.uid).get();
  assert.equal(conversations.size, 0);
});

test("withdrawing dating consent cancels pending dating invitations", async () => {
  const { speaker, learner } = await freshPair();
  const dating = await invite(speaker, learner.uid, { intent: "dating" });
  const platonic = await invite(speaker, learner.uid, { intent: "platonic" });

  const result = await learner.call("setDatingConsent", { enabled: false });
  assert.equal(result.dating.enabled, false);
  assert.equal(result.cancelledInvitations, 1);

  const datingDoc = await admin().doc(`invitations/${dating.invitation.id}`).get();
  assert.equal(datingDoc.get("status"), "cancelled");
  assert.equal(datingDoc.get("resolution").reason, "dating-consent-withdrawn");

  // The platonic invitation is untouched: withdrawing dating consent is not a block.
  const platonicDoc = await admin().doc(`invitations/${platonic.invitation.id}`).get();
  assert.equal(platonicDoc.get("status"), "pending");
  const accepted = await learner.call("respondToInvitation", { invitationId: platonic.invitation.id, action: "accept" });
  assert.equal(accepted.invitation.status, "accepted");
});

test("consent withdrawn after an invitation stops acceptance even without the cascade", async () => {
  const { speaker, learner } = await freshPair();
  const { invitation } = await invite(speaker, learner.uid, { intent: "dating" });

  // Flip the stored consent directly, skipping setDatingConsent's cascade.
  await admin().doc(`privateProfiles/${learner.uid}`).update({ "dating.enabled": false });

  const error = await expectFailure(
    learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" }),
    "failed-precondition",
  );
  assert.equal(error.details.reason, "dating/not-enabled");
});

test("a language change that breaks the exchange stops acceptance", async () => {
  const { speaker, learner } = await freshPair();
  const { invitation } = await invite(speaker, learner.uid);

  // The sender switches to practising Korean, so the agreed pair no longer exists.
  await speaker.call("upsertProfile", {
    ...CAST.alex, displayName: "Speaker changed", learns: [{ lang: "korean", level: "beginner" }],
  });

  const error = await expectFailure(
    learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" }),
    "failed-precondition",
  );
  assert.equal(error.details.reason, "language/not-reciprocal");
});

test("participants can list their own invitations and nobody else's", async () => {
  const { speaker, learner } = await freshPair();
  const { invitation } = await invite(speaker, learner.uid);

  const mine = await speaker.readAll("invitations", where("participants", "array-contains", speaker.uid));
  assert.ok(mine.docs.some((doc) => doc.id === invitation.id));

  const theirs = await learner.readAll("invitations", where("participants", "array-contains", learner.uid));
  assert.ok(theirs.docs.some((doc) => doc.id === invitation.id));

  // A query that is not scoped to the caller is refused outright.
  await expectDenied(ren.readAll("invitations"), "an unscoped invitation query");
  await expectDenied(
    ren.readAll("invitations", where("participants", "array-contains", speaker.uid)),
    "querying somebody else's invitations",
  );
});

test("responding to an invitation that does not exist is a clean not-found", async () => {
  const error = await expectFailure(
    aiko.call("respondToInvitation", { invitationId: "inv_does_not_exist", action: "accept" }),
    "not-found",
  );
  assert.equal(error.details.reason, "invitation/not-found");
});
