"use strict";

/**
 * Cities: a profile belongs to one from the world list, discovery never crosses one, and
 * the apps from before cities and before the world list keep working. The backfill script
 * is run against the emulator too, so the deploy step that makes the discovery query safe
 * is exercised here.
 */

process.env.DUODIALECT_PUSH_TRANSPORT = "stub";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { FieldValue } = require("firebase-admin/firestore");
const {
  PROJECT_ID, clearEmulators, shutdown, makeActor, expectFailure, admin, serverTimestamp, waitFor, futureMeeting,
} = require("./helpers/env");
const { CAST } = require("./helpers/actors");
const { CITIES, CITY_IDS, LEGACY_CITY_IDS, DEFAULT_CITY, isCityId, cityLabel } = require("../lib/constants");
const { reminderTimeFor } = require("../lib/reminders");
const { checkInTimeFor } = require("../lib/checkins");

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

test("the world list is well formed, keeps the original eleven ids, and the default is on it", () => {
  assert.ok(CITIES.length > 5000, "every city of 100,000 people and every capital");
  assert.equal(new Set(CITY_IDS).size, CITY_IDS.length, "ids are unique");
  for (const city of CITIES) {
    assert.match(city.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${city.id} is lower case with hyphens only inside`);
    assert.ok(city.name.trim().length > 0, city.id);
    assert.match(city.country, /^[A-Z]{2}$/, city.id);
    assert.ok(city.countryName, city.id);
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en", { timeZone: city.timeZone }), `${city.id} has a real time zone`);
  }
  // Production profiles store these, and the 1.1.2 app sends them.
  const zones = {
    sydney: "Australia/Sydney", melbourne: "Australia/Melbourne", brisbane: "Australia/Brisbane", perth: "Australia/Perth",
    adelaide: "Australia/Adelaide", canberra: "Australia/Sydney", hobart: "Australia/Hobart", darwin: "Australia/Darwin",
    "gold-coast": "Australia/Brisbane", auckland: "Pacific/Auckland", wellington: "Pacific/Auckland",
  };
  assert.deepEqual([...LEGACY_CITY_IDS].sort(), Object.keys(zones).sort());
  for (const id of LEGACY_CITY_IDS) {
    const city = CITIES.find((item) => item.id === id);
    assert.ok(city, `${id} is still on the list`);
    assert.equal(city.timeZone, zones[id], id);
    assert.ok(["AU", "NZ"].includes(city.country), id);
  }
  assert.equal(cityLabel("sydney"), "Sydney, Australia");
  assert.equal(cityLabel("gold-coast"), "Gold Coast, Australia");
  assert.equal(cityLabel("london-gb"), "London, United Kingdom");
  assert.equal(cityLabel("springfield-us-il"), "Springfield, Illinois, United States");
  assert.equal(isCityId("atlantis"), false);
  assert.equal(isCityId("London-GB"), false, "ids are matched lower case; upsertProfile lower cases first");
  assert.ok(isCityId(DEFAULT_CITY));
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

  // Any city on the world list is accepted, not only the original eleven.
  const london = await nobody.call("upsertProfile", { ...CAST.alex, city: " London-GB ", cityList: "world" });
  assert.equal(london.profile.city, "london-gb");
  assert.equal((await nobody.call("getMyAccount")).profile.city, "london-gb");
  const springfield = await nobody.call("upsertProfile", { ...CAST.alex, city: "springfield-us-il", cityList: "world" });
  assert.equal(springfield.profile.city, "springfield-us-il");

  // A name is not an id, and nothing changes when one is refused.
  const named = await expectFailure(nobody.call("upsertProfile", { ...CAST.alex, city: "London", cityList: "world" }), "invalid-argument");
  assert.equal(named.details.reason, "profile/city-invalid");
  assert.equal((await nobody.call("getMyAccount")).profile.city, "springfield-us-il");
});

test("the 1.1.2 app's Sydney fallback never moves someone out of a city it cannot show", async () => {
  // 1.1.2 knows eleven cities and shows any other stored city as Sydney, so saving a
  // profile from it sends "sydney" without `cityList`. That keeps the stored city.
  const traveller = await member("city-old-app", null);
  await traveller.call("upsertProfile", { ...CAST.alex, displayName: traveller.name, city: "london-gb", cityList: "world" });
  const resaved = await traveller.call("upsertProfile", { ...CAST.alex, displayName: traveller.name, city: "sydney", bio: "Edited in 1.1.2" });
  assert.equal(resaved.profile.city, "london-gb");
  assert.equal(resaved.profile.bio, "Edited in 1.1.2", "the rest of the save goes through");
  assert.equal((await admin().doc(`profiles/${traveller.uid}`).get()).get("city"), "london-gb");

  // Any other city 1.1.2 offers is a deliberate move.
  const moved = await traveller.call("upsertProfile", { ...CAST.alex, displayName: traveller.name, city: "melbourne" });
  assert.equal(moved.profile.city, "melbourne");

  // From a city 1.1.2 can show, "sydney" is a real choice too.
  const toSydney = await traveller.call("upsertProfile", { ...CAST.alex, displayName: traveller.name, city: "sydney" });
  assert.equal(toSydney.profile.city, "sydney");

  // A client that knows the world list can always choose Sydney.
  await traveller.call("upsertProfile", { ...CAST.alex, displayName: traveller.name, city: "paris-fr", cityList: "world" });
  const chosen = await traveller.call("upsertProfile", { ...CAST.alex, displayName: traveller.name, city: "sydney", cityList: "world" });
  assert.equal(chosen.profile.city, "sydney");
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

test("a world city is a boundary like any other: London members never see Paris or Sydney", async () => {
  const lonAiko = await member("w-lon-aiko", { ...CAST.aiko, cityList: "world" }, "london-gb");
  const parAiko = await member("w-par-aiko", { ...CAST.aiko, cityList: "world" }, "paris-fr");
  const sydAiko = await member("w-syd-aiko", CAST.aiko, "sydney");
  const lonAlex = await member("w-lon-alex", { ...CAST.alex, cityList: "world" }, "london-gb");

  const london = await lonAlex.call("discoverCandidates", { mode: "platonic", limit: 20 });
  const uids = london.candidates.map((candidate) => candidate.uid);
  assert.ok(uids.includes(lonAiko.uid), "Aiko in London is a partner for Alex in London");
  assert.equal(uids.includes(parAiko.uid), false, "Paris is another city");
  assert.equal(uids.includes(sydAiko.uid), false, "and so is Sydney");
  for (const candidate of london.candidates) assert.equal(candidate.city, "london-gb");
});

test("a plan in a world city is reminded and checked in on that city's clock", async () => {
  const host = await member("tz-lon-alex", { ...CAST.alex, cityList: "world" }, "london-gb");
  const guest = await member("tz-lon-aiko", { ...CAST.aiko, cityList: "world" }, "london-gb");
  // The app states the city's zone, Europe/London, whatever the phone says.
  const meeting = futureMeeting({ days: 8, localTime: "18:30", timeZone: "Europe/London", venue: "A cafe in Soho" });
  const { invitation } = await host.call("createInvitation", {
    toUid: guest.uid, intent: "platonic", requestKey: "tz-london", note: "Coffee?", meeting,
  });
  assert.equal(invitation.meeting.timeZone, "Europe/London");
  await guest.call("respondToInvitation", { invitationId: invitation.id, action: "accept" });

  const stored = (await admin().doc(`invitations/${invitation.id}`).get()).data();
  const wall = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  assert.equal(wall.format(new Date(invitation.meeting.startAt)), "18:30", "the meetup starts at 18:30 London time");
  assert.equal(wall.format(stored.meeting.startAt.toDate()), "18:30");
  assert.equal(stored.nextReminderAt.toDate().toISOString(), reminderTimeFor(meeting.localDate, "Europe/London").toISOString());
  assert.equal(stored.nextCheckInAt.toDate().toISOString(), checkInTimeFor(meeting.localDate, "Europe/London").toISOString());
  assert.notEqual(stored.nextReminderAt.toDate().toISOString(), reminderTimeFor(meeting.localDate, "Australia/Sydney").toISOString(),
    "not Sydney's evening");
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
