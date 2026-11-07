"use strict";

/**
 * Photos and trust: the main photo must show one clear face, a new profile from a client
 * that asks for it (or from anyone, under the requireProfilePhoto flag) needs one, the same
 * picture on two accounts is held for a moderator, and, while requireVerification is on, a
 * verified member's new main photo sends them back to pending.
 *
 * Screening runs the real onObjectFinalized trigger with its emulator stub. The stub
 * counts one clear face unless the upload's custom metadata `talkevenStubFaces` says
 * otherwise ("0", "2", "1@0.2"), and it fingerprints the real bytes, so these tests upload
 * real JPEGs made with jpeg-js when duplicates matter.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jpeg = require("jpeg-js");
const {
  clearEmulators, clearStorage, shutdown, makeActor, expectFailure, admin, adminAuth, adminBucket, waitFor,
} = require("./helpers/env");
const { CAST, memberOf } = require("./helpers/actors");
const { stubFaces } = require("../lib/photos");

let moderator;

const newId = () => crypto.randomUUID();
const pathOf = (uid, id) => `profilePhotos/${uid}/${id}.jpg`;
const setTrust = (flags) => admin().doc("config/trust").set(flags);
const clearTrust = () => admin().doc("config/trust").delete();

/** Enough of a JPEG for Storage; it cannot be decoded, so it has no fingerprint. */
const fakeJpeg = () => {
  const bytes = new Uint8Array(256);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
};

/** A real JPEG: an 8 by 8 grid of coloured blocks chosen by `seed`. */
function picture(seed, { size = 96, quality = 85 } = {}) {
  let state = seed;
  const random = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; };
  const levels = Array.from({ length: 64 }, () => Math.floor(random() * 200) + 20);
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const level = levels[Math.floor((y * 8) / size) * 8 + Math.floor((x * 8) / size)];
      data.set([level, (level * 3) % 256, 255 - level, 255], (y * size + x) * 4);
    }
  }
  return new Uint8Array(jpeg.encode({ data, width: size, height: size }, quality).data);
}

/** A real JPEG of one flat colour: no detail, so never a duplicate of anything. */
function flat(level, size = 64) {
  const data = Buffer.alloc(size * size * 4, level);
  return new Uint8Array(jpeg.encode({ data, width: size, height: size }, 85).data);
}

async function verdictFor(uid, id) {
  return waitFor(async () => {
    const snap = await admin().doc(`photoScreening/${uid}_${id}`).get();
    return snap.exists ? snap.data() : null;
  }, { timeoutMs: 20000, label: `screening of ${id}` });
}

/** Uploads as the actor, optionally with stubbed faces, and waits for the verdict. */
async function uploaded(actor, { bytes = fakeJpeg(), faces } = {}) {
  const id = newId();
  const metadata = { contentType: "image/jpeg" };
  if (faces !== undefined) metadata.customMetadata = { talkevenStubFaces: String(faces) };
  await actor.upload(pathOf(actor.uid, id), bytes, metadata);
  return { id, verdict: await verdictFor(actor.uid, id) };
}

async function objectExists(uid, id) {
  const [exists] = await adminBucket().file(pathOf(uid, id)).exists();
  return exists;
}

test.before(async () => {
  await clearEmulators();
  await clearStorage();
  moderator = await makeActor("photomod");
  await adminAuth().setCustomUserClaims(moderator.uid, { moderator: true });
  await moderator.refreshToken();
});

test.after(async () => {
  await clearTrust().catch(() => {});
  await shutdown();
});

test("the stub counts one clear face unless the upload's metadata says otherwise", () => {
  assert.deepEqual({ ...stubFaces({}) }, { ok: true, count: 1, confidence: 0.99, problem: null });
  assert.equal(stubFaces({ talkevenStubFaces: "0" }).problem, "no-face");
  assert.equal(stubFaces({ talkevenStubFaces: "2" }).problem, "many-faces");
  assert.equal(stubFaces({ talkevenStubFaces: "1@0.2" }).problem, "unclear-face");
  assert.equal(stubFaces({ talkevenStubFaces: "rubbish" }).ok, true);
  assert.equal(stubFaces(undefined).ok, true);
});

test("screening records the face check; the main photo needs one clear face, extras do not", async () => {
  const member = await memberOf("alex", "faces", { city: "perth" });
  const face = await uploaded(member);
  assert.equal(face.verdict.status, "approved");
  assert.deepEqual(face.verdict.face, { ok: true, count: 1, confidence: 0.99, problem: null });
  assert.equal(face.verdict.dhash, null, "bytes that are not a readable JPEG have no fingerprint");
  assert.deepEqual(face.verdict.dhashBands, []);

  const none = await uploaded(member, { faces: 0 });
  const group = await uploaded(member, { faces: 2 });
  const blurry = await uploaded(member, { faces: "1@0.2" });
  for (const photo of [none, group, blurry]) {
    assert.equal(photo.verdict.status, "approved", "SafeSearch passed, so it is usable as an extra");
    assert.equal(photo.verdict.face.ok, false);
  }

  for (const [photo, problem] of [[none, "no-face"], [group, "many-faces"], [blurry, "unclear-face"]]) {
    const error = await expectFailure(member.call("setProfilePhotos", { photoIds: [photo.id, face.id] }), "invalid-argument", problem);
    assert.equal(error.details.reason, "photo/main-needs-face");
    assert.equal(error.details.problem, problem);
    assert.match(error.message, /main photo/);
  }
  assert.deepEqual((await admin().doc(`profiles/${member.uid}`).get()).get("photos") || [], [], "nothing was saved");

  const saved = await member.call("setProfilePhotos", { photoIds: [face.id, none.id, group.id] });
  assert.deepEqual(saved.photos.map((photo) => photo.id), [face.id, none.id, group.id]);

  // A photo screened before face checks existed has no `face`, and may still be the main one.
  await admin().doc(`photoScreening/${member.uid}_${blurry.id}`).set({ face: null }, { merge: true });
  const legacy = await member.call("setProfilePhotos", { photoIds: [blurry.id] });
  assert.deepEqual(legacy.photos.map((photo) => photo.id), [blurry.id]);
});

test("a new profile from a client that asks for it needs a main photo, attached in the same save", async () => {
  const newcomer = await makeActor("np-required");
  const spec = { ...CAST.alex, displayName: "Newcomer", city: "hobart" };

  const refused = await expectFailure(newcomer.call("upsertProfile", { ...spec, photoPolicy: "required" }), "invalid-argument");
  assert.equal(refused.details.reason, "profile/photo-required");
  assert.equal((await admin().doc(`profiles/${newcomer.uid}`).get()).exists, false);

  // Photos are uploaded and screened before the profile exists.
  const noFace = await uploaded(newcomer, { faces: 0 });
  const wrongMain = await expectFailure(
    newcomer.call("upsertProfile", { ...spec, photoPolicy: "required", photoIds: [noFace.id] }), "invalid-argument");
  assert.equal(wrongMain.details.reason, "photo/main-needs-face");

  const other = await makeActor("np-other");
  const theirs = await uploaded(other);
  const foreign = await expectFailure(
    newcomer.call("upsertProfile", { ...spec, photoPolicy: "required", photoIds: [theirs.id] }), "not-found");
  assert.equal(foreign.details.reason, "photo/not-found");

  const face = await uploaded(newcomer);
  const created = await newcomer.call("upsertProfile", { ...spec, photoPolicy: "required", photoIds: [face.id, noFace.id] });
  const expected = [{ id: face.id, path: pathOf(newcomer.uid, face.id) }, { id: noFace.id, path: pathOf(newcomer.uid, noFace.id) }];
  assert.deepEqual(created.profile.photos, expected);
  assert.deepEqual((await admin().doc(`profiles/${newcomer.uid}`).get()).get("photos"), expected);
  assert.deepEqual((await newcomer.call("getMyAccount", {})).profile.photos, expected);

  // Later saves never touch photos, whatever they send.
  const later = await newcomer.call("upsertProfile", { ...spec, bio: "Hello", photoPolicy: "required", photoIds: [] });
  assert.deepEqual(later.profile.photos, expected);
});

test("older apps still create a profile with no photo, unless the server requires one of everyone", async () => {
  const spec = { ...CAST.aiko, city: "hobart" };
  const oldClient = await makeActor("np-old");
  const saved = await oldClient.call("upsertProfile", spec);
  assert.deepEqual(saved.profile.photos, []);

  await setTrust({ requireProfilePhoto: true });
  try {
    const another = await makeActor("np-old-flag");
    const error = await expectFailure(another.call("upsertProfile", spec), "invalid-argument");
    assert.equal(error.details.reason, "profile/photo-required");
    assert.match(error.message, /photo/);
    // An existing profile is unaffected: the rule is for new ones.
    const resaved = await oldClient.call("upsertProfile", { ...spec, bio: "Still fine" });
    assert.equal(resaved.profile.bio, "Still fine");
  } finally {
    await clearTrust();
  }
});

test("the same picture on another account is held for a moderator, who can approve or reject it", async () => {
  const owner = await memberOf("alex", "dup-owner", { city: "sydney" });
  const copier = await memberOf("aiko", "dup-copier", { city: "sydney" });
  const third = await memberOf("ren", "dup-third", { city: "sydney" });

  const first = await uploaded(owner, { bytes: picture(42) });
  assert.equal(first.verdict.status, "approved");
  assert.match(first.verdict.dhash, /^[0-9a-f]{16}$/);
  assert.equal(first.verdict.dhashBands.length, 8);

  // The same picture, compressed differently, from another account.
  const copy = await uploaded(copier, { bytes: picture(42, { quality: 55 }) });
  assert.equal(copy.verdict.status, "review");
  assert.equal(copy.verdict.matches, undefined, "the uploader never learns whose photo it matched");
  const [metadata] = await adminBucket().file(pathOf(copier.uid, copy.id)).getMetadata();
  assert.equal(metadata.metadata.talkevenScreening, "review");
  await expectFailure(copier.downloadUrl(pathOf(copier.uid, copy.id)), "unauthorized", "a held photo is unreadable, even to its owner");
  await expectFailure(owner.downloadUrl(pathOf(copier.uid, copy.id)), "unauthorized", "and to everyone else");
  const held = await expectFailure(copier.call("setProfilePhotos", { photoIds: [copy.id] }), "failed-precondition");
  assert.equal(held.details.reason, "photo/in-review");

  const reportId = `photo_${copier.uid}_${copy.id}`;
  const report = (await admin().doc(`reports/${reportId}`).get()).data();
  assert.equal(report.source, "photo-screening");
  assert.equal(report.reason, "duplicate_photo");
  assert.equal(report.reporterUid, null);
  assert.equal(report.reportedUid, copier.uid);
  assert.equal(report.status, "received");
  assert.deepEqual(report.photo, { photoId: copy.id, path: pathOf(copier.uid, copy.id) });
  assert.equal(report.matches[0].uid, owner.uid);
  assert.equal(report.matches[0].photoId, first.id);
  assert.ok(report.matches[0].distance <= 6);

  // A different picture is fine; so is the owner adding their own again (the held copy
  // does not count against them); and plain pictures never match each other.
  assert.equal((await uploaded(copier, { bytes: picture(43) })).verdict.status, "approved");
  assert.equal((await uploaded(owner, { bytes: picture(42) })).verdict.status, "approved");
  assert.equal((await uploaded(owner, { bytes: flat(120) })).verdict.status, "approved");
  assert.equal((await uploaded(copier, { bytes: flat(120) })).verdict.status, "approved");

  // The moderator's queue has it, filed by screening rather than by a member.
  const queue = await moderator.call("listReports", { status: "received", limit: 50 });
  const row = queue.reports.find((item) => item.id === reportId);
  assert.ok(row, "the held photo is in the queue");
  assert.equal(row.source, "photo-screening");
  assert.equal(row.reporterUid, null);
  assert.equal(row.reporterName, null);
  const context = await moderator.call("getReportContext", { reportId });
  assert.equal(context.report.source, "photo-screening");
  assert.deepEqual(context.report.photo, { photoId: copy.id, path: pathOf(copier.uid, copy.id) });
  assert.equal(context.report.matches[0].path, pathOf(owner.uid, first.id));

  // Approving makes it readable and adds it to their profile, as they were trying to.
  const approved = await moderator.call("actOnReport", { reportId, action: "approve-photo", note: "Same person." });
  assert.equal(approved.reportStatus, "actioned");
  assert.equal(approved.photoAttached, true);
  assert.equal((await admin().doc(`photoScreening/${copier.uid}_${copy.id}`).get()).get("status"), "approved");
  assert.deepEqual((await admin().doc(`profiles/${copier.uid}`).get()).get("photos"),
    [{ id: copy.id, path: pathOf(copier.uid, copy.id) }]);
  assert.ok(await owner.downloadUrl(pathOf(copier.uid, copy.id)));
  const audit = await admin().collection("moderationActions").where("reportId", "==", reportId).get();
  const entry = audit.docs.map((doc) => doc.data()).find((item) => item.action === "approve-photo");
  assert.equal(entry.moderatorUid, moderator.uid);
  assert.equal(entry.photoAttached, true);

  // Rejecting deletes the held photo and its record.
  const another = await uploaded(third, { bytes: picture(42) });
  assert.equal(another.verdict.status, "review");
  const rejected = await moderator.call("actOnReport", { reportId: `photo_${third.uid}_${another.id}`, action: "reject-photo" });
  assert.equal(rejected.reportStatus, "actioned");
  assert.equal(await objectExists(third.uid, another.id), false);
  assert.equal((await admin().doc(`photoScreening/${third.uid}_${another.id}`).get()).exists, false);

  // A photo action needs a report about a held photo.
  const filed = await owner.call("reportUser", { reportedUid: third.uid, reason: "spam" });
  const wrong = await expectFailure(moderator.call("actOnReport", { reportId: filed.reportId, action: "approve-photo" }),
    "failed-precondition");
  assert.equal(wrong.details.reason, "moderation/not-a-photo-report");
});

test("with requireVerification on, a verified member's new main photo sends them back to pending", async () => {
  const member = await memberOf("alex", "recheck", { city: "adelaide" });
  const [a, b, c] = [await uploaded(member), await uploaded(member), await uploaded(member)];
  await member.call("setProfilePhotos", { photoIds: [a.id, b.id] });
  await moderator.call("setVerification", { uid: member.uid, status: "verified" });
  assert.equal((await admin().doc(`verifications/${member.uid}`).get()).get("photoId"), a.id,
    "the record names the main photo the person was verified against");

  const verified = async () => (await admin().doc(`profiles/${member.uid}`).get()).get("verified");

  // Flag off: a new main photo changes nothing.
  await member.call("setProfilePhotos", { photoIds: [b.id, a.id] });
  assert.equal(await verified(), true);

  await setTrust({ requireVerification: true });
  try {
    // The same main photo with the others changed: still verified.
    await member.call("setProfilePhotos", { photoIds: [b.id, c.id] });
    assert.equal(await verified(), true);

    // A new main photo: pending until the check runs again.
    await member.call("setProfilePhotos", { photoIds: [c.id, b.id] });
    assert.equal(await verified(), false);
    const record = (await admin().doc(`verifications/${member.uid}`).get()).data();
    assert.equal(record.status, "pending");
    assert.equal(record.pendingReason, "main-photo-changed");
    assert.ok(record.photoChangedAt, "photoChangedAt is stamped");
    const account = await member.call("getMyAccount", {});
    assert.equal(account.account.trust.verification.status, "pending");
    assert.ok(Date.parse(account.account.trust.verification.photoChangedAt));
    assert.deepEqual(account.account.trust.restrictions, ["verification/required-to-meet"]);

    // Checked again (by a moderator in phase 1), then the moderator removes every photo:
    // nothing is left to match, so the badge goes again.
    await moderator.call("setVerification", { uid: member.uid, status: "verified" });
    assert.equal(await verified(), true);
    const reporter = await memberOf("aiko", "recheck-reporter", { city: "adelaide" });
    const { reportId } = await reporter.call("reportUser", { reportedUid: member.uid, reason: "impersonation" });
    await moderator.call("actOnReport", { reportId, action: "remove-photos" });
    assert.equal(await verified(), false);
    assert.equal((await admin().doc(`verifications/${member.uid}`).get()).get("status"), "pending");
  } finally {
    await clearTrust();
  }
});
