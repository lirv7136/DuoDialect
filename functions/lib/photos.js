"use strict";

const logger = require("firebase-functions/logger");
const { HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { requireObject, invalid } = require("./validation");
const { LIMITS, DUPLICATE_PHOTO_DISTANCE } = require("./constants");
const { REASON, reject } = require("./eligibility");
const { refs } = require("./refs");
const { faceVerdict, mayBeMainPhoto, faceProblemMessage } = require("./trust-policy");
const { dhashFromJpeg, hammingDistance, hashBands, isHash, isLowDetail } = require("./dhash");
const { readTrustConfig } = require("./trust");
const { mainPhotoRecheck, recheckAfterMainPhotoChange } = require("./verification");

/**
 * Profile photos.
 *
 * Objects live at profilePhotos/{uid}/{photoId}.jpg in the default bucket. The owner
 * uploads directly with the Storage SDK (storage.rules constrains who, what type and how
 * big); everything after that is server side:
 *
 *   1. onObjectFinalized runs screening on every new upload (screenUpload below).
 *   2. An approved object gets the custom metadata `talkevenScreening: "approved"`, which
 *      is what storage.rules checks before anyone may read it. A rejected object is
 *      deleted. Either way the outcome is written to photoScreening/{uid}_{photoId}, which
 *      only the owner can read, so the app can wait for it.
 *   3. setProfilePhotos puts up to three approved photos on the public profile, in order,
 *      and deletes objects that are no longer referenced.
 *
 * Screening also counts faces (Cloud Vision FACE_DETECTION) and records the verdict, so
 * the main photo, the first one, can be required to show exactly one clear face. Other
 * photos may show anything SafeSearch allows. And it fingerprints each photo (a dHash,
 * lib/dhash.js): a photo that matches one on another account is held for a moderator
 * (status "review", metadata "review", and a report in the moderation queue) instead of
 * being approved, because one picture on several accounts is how fake account farms look.
 *
 * No download URL is ever stored. The profile holds only { id, path }; clients resolve a
 * path with the Storage SDK, and the rules decide whether they may.
 */

const PHOTO_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const SCREENING_METADATA_KEY = "talkevenScreening";
/** SafeSearch likelihoods that count as a rejection for the categories we screen. */
const REJECT_LIKELIHOODS = ["LIKELY", "VERY_LIKELY"];
const SCREENED_CATEGORIES = ["adult", "violence", "racy"];
/**
 * An upload nobody has referenced yet is kept this long before setProfilePhotos may
 * clean it up, so a photo still being screened in another tab of the same flow is never
 * deleted underneath it. Photos that were on the profile and have been removed go at once.
 */
const ORPHAN_GRACE_MS = 60 * 60 * 1000;

const photoPath = (uid, photoId) => `profilePhotos/${uid}/${photoId}.jpg`;
const folderOf = (uid) => `profilePhotos/${uid}/`;
const bucket = () => getStorage().bucket();

/** Splits an object name into its owner and photo id, or null if it is not a profile photo. */
function parsePhotoPath(name) {
  const match = /^profilePhotos\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9-]{8,64})\.jpg$/.exec(String(name || ""));
  return match ? { uid: match[1], photoId: match[2] } : null;
}

/** Custom metadata the emulator stub reads to pretend Vision counted faces; see stubFaces. */
const STUB_FACES_METADATA_KEY = "talkevenStubFaces";
/** Reports created by screening rather than by a member. */
const SCREENING_REPORT_SOURCE = "photo-screening";
const DUPLICATE_REPORT_REASON = "duplicate_photo";
/** At most this many candidate fingerprints are compared per upload. */
const DUPLICATE_SCAN_LIMIT = 50;

/**
 * Screening transport.
 *
 * "stub" approves everything without calling anything. It is the default whenever the
 * Functions emulator is running, so tests never reach Cloud Vision, mirroring the push
 * transport in notifier.js. Set TALKEVEN_PHOTO_SCREENING to "stub" or "vision" to override.
 * The stub still fingerprints the bytes, so duplicate detection runs for real in tests.
 */
function resolveScreening() {
  const explicit = process.env.TALKEVEN_PHOTO_SCREENING;
  if (explicit === "stub" || explicit === "vision") return explicit;
  if (process.env.FUNCTIONS_EMULATOR === "true") return "stub";
  return "vision";
}

let visionClient = null;
function getVision() {
  if (!visionClient) {
    const vision = require("@google-cloud/vision");
    visionClient = new vision.ImageAnnotatorClient();
  }
  return visionClient;
}

/** The client returns likelihoods as enum names by default; accept the numeric form too. */
const LIKELIHOOD_NAMES = ["UNKNOWN", "VERY_UNLIKELY", "UNLIKELY", "POSSIBLE", "LIKELY", "VERY_LIKELY"];
function likelihoodName(value) {
  if (typeof value === "number") return LIKELIHOOD_NAMES[value] || "UNKNOWN";
  return typeof value === "string" ? value : "UNKNOWN";
}

/** Pure verdict from a SafeSearch annotation, so the policy is testable on its own. */
function verdictFromSafeSearch(annotation) {
  const scores = {};
  for (const category of SCREENED_CATEGORIES) {
    scores[category] = likelihoodName(annotation && annotation[category]);
  }
  const flagged = SCREENED_CATEGORIES.filter((category) => REJECT_LIKELIHOODS.includes(scores[category]));
  return { approved: flagged.length === 0, flagged, scores };
}

/**
 * What the stub reports for faces. One clear face unless the uploader set the custom
 * metadata `talkevenStubFaces` to "N" (N faces) or "N@C" (N faces at confidence C), which
 * is how the emulator tests simulate a photo with no face, a group or a blurry one. Only
 * the stub reads it: the Vision transport ignores client metadata entirely.
 */
function stubFaces(metadata) {
  const raw = metadata && typeof metadata[STUB_FACES_METADATA_KEY] === "string" ? metadata[STUB_FACES_METADATA_KEY] : "1";
  const match = /^(\d{1,2})(?:@(\d(?:\.\d+)?))?$/.exec(raw.trim());
  const count = match ? Number(match[1]) : 1;
  const confidence = match && match[2] !== undefined ? Number(match[2]) : 0.99;
  return faceVerdict(Array.from({ length: count }, () => ({ detectionConfidence: confidence })));
}

/**
 * SafeSearch and face detection, in one Vision request. A Vision error in the response
 * (an image it could not read, say) is thrown, so the upload fails closed rather than
 * passing with every likelihood UNKNOWN.
 */
async function screenImage(bucketName, name, metadata) {
  const transport = resolveScreening();
  if (transport === "stub") {
    return { approved: true, flagged: [], scores: {}, face: stubFaces(metadata), transport };
  }
  const [result] = await getVision().annotateImage({
    image: { source: { imageUri: `gs://${bucketName}/${name}` } },
    features: [{ type: "SAFE_SEARCH_DETECTION" }, { type: "FACE_DETECTION", maxResults: 10 }],
  });
  if (result && result.error && result.error.message) throw new Error(`Vision: ${result.error.message}`);
  return {
    ...verdictFromSafeSearch(result && result.safeSearchAnnotation),
    face: faceVerdict(result && result.faceAnnotations),
    transport,
  };
}

/** The photo's dHash, or null when it is not a JPEG we can read. Never throws. */
async function fingerprint(file) {
  try {
    const [bytes] = await file.download();
    return dhashFromJpeg(bytes);
  } catch (error) {
    logger.warn("Could not fingerprint a photo", { name: file.name, error: String(error) });
    return null;
  }
}

/**
 * Photos on other accounts that are the same picture: within DUPLICATE_PHOTO_DISTANCE bits,
 * approved, and not the uploader's own. Held photos are not matched against, so a copy
 * someone else uploaded (and that is now waiting for a moderator) never holds up the real
 * owner adding their own photo again. Plain pictures are skipped, since they all look
 * alike to a dHash.
 */
async function findDuplicates(db, uid, hash) {
  if (!isHash(hash) || isLowDetail(hash)) return [];
  const snap = await refs(db).photoScreenings()
    .where("dhashBands", "array-contains-any", hashBands(hash))
    .limit(DUPLICATE_SCAN_LIMIT)
    .get();
  return snap.docs
    .map((doc) => doc.data())
    .filter((other) => other.uid && other.uid !== uid && other.status === "approved" && isHash(other.dhash))
    .map((other) => ({ uid: other.uid, photoId: other.photoId, path: other.path, distance: hammingDistance(hash, other.dhash) }))
    .filter((match) => match.distance <= DUPLICATE_PHOTO_DISTANCE)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);
}

/**
 * Puts a held photo in the moderation queue. The id is fixed per photo, so a redelivered
 * event cannot file it twice. Which accounts it matched is only on the report: the
 * uploader can read their own screening record and must not learn whose photo it was.
 */
async function reportDuplicate(db, { uid, photoId, path, matches }) {
  await refs(db).report(`photo_${uid}_${photoId}`).set({
    reporterUid: null,
    source: SCREENING_REPORT_SOURCE,
    reportedUid: uid,
    conversationId: null,
    reason: DUPLICATE_REPORT_REASON,
    detail: `This photo matches ${matches.length} photo${matches.length === 1 ? "" : "s"} on other accounts. It is hidden until a moderator approves or rejects it.`,
    photo: { photoId, path },
    matches,
    status: "received",
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * The onObjectFinalized handler. Idempotent: an object that already carries a verdict is
 * left alone, so a redelivered event does not screen twice.
 */
async function screenUpload(db, object) {
  if (!object.name || !String(object.name).startsWith("profilePhotos/")) return { skipped: "not-a-profile-photo" };
  const parsed = parsePhotoPath(object.name);

  const file = getStorage().bucket(object.bucket).file(object.name);
  if (!parsed) {
    // storage.rules should make this impossible; delete rather than keep an unscreenable object.
    await file.delete({ ignoreNotFound: true });
    logger.warn("Deleted a malformed profile photo path", { name: object.name });
    return { skipped: "malformed" };
  }
  const existing = object.metadata && object.metadata[SCREENING_METADATA_KEY];
  if (existing) return { skipped: "already-screened" };

  const r = refs(db);
  const { uid, photoId } = parsed;

  // An upload that lands after its owner asked to be deleted must not outlive them.
  const deletion = await r.deletionRequest(uid).get();
  if (deletion.exists) {
    await file.delete({ ignoreNotFound: true });
    return { skipped: "account-deleted" };
  }

  let verdict;
  try {
    verdict = await screenImage(object.bucket, object.name, object.metadata);
  } catch (error) {
    // Fail closed: an unscreened photo is never made readable. The owner can try again.
    logger.error("Photo screening failed", { uid, photoId, error: String(error) });
    await file.delete({ ignoreNotFound: true });
    await r.photoScreening(uid, photoId).set({
      uid, photoId, path: object.name, status: "failed", flagged: [],
      transport: resolveScreening(), screenedAt: FieldValue.serverTimestamp(),
    });
    return { status: "failed" };
  }

  // Only a photo SafeSearch passed is worth fingerprinting; a rejected one is deleted.
  const dhash = verdict.approved ? await fingerprint(file) : null;
  const matches = dhash ? await findDuplicates(db, uid, dhash) : [];

  let status;
  if (!verdict.approved) {
    status = "rejected";
    await file.delete({ ignoreNotFound: true });
  } else if (matches.length > 0) {
    // Held: not readable (storage.rules wants "approved"), not usable by setProfilePhotos,
    // and marked so a redelivered event is skipped and the orphan sweep leaves it alone.
    status = "review";
    await file.setMetadata({ metadata: { [SCREENING_METADATA_KEY]: "review" } });
    await reportDuplicate(db, { uid, photoId, path: object.name, matches });
  } else {
    status = "approved";
    await file.setMetadata({ metadata: { [SCREENING_METADATA_KEY]: "approved" } });
  }

  await r.photoScreening(uid, photoId).set({
    uid,
    photoId,
    path: object.name,
    status,
    flagged: verdict.flagged,
    scores: verdict.scores,
    // { ok, count, confidence, problem }: whether this photo may be the main one.
    face: verdict.face || null,
    // The fingerprint, and its bands for the duplicate query. Null when unreadable.
    dhash: dhash || null,
    dhashBands: dhash ? hashBands(dhash) : [],
    transport: verdict.transport,
    contentType: object.contentType || null,
    size: Number(object.size || 0),
    screenedAt: FieldValue.serverTimestamp(),
  });
  logger.info("Photo screened", {
    uid, photoId, status, flagged: verdict.flagged, face: verdict.face && verdict.face.problem,
    duplicates: matches.length, transport: verdict.transport,
  });
  return { status };
}

function requirePhotoIds(value) {
  if (!Array.isArray(value)) throw invalid("photoIds must be an array.");
  if (value.length > LIMITS.photos) throw invalid(`You can add up to ${LIMITS.photos} photos.`);
  const seen = new Set();
  return value.map((id) => {
    if (typeof id !== "string" || !PHOTO_ID_PATTERN.test(id)) throw invalid("photoIds contains an invalid photo id.");
    if (seen.has(id)) throw invalid("photoIds lists the same photo more than once.");
    seen.add(id);
    return id;
  });
}

/** Only the id and path ever leave the server. Old or malformed entries are dropped. */
function publicPhotos(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item.id === "string" && typeof item.path === "string")
    .slice(0, LIMITS.photos)
    .map((item) => ({ id: item.id, path: item.path }));
}

/**
 * Throws unless every id names an approved photo in the caller's own folder and the first,
 * the main photo, may be a main photo (one clear face; a photo screened before face checks
 * existed counts as fine). Ids are never paths: the path is always built from the verified
 * uid, so another member's photo simply does not exist from the caller's point of view.
 *
 * The face refusal is invalid-argument with a readable message, because the 1.1.2 and
 * 1.2.0 apps show the server's message for invalid-argument, and so explain it properly.
 */
async function assertPhotosUsable(db, uid, photoIds) {
  const r = refs(db);
  const screenings = [];
  for (const photoId of photoIds) {
    const file = bucket().file(photoPath(uid, photoId));
    const [exists] = await file.exists();
    if (!exists) {
      throw reject("not-found", REASON.photoNotFound, "That photo is no longer available. Please add it again.");
    }
    const [metadata] = await file.getMetadata();
    const screening = await r.photoScreening(uid, photoId).get();
    if (screening.exists && screening.get("status") === "review") {
      throw reject("failed-precondition", REASON.photoInReview, "That photo is being checked by our team. Try a different one for now.");
    }
    const approved = metadata && metadata.metadata && metadata.metadata[SCREENING_METADATA_KEY] === "approved" &&
      screening.exists && screening.get("status") === "approved";
    if (!approved) {
      throw reject("failed-precondition", REASON.photoNotScreened, "That photo hasn’t finished its check yet.");
    }
    screenings.push(screening.data());
  }
  if (screenings.length > 0 && !mayBeMainPhoto(screenings[0])) {
    const problem = screenings[0].face.problem || "no-face";
    throw new HttpsError("invalid-argument", faceProblemMessage(problem), { reason: REASON.photoMainNeedsFace, problem });
  }
  return photoIds.map((id) => ({ id, path: photoPath(uid, id) }));
}

const mainIdOf = (photos) => (photos[0] ? photos[0].id : null);

/**
 * Sets the caller's profile photos, in order; the first is the main photo, and must show
 * one clear face (see assertPhotosUsable). While requireVerification is on, a verified
 * member whose main photo changes goes back to pending (lib/verification.js).
 */
async function setProfilePhotos(db, uid, payload, now = new Date()) {
  const body = requireObject(payload, "request");
  const photoIds = requirePhotoIds(body.photoIds);
  const r = refs(db);

  const photos = await assertPhotosUsable(db, uid, photoIds);
  const config = await readTrustConfig(db);
  const previous = await db.runTransaction(async (tx) => {
    const [snap, verificationSnap] = await tx.getAll(r.profile(uid), r.verification(uid));
    if (!snap.exists) {
      throw reject("failed-precondition", REASON.profileIncomplete, "Complete your profile before adding photos.");
    }
    const before = publicPhotos(snap.get("photos"));
    const recheck = config.requireVerification && mainIdOf(before) !== mainIdOf(photos)
      ? mainPhotoRecheck(verificationSnap) : null;
    tx.set(r.profile(uid), {
      photos, updatedAt: FieldValue.serverTimestamp(), ...(recheck ? recheck.profile : {}),
    }, { merge: true });
    if (recheck) tx.set(r.verification(uid), recheck.record, { merge: true });
    return before;
  });

  const deleted = await deleteUnreferenced(db, uid, {
    keep: new Set(photoIds),
    removedNow: new Set(previous.map((item) => item.id)),
    now,
  });
  return { photos, deleted };
}

/**
 * Removes objects in the caller's folder that the profile does not reference: at once for
 * photos that were just taken off the profile, after a grace period for uploads that were
 * never used (for example, abandoned part way through).
 */
async function deleteUnreferenced(db, uid, { keep, removedNow, now }) {
  const r = refs(db);
  const [files] = await bucket().getFiles({ prefix: folderOf(uid) });
  let deleted = 0;
  for (const file of files) {
    const parsed = parsePhotoPath(file.name);
    if (parsed && keep.has(parsed.photoId)) continue;
    // A photo held for a moderator stays until they approve or reject it.
    if (file.metadata && file.metadata.metadata && file.metadata.metadata[SCREENING_METADATA_KEY] === "review") continue;
    const created = Date.parse((file.metadata && file.metadata.timeCreated) || "");
    const stale = !Number.isFinite(created) || now.getTime() - created > ORPHAN_GRACE_MS;
    if (!parsed || removedNow.has(parsed.photoId) || stale) {
      await file.delete({ ignoreNotFound: true });
      if (parsed) await r.photoScreening(uid, parsed.photoId).delete();
      deleted += 1;
    }
  }
  return deleted;
}

/**
 * Deletes every photo object and screening record for a person and clears the photos on
 * their profile if it still exists. Used by account deletion and by moderation.
 */
async function deleteAllPhotosFor(db, uid) {
  const r = refs(db);
  const [files] = await bucket().getFiles({ prefix: folderOf(uid) });
  for (const file of files) await file.delete({ ignoreNotFound: true });

  const screenings = await r.photoScreenings().where("uid", "==", uid).limit(500).get();
  for (const doc of screenings.docs) await doc.ref.delete();

  const profile = await r.profile(uid).get();
  if (profile.exists && Array.isArray(profile.get("photos")) && profile.get("photos").length > 0) {
    await r.profile(uid).set({ photos: [], updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    // The main photo is gone, so whatever was verified against it no longer stands.
    if ((await readTrustConfig(db)).requireVerification) await recheckAfterMainPhotoChange(db, uid);
  }
  return { objects: files.length, screenings: screenings.size };
}

/**
 * A moderator approves a photo screening held for review: it becomes readable and usable,
 * and it is added to the end of the member's photos when there is room and the main photo
 * rule still holds, since adding it is what they were trying to do. Returns whether it was
 * added.
 */
async function approveHeldPhoto(db, uid, photoId, moderatorUid) {
  const r = refs(db);
  const path = photoPath(uid, photoId);
  const file = bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw reject("not-found", REASON.photoNotFound, "That photo no longer exists.");
  await file.setMetadata({ metadata: { [SCREENING_METADATA_KEY]: "approved" } });
  await r.photoScreening(uid, photoId).set({
    status: "approved", reviewedBy: moderatorUid, reviewedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const config = await readTrustConfig(db);
  return db.runTransaction(async (tx) => {
    const [profileSnap, screeningSnap, verificationSnap] = await tx.getAll(
      r.profile(uid), r.photoScreening(uid, photoId), r.verification(uid),
    );
    if (!profileSnap.exists) return false;
    const photos = publicPhotos(profileSnap.get("photos"));
    if (photos.some((photo) => photo.id === photoId) || photos.length >= LIMITS.photos) return false;
    if (photos.length === 0 && !mayBeMainPhoto(screeningSnap.data())) return false;
    // Added to an empty profile, it becomes the main photo.
    const recheck = config.requireVerification && photos.length === 0 ? mainPhotoRecheck(verificationSnap) : null;
    tx.set(r.profile(uid), { photos: [...photos, { id: photoId, path }], ...(recheck ? recheck.profile : {}) }, { merge: true });
    if (recheck) tx.set(r.verification(uid), recheck.record, { merge: true });
    return true;
  });
}

/** A moderator rejects a held photo: the object and its screening record are deleted. */
async function rejectHeldPhoto(db, uid, photoId) {
  await bucket().file(photoPath(uid, photoId)).delete({ ignoreNotFound: true });
  await refs(db).photoScreening(uid, photoId).delete();
}

module.exports = {
  PHOTO_ID_PATTERN,
  SCREENING_METADATA_KEY,
  STUB_FACES_METADATA_KEY,
  SCREENING_REPORT_SOURCE,
  DUPLICATE_REPORT_REASON,
  stubFaces,
  requirePhotoIds,
  assertPhotosUsable,
  approveHeldPhoto,
  rejectHeldPhoto,
  photoPath,
  parsePhotoPath,
  resolveScreening,
  verdictFromSafeSearch,
  screenUpload,
  setProfilePhotos,
  publicPhotos,
  deleteAllPhotosFor,
};
