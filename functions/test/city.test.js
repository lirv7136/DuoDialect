"use strict";

/**
 * Cities: a profile belongs to one, discovery never crosses one, and the apps from
 * before cities keep working. The backfill script is run against the emulator too, so
 * the deploy step that makes the new discovery query safe is exercised here.
 */

process.env.DUODIALECT_PUSH_TRANSPORT = "stub";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { FieldValue } = require("firebase-admin/firestore");
const {
  PROJECT_ID, clearEmulators, shutdown, makeActor, expectFailure, admin, serverTimestamp, waitFor,
} = require("./helpers/env");
const { CAST } = require("./helpers/actors");
const { CITIES, CITY_IDS, DEFAULT_CITY } = require("../lib/constants");

let seq = 0;

/** A member in a given city, created through the real callable. */
async function member(label, profile, city) {
  const actor = await makeActor(`${label}${++seq}`);
  actor.name = `${label} ${seq}`;
  if (profile) await actor.call("upsertProfile", { ...profile, displayName: actor.name, city });
  return actor;
}

/** What a 1.0.1 or 1.1.0 app left behind: a profile with no city field at all. */
async function forgetCity(actor) {
  await admin().doc(`profiles/${actor.uid}`).update({ city: FieldValue.delete() });
}

async function matchNoticesTo(uid) {
  const snap = await admin().collection("pushDeliveries")
    .where("toUid", "==", uid).where("data.type", "==", "match").get();
  return snap.docs.map((doc) => doc.data());
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 1200));

test.before(async () => { await clearEmulators(); });
test.after(async () => { await shutdown(); });

test("the allow list is well formed and the default is on it", () => {
  assert.ok(CITIES.length >= 11);
  assert.equal(new Set(CITY_IDS).size, CITY_IDS.length, "ids are unique");
  for (const city of CITIES) {
    assert.match(city.id, /^[a-z]+(-[a-z]+)*$/, `${city.id} is lower case with hyphens only inside`);
    assert.ok(city.name.trim().length > 0);
  }
  assert.ok(CITY_IDS.includes(DEFAULT_CITY));
  assert.equal(DEFAULT_CITY, "sydney");
});

test("a new profile without a city is Sydney (older apps still sign up); a bogus city is refused", async () => {
  const { city: _omitted, ...withoutCity } = CAST.alex;
  const nobody = await makeActor("city-none");
  const defaulted = await nobody.call("upsertProfile", withoutCity);
  assert.equal(defaulted.profile.city, "sydney");
  assert.equal((await admin().doc(`profiles/${nobody.uid}`).get()).get("city"), "sydney");

  const elsewhere = await makeActor("city-bogus");
  const bogus = await expectFailure(elsewhere.call("upsertProfile", { ...CAST.alex, city: "atlantis" }), "invalid-argument");
  assert.equal(bogus.details.reason, "profile/city-invalid");

  // Nothing was written for the refused one.
  assert.equal((await admin().doc(`profiles/${elsewhere.uid}`).get()).exists, false);

  // A valid city, in any case, is stored normalised and returned.
  const saved = await nobody.call("upsertProfile", { ...CAST.alex, city: " Melbourne " });
  assert.equal(saved.profile.city, "melbourne");
  assert.equal((await nobody.call("getMyAccount")).profile.city, "melbourne");
});

test("an app from before cities keeps working: omitted city means the stored one, or Sydney", async () => {
  const mover = await member("city-mover", CAST.alex, "melbourne");

  // A later save that omits the city keeps Melbourne; it does not fall back to Sydney.
  const kept = await mover.call("upsertProfile", { ...CAST.alex, displayName: mover.name, city: undefined });
  assert.equal(kept.profile.city, "melbourne");

  // A profile with no city at all (written before 1.1.2) reads as Sydney, and a save
  // from an old app that never sends a city stamps Sydney on it.
  const legacy = await member("city-legacy", CAST.aiko, "sydney");
  await forgetCity(legacy);
  assert.equal((await admin().doc(`profiles/${legacy.uid}`).get()).get("city"), undefined);
  assert.equal((await legacy.call("getMyAccount")).profile.city, "sydney");

  const { city: _omitted, ...oldAppPayload } = CAST.aiko;
  const resaved = await legacy.call("upsertProfile", { ...oldAppPayload, displayName: legacy.name });
  assert.equal(resaved.profile.city, "sydney");
  assert.equal((await admin().doc(`profiles/${legacy.uid}`).get()).get("city"), "sydney");
});

test("the backfill script stamps Sydney on profiles without a city, and only those", async () => {
  const one = await member("bf-one", CAST.alex, "sydney");
  const two = await member("bf-two", CAST.aiko, "sydney");
  const perth = await member("bf-perth", CAST.ren, "perth");
  await forgetCity(one);
  await forgetCity(two);

  const run = (...flags) => execFileSync(process.execPath, [
    path.join(__dirname, "..", "scripts", "backfill-city.js"), "--project", PROJECT_ID, ...flags,
  ], {
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080" },
    encoding: "utf8",
  });

  const dry = run("--dry-run");
  assert.match(dry, /2 without a city/);
  assert.match(dry, /nothing was written/i);
  assert.equal((await admin().doc(`profiles/${one.uid}`).get()).get("city"), undefined, "a dry run writes nothing");

  const real = run();
  assert.match(real, /2 without a city/);
  assert.equal((await admin().doc(`profiles/${one.uid}`).get()).get("city"), "sydney");
  assert.equal((await admin().doc(`profiles/${two.uid}`).get()).get("city"), "sydney");
  assert.equal((await admin().doc(`profiles/${perth.uid}`).get()).get("city"), "perth", "a profile with a city is untouched");

  // Running it again finds nothing to do.
  assert.match(run(), /0 without a city/);
});

test("near misses and the learning count stay inside the caller's city", async () => {
  // Melbourne has only Alex and Mei (Japanese at intermediate), so Discover is empty there.
  const melAlex = await member("nm-mel-alex", CAST.alex, "melbourne");
  const melMei = await member("nm-mel-mei", CAST.mei, "melbourne");
  const sydMei = await member("nm-syd-mei", CAST.mei, "sydney");
  const sydAiko = await member("nm-syd-aiko", CAST.aiko, "sydney");

  const result = await melAlex.call("discoverCandidates", { mode: "platonic", limit: 20 });
  assert.deepEqual(result.candidates, [], "Sydney's Aiko is not a Melbourne partner");
  assert.ok(result.nearMisses.some((item) => item.uid === melMei.uid), "Mei in Melbourne is a near miss");
  assert.equal(result.nearMisses.some((item) => item.uid === sydMei.uid), false, "Mei in Sydney is not");
  assert.equal(result.nearMisses.some((item) => item.uid === sydAiko.uid), false);
  assert.equal(result.learningYourLanguage, 1, "only Melbourne's Mei counts, not Sydney's Mei or Aiko");
});

test("discovery shows partners in the caller's city only", async () => {
  const melAiko = await member("disc-mel-aiko", CAST.aiko, "melbourne");
  const sydAlex = await member("disc-syd-alex", CAST.alex, "sydney");
  const melAlex = await member("disc-mel-alex", CAST.alex, "melbourne");

  const melbourne = await melAlex.call("discoverCandidates", { mode: "platonic", limit: 20 });
  const melUids = melbourne.candidates.map((candidate) => candidate.uid);
  assert.ok(melUids.includes(melAiko.uid), "Aiko in Melbourne is a partner for Alex in Melbourne");
  for (const candidate of melbourne.candidates) assert.equal(candidate.city, "melbourne");

  const sydney = await sydAlex.call("discoverCandidates", { mode: "platonic", limit: 20 });
  const sydUids = sydney.candidates.map((candidate) => candidate.uid);
  assert.equal(sydUids.includes(melAiko.uid), false, "Aiko in Melbourne is hidden from Sydney");
  for (const candidate of sydney.candidates) assert.equal(candidate.city, "sydney");

  // Moving city moves the person's whole Discover.
  await melAlex.call("upsertProfile", { ...CAST.alex, displayName: melAlex.name, city: "sydney" });
  const moved = await melAlex.call("discoverCandidates", { mode: "platonic", limit: 20 });
  const movedUids = moved.candidates.map((candidate) => candidate.uid);
  assert.equal(movedUids.includes(melAiko.uid), false);
  assert.deepEqual([...movedUids].sort(), [...sydUids].sort(), "the same Sydney partners as Alex in Sydney");
});

test("a match notice reaches members in the newcomer's city only", async () => {
  const sydLearner = await member("mn-syd-learner", CAST.aiko, "sydney");
  const melLearner = await member("mn-mel-learner", CAST.aiko, "melbourne");
  for (const actor of [sydLearner, melLearner]) {
    await actor.write(`pushTokens/${actor.uid}`, {
      token: `ExponentPushToken[${actor.uid}]`, platform: "ios", updatedAt: serverTimestamp(),
    });
  }
  await settle();

  const speaker = await member("mn-mel-speaker", CAST.alex, "melbourne");
  await waitFor(async () => {
    const all = await matchNoticesTo(melLearner.uid);
    return all.find((item) => item.data.otherUid === speaker.uid) || null;
  }, { label: "the Melbourne learner's notice" });
  await settle();
  assert.equal((await matchNoticesTo(sydLearner.uid)).filter((item) => item.data.otherUid === speaker.uid).length, 0,
    "the Sydney learner hears nothing about a Melbourne newcomer");

  // A newcomer with no city (a profile from before the backfill) notifies nobody.
  const ghost = await member("mn-ghost", null);
  await admin().doc(`profiles/${ghost.uid}`).set({
    uid: ghost.uid, displayName: ghost.name, discoverable: true,
    speaks: CAST.alex.speaks, learns: CAST.alex.learns, offers: ["english"], seeks: ["japanese"],
  });
  await settle();
  for (const learner of [sydLearner, melLearner]) {
    assert.equal((await matchNoticesTo(learner.uid)).filter((item) => item.data.otherUid === ghost.uid).length, 0);
  }
});
