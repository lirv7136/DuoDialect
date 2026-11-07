"use strict";

/**
 * Trust, phase 1: verification (the server owned record, the moderator callable and its
 * audit, the badge, the verified only filter, verification before the first meetup, the
 * phase 2 hook), the email gate, and that the new collections are closed to clients.
 *
 * Every flag lives in config/trust and defaults off; tests turn one on with the Admin SDK
 * and always turn it off again. Each test keeps to a city of its own, because discovery
 * never crosses a city. Photo rules are in photo-trust.test.js; contact details and rate
 * limits in limits.test.js.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clearEmulators, shutdown, makeActor, anonymousActor, expectFailure, expectDenied, futureMeeting, admin, adminAuth,
} = require("./helpers/env");
const { CAST, memberOf } = require("./helpers/actors");
const { applyVerificationResult } = require("../lib/verification");

let moderator; let stranger;

async function makeModerator() {
  const actor = await makeActor("trustmod");
  await adminAuth().setCustomUserClaims(actor.uid, { moderator: true });
  await actor.refreshToken();
  return actor;
}

const setTrust = (flags) => admin().doc("config/trust").set(flags);
const clearTrust = () => admin().doc("config/trust").delete();

function invite(toUid, requestKey) {
  return { toUid, intent: "platonic", requestKey, note: "Coffee?", meeting: futureMeeting() };
}

const uidsOf = (result) => result.candidates.map((candidate) => candidate.uid).sort();

test.before(async () => {
  await clearEmulators();
  moderator = await makeModerator();
  stranger = anonymousActor();
});

test.after(async () => {
  await clearTrust().catch(() => {});
  await shutdown();
});

test("verification records, trust flags and rate limit counters are closed to every client, moderators included", async () => {
  const member = await memberOf("alex", "closed", { city: "perth" });
  await admin().doc(`verifications/${member.uid}`).set({ uid: member.uid, status: "none" });
  await setTrust({ requireVerification: false });
  await admin().doc(`rateLimits/${member.uid}`).set({ uid: member.uid, day: "2026-01-01", counts: {} });

  for (const actor of [member, moderator]) {
    await expectDenied(actor.read(`verifications/${member.uid}`), "reading a verification record");
    await expectDenied(actor.read("config/trust"), "reading the trust flags");
    await expectDenied(actor.read(`rateLimits/${member.uid}`), "reading a rate limit counter");
    await expectDenied(actor.write(`verifications/${actor.uid}`, { status: "verified" }), "writing a verification record");
    await expectDenied(actor.write("config/trust", { requireVerification: false }), "writing the trust flags");
    await expectDenied(actor.write(`rateLimits/${actor.uid}`, { day: "2000-01-01" }), "resetting a counter");
  }
  await expectDenied(stranger.read("config/trust"), "anonymous read of the trust flags");

  // The badge cannot be granted from the client either: the profile is server written, and
  // upsertProfile ignores a `verified` field in the request.
  await expectDenied(member.merge(`profiles/${member.uid}`, { verified: true }), "writing one's own badge");
  const saved = await member.call("upsertProfile", { ...member.spec, verified: true });
  assert.equal(saved.profile.verified, false);
  assert.equal((await admin().doc(`profiles/${member.uid}`).get()).get("verified"), false);
  await clearTrust();
});

test("by default nobody is verified, nothing is restricted and plans work as before", async () => {
  await clearTrust();
  const speaker = await memberOf("alex", "def-speaker", { city: "melbourne" });
  const learner = await memberOf("aiko", "def-learner", { city: "melbourne" });

  const mine = await speaker.call("getMyAccount", {});
  assert.equal(mine.profile.verified, false);
  assert.deepEqual(mine.account.discovery, { verifiedOnly: false });
  assert.deepEqual(mine.account.trust.verification, { status: "none", method: null, verifiedAt: null, photoChangedAt: null });
  assert.deepEqual(mine.account.trust.requirements, { verificationToMeet: false, emailConfirmation: false });
  assert.deepEqual(mine.account.trust.restrictions, []);
  assert.equal(mine.account.trust.emailConfirmed, false, "a fresh password account has not confirmed its email");

  const { candidates } = await learner.call("discoverCandidates", {});
  const found = candidates.find((candidate) => candidate.uid === speaker.uid);
  assert.ok(found, "the speaker is discoverable");
  assert.equal(found.verified, false);

  const { invitation } = await speaker.call("createInvitation", invite(learner.uid, "def-1"));
  const accepted = await learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" });
  assert.equal(accepted.changed, true);
});

test("only moderators set verification by hand, by uid or email, and every change is audited", async () => {
  const subject = await memberOf("alex", "vsubject", { city: "perth" });

  const member = await expectFailure(subject.call("setVerification", { uid: subject.uid, status: "verified" }), "permission-denied");
  assert.equal(member.details.reason, "moderation/not-an-operator");
  await expectFailure(stranger.call("setVerification", { uid: subject.uid, status: "verified" }), "unauthenticated");

  await expectFailure(moderator.call("setVerification", { uid: subject.uid, status: "pending" }), "invalid-argument",
    "pending belongs to the automated check");
  await expectFailure(moderator.call("setVerification", { status: "verified" }), "invalid-argument", "nobody named");
  const missing = await expectFailure(moderator.call("setVerification", { uid: "nobody-at-all", status: "verified" }), "not-found");
  assert.equal(missing.details.reason, "verification/member-not-found");
  const missingEmail = await expectFailure(
    moderator.call("setVerification", { email: "nobody@example.test", status: "verified" }), "not-found");
  assert.equal(missingEmail.details.reason, "verification/member-not-found");

  const verified = await moderator.call("setVerification", { uid: subject.uid, status: "verified", note: "Seen on a video call." });
  assert.deepEqual(verified, { uid: subject.uid, status: "verified", previousStatus: "none", verified: true, ageReview: false });
  assert.equal((await admin().doc(`profiles/${subject.uid}`).get()).get("verified"), true);
  const record = (await admin().doc(`verifications/${subject.uid}`).get()).data();
  assert.equal(record.status, "verified");
  assert.equal(record.method, "moderator");
  assert.equal(record.reviewedBy, moderator.uid);
  assert.equal(record.attempts, 0, "a moderator's decision is not an automated attempt");
  assert.ok(record.verifiedAt, "verifiedAt is stamped");

  const mine = await subject.call("getMyAccount", {});
  assert.equal(mine.profile.verified, true);
  assert.equal(mine.account.trust.verified, true);
  assert.equal(mine.account.trust.verification.status, "verified");
  assert.equal(mine.account.trust.verification.method, "moderator");
  assert.ok(Date.parse(mine.account.trust.verification.verifiedAt));

  const review = await moderator.call("setVerification", { email: subject.email, status: "review", ageReview: true });
  assert.deepEqual(review, { uid: subject.uid, status: "review", previousStatus: "verified", verified: false, ageReview: true });
  assert.equal((await admin().doc(`profiles/${subject.uid}`).get()).get("verified"), false);
  assert.equal((await admin().doc(`verifications/${subject.uid}`).get()).get("verifiedAt"), null);

  const failed = await moderator.call("setVerification", { uid: subject.uid, status: "failed" });
  assert.equal(failed.previousStatus, "review");
  assert.equal(failed.ageReview, true, "the age flag stays until a moderator clears it");

  const audit = await admin().collection("moderationActions")
    .where("subjectUid", "==", subject.uid).where("action", "==", "set-verification").get();
  const entries = audit.docs.map((doc) => doc.data());
  assert.equal(entries.length, 3);
  for (const entry of entries) assert.equal(entry.moderatorUid, moderator.uid);
  const first = entries.find((entry) => entry.status === "verified");
  assert.equal(first.previousStatus, "none");
  assert.equal(first.note, "Seen on a video call.");
  assert.equal(entries.find((entry) => entry.status === "review").ageReview, true);
});

test("the badge shows in discovery and on the profile, and verified only shows only verified members", async () => {
  const learner = await memberOf("aiko", "vo-learner", { city: "adelaide" });
  const verifiedSpeaker = await memberOf("alex", "vo-verified", { city: "adelaide" });
  const plainSpeaker = await memberOf("alex", "vo-plain", { city: "adelaide" });
  await moderator.call("setVerification", { uid: verifiedSpeaker.uid, status: "verified" });

  let result = await learner.call("discoverCandidates", {});
  assert.deepEqual(uidsOf(result), [verifiedSpeaker.uid, plainSpeaker.uid].sort());
  assert.equal(result.candidates.find((c) => c.uid === verifiedSpeaker.uid).verified, true);
  assert.equal(result.candidates.find((c) => c.uid === plainSpeaker.uid).verified, false);
  // The person screen reads the public profile, which carries it too.
  assert.equal((await learner.read(`profiles/${verifiedSpeaker.uid}`)).get("verified"), true);

  assert.deepEqual(await learner.call("setDiscoveryPreferences", { verifiedOnly: true }), { discovery: { verifiedOnly: true } });
  assert.deepEqual((await learner.call("getMyAccount", {})).account.discovery, { verifiedOnly: true });
  result = await learner.call("discoverCandidates", {});
  assert.deepEqual(uidsOf(result), [verifiedSpeaker.uid]);

  // Saving the profile leaves the preference alone.
  await learner.call("upsertProfile", { ...learner.spec, bio: "Updated" });
  assert.deepEqual(uidsOf(await learner.call("discoverCandidates", {})), [verifiedSpeaker.uid]);

  await learner.call("setDiscoveryPreferences", { verifiedOnly: false });
  assert.deepEqual(uidsOf(await learner.call("discoverCandidates", {})), [verifiedSpeaker.uid, plainSpeaker.uid].sort());

  await expectFailure(learner.call("setDiscoveryPreferences", { verifiedOnly: "yes" }), "invalid-argument");
  await expectFailure(learner.call("setDiscoveryPreferences", {}), "invalid-argument");
  const newcomer = await makeActor("vo-newcomer");
  const early = await expectFailure(newcomer.call("setDiscoveryPreferences", { verifiedOnly: true }), "failed-precondition");
  assert.equal(early.details.reason, "profile/incomplete");
  await expectFailure(stranger.call("setDiscoveryPreferences", { verifiedOnly: true }), "unauthenticated");
});

test("requireVerification: unverified members stay discoverable, browse and chat, but cannot create or accept a plan", async () => {
  const speaker = await memberOf("alex", "rv-speaker", { city: "brisbane" });
  const learner = await memberOf("aiko", "rv-learner", { city: "brisbane" });
  const third = await memberOf("aiko", "rv-third", { city: "brisbane" });
  // From before the flag: one accepted plan with a conversation, and one still pending.
  const before = await speaker.call("createInvitation", invite(learner.uid, "rv-before"));
  const accepted = await learner.call("respondToInvitation", { invitationId: before.invitation.id, action: "accept" });
  const pending = await learner.call("createInvitation", invite(speaker.uid, "rv-pending"));

  await setTrust({ requireVerification: true });
  try {
    // Still discoverable, and still able to browse.
    assert.ok(uidsOf(await learner.call("discoverCandidates", {})).includes(speaker.uid));
    await speaker.call("discoverCandidates", {});
    // Still able to chat where they already have a conversation.
    const sent = await speaker.call("sendMessage", {
      conversationId: accepted.conversationId, text: "Still on for Thursday?", clientMessageId: "rv-chat",
    });
    assert.equal(sent.created, true);

    // But not to start a plan, or to accept one.
    const create = await expectFailure(speaker.call("createInvitation", invite(third.uid, "rv-new")), "failed-precondition");
    assert.equal(create.details.reason, "verification/required-to-meet");
    const accept = await expectFailure(
      speaker.call("respondToInvitation", { invitationId: pending.invitation.id, action: "accept" }), "failed-precondition");
    assert.equal(accept.details.reason, "verification/required-to-meet");
    assert.equal((await admin().doc(`invitations/${pending.invitation.id}`).get()).get("status"), "pending");

    const account = await speaker.call("getMyAccount", {});
    assert.deepEqual(account.account.trust.restrictions, ["verification/required-to-meet"]);
    assert.equal(account.account.trust.requirements.verificationToMeet, true);

    // A verified member may invite someone who is not verified yet; they are asked when they accept.
    await moderator.call("setVerification", { uid: third.uid, status: "verified" });
    const fromVerified = await third.call("createInvitation", invite(speaker.uid, "rv-from-verified"));
    const notYet = await expectFailure(
      speaker.call("respondToInvitation", { invitationId: fromVerified.invitation.id, action: "accept" }), "failed-precondition");
    assert.equal(notYet.details.reason, "verification/required-to-meet");

    // Declining is always allowed.
    const declined = await speaker.call("respondToInvitation", { invitationId: pending.invitation.id, action: "decline" });
    assert.equal(declined.changed, true);

    // Once verified, plans work again.
    await moderator.call("setVerification", { uid: speaker.uid, status: "verified" });
    const ok = await speaker.call("respondToInvitation", { invitationId: fromVerified.invitation.id, action: "accept" });
    assert.equal(ok.changed, true);
    assert.deepEqual((await speaker.call("getMyAccount", {})).account.trust.restrictions, []);

    // The plan accepted before the flag is untouched.
    assert.equal((await admin().doc(`invitations/${before.invitation.id}`).get()).get("status"), "accepted");
  } finally {
    await clearTrust();
  }
});

test("a verification made before the profile exists shows once the profile is created", async () => {
  const early = await makeActor("early-bird");
  const result = await moderator.call("setVerification", { uid: early.uid, status: "verified" });
  assert.equal(result.verified, true);
  assert.equal((await admin().doc(`profiles/${early.uid}`).get()).exists, false);

  const saved = await early.call("upsertProfile", { ...CAST.alex, displayName: "Early", city: "hobart" });
  assert.equal(saved.profile.verified, true);
  assert.equal((await admin().doc(`profiles/${early.uid}`).get()).get("verified"), true);
});

test("phase 2 hook: a selfie check's result sets the status, counts the attempt and keeps no selfie", async () => {
  const subject = await memberOf("alex", "phase2", { city: "darwin" });

  const started = await applyVerificationResult(admin(), subject.uid, { outcome: "pending" });
  assert.equal(started.status, "pending");
  assert.equal(started.attempts, 0);

  const passed = await applyVerificationResult(admin(), subject.uid, {
    outcome: "pass", liveness: true, faceMatch: true, ageEstimate: 29, provider: "test", providerRef: "chk_1",
    selfie: "data:image/jpeg;base64,AAAA",
  });
  assert.equal(passed.status, "verified");
  assert.equal(passed.attempts, 1);
  assert.equal(passed.ageReview, false);
  assert.equal((await admin().doc(`profiles/${subject.uid}`).get()).get("verified"), true);
  const record = (await admin().doc(`verifications/${subject.uid}`).get()).data();
  assert.equal(record.method, "selfie");
  assert.deepEqual(record.lastResult, {
    outcome: "pass", liveness: true, faceMatch: true, ageEstimate: 29, provider: "test", providerRef: "chk_1",
  });
  assert.doesNotMatch(JSON.stringify(record), /base64/, "the selfie itself is never stored");

  // Under 18 by estimate is never verified automatically.
  const young = await applyVerificationResult(admin(), subject.uid, { outcome: "pass", ageEstimate: 15 });
  assert.equal(young.status, "review");
  assert.equal(young.ageReview, true);
  assert.equal(young.attempts, 2);
  assert.equal((await admin().doc(`profiles/${subject.uid}`).get()).get("verified"), false);

  const failed = await applyVerificationResult(admin(), subject.uid, { outcome: "fail" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.attempts, 3);

  await assert.rejects(applyVerificationResult(admin(), subject.uid, { outcome: "maybe" }), /outcome/);
  await assert.rejects(applyVerificationResult(admin(), subject.uid, { outcome: "pass", liveness: "yes" }), /liveness/);
});

test("requireEmailVerification hides unconfirmed password accounts from discovery until they confirm", async () => {
  const learner = await memberOf("aiko", "em-learner", { city: "canberra" });
  const unconfirmed = await memberOf("alex", "em-unconfirmed", { city: "canberra" });
  const confirmed = await memberOf("alex", "em-confirmed", { city: "canberra" });
  await adminAuth().updateUser(confirmed.uid, { emailVerified: true });

  assert.deepEqual(uidsOf(await learner.call("discoverCandidates", {})), [unconfirmed.uid, confirmed.uid].sort(),
    "the flag is off, so nobody is hidden");

  await setTrust({ requireEmailVerification: true });
  try {
    assert.deepEqual(uidsOf(await learner.call("discoverCandidates", {})), [confirmed.uid]);
    const account = await unconfirmed.call("getMyAccount", {});
    assert.equal(account.account.trust.emailConfirmed, false);
    assert.deepEqual(account.account.trust.restrictions, ["trust/email-unconfirmed"]);
    assert.equal(account.account.trust.requirements.emailConfirmation, true);

    // Confirming brings them straight back: the server reads the auth record, so their
    // old token, minted before they clicked the link, does not matter.
    await adminAuth().updateUser(unconfirmed.uid, { emailVerified: true });
    assert.deepEqual(uidsOf(await learner.call("discoverCandidates", {})), [unconfirmed.uid, confirmed.uid].sort());
    const after = await unconfirmed.call("getMyAccount", {});
    assert.equal(after.account.trust.emailConfirmed, true);
    assert.deepEqual(after.account.trust.restrictions, []);
  } finally {
    await clearTrust();
  }
});
