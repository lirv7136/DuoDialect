"use strict";

/**
 * Push token lifecycle: one document per device, fan out to every device once, the
 * rules around the devices collection, releasing a previous account's registration,
 * the deletion cascade, and the receipt sweep that retires dead tokens.
 *
 * Delivery runs through the stub transport, which records one pushDeliveries document
 * per token. The sweep is a scheduled function, so it is run directly against the
 * emulator with an explicit clock and, for the Expo path, a fake Expo client.
 */

process.env.DUODIALECT_PUSH_TRANSPORT = "stub";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clearEmulators, shutdown, makeActor, anonymousActor, expectDenied, expectFailure,
  futureMeeting, admin, waitFor, serverTimestamp,
} = require("./helpers/env");
const { CAST } = require("./helpers/actors");
const { sweepPushReceipts, RECEIPT_DELAY_MS, TICKET_TTL_MS } = require("../lib/push-receipts");

let pairSeq = 0;

/** A fresh accepted pair with an open conversation, so a message triggers a push. */
async function acceptedPair() {
  const suffix = ++pairSeq;
  const speaker = await makeActor(`push-speaker${suffix}`);
  const learner = await makeActor(`push-learner${suffix}`);
  await speaker.call("upsertProfile", { ...CAST.alex, displayName: `Speaker ${suffix}` });
  await learner.call("upsertProfile", { ...CAST.aiko, displayName: `Learner ${suffix}` });
  const { invitation } = await speaker.call("createInvitation", {
    toUid: learner.uid, intent: "platonic", requestKey: `push-${suffix}`,
    note: "Thursday coffee?", meeting: futureMeeting(),
  });
  const accepted = await learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" });
  return { speaker, learner, conversationId: accepted.conversationId };
}

const tokenDoc = (token) => ({ token, platform: "ios", updatedAt: serverTimestamp() });

const messagesFor = (uid) => admin().collection("pushDeliveries")
  .where("toUid", "==", uid).where("data.type", "==", "message").get();

const settle = () => new Promise((resolve) => setTimeout(resolve, 1500));

test.before(async () => { await clearEmulators(); });
test.after(async () => { await shutdown(); });

test("a message goes to every device once: two device tokens plus a distinct legacy token", async () => {
  const { speaker, learner, conversationId } = await acceptedPair();
  const phone = `ExponentPushToken[${learner.uid}-phone]`;
  const tablet = `ExponentPushToken[${learner.uid}-tablet]`;
  const legacy = `ExponentPushToken[${learner.uid}-old-build]`;
  await learner.write(`pushTokens/${learner.uid}/devices/d_phone`, tokenDoc(phone));
  await learner.write(`pushTokens/${learner.uid}/devices/d_tablet`, tokenDoc(tablet));
  await learner.write(`pushTokens/${learner.uid}`, tokenDoc(legacy));

  await speaker.call("sendMessage", { conversationId, text: "Three devices", clientMessageId: "fan-1" });

  const docs = await waitFor(async () => {
    const snap = await messagesFor(learner.uid);
    return snap.size >= 3 ? snap.docs : null;
  }, { label: "three stubbed deliveries" });
  await settle();
  const again = await messagesFor(learner.uid);
  assert.equal(again.size, 3, "each distinct token is sent to exactly once");

  const byToken = new Map(docs.map((doc) => [doc.get("token"), doc]));
  assert.deepEqual([...byToken.keys()].sort(), [legacy, phone, tablet].sort());
  assert.equal(byToken.get(phone).get("deviceId"), "d_phone");
  assert.equal(byToken.get(legacy).get("deviceId"), null, "the legacy document has no device id");
  for (const doc of docs) {
    assert.equal(doc.get("transport"), "stub");
    assert.equal(doc.get("body"), "Three devices");
  }
});

test("a device that wrote both the device document and the legacy document is sent to once", async () => {
  const { speaker, learner, conversationId } = await acceptedPair();
  const phone = `ExponentPushToken[${learner.uid}-phone]`;
  await learner.write(`pushTokens/${learner.uid}/devices/d_phone`, tokenDoc(phone));
  await learner.write(`pushTokens/${learner.uid}`, tokenDoc(phone));

  await speaker.call("sendMessage", { conversationId, text: "One phone", clientMessageId: "dedupe-1" });

  await waitFor(async () => ((await messagesFor(learner.uid)).empty ? null : true), { label: "the stubbed delivery" });
  await settle();
  const snap = await messagesFor(learner.uid);
  assert.equal(snap.size, 1);
  assert.equal(snap.docs[0].get("token"), phone);
  assert.equal(snap.docs[0].get("deviceId"), "d_phone", "the device document wins over the legacy one");
});

test("a member writes, lists and deletes their own device documents and nobody else's", async () => {
  const alex = await makeActor("rules-alex");
  const aiko = await makeActor("rules-aiko");
  const path = `pushTokens/${alex.uid}/devices/d_one`;

  await assert.doesNotReject(alex.write(path, tokenDoc("ExponentPushToken[alex-phone]")), "the owner registers a device");
  assert.equal((await alex.read(path)).get("platform"), "ios");
  assert.equal((await alex.readAll(`pushTokens/${alex.uid}/devices`)).size, 1, "the owner may list their devices");

  await expectDenied(aiko.read(path), "reading another member's device token");
  await expectDenied(aiko.readAll(`pushTokens/${alex.uid}/devices`), "listing another member's devices");
  await expectDenied(aiko.write(`pushTokens/${alex.uid}/devices/d_two`, tokenDoc("ExponentPushToken[stolen]")), "writing a device under another member");
  await expectDenied(aiko.remove(path), "deleting another member's device token");

  await expectDenied(alex.write(`pushTokens/${alex.uid}/devices/d_bad`, {
    token: "ExponentPushToken[x]", platform: "carrier-pigeon", updatedAt: serverTimestamp(),
  }), "an unknown platform value");
  await expectDenied(alex.write(`pushTokens/${alex.uid}/devices/d_bad`, {
    token: "ExponentPushToken[x]", platform: "ios", updatedAt: serverTimestamp(), smuggled: "payload",
  }), "extra fields on a device document");

  await expectDenied(alex.readAll("pushTickets"), "reading push tickets");
  await expectDenied(alex.write("pushTickets/t1", { toUid: alex.uid }), "writing a push ticket");

  await assert.doesNotReject(alex.remove(path), "the owner removes their own device");
  assert.equal((await alex.read(path)).exists(), false);
});

test("the next account on a phone can release the previous account's registration, with the token as proof", async () => {
  const previous = await makeActor("release-previous");
  const next = await makeActor("release-next");
  const token = `ExponentPushToken[${previous.uid}-phone]`;
  await previous.write(`pushTokens/${previous.uid}/devices/d_phone`, tokenDoc(token));
  await previous.write(`pushTokens/${previous.uid}`, tokenDoc(token));

  const guess = await next.call("releasePushToken", { uid: previous.uid, deviceId: "d_phone", token: "ExponentPushToken[guess]" });
  assert.equal(guess.released, 0, "a wrong token releases nothing");
  assert.equal((await admin().doc(`pushTokens/${previous.uid}/devices/d_phone`).get()).exists, true);
  assert.equal((await admin().doc(`pushTokens/${previous.uid}`).get()).exists, true);

  const released = await next.call("releasePushToken", { uid: previous.uid, deviceId: "d_phone", token });
  assert.equal(released.released, 2);
  assert.equal((await admin().doc(`pushTokens/${previous.uid}/devices/d_phone`).get()).exists, false);
  assert.equal((await admin().doc(`pushTokens/${previous.uid}`).get()).exists, false);

  const again = await next.call("releasePushToken", { uid: previous.uid, deviceId: "d_phone", token });
  assert.equal(again.released, 0, "releasing twice is harmless");

  await expectFailure(next.call("releasePushToken", {}), "invalid-argument");
  await expectFailure(next.call("releasePushToken", { uid: previous.uid, deviceId: "../x", token }), "invalid-argument");
  await expectFailure(anonymousActor().call("releasePushToken", { uid: previous.uid, deviceId: "d_phone", token }), "unauthenticated");
});

test("account deletion removes every device document along with the legacy one", async () => {
  const { speaker: leaver } = await acceptedPair();
  await leaver.write(`pushTokens/${leaver.uid}/devices/d_phone`, tokenDoc(`ExponentPushToken[${leaver.uid}-phone]`));
  await leaver.write(`pushTokens/${leaver.uid}/devices/d_tablet`, tokenDoc(`ExponentPushToken[${leaver.uid}-tablet]`));
  await leaver.write(`pushTokens/${leaver.uid}`, tokenDoc(`ExponentPushToken[${leaver.uid}-old]`));

  const result = await leaver.call("requestAccountDeletion", { confirmation: "DELETE" });
  assert.equal(result.status, "completed");

  assert.equal((await admin().doc(`pushTokens/${leaver.uid}`).get()).exists, false);
  assert.equal((await admin().collection(`pushTokens/${leaver.uid}/devices`).get()).size, 0, "the devices subcollection is gone");
});

test("the receipt sweep is a no op under the stub transport", async () => {
  const old = new Date(Date.now() - RECEIPT_DELAY_MS - 60 * 1000);
  await admin().doc("pushTickets/stub-ticket").set({ toUid: "nobody", token: "ExponentPushToken[x]", deviceId: "d_x", createdAt: old });

  const result = await sweepPushReceipts(admin(), new Date());
  assert.deepEqual(result, { transport: "stub", tickets: 0, checked: 0, dead: 0, removed: 0, expired: 0 });
  assert.equal((await admin().doc("pushTickets/stub-ticket").get()).exists, true, "nothing is touched");
  await admin().doc("pushTickets/stub-ticket").delete();
});

test("the receipt sweep retires tokens Expo reports as DeviceNotRegistered and forgets answered tickets", async () => {
  const db = admin();
  const uid = "sweep-person";
  const dead = "ExponentPushToken[sweep-dead]";
  const alive = "ExponentPushToken[sweep-alive]";
  const stamp = { platform: "ios", updatedAt: new Date() };
  await db.doc(`pushTokens/${uid}/devices/d_dead`).set({ token: dead, ...stamp });
  await db.doc(`pushTokens/${uid}/devices/d_alive`).set({ token: alive, ...stamp });
  await db.doc(`pushTokens/${uid}`).set({ token: dead, ...stamp });

  const now = new Date();
  const old = new Date(now.getTime() - RECEIPT_DELAY_MS - 60 * 1000);
  const ancient = new Date(now.getTime() - TICKET_TTL_MS - 60 * 1000);
  await db.doc("pushTickets/t-dead").set({ toUid: uid, token: dead, deviceId: "d_dead", createdAt: old });
  await db.doc("pushTickets/t-alive").set({ toUid: uid, token: alive, deviceId: "d_alive", createdAt: old });
  await db.doc("pushTickets/t-fresh").set({ toUid: uid, token: alive, deviceId: "d_alive", createdAt: now });
  await db.doc("pushTickets/t-ancient").set({ toUid: uid, token: alive, deviceId: "d_alive", createdAt: ancient });

  const asked = [];
  const fakeExpo = {
    chunkPushNotificationReceiptIds: (ids) => [ids],
    getPushNotificationReceiptsAsync: async (ids) => {
      asked.push(...ids);
      return {
        "t-dead": { status: "error", message: "The recipient device is not registered", details: { error: "DeviceNotRegistered" } },
        "t-alive": { status: "ok" },
      };
    },
  };

  const result = await sweepPushReceipts(db, now, { transport: "expo", expo: fakeExpo });
  assert.deepEqual(result, { transport: "expo", tickets: 3, checked: 2, dead: 1, removed: 2, expired: 1 });
  assert.deepEqual(asked.sort(), ["t-alive", "t-ancient", "t-dead"], "only tickets old enough are asked about");

  assert.equal((await db.doc(`pushTokens/${uid}/devices/d_dead`).get()).exists, false, "the dead device is retired");
  assert.equal((await db.doc(`pushTokens/${uid}`).get()).exists, false, "the legacy document held the same dead token");
  assert.equal((await db.doc(`pushTokens/${uid}/devices/d_alive`).get()).exists, true, "a working device is kept");
  for (const id of ["t-dead", "t-alive", "t-ancient"]) {
    assert.equal((await db.doc(`pushTickets/${id}`).get()).exists, false, `${id} is forgotten`);
  }
  assert.equal((await db.doc("pushTickets/t-fresh").get()).exists, true, "a ticket younger than 15 minutes waits");

  const again = await sweepPushReceipts(db, now, { transport: "expo", expo: fakeExpo });
  assert.deepEqual(again, { transport: "expo", tickets: 0, checked: 0, dead: 0, removed: 0, expired: 0 }, "a repeated sweep finds nothing");
});
