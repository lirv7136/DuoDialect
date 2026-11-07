"use strict";

/**
 * Firestore rules, exercised against the real emulator with real auth tokens.
 *
 * Three signed in members plus an unauthenticated client. Everything here is a direct
 * database access that deliberately goes around the callables, which is exactly what a
 * modified or hostile client would do.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clearEmulators, shutdown, makeActor, anonymousActor, expectDenied, expectFailure,
  serverTimestamp, admin,
} = require("./helpers/env");
const { castOf } = require("./helpers/actors");

let alex; let aiko; let carol; let stranger;

test.before(async () => {
  await clearEmulators();
  ({ alex, aiko } = await castOf("alex", "aiko"));
  carol = (await castOf("ren")).ren;
  stranger = anonymousActor();
});

test.after(async () => { await shutdown(); });

test("an unauthenticated client can read nothing", async () => {
  await expectDenied(stranger.read(`profiles/${alex.uid}`), "anonymous profile read");
  await expectDenied(stranger.read(`privateProfiles/${alex.uid}`), "anonymous private profile read");
  await expectDenied(stranger.readAll("profiles"), "anonymous profile listing");
  await expectDenied(stranger.readAll("invitations"), "anonymous invitation listing");
  await expectDenied(stranger.readAll("conversations"), "anonymous conversation listing");
  await expectDenied(stranger.write(`profiles/${alex.uid}`, { displayName: "Hijacked" }), "anonymous profile write");
});

test("a member reads another public profile but can never list the member base", async () => {
  const snap = await aiko.read(`profiles/${alex.uid}`);
  assert.equal(snap.get("displayName"), "Alex");
  assert.equal(snap.get("bio"), "Here for a weekly swap and better coffee.");
  // Nothing private leaked into the public document.
  assert.equal(snap.get("birthDate"), undefined);
  assert.equal(snap.get("gender"), undefined);
  assert.equal(snap.get("dating"), undefined);

  await expectDenied(aiko.readAll("profiles"), "profile listing is closed to clients");
});

test("private account data is readable only by its owner", async () => {
  const mine = await alex.read(`privateProfiles/${alex.uid}`);
  assert.equal(mine.get("gender"), "nonbinary");
  assert.equal(mine.get("ageAssurance"), "self-declared");

  await expectDenied(aiko.read(`privateProfiles/${alex.uid}`), "another member's private profile");
  await expectDenied(carol.read(`privateProfiles/${alex.uid}`), "an outsider's read of private data");
  await expectDenied(aiko.readAll("privateProfiles"), "private profile listing");
});

test("a client cannot forge or edit any identity document", async () => {
  await expectDenied(alex.write(`profiles/${alex.uid}`, { displayName: "Self edited" }), "writing own public profile");
  await expectDenied(alex.merge(`profiles/${aiko.uid}`, { displayName: "Forged" }), "writing another public profile");
  await expectDenied(
    alex.merge(`privateProfiles/${alex.uid}`, { birthDate: "1990-01-01" }),
    "granting oneself a different age",
  );
  await expectDenied(
    alex.merge(`privateProfiles/${alex.uid}`, { dating: { enabled: true, genders: ["woman"], ageMin: 18, ageMax: 99 } }),
    "granting oneself dating consent",
  );
  await expectDenied(
    alex.merge(`privateProfiles/${aiko.uid}`, { dating: { enabled: true } }),
    "granting another member dating consent",
  );
});

test("a client cannot create an accepted match or a conversation unilaterally", async () => {
  await expectDenied(
    alex.write("invitations/forged", {
      fromUid: aiko.uid, toUid: alex.uid, participants: [alex.uid, aiko.uid].sort(),
      intent: "dating", status: "accepted",
    }),
    "writing an invitation directly",
  );
  await expectDenied(
    alex.write("conversations/forged", {
      participants: [alex.uid, carol.uid].sort(), intent: "platonic",
    }),
    "writing a conversation directly",
  );
  await expectDenied(
    alex.write("invitationLocks/forged", { invitationId: "x" }),
    "writing an invitation lock",
  );
  await expectDenied(alex.read("invitationLocks/forged"), "reading an invitation lock");
});

test("a client cannot write blocks directly, which would skip the cancellation cascade", async () => {
  await expectDenied(
    alex.write(`blocks/${alex.uid}/users/${aiko.uid}`, { blockedUid: aiko.uid }),
    "writing own block document",
  );
  await expectDenied(
    alex.write(`blocks/${aiko.uid}/users/${carol.uid}`, { blockedUid: carol.uid }),
    "writing somebody else's block",
  );
  await expectDenied(alex.readAll(`blocks/${aiko.uid}/users`), "reading somebody else's blocks");
  // Owner reads are allowed.
  const own = await alex.readAll(`blocks/${alex.uid}/users`);
  assert.equal(own.size, 0);
});

test("reports and stubbed push records are closed to every client", async () => {
  await expectDenied(alex.append("reports", { reportedUid: aiko.uid, reason: "spam" }), "writing a report directly");
  await expectDenied(alex.readAll("reports"), "reading reports");
  await expectDenied(alex.readAll("pushDeliveries"), "reading push delivery records");
});

test("a client cannot fabricate its own inbox state", async () => {
  await expectDenied(
    alex.write(`userConversations/${alex.uid}/items/anything`, { unread: 0 }),
    "writing own inbox summary",
  );
  await expectDenied(
    alex.write(`userConversations/${aiko.uid}/items/anything`, { unread: 99 }),
    "writing another member's inbox summary",
  );
  await expectDenied(alex.readAll(`userConversations/${aiko.uid}/items`), "reading another member's inbox");
});

test("push tokens stay owner writable but shape constrained", async () => {
  await assert.doesNotReject(alex.write(`pushTokens/${alex.uid}`, {
    token: "ExponentPushToken[alex-device-1]", platform: "ios", updatedAt: serverTimestamp(),
  }), "the owner may register a device token");

  const snap = await alex.read(`pushTokens/${alex.uid}`);
  assert.equal(snap.get("platform"), "ios");

  await expectDenied(alex.read(`pushTokens/${aiko.uid}`), "reading another member's push token");
  await expectDenied(alex.write(`pushTokens/${aiko.uid}`, {
    token: "ExponentPushToken[stolen]", platform: "ios", updatedAt: serverTimestamp(),
  }), "writing another member's push token");
  await expectDenied(alex.write(`pushTokens/${alex.uid}`, {
    token: "ExponentPushToken[x]", platform: "carrier-pigeon", updatedAt: serverTimestamp(),
  }), "an unknown platform value");
  await expectDenied(alex.write(`pushTokens/${alex.uid}`, {
    token: "ExponentPushToken[x]", platform: "ios", updatedAt: serverTimestamp(), smuggled: "payload",
  }), "extra fields on the push token document");
});

test("the collections the earlier client wrote to directly are closed", async () => {
  for (const path of [
    `users/${alex.uid}`,
    `chats/${[alex.uid, aiko.uid].sort().join("_")}`,
    `matches/${alex.uid}/with/${aiko.uid}`,
    `swipes/${alex.uid}/outgoing/${aiko.uid}`,
  ]) {
    await expectDenied(alex.read(path), `reading legacy path ${path}`);
    await expectDenied(alex.write(path, { anything: true }), `writing legacy path ${path}`);
  }
});

test("an unknown collection is denied by the catch-all rule", async () => {
  await expectDenied(alex.write("somethingNew/doc", { a: 1 }), "writing an undeclared collection");
  await expectDenied(alex.read("somethingNew/doc"), "reading an undeclared collection");
});

test("a block hides the blocked member's profile in both directions", async () => {
  await alex.call("setBlock", { otherUid: carol.uid, blocked: true });

  await expectDenied(alex.read(`profiles/${carol.uid}`), "the blocker reading the blocked profile");
  await expectDenied(carol.read(`profiles/${alex.uid}`), "the blocked member reading the blocker's profile");

  // Unrelated members are unaffected.
  const stillVisible = await aiko.read(`profiles/${carol.uid}`);
  assert.equal(stillVisible.exists(), true);

  await alex.call("setBlock", { otherUid: carol.uid, blocked: false });
  const restored = await alex.read(`profiles/${carol.uid}`);
  assert.equal(restored.get("displayName"), "Ren");
});

test("the callables reject unauthenticated callers", async () => {
  for (const name of [
    "upsertProfile", "getMyAccount", "setDatingConsent", "discoverCandidates",
    "createInvitation", "respondToInvitation", "cancelInvitation",
    "sendMessage", "markConversationRead", "setBlock", "reportUser",
  ]) {
    await expectFailure(stranger.call(name, {}), "unauthenticated", `${name} must require sign in`);
  }
});

test("the admin view confirms the public and private split is real", async () => {
  const db = admin();
  const publicDoc = await db.doc(`profiles/${alex.uid}`).get();
  const privateDoc = await db.doc(`privateProfiles/${alex.uid}`).get();

  assert.equal(publicDoc.get("birthDate"), undefined);
  assert.equal(publicDoc.get("gender"), undefined);
  assert.equal(publicDoc.get("dating"), undefined);
  assert.equal(privateDoc.get("birthDate"), alex.spec.birthDate);
  assert.equal(privateDoc.get("ageAssurance"), "self-declared");
  assert.equal(privateDoc.get("dating").enabled, true);
});
