"use strict";

/**
 * Matching authority: who is allowed to reach whom, and on what terms.
 *
 * Every assertion goes through a real callable. The language, age, consent and block
 * rules are never evaluated on a client in these tests.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clearEmulators, shutdown, makeActor, expectFailure, futureMeeting, birthDateForAge, admin,
} = require("./helpers/env");
const { castOf, CAST } = require("./helpers/actors");

let alex; let aiko; let ren; let mei; let sam;
let key = 0;
const nextKey = () => `key-${++key}`;

function invite(from, toUid, intent = "platonic", extra = {}) {
  return from.call("createInvitation", {
    toUid, intent, requestKey: nextKey(), note: "Coffee and a language swap?",
    meeting: futureMeeting(), ...extra,
  });
}

test.before(async () => {
  await clearEmulators();
  ({ alex, aiko, ren, mei, sam } = await castOf("alex", "aiko", "ren", "mei", "sam"));
});

test.after(async () => { await shutdown(); });

test("a reciprocal pair may invite each other", async () => {
  const result = await invite(alex, aiko.uid);
  assert.equal(result.created, true);
  assert.equal(result.invitation.status, "pending");
  assert.equal(result.invitation.intent, "platonic");
  assert.deepEqual(result.invitation.languages, { fromOffers: "english", toOffers: "japanese" });
});

test("a non-reciprocal pair is refused", async () => {
  // Alex offers English and seeks Japanese. Sam offers Spanish and seeks French.
  const error = await expectFailure(invite(alex, sam.uid), "failed-precondition");
  assert.equal(error.details.reason, "language/not-reciprocal");

  const reverse = await expectFailure(invite(sam, alex.uid), "failed-precondition");
  assert.equal(reverse.details.reason, "language/not-reciprocal");
});

test("a shared language at intermediate level is not enough to offer", async () => {
  // Mei lists Japanese at intermediate. Alex is practising Japanese, so the pair looks
  // plausible, but nobody may teach a language they are not native or fluent in.
  const error = await expectFailure(invite(alex, mei.uid), "failed-precondition");
  assert.equal(error.details.reason, "language/insufficient-fluency");

  const reverse = await expectFailure(invite(mei, alex.uid), "failed-precondition");
  assert.equal(reverse.details.reason, "language/insufficient-fluency");
});

test("a profile cannot be saved without a language it can actually offer", async () => {
  const actor = await makeActor("learner");
  const error = await expectFailure(actor.call("upsertProfile", {
    ...CAST.aiko,
    speaks: [{ lang: "japanese", level: "intermediate" }],
  }), "failed-precondition");
  assert.equal(error.details.reason, "language/insufficient-fluency");
});

test("a profile cannot both offer and practise the same language", async () => {
  const actor = await makeActor("contradiction");
  const error = await expectFailure(actor.call("upsertProfile", {
    ...CAST.alex,
    speaks: [{ lang: "english", level: "native" }],
    learns: [{ lang: "english", level: "beginner" }],
  }), "invalid-argument");
  assert.equal(error.details.reason, "language/offered-and-sought");
});

test("a self declared minor cannot hold an account at all", async () => {
  const actor = await makeActor("kai");
  const error = await expectFailure(
    actor.call("upsertProfile", CAST.kai),
    "failed-precondition",
    "A 16 year old must not be able to create a profile",
  );
  assert.equal(error.details.reason, "account/not-adult");
});

test("dating is refused when either side has it switched off", async () => {
  // Ren has dating off.
  const toRen = await expectFailure(invite(alex, ren.uid, "dating"), "failed-precondition");
  assert.equal(toRen.details.reason, "dating/not-enabled");

  // And the person with dating off cannot initiate a date either.
  const fromRen = await expectFailure(invite(ren, alex.uid, "dating"), "failed-precondition");
  assert.equal(fromRen.details.reason, "dating/not-enabled");
});

test("dating is refused when stated preferences do not match on both sides", async () => {
  const picky = await makeActor("picky");
  await picky.call("upsertProfile", {
    ...CAST.aiko,
    displayName: "Picky",
    birthDate: birthDateForAge(30),
    // Alex is 27, so Alex falls outside this range.
    dating: { enabled: true, genders: ["woman", "man", "nonbinary"], ageMin: 40, ageMax: 55 },
  });

  const outbound = await expectFailure(invite(alex, picky.uid, "dating"), "failed-precondition");
  assert.equal(outbound.details.reason, "dating/preferences-mismatch");
  const inbound = await expectFailure(invite(picky, alex.uid, "dating"), "failed-precondition");
  assert.equal(inbound.details.reason, "dating/preferences-mismatch");

  // The same pair is perfectly fine as platonic language partners.
  const platonic = await invite(alex, picky.uid, "platonic");
  assert.equal(platonic.invitation.status, "pending");
  await alex.call("cancelInvitation", { invitationId: platonic.invitation.id });
});

test("gender preferences must be satisfied in both directions", async () => {
  const oneWay = await makeActor("oneway");
  await oneWay.call("upsertProfile", {
    ...CAST.aiko,
    displayName: "Oneway",
    gender: "woman",
    birthDate: birthDateForAge(28),
    // Happy to date men only; Alex is nonbinary.
    dating: { enabled: true, genders: ["man"], ageMin: 18, ageMax: 60 },
  });
  const error = await expectFailure(invite(alex, oneWay.uid, "dating"), "failed-precondition");
  assert.equal(error.details.reason, "dating/preferences-mismatch");
});

test("the dating age gate is re-checked independently of the account gate", async () => {
  // Simulate a record that became ineligible after the account was created, by editing
  // the stored birth date with the Admin SDK. The dating gate must still refuse.
  const stale = await makeActor("stale");
  await stale.call("upsertProfile", {
    ...CAST.aiko, displayName: "Stale", birthDate: birthDateForAge(24),
  });
  await admin().doc(`privateProfiles/${stale.uid}`).update({ birthDate: birthDateForAge(15) });

  const error = await expectFailure(invite(alex, stale.uid, "dating"), "failed-precondition");
  assert.equal(error.details.reason, "dating/not-adult");

  // Platonic use of the same stale record is unaffected by the dating age gate.
  const platonic = await invite(alex, stale.uid, "platonic");
  assert.equal(platonic.invitation.status, "pending");
});

test("nobody can invite themselves", async () => {
  const error = await expectFailure(invite(alex, alex.uid), "invalid-argument");
  assert.equal(error.details.reason, "target/self");
});

test("an invitation cannot name a language outside the reciprocal set", async () => {
  const error = await expectFailure(
    invite(alex, aiko.uid, "platonic", { languages: { fromOffers: "klingon", toOffers: "japanese" } }),
    "failed-precondition",
  );
  assert.equal(error.details.reason, "language/not-offered");
});

test("discovery returns reciprocal partners only, and never private data", async () => {
  const result = await alex.call("discoverCandidates", { mode: "platonic", limit: 20 });
  const uids = result.candidates.map((candidate) => candidate.uid);

  assert.ok(uids.includes(aiko.uid), "Aiko offers Japanese and seeks English");
  assert.ok(uids.includes(ren.uid), "Ren offers Japanese and seeks English");
  assert.ok(!uids.includes(sam.uid), "Sam has no exchange with Alex");
  assert.ok(!uids.includes(mei.uid), "Mei is only intermediate in Japanese");
  assert.ok(!uids.includes(alex.uid), "Discovery never returns the caller");

  for (const candidate of result.candidates) {
    assert.equal(candidate.birthDate, undefined);
    assert.equal(candidate.age, undefined);
    assert.equal(candidate.gender, undefined);
    assert.equal(candidate.dating, undefined);
    assert.deepEqual(Object.keys(candidate).sort(), [
      "area", "availability", "bio", "displayName", "exchange", "fluencyAssurance",
      "interests", "offers", "seeks", "sharedAvailability", "uid",
    ]);
  }

  const aikoRow = result.candidates.find((candidate) => candidate.uid === aiko.uid);
  assert.deepEqual(aikoRow.exchange, { theyOffer: ["japanese"], youOffer: ["english"] });
  assert.deepEqual(aikoRow.sharedAvailability, ["Saturday morning", "Thursday evening"]);
});

test("dating discovery returns only mutually eligible people", async () => {
  const result = await alex.call("discoverCandidates", { mode: "dating", limit: 20 });
  const uids = result.candidates.map((candidate) => candidate.uid);

  assert.ok(uids.includes(aiko.uid), "Aiko is an adult with dating on and compatible preferences");
  assert.ok(!uids.includes(ren.uid), "Ren has dating switched off");
  assert.ok(!uids.includes(sam.uid), "Sam has no language exchange with Alex");

  // A member who is ineligible for dating is still not distinguishable from absent:
  // the response carries no reason and no preference data.
  for (const candidate of result.candidates) {
    assert.equal(candidate.dating, undefined);
  }
});

test("dating discovery requires the caller's own consent", async () => {
  const error = await expectFailure(
    ren.call("discoverCandidates", { mode: "dating" }),
    "failed-precondition",
  );
  assert.equal(error.details.reason, "dating/not-enabled");
});

test("discovery excludes blocked members in both directions", async () => {
  await alex.call("setBlock", { otherUid: ren.uid, blocked: true });

  const mine = await alex.call("discoverCandidates", { mode: "platonic", limit: 20 });
  assert.ok(!mine.candidates.some((candidate) => candidate.uid === ren.uid), "the blocker does not see the blocked member");

  const theirs = await ren.call("discoverCandidates", { mode: "platonic", limit: 20 });
  assert.ok(!theirs.candidates.some((candidate) => candidate.uid === alex.uid), "the blocked member does not see the blocker");

  await alex.call("setBlock", { otherUid: ren.uid, blocked: false });
  const restored = await alex.call("discoverCandidates", { mode: "platonic", limit: 20 });
  assert.ok(restored.candidates.some((candidate) => candidate.uid === ren.uid));
});

test("a blocked member cannot be invited in either direction", async () => {
  await aiko.call("setBlock", { otherUid: alex.uid, blocked: true });

  const fromBlocked = await expectFailure(invite(alex, aiko.uid), "permission-denied");
  assert.equal(fromBlocked.details.reason, "target/unavailable");
  const fromBlocker = await expectFailure(invite(aiko, alex.uid), "permission-denied");
  assert.equal(fromBlocker.details.reason, "target/unavailable");

  await aiko.call("setBlock", { otherUid: alex.uid, blocked: false });
});

function welshProfile(name, extra = {}) {
  return {
    displayName: name,
    speaks: [{ lang: "icelandic", level: "native" }],
    learns: [{ lang: "welsh", level: "beginner" }],
    birthDate: birthDateForAge(30),
    ...extra,
  };
}

test("a profile saves without a gender, but dating cannot switch on without one", async () => {
  const noGender = await makeActor("nogender");
  const saved = await noGender.call("upsertProfile", welshProfile("No Gender"));
  assert.equal(saved.account.gender, null);

  const error = await expectFailure(
    noGender.call("setDatingConsent", { enabled: true, genders: ["woman"], ageMin: 18, ageMax: 40 }),
    "failed-precondition",
  );
  assert.equal(error.details.reason, "dating/gender-required");
});

test("paging past a full page returns every eligible person exactly once", async () => {
  const seeker = await makeActor("pager");
  await seeker.call("upsertProfile", {
    displayName: "Pager",
    speaks: [{ lang: "welsh", level: "native" }],
    learns: [{ lang: "icelandic", level: "beginner" }],
    birthDate: birthDateForAge(30),
  });
  const partners = [];
  for (const name of ["Ari", "Bryn", "Dilys"]) {
    const actor = await makeActor(name.toLowerCase());
    await actor.call("upsertProfile", welshProfile(name));
    partners.push(actor.uid);
  }

  const seen = [];
  let cursor = null;
  for (let pages = 0; pages < 10; pages++) {
    const result = await seeker.call("discoverCandidates", { mode: "platonic", limit: 1, ...(cursor ? { cursor } : {}) });
    seen.push(...result.candidates.map((candidate) => candidate.uid));
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  const found = seen.filter((uid) => partners.includes(uid));
  assert.deepEqual([...found].sort(), [...partners].sort());
  assert.equal(new Set(seen).size, seen.length, "nobody is returned twice");
});
