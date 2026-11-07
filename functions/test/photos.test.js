"use strict";

/**
 * Profile photos: storage.rules, the screening trigger, setProfilePhotos, and the places
 * photos flow into (discovery, the profile callables, deletion and moderation).
 *
 * Uploads and reads go through the real Storage emulator and storage.rules, including the
 * cross-service block checks against the Firestore emulator. Screening runs the real
 * onObjectFinalized trigger with its emulator stub, which approves everything and never
 * calls Cloud Vision.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  clearEmulators, clearStorage, shutdown, makeActor, anonymousActor, expectFailure, expectDenied,
  admin, adminAuth, adminBucket, waitFor,
} = require("./helpers/env");
const { castOf, CAST } = require("./helpers/actors");
const { verdictFromSafeSearch, resolveScreening } = require("../lib/photos");

let alex; let aiko; let ren; let stranger;

const newId = () => crypto.randomUUID();
const pathOf = (uid, id) => `profilePhotos/${uid}/${id}.jpg`;
/** Enough of a JPEG for Storage; the emulator stub never decodes it. */
const jpeg = (size = 256) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
};

/** Waits for the trigger to record a verdict, via the Admin SDK. */
async function verdictFor(uid, id) {
  return waitFor(async () => {
    const snap = await admin().doc(`photoScreening/${uid}_${id}`).get();
    return snap.exists ? snap.data() : null;
  }, { timeoutMs: 20000, label: `screening of ${id}` });
}

/** Uploads as the actor and waits until the photo has passed screening. */
async function screenedPhoto(actor) {
  const id = newId();
  await actor.upload(pathOf(actor.uid, id), jpeg());
  const verdict = await verdictFor(actor.uid, id);
  assert.equal(verdict.status, "approved");
  return id;
}

async function objectExists(uid, id) {
  const [exists] = await adminBucket().file(pathOf(uid, id)).exists();
  return exists;
}

async function folderOf(uid) {
  const [files] = await adminBucket().getFiles({ prefix: `profilePhotos/${uid}/` });
  return files.map((file) => file.name);
}

/** Takes the approval off an object, leaving it as a pending upload would be. */
async function unscreen(uid, id) {
  await adminBucket().file(pathOf(uid, id)).setMetadata({ metadata: { talkevenScreening: null } });
}

test.before(async () => {
  await clearEmulators();
  await clearStorage();
  ({ alex, aiko, ren } = await castOf("alex", "aiko", "ren"));
  stranger = anonymousActor();
});

test.after(async () => { await shutdown(); });

test("screening policy: likely or very likely adult, violence or racy content is rejected", () => {
  assert.equal(verdictFromSafeSearch({ adult: "VERY_UNLIKELY", violence: "UNLIKELY", racy: "POSSIBLE" }).approved, true);
  for (const category of ["adult", "violence", "racy"]) {
    for (const level of ["LIKELY", "VERY_LIKELY", 4, 5]) {
      const verdict = verdictFromSafeSearch({ adult: "VERY_UNLIKELY", violence: "VERY_UNLIKELY", racy: "VERY_UNLIKELY", [category]: level });
      assert.equal(verdict.approved, false, `${category}=${level}`);
      assert.deepEqual(verdict.flagged, [category]);
    }
  }
  // Spoof and medical are not screened categories.
  assert.equal(verdictFromSafeSearch({ spoof: "VERY_LIKELY", medical: "VERY_LIKELY" }).approved, true);
});

test("screening is stubbed under the Functions emulator unless explicitly overridden", () => {
  const saved = { emulator: process.env.FUNCTIONS_EMULATOR, explicit: process.env.TALKEVEN_PHOTO_SCREENING };
  try {
    delete process.env.TALKEVEN_PHOTO_SCREENING;
    process.env.FUNCTIONS_EMULATOR = "true";
    assert.equal(resolveScreening(), "stub");
    delete process.env.FUNCTIONS_EMULATOR;
    assert.equal(resolveScreening(), "vision");
    process.env.TALKEVEN_PHOTO_SCREENING = "stub";
    assert.equal(resolveScreening(), "stub");
  } finally {
    for (const [key, value] of [["FUNCTIONS_EMULATOR", saved.emulator], ["TALKEVEN_PHOTO_SCREENING", saved.explicit]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("only the owner may upload: a JPEG or PNG of at most 5 MB, under a safe photo id", async () => {
  await alex.upload(pathOf(alex.uid, newId()), jpeg());
  await alex.upload(pathOf(alex.uid, newId()), jpeg(), { contentType: "image/png" });

  const refused = [
    [alex, pathOf(aiko.uid, newId()), jpeg(), { contentType: "image/jpeg" }, "into another member's folder"],
    [alex, pathOf(alex.uid, newId()), jpeg(), { contentType: "image/gif" }, "a GIF"],
    [alex, pathOf(alex.uid, newId()), jpeg(), { contentType: "text/plain" }, "not an image"],
    [alex, pathOf(alex.uid, newId()), jpeg(5 * 1024 * 1024 + 1), { contentType: "image/jpeg" }, "over 5 MB"],
    [alex, `profilePhotos/${alex.uid}/bad_id_1234.jpg`, jpeg(), { contentType: "image/jpeg" }, "an underscore in the id"],
    [alex, `profilePhotos/${alex.uid}/short.jpg`, jpeg(), { contentType: "image/jpeg" }, "a short id"],
    [alex, `profilePhotos/${alex.uid}/${newId()}.png`, jpeg(), { contentType: "image/png" }, "another extension"],
    [alex, `profilePhotos/${alex.uid}/nested/${newId()}.jpg`, jpeg(), { contentType: "image/jpeg" }, "a nested path"],
    [alex, `elsewhere/${newId()}.jpg`, jpeg(), { contentType: "image/jpeg" }, "outside profilePhotos"],
    [alex, pathOf(alex.uid, newId()), jpeg(),
      { contentType: "image/jpeg", customMetadata: { talkevenScreening: "approved" } }, "self-approved metadata"],
    [stranger, pathOf("someone", newId()), jpeg(), { contentType: "image/jpeg" }, "an anonymous caller"],
  ];
  for (const [actor, path, bytes, metadata, why] of refused) {
    await expectFailure(actor.upload(path, bytes, metadata), "unauthorized", `upload refused: ${why}`);
  }

  // No overwriting an existing photo, even your own.
  const id = newId();
  await alex.upload(pathOf(alex.uid, id), jpeg());
  await expectFailure(alex.upload(pathOf(alex.uid, id), jpeg(512)), "unauthorized", "overwrite refused");
});

test("screening approves an upload and records the verdict, which only the owner can read", async () => {
  const id = newId();
  await alex.upload(pathOf(alex.uid, id), jpeg());
  const verdict = await verdictFor(alex.uid, id);
  assert.equal(verdict.status, "approved");
  assert.equal(verdict.transport, "stub");
  assert.equal(verdict.uid, alex.uid);

  const [metadata] = await adminBucket().file(pathOf(alex.uid, id)).getMetadata();
  assert.equal(metadata.metadata.talkevenScreening, "approved");

  const own = await alex.read(`photoScreening/${alex.uid}_${id}`);
  assert.equal(own.get("status"), "approved");
  // The owner may also watch a verdict that does not exist yet.
  const notYet = await alex.read(`photoScreening/${alex.uid}_${newId()}`);
  assert.equal(notYet.exists(), false);

  await expectDenied(aiko.read(`photoScreening/${alex.uid}_${id}`), "another member's verdict");
  await expectDenied(stranger.read(`photoScreening/${alex.uid}_${id}`), "anonymous read of a verdict");
  await expectDenied(alex.readAll("photoScreening"), "listing verdicts");
  await expectDenied(alex.write(`photoScreening/${alex.uid}_${newId()}`, { uid: alex.uid, status: "approved" }),
    "writing one's own verdict");
});

test("an approved photo is readable by members, but not while pending or by anyone signed out", async () => {
  const id = await screenedPhoto(alex);
  const path = pathOf(alex.uid, id);

  assert.ok(await aiko.downloadUrl(path));
  assert.equal((await aiko.download(path)).byteLength, 256);
  assert.ok(await alex.downloadUrl(path), "the owner can read their own approved photo");
  await expectFailure(stranger.downloadUrl(path), "unauthorized", "anonymous read");

  await unscreen(alex.uid, id);
  await expectFailure(aiko.downloadUrl(path), "unauthorized", "a pending photo is not readable");
  await expectFailure(alex.downloadUrl(path), "unauthorized", "not even by its owner");
});

test("a block in either direction stops photo reads both ways; unblocking restores them", async () => {
  const alexPhoto = pathOf(alex.uid, await screenedPhoto(alex));
  const renPhoto = pathOf(ren.uid, await screenedPhoto(ren));
  assert.ok(await ren.downloadUrl(alexPhoto));

  await ren.call("setBlock", { otherUid: alex.uid, blocked: true });
  await expectFailure(ren.downloadUrl(alexPhoto), "unauthorized", "the blocker cannot read the blocked person's photo");
  await expectFailure(alex.downloadUrl(renPhoto), "unauthorized", "the blocked person cannot read the blocker's photo");
  assert.ok(await aiko.downloadUrl(alexPhoto), "people outside the block are unaffected");

  await ren.call("setBlock", { otherUid: alex.uid, blocked: false });
  assert.ok(await ren.downloadUrl(alexPhoto));
  assert.ok(await alex.downloadUrl(renPhoto));
});

test("setProfilePhotos stores up to three screened photos of the caller's own, in order", async () => {
  const [a, b, c] = [await screenedPhoto(alex), await screenedPhoto(alex), await screenedPhoto(alex)];

  const result = await alex.call("setProfilePhotos", { photoIds: [b, a, c] });
  assert.deepEqual(result.photos.map((photo) => photo.id), [b, a, c]);
  assert.deepEqual(result.photos[0], { id: b, path: pathOf(alex.uid, b) });

  // Stored on the public profile as { id, path } only: no download URL, no token.
  const profile = await aiko.read(`profiles/${alex.uid}`);
  assert.deepEqual(profile.get("photos"), result.photos);
  assert.doesNotMatch(JSON.stringify(profile.get("photos")), /token|https?:/i);

  const mine = await alex.call("getMyAccount", {});
  assert.deepEqual(mine.profile.photos, result.photos);

  // upsertProfile never touches photos.
  const saved = await alex.call("upsertProfile", { ...CAST.alex, bio: "Updated bio", photos: [] });
  assert.deepEqual(saved.profile.photos, result.photos);
  assert.deepEqual((await admin().doc(`profiles/${alex.uid}`).get()).get("photos"), result.photos);
});

test("setProfilePhotos refuses a fourth photo, duplicates, bad ids, other members' photos and unscreened ones", async () => {
  const mine = [await screenedPhoto(alex), await screenedPhoto(alex), await screenedPhoto(alex), await screenedPhoto(alex)];

  await expectFailure(alex.call("setProfilePhotos", { photoIds: mine }), "invalid-argument", "four photos");
  await expectFailure(alex.call("setProfilePhotos", { photoIds: [mine[0], mine[0]] }), "invalid-argument", "a duplicate");
  await expectFailure(alex.call("setProfilePhotos", { photoIds: ["../../x"] }), "invalid-argument", "a path as an id");
  await expectFailure(alex.call("setProfilePhotos", { photoIds: [`${aiko.uid}/${mine[0]}`] }), "invalid-argument", "a slash");
  await expectFailure(alex.call("setProfilePhotos", {}), "invalid-argument", "no photoIds");

  const theirs = await screenedPhoto(aiko);
  const foreign = await expectFailure(alex.call("setProfilePhotos", { photoIds: [theirs] }), "not-found", "another member's photo");
  assert.equal(foreign.details.reason, "photo/not-found");
  assert.equal(await objectExists(aiko.uid, theirs), true, "the other member's photo is untouched");

  const missing = await expectFailure(alex.call("setProfilePhotos", { photoIds: [newId()] }), "not-found");
  assert.equal(missing.details.reason, "photo/not-found");

  await unscreen(alex.uid, mine[3]);
  const pending = await expectFailure(alex.call("setProfilePhotos", { photoIds: [mine[3]] }), "failed-precondition");
  assert.equal(pending.details.reason, "photo/not-screened");

  // A verdict of rejected is refused even if an object somehow remains.
  await admin().doc(`photoScreening/${alex.uid}_${mine[2]}`).set({ status: "rejected" }, { merge: true });
  const rejected = await expectFailure(alex.call("setProfilePhotos", { photoIds: [mine[2]] }), "failed-precondition");
  assert.equal(rejected.details.reason, "photo/not-screened");

  await expectFailure(stranger.call("setProfilePhotos", { photoIds: [] }), "unauthenticated");
});

test("setProfilePhotos needs a profile first", async () => {
  const newcomer = await makeActor("newcomer");
  const id = await screenedPhoto(newcomer);
  const refused = await expectFailure(newcomer.call("setProfilePhotos", { photoIds: [id] }), "failed-precondition");
  assert.equal(refused.details.reason, "profile/incomplete");
});

test("photos taken off the profile are deleted; a fresh upload not yet used is kept", async () => {
  const owner = await makeActor("owner");
  await owner.call("upsertProfile", { ...CAST.alex, displayName: "Owner" });
  const [a, b, c] = [await screenedPhoto(owner), await screenedPhoto(owner), await screenedPhoto(owner)];
  await owner.call("setProfilePhotos", { photoIds: [a, b, c] });

  const fresh = await screenedPhoto(owner);
  const result = await owner.call("setProfilePhotos", { photoIds: [c] });
  assert.equal(result.deleted, 2);
  assert.deepEqual(result.photos.map((photo) => photo.id), [c]);
  assert.equal(await objectExists(owner.uid, a), false);
  assert.equal(await objectExists(owner.uid, b), false);
  assert.equal((await admin().doc(`photoScreening/${owner.uid}_${a}`).get()).exists, false);
  assert.equal(await objectExists(owner.uid, c), true);
  assert.equal(await objectExists(owner.uid, fresh), true, "an upload still being added is not swept away");

  // Clearing every photo removes the rest that were on the profile.
  const cleared = await owner.call("setProfilePhotos", { photoIds: [] });
  assert.deepEqual(cleared.photos, []);
  assert.equal(await objectExists(owner.uid, c), false);
  assert.deepEqual((await admin().doc(`profiles/${owner.uid}`).get()).get("photos"), []);

  // The owner may delete their own objects directly, but not somebody else's.
  await owner.removeObject(pathOf(owner.uid, fresh));
  const theirs = await screenedPhoto(aiko);
  await expectFailure(owner.removeObject(pathOf(aiko.uid, theirs)), "unauthorized", "deleting another member's photo");
});

test("discovery returns each candidate's photos as { id, path }", async () => {
  const id = await screenedPhoto(alex);
  await alex.call("setProfilePhotos", { photoIds: [id] });

  const { candidates } = await aiko.call("discoverCandidates", { mode: "platonic" });
  const found = candidates.find((candidate) => candidate.uid === alex.uid);
  assert.ok(found, "alex is discoverable by aiko");
  assert.deepEqual(found.photos, [{ id, path: pathOf(alex.uid, id) }]);

  const others = candidates.filter((candidate) => candidate.uid !== alex.uid);
  for (const candidate of others) assert.ok(Array.isArray(candidate.photos), "a candidate without photos has an empty list");
});

test("account deletion removes every photo object and screening record", async () => {
  const leaver = await makeActor("photoleaver");
  await leaver.call("upsertProfile", { ...CAST.alex, displayName: "Photo leaver" });
  const used = await screenedPhoto(leaver);
  await screenedPhoto(leaver);
  await leaver.call("setProfilePhotos", { photoIds: [used] });
  assert.equal((await folderOf(leaver.uid)).length, 2);

  const result = await leaver.call("requestAccountDeletion", { confirmation: "DELETE" });
  assert.equal(result.status, "completed");
  assert.equal(result.deleted.photos, 2);
  assert.equal(result.deleted.photoScreenings, 2);

  assert.deepEqual(await folderOf(leaver.uid), []);
  const screenings = await admin().collection("photoScreening").where("uid", "==", leaver.uid).get();
  assert.equal(screenings.size, 0);
});

test("moderators see a reported member's photo paths and can remove their photos, audited", async () => {
  const moderator = await makeActor("photomod");
  await adminAuth().setCustomUserClaims(moderator.uid, { moderator: true });
  await moderator.refreshToken();

  const accused = await makeActor("photoaccused");
  await accused.call("upsertProfile", { ...CAST.alex, displayName: "Accused" });
  const [a, b] = [await screenedPhoto(accused), await screenedPhoto(accused)];
  await accused.call("setProfilePhotos", { photoIds: [a, b] });

  const { reportId } = await aiko.call("reportUser", {
    reportedUid: accused.uid, reason: "inappropriate_content", detail: "Profile photo.",
  });

  const context = await moderator.call("getReportContext", { reportId });
  assert.deepEqual(context.report.reportedPhotos, [
    { id: a, path: pathOf(accused.uid, a) }, { id: b, path: pathOf(accused.uid, b) },
  ]);

  await expectFailure(aiko.call("actOnReport", { reportId, action: "remove-photos" }), "permission-denied",
    "an ordinary member cannot remove photos");

  const acted = await moderator.call("actOnReport", { reportId, action: "remove-photos", note: "Not a face photo." });
  assert.equal(acted.reportStatus, "actioned");
  assert.equal(acted.photosRemoved, 2);
  assert.deepEqual(await folderOf(accused.uid), []);
  assert.deepEqual((await admin().doc(`profiles/${accused.uid}`).get()).get("photos"), []);

  const audit = await admin().collection("moderationActions").where("reportId", "==", reportId).get();
  const actions = audit.docs.map((doc) => doc.data());
  const viewed = actions.find((entry) => entry.action === "viewed-context");
  assert.equal(viewed.photosListed, 2);
  const removed = actions.find((entry) => entry.action === "remove-photos");
  assert.equal(removed.moderatorUid, moderator.uid);
  assert.equal(removed.photosRemoved, 2);
  assert.equal(removed.note, "Not a face photo.");

  // Nothing is left for other members to read.
  await expectFailure(aiko.downloadUrl(pathOf(accused.uid, a)), "unauthorized", "a removed photo cannot be read");
});
