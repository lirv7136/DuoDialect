"use strict";

/**
 * "A match joined" notices: who is told when a profile appears or changes languages,
 * that nobody is told twice, and that blocks and cosmetic edits stay quiet.
 *
 * The profile trigger runs in the Functions emulator, so these tests write through the
 * real upsertProfile callable and wait for the stubbed deliveries to appear.
 */

process.env.DUODIALECT_PUSH_TRANSPORT = "stub";

const test = require("node:test");
const assert = require("node:assert/strict");
const { clearEmulators, shutdown, makeActor, admin, serverTimestamp, waitFor } = require("./helpers/env");
const { CAST } = require("./helpers/actors");
const { shouldNotify, noticeId } = require("../lib/matches");

let seq = 0;

async function member(label, profile) {
  const actor = await makeActor(`${label}${++seq}`);
  await actor.write(`pushTokens/${actor.uid}`, {
    token: `ExponentPushToken[${actor.uid}]`, platform: "ios", updatedAt: serverTimestamp(),
  });
  actor.name = `${label} ${seq}`;
  if (profile) await actor.call("upsertProfile", { ...profile, displayName: actor.name });
  return actor;
}

async function matchNoticesTo(uid) {
  const snap = await admin().collection("pushDeliveries")
    .where("toUid", "==", uid).where("data.type", "==", "match").get();
  return snap.docs.map((doc) => doc.data());
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 1200));

test.before(async () => { await clearEmulators(); });
test.after(async () => { await shutdown(); });

test("only a first usable profile or a language change fans out", () => {
  const usable = { displayName: "A", discoverable: true, speaks: [{ lang: "english", level: "native" }],
    learns: [{ lang: "japanese", level: "beginner" }], offers: ["english"], seeks: ["japanese"] };
  assert.equal(shouldNotify(null, usable), true);
  assert.equal(shouldNotify(usable, { ...usable, bio: "new bio", area: "Glebe" }), false);
  assert.equal(shouldNotify(usable, { ...usable, seeks: ["japanese", "korean"] }), true);
  assert.equal(shouldNotify(usable, { ...usable, discoverable: false }), false);
  assert.equal(shouldNotify({ ...usable, discoverable: false }, usable), true);
  assert.equal(shouldNotify(usable, null), false);
  assert.notEqual(noticeId("a", "b"), noticeId("b", "a"));
});

test("an existing member hears once when a reciprocal partner joins, and never about a stranger", async () => {
  const learner = await member("match-learner", CAST.aiko);   // Japanese fluent, learning English
  const stranger = await member("match-stranger", CAST.sam);  // Spanish, learning French
  await settle();
  const before = (await matchNoticesTo(learner.uid)).length;

  const speaker = await member("match-speaker", CAST.alex);   // English native, learning Japanese

  const notice = await waitFor(async () => {
    const all = await matchNoticesTo(learner.uid);
    return all.find((item) => item.data.otherUid === speaker.uid) || null;
  }, { label: "the match notice" });
  assert.equal(notice.title, "A new language partner");
  assert.equal(notice.body, `${speaker.name} speaks English and is learning Japanese. Take a look.`);
  assert.equal(notice.transport, "stub");

  // The newcomer is not told about the people who were already there, and the stranger hears nothing.
  await settle();
  assert.equal((await matchNoticesTo(speaker.uid)).length, 0);
  assert.equal((await matchNoticesTo(stranger.uid)).filter((item) => item.data.otherUid === speaker.uid).length, 0);
  assert.equal((await matchNoticesTo(learner.uid)).length, before + 1);

  // A cosmetic edit, then a language change, never repeat the notice to the same person.
  await speaker.call("upsertProfile", { ...CAST.alex, displayName: speaker.name, bio: "Edited bio" });
  await speaker.call("upsertProfile", {
    ...CAST.alex, displayName: speaker.name,
    learns: [{ lang: "japanese", level: "beginner" }, { lang: "korean", level: "beginner" }],
  });
  await settle();
  assert.equal((await matchNoticesTo(learner.uid)).filter((item) => item.data.otherUid === speaker.uid).length, 1);
  assert.equal((await admin().doc(`matchNotices/${noticeId(learner.uid, speaker.uid)}`).get()).exists, true);
});

test("a block in either direction keeps the notice quiet", async () => {
  const learner = await member("block-learner", CAST.aiko);
  const blocker = await member("block-blocker", CAST.aiko);
  const speaker = await member("block-speaker", null);
  await blocker.call("setBlock", { otherUid: speaker.uid, blocked: true });
  await speaker.call("upsertProfile", { ...CAST.alex, displayName: speaker.name });

  await waitFor(async () => {
    const all = await matchNoticesTo(learner.uid);
    return all.find((item) => item.data.otherUid === speaker.uid) || null;
  }, { label: "the unblocked learner's notice" });
  await settle();
  assert.equal((await matchNoticesTo(blocker.uid)).filter((item) => item.data.otherUid === speaker.uid).length, 0);
});
