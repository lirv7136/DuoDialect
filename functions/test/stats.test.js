"use strict";

/**
 * Operator stats, end to end: only a moderator gets them, the first call builds a snapshot
 * from the real community, a refresh is honoured once the cooldown has passed, the stats
 * collections stay closed to every client, App Store units land where getStats reads
 * them, with a broken secret or the placeholder reported rather than swallowed and only a
 * successful run counted as connected, and "active this week" counts only who acted.
 */

process.env.DUODIALECT_PUSH_TRANSPORT = "stub";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { Buffer } = require("node:buffer");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");
const {
  clearEmulators, shutdown, makeActor, admin, adminAuth, expectFailure, expectDenied, futureMeeting,
} = require("./helpers/env");
const { CAST } = require("./helpers/actors");
const { syncAppStoreDownloads, runAppStoreSync, TALKEVEN_APPLE_ID } = require("../lib/appstore");
const { activeUidsSince } = require("../lib/stats");

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
    { id: "sydney", name: "Sydney, Australia", members: 4, active7: 4, new30: 4, unmatched: 1 },
  ]);
  assert.deepEqual(latest.pairs[0], {
    city: "sydney", a: "english", b: "japanese", aSide: 1, bSide: 2, meetups: 0,
  });
  assert.equal(latest.truncated, false);
  assert.equal(latest.citiesTruncated, false);
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

  // A first run that fails, as with a key Apple refuses, is not connected: no sync time,
  // and the error says why.
  const refused = async () => ({ status: 401, ok: false, text: async () => "NOT_AUTHORIZED" });
  const failedFirst = await syncAppStoreDownloads(admin(), config, { now, fetchImpl: refused });
  assert.match(failedFirst.lastError, /answered 401/);
  const notConnected = (await moderator.call("getStats", {})).appStore;
  assert.equal(notConnected.lastSyncAt, null, "no run has succeeded yet");
  assert.match(notConnected.lastError, /answered 401/);

  const first = await syncAppStoreDownloads(admin(), config, { now, fetchImpl });
  assert.deepEqual(first, { checked: 30, written: 30, lastError: null });
  assert.equal(requested[0], "2026-11-05");

  requested.length = 0;
  const again = await syncAppStoreDownloads(admin(), config, { now, fetchImpl });
  assert.deepEqual(requested, ["2026-11-05", "2026-11-04"], "only the two most recent days are fetched again");
  assert.equal(again.written, 2);

  const { appStore } = await moderator.call("getStats", {});
  assert.equal(typeof appStore.lastSyncAt, "number");
  assert.equal(appStore.lastError, null, "a successful run clears the error");
  assert.equal(appStore.days.length, 30);
  assert.deepEqual(appStore.days[0], { day: "2026-11-05", downloads: 2, redownloads: 0, updates: 5 });
  assert.deepEqual(appStore.days[1], { day: "2026-11-04", downloads: 0, redownloads: 0, updates: 0 });

  const broken = await runAppStoreSync(admin(), JSON.stringify({ keyId: "only this" }));
  assert.match(broken.lastError, /missing issuerId/);
  const after = await moderator.call("getStats", {});
  assert.match(after.appStore.lastError, /missing issuerId/);
  assert.equal(after.appStore.lastSyncAt, appStore.lastSyncAt, "a failed read of the secret is not a run");

  const placeholder = await runAppStoreSync(admin(), "{}");
  assert.match(placeholder.lastError, /^Not connected yet/);

  // A later run that fails keeps the last good time beside its error.
  await syncAppStoreDownloads(admin(), config, { now, fetchImpl: refused });
  const failedLater = (await moderator.call("getStats", {})).appStore;
  assert.equal(failedLater.lastSyncAt, appStore.lastSyncAt);
  assert.match(failedLater.lastError, /answered 401/);
});

test("active this week counts whoever acted, not the other side, and a full scan is reported", async () => {
  const db = admin();
  // Profiles saved by the person carry lastEditedAt, which the count reads.
  const profile = await db.doc(`profiles/${members.alex.uid}`).get();
  assert.equal(typeof profile.get("lastEditedAt")?.toMillis, "function", "upsertProfile stamps the person's own edit");

  // Everyone's last edit is before this, so only what follows counts.
  const since = new Date();
  const active = async () => [...(await activeUidsSince(db, since)).uids].sort();

  const { invitation } = await members.alex.call("createInvitation", {
    toUid: members.ren.uid, intent: "platonic", requestKey: "stats-active-1", note: "Coffee?", meeting: futureMeeting(),
  });
  assert.deepEqual(await active(), [members.alex.uid], "sending counts; being sent a plan does not");

  const { conversationId } = await members.ren.call("respondToInvitation", { invitationId: invitation.id, action: "accept" });
  await members.ren.call("sendMessage", { conversationId, text: "See you there.", clientMessageId: "stats-m1" });
  const conversation = await db.doc(`conversations/${conversationId}`).get();
  assert.equal(typeof conversation.get("lastMessageAt")?.toMillis, "function", "sendMessage stamps when the latest message was sent");
  assert.deepEqual(await active(), [members.alex.uid, members.ren.uid].sort());

  // A moderator hiding a profile moves updatedAt, as suspension does, but it is not that
  // person's activity.
  for (const name of ["sam", "aiko"]) {
    await db.doc(`profiles/${members[name].uid}`).set({ discoverable: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  assert.deepEqual(await active(), [members.alex.uid, members.ren.uid].sort());

  const partial = await activeUidsSince(db, since, { limit: 1 });
  assert.equal(partial.truncated, true, "two profiles changed, more than a limit of one");
  assert.equal((await activeUidsSince(db, since)).truncated, false);
  for (const name of ["sam", "aiko"]) await db.doc(`profiles/${members[name].uid}`).set({ discoverable: true }, { merge: true });
});
