"use strict";

/**
 * Operator stats, end to end: only a moderator gets them, the first call builds a snapshot
 * from the real community, a refresh is honoured once the cooldown has passed, the stats
 * collections stay closed to every client, and App Store units land where getStats reads
 * them, with a broken secret reported rather than swallowed.
 */

process.env.DUODIALECT_PUSH_TRANSPORT = "stub";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { Buffer } = require("node:buffer");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");
const {
  clearEmulators, shutdown, makeActor, admin, adminAuth, expectFailure, expectDenied,
} = require("./helpers/env");
const { CAST } = require("./helpers/actors");
const { syncAppStoreDownloads, runAppStoreSync, TALKEVEN_APPLE_ID } = require("../lib/appstore");

const members = {};
let moderator;
let stranger;

test.before(async () => {
  await clearEmulators();
  for (const name of ["alex", "aiko", "ren", "sam"]) {
    const actor = await makeActor(name);
    await actor.call("upsertProfile", { ...CAST[name] });
    members[name] = actor;
  }
  // Two accounts that never made a profile: one ordinary, one moderator.
  stranger = await makeActor("stranger");
  moderator = await makeActor("moderator");
  await adminAuth().setCustomUserClaims(moderator.uid, { moderator: true });
  await moderator.refreshToken();
});
test.after(async () => { await shutdown(); });

test("only a moderator gets stats", async () => {
  await expectFailure(stranger.call("getStats", {}), "permission-denied", "a member without the claim");
});

test("the first call builds a snapshot from the community as it is", async () => {
  const stats = await moderator.call("getStats", {});
  const { latest } = stats;
  assert.equal(typeof latest.generatedAt, "number");
  assert.match(latest.day, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(latest.accounts, { total: 6, withProfile: 4, withoutProfile: 2 });
  assert.deepEqual(latest.members, {
    total: 4, discoverable: 4, new7: 4, new30: 4, active7: 4, withMeetup: 0, unmatched: 1,
  });
  assert.deepEqual(latest.plans, { total: 0, new7: 0, pending: 0, accepted: 0, declined: 0, cancelled: 0 });
  assert.deepEqual(latest.meetups, { confirmed: 0, confirmed30: 0 });
  assert.deepEqual(latest.cities, [
    { id: "sydney", name: "Sydney", members: 4, active7: 4, new30: 4, unmatched: 1 },
  ]);
  assert.deepEqual(latest.pairs[0], {
    city: "sydney", a: "english", b: "japanese", aSide: 1, bSide: 2, meetups: 0,
  });
  assert.equal(latest.truncated, false);
  assert.deepEqual(stats.history, [{
    day: latest.day, accounts: 6, members: 4, active7: 4, plans: 0, meetups: 0,
  }]);
  assert.deepEqual(stats.appStore, { lastSyncAt: null, lastError: null, days: [] });
});

test("a refresh inside the cooldown returns the same snapshot; after it, a new one", async () => {
  const first = (await moderator.call("getStats", {})).latest;

  // A plan alex and aiko agreed on, and the meetup they both confirmed, in the shapes the
  // invitation and check-in callables write.
  const db = admin();
  const participants = [members.alex.uid, members.aiko.uid].sort();
  await db.doc("invitations/inv_stats_test").set({
    participants, fromUid: members.alex.uid, toUid: members.aiko.uid, status: "accepted",
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  await db.doc("confirmedMeetups/meet_stats_test").set({
    invitationId: "inv_stats_test", participants,
    gave: { [members.alex.uid]: "english", [members.aiko.uid]: "japanese" },
    confirmedAt: FieldValue.serverTimestamp(),
  });
  for (const uid of participants) await db.doc(`profiles/${uid}`).update({ meetupsConfirmed: 1 });

  const cached = (await moderator.call("getStats", { refresh: true })).latest;
  assert.equal(cached.generatedAt, first.generatedAt, "under a minute old, so not rebuilt");
  assert.equal(cached.plans.total, 0);

  await db.doc("stats/latest").update({ generatedAt: Timestamp.fromMillis(first.generatedAt - 5 * 60 * 1000) });
  const fresh = (await moderator.call("getStats", { refresh: true })).latest;
  assert.ok(fresh.generatedAt > first.generatedAt);
  assert.deepEqual(fresh.plans, { total: 1, new7: 1, pending: 0, accepted: 1, declined: 0, cancelled: 0 });
  assert.deepEqual(fresh.meetups, { confirmed: 1, confirmed30: 1 });
  assert.equal(fresh.members.withMeetup, 2);
  assert.equal(fresh.pairs[0].meetups, 1);
});

test("the stats collections are closed to every client, moderators included", async () => {
  await expectDenied(moderator.read("stats/latest"), "a moderator reading the snapshot directly");
  await expectDenied(moderator.readAll("statsDaily"), "a moderator listing daily snapshots");
  await expectDenied(members.alex.readAll("appStoreDaily"), "a member reading App Store units");
  await expectDenied(moderator.write("stats/latest", { members: { total: 1e6 } }), "a client writing stats");
});

test("App Store units land where getStats reads them, and a broken secret is reported", async () => {
  const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const config = {
    keyId: "ABC123DEFG", issuerId: "issuer", vendorNumber: "87654321", appleId: TALKEVEN_APPLE_ID,
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
  const report = zlib.gzipSync(Buffer.from([
    "Product Type Identifier\tUnits\tCountry Code\tApple Identifier",
    `1\t2\tAU\t${TALKEVEN_APPLE_ID}`,
    `7\t5\tAU\t${TALKEVEN_APPLE_ID}`,
  ].join("\n")));
  const requested = [];
  const fetchImpl = async (url) => {
    const day = new URL(url).searchParams.get("filter[reportDate]");
    requested.push(day);
    if (day === "2026-11-04") {
      return { status: 404, ok: false, text: async () => "There were no sales for the date specified." };
    }
    return { status: 200, ok: true, arrayBuffer: async () => report };
  };
  // 20:00 UTC on 6 November is still the 6th in California, so the newest report is the 5th.
  const now = new Date("2026-11-06T20:00:00Z");

  const first = await syncAppStoreDownloads(admin(), config, { now, fetchImpl });
  assert.deepEqual(first, { checked: 30, written: 30, lastError: null });
  assert.equal(requested[0], "2026-11-05");

  requested.length = 0;
  const again = await syncAppStoreDownloads(admin(), config, { now, fetchImpl });
  assert.deepEqual(requested, ["2026-11-05", "2026-11-04"], "only the two most recent days are fetched again");
  assert.equal(again.written, 2);

  const { appStore } = await moderator.call("getStats", {});
  assert.equal(typeof appStore.lastSyncAt, "number");
  assert.equal(appStore.lastError, null);
  assert.equal(appStore.days.length, 30);
  assert.deepEqual(appStore.days[0], { day: "2026-11-05", downloads: 2, redownloads: 0, updates: 5 });
  assert.deepEqual(appStore.days[1], { day: "2026-11-04", downloads: 0, redownloads: 0, updates: 0 });

  const broken = await runAppStoreSync(admin(), "{}");
  assert.match(broken.lastError, /missing keyId/);
  const after = await moderator.call("getStats", {});
  assert.match(after.appStore.lastError, /missing keyId/);
});
