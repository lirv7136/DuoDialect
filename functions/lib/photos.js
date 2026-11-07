"use strict";

const logger = require("firebase-functions/logger");
const { FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { requireObject, invalid } = require("./validation");
const { LIMITS } = require("./constants");
const { REASON, reject } = require("./eligibility");
const { refs } = require("./refs");

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

/**
 * Screening transport.
 *
 * "stub" approves everything without calling anything. It is the default whenever the
 * Functions emulator is running, so tests never reach Cloud Vision, mirroring the push
 * transport in notifier.js. Set TALKEVEN_PHOTO_SCREENING to "stub" or "vision" to override.
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

async function screenImage(bucketName, name) {
  const transport = resolveScreening();
  if (transport === "stub") {
    return { approved: true, flagged: [], scores: {}, transport };
  }
  const [result] = await getVision().safeSearchDetection(`gs://${bucketName}/${name}`);
  return { ...verdictFromSafeSearch(result && result.safeSearchAnnotation), transport };
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
    verdict = await screenImage(object.bucket, object.name);
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

  if (verdict.approved) {
    await file.setMetadata({ metadata: { [SCREENING_METADATA_KEY]: "approved" } });
  } else {
    await file.delete({ ignoreNotFound: true });
  }

  const status = verdict.approved ? "approved" : "rejected";
  await r.photoScreening(uid, photoId).set({
    uid,
    photoId,
    path: object.name,
    status,
    flagged: verdict.flagged,
    scores: verdict.scores,
    transport: verdict.transport,
    contentType: object.contentType || null,
    size: Number(object.size || 0),
    screenedAt: FieldValue.serverTimestamp(),
  });
  logger.info("Photo screened", { uid, photoId, status, flagged: verdict.flagged, transport: verdict.transport });
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
 * Sets the caller's profile photos, in order; the first is the main photo.
 *
 * Every id must name an object in the caller's own folder that has passed screening.
 * Ids are never paths: the path is always built from the verified uid, so another
 * member's photo simply does not exist from the caller's point of view.
 */
async function setProfilePhotos(db, uid, payload, now = new Date()) {
  const body = requireObject(payload, "request");
  const photoIds = requirePhotoIds(body.photoIds);
  const r = refs(db);

  for (const photoId of photoIds) {
    const file = bucket().file(photoPath(uid, photoId));
    const [exists] = await file.exists();
    if (!exists) {
      throw reject("not-found", REASON.photoNotFound, "That photo is no longer available. Please add it again.");
    }
    const [metadata] = await file.getMetadata();
    const screening = await r.photoScreening(uid, photoId).get();
    const approved = metadata && metadata.metadata && metadata.metadata[SCREENING_METADATA_KEY] === "approved" &&
      screening.exists && screening.get("status") === "approved";
    if (!approved) {
      throw reject("failed-precondition", REASON.photoNotScreened, "That photo hasn’t finished its check yet.");
    }
  }

  const photos = photoIds.map((id) => ({ id, path: photoPath(uid, id) }));
  const previous = await db.runTransaction(async (tx) => {
    const snap = await tx.get(r.profile(uid));
    if (!snap.exists) {
      throw reject("failed-precondition", REASON.profileIncomplete, "Complete your profile before adding photos.");
    }
    tx.set(r.profile(uid), { photos, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return publicPhotos(snap.get("photos"));
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
  }
  return { objects: files.length, screenings: screenings.size };
}

module.exports = {
  PHOTO_ID_PATTERN,
  SCREENING_METADATA_KEY,
  photoPath,
  parsePhotoPath,
  resolveScreening,
  verdictFromSafeSearch,
  screenUpload,
  setProfilePhotos,
  publicPhotos,
  deleteAllPhotosFor,
};
