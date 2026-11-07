"use strict";

/**
 * Early contact details and per member daily limits.
 *
 * Contact details (links, email addresses, phone numbers) are refused in what a stranger
 * sees before anyone has agreed to anything: a profile's name, bio and neighbourhood, and
 * an invitation's note. In chat they are allowed, with a warning for the sender until the
 * pair has a confirmed meetup. The limits are counted per UTC day in rateLimits/{uid},
 * inside the same transaction as the write they allow; tests seed the counter directly
 * rather than sending hundreds of messages.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { clearEmulators, shutdown, makeActor, expectFailure, futureMeeting, admin } = require("./helpers/env");
const { CAST, memberOf } = require("./helpers/actors");
const { RATE_LIMITS } = require("../lib/constants");

const today = () => new Date().toISOString().slice(0, 10);
const seedCounter = (uid, day, counts) => admin().doc(`rateLimits/${uid}`).set({ uid, day, counts });

function invite(toUid, requestKey, extra = {}) {
  return { toUid, intent: "platonic", requestKey, note: "Coffee?", meeting: futureMeeting(), ...extra };
}

async function acceptedPair(label, city) {
  const speaker = await memberOf("alex", `${label}-s`, { city });
  const learner = await memberOf("aiko", `${label}-l`, { city });
  const { invitation } = await speaker.call("createInvitation", invite(learner.uid, `${label}-plan`));
  const { conversationId } = await learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" });
  return { speaker, learner, conversationId };
}

test.before(async () => { await clearEmulators(); });
test.after(async () => { await shutdown(); });

test("a profile's name, bio and neighbourhood may not carry contact details", async () => {
  const actor = await makeActor("cd-profile");
  const spec = { ...CAST.alex, city: "perth" };
  for (const [field, value] of [
    ["bio", "Find me at instagram.com/alex"],
    ["displayName", "Alex 0412345678"],
    ["area", "alex@example.com"],
  ]) {
    const error = await expectFailure(actor.call("upsertProfile", { ...spec, [field]: value }), "invalid-argument", field);
    assert.equal(error.details.reason, "profile/contact-details");
    assert.equal(error.details.field, field);
    assert.match(error.message, /email addresses/);
  }
  assert.equal((await admin().doc(`profiles/${actor.uid}`).get()).exists, false, "nothing was saved");

  await actor.call("upsertProfile", spec);

  // A bio saved before the rule keeps working until its owner edits it, so a save that
  // only changes something else (as an older app's would) is never refused.
  await admin().doc(`profiles/${actor.uid}`).set({ bio: "Old bio, www.example.com" }, { merge: true });
  const moved = await actor.call("upsertProfile", { ...spec, bio: "Old bio, www.example.com", area: "Newtown" });
  assert.equal(moved.profile.area, "Newtown");
  const edited = await expectFailure(actor.call("upsertProfile", { ...spec, bio: "New bio, www.example.com" }), "invalid-argument");
  assert.equal(edited.details.field, "bio");
});

test("an invitation's note may not carry contact details", async () => {
  const speaker = await memberOf("alex", "note-s", { city: "melbourne" });
  const learner = await memberOf("aiko", "note-l", { city: "melbourne" });
  for (const note of ["Text me on 0412 345 678", "aiko@example.com is me", "wa.me/61412345678"]) {
    const error = await expectFailure(speaker.call("createInvitation", invite(learner.uid, `note-${note.length}`, { note })),
      "invalid-argument", note);
    assert.equal(error.details.reason, "invitation/contact-details");
    assert.match(error.message, /once you’ve agreed to meet/);
  }
  const none = await admin().collection("invitations").where("participants", "array-contains", speaker.uid).get();
  assert.equal(none.size, 0, "no invitation was created");
  const { created } = await speaker.call("createInvitation", invite(learner.uid, "note-clean", { note: "Coffee at 18:30 on Thursday?" }));
  assert.equal(created, true);
});

test("chat allows contact details, with a warning for the sender until the pair has a confirmed meetup", async () => {
  const { speaker, learner, conversationId } = await acceptedPair("warn", "brisbane");

  const plain = await speaker.call("sendMessage", { conversationId, text: "See you Thursday", clientMessageId: "w1" });
  assert.equal(plain.created, true);
  assert.equal(plain.contactWarning, false);

  const warned = await speaker.call("sendMessage", { conversationId, text: "My number is 0412 345 678", clientMessageId: "w2" });
  assert.equal(warned.created, true, "a warning, not a refusal");
  assert.equal(warned.contactWarning, true);
  const stored = await admin().doc(`conversations/${conversationId}/messages/${warned.messageId}`).get();
  assert.equal(stored.get("text"), "My number is 0412 345 678");
  // A retry of the same message gets the same answer.
  const retry = await speaker.call("sendMessage", { conversationId, text: "My number is 0412 345 678", clientMessageId: "w2" });
  assert.equal(retry.created, false);
  assert.equal(retry.contactWarning, true);

  // Once both said a meetup happened (the record answerCheckIn writes), no more warning.
  await admin().doc("confirmedMeetups/warn-meetup").set({
    invitationId: "warn-plan", participants: [speaker.uid, learner.uid].sort(), localDate: "2026-01-01",
  });
  const later = await learner.call("sendMessage", { conversationId, text: "Mine is aiko@example.com", clientMessageId: "w3" });
  assert.equal(later.contactWarning, false);
});

test("messages: the daily limit refuses the next one with a reason, and retries and yesterday never count", async () => {
  const { speaker, conversationId } = await acceptedPair("rl-msg", "adelaide");
  const day = today();
  await seedCounter(speaker.uid, day, { sendMessage: RATE_LIMITS.sendMessage - 1, createInvitation: 3 });

  const last = await speaker.call("sendMessage", { conversationId, text: "One more", clientMessageId: "rl-last" });
  assert.equal(last.created, true);
  const counter = (await admin().doc(`rateLimits/${speaker.uid}`).get()).data();
  assert.equal(counter.day, day);
  assert.deepEqual(counter.counts, { sendMessage: RATE_LIMITS.sendMessage, createInvitation: 3 });

  const refused = await expectFailure(
    speaker.call("sendMessage", { conversationId, text: "And another", clientMessageId: "rl-over" }), "resource-exhausted");
  assert.equal(refused.details.reason, "rate-limit/messages");
  assert.equal(refused.details.limit, RATE_LIMITS.sendMessage);
  assert.ok(Date.parse(refused.details.resetsAt) > Date.now());
  assert.match(refused.message, /tomorrow/);
  const thread = await admin().collection(`conversations/${conversationId}/messages`).get();
  assert.ok(!thread.docs.some((doc) => doc.get("text") === "And another"), "the refused message was not written");

  // A retry of a message that already landed is answered, not refused or counted.
  const retry = await speaker.call("sendMessage", { conversationId, text: "One more", clientMessageId: "rl-last" });
  assert.equal(retry.created, false);
  assert.equal((await admin().doc(`rateLimits/${speaker.uid}`).get()).get("counts.sendMessage"), RATE_LIMITS.sendMessage);

  // Yesterday's count does not carry over.
  await seedCounter(speaker.uid, "2000-01-01", { sendMessage: 9999, reportUser: 9999 });
  const fresh = await speaker.call("sendMessage", { conversationId, text: "New day", clientMessageId: "rl-fresh" });
  assert.equal(fresh.created, true);
  const reset = (await admin().doc(`rateLimits/${speaker.uid}`).get()).data();
  assert.equal(reset.day, day);
  assert.deepEqual(reset.counts, { sendMessage: 1 });
});

test("invitations: the daily limit refuses a new one, but never a retry of one already created", async () => {
  const speaker = await memberOf("alex", "rl-inv-s", { city: "hobart" });
  const first = await memberOf("aiko", "rl-inv-a", { city: "hobart" });
  const second = await memberOf("aiko", "rl-inv-b", { city: "hobart" });
  await seedCounter(speaker.uid, today(), { createInvitation: RATE_LIMITS.createInvitation - 1 });

  const made = await speaker.call("createInvitation", invite(first.uid, "rl-inv-1"));
  assert.equal(made.created, true);
  const retry = await speaker.call("createInvitation", invite(first.uid, "rl-inv-1"));
  assert.equal(retry.created, false, "a retry of the same send is answered");

  const refused = await expectFailure(speaker.call("createInvitation", invite(second.uid, "rl-inv-2")), "resource-exhausted");
  assert.equal(refused.details.reason, "rate-limit/invitations");
  assert.equal(refused.details.limit, RATE_LIMITS.createInvitation);
  const toSecond = await admin().collection("invitations").where("toUid", "==", second.uid).get();
  assert.equal(toSecond.size, 0);
  assert.equal((await admin().doc(`rateLimits/${speaker.uid}`).get()).get("counts.createInvitation"), RATE_LIMITS.createInvitation);
});

test("reports: the daily limit keeps one account from flooding the queue", async () => {
  const reporter = await memberOf("aiko", "rl-rep", { city: "darwin" });
  const subject = await memberOf("alex", "rl-rep-subject", { city: "darwin" });
  await seedCounter(reporter.uid, today(), { reportUser: RATE_LIMITS.reportUser - 1 });

  const filed = await reporter.call("reportUser", { reportedUid: subject.uid, reason: "spam" });
  assert.equal(filed.status, "received");
  assert.ok((await admin().doc(`reports/${filed.reportId}`).get()).exists);

  const refused = await expectFailure(reporter.call("reportUser", { reportedUid: subject.uid, reason: "harassment" }),
    "resource-exhausted");
  assert.equal(refused.details.reason, "rate-limit/reports");
  const filedBy = await admin().collection("reports").where("reporterUid", "==", reporter.uid).get();
  assert.equal(filedBy.size, 1);
});
