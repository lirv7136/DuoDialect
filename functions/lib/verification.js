"use strict";

const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { refs } = require("./refs");
const { ageFromBirthDate, requireObject, requireBoolean } = require("./validation");
const { decideVerification, isVerificationStatus } = require("./trust-policy");

/**
 * Member verification.
 *
 *   profiles/{uid}.verified   public boolean; the "Verified" badge and the verified only
 *                             filter read it. Server written, true only while the status
 *                             below is "verified".
 *   verifications/{uid}       server only; never readable by any client. getMyAccount
 *                             returns the owner's status, method and verifiedAt from it.
 *                             { uid, status, method, verifiedAt, ageReview, attempts,
 *                               lastResult, reviewedBy, note, createdAt, updatedAt }
 *
 * status is one of none | pending | verified | failed | review. Phase 1 sets it only by
 * hand, through the moderator callable setVerification (lib/moderation.js). Phase 2's
 * selfie check (liveness, face match, age estimate) calls applyVerificationResult below,
 * and nothing else needs to change: the badge, the filter, the requireVerification gate
 * and the copy onto a profile created after the check all read the same two documents.
 *
 * Verified means the person matched their main photo, so while requireVerification is on,
 * changing the main photo puts a verified member back to "pending" with photoChangedAt set
 * and takes the badge away until the check runs again (mainPhotoRecheck below).
 */

/**
 * The one writer. Sets the record and, when the profile exists, profiles/{uid}.verified,
 * in one transaction. A profile created later copies the status (see upsertProfile), so a
 * check that runs at sign up, before there is a profile, still shows.
 *
 * The profile's updatedAt is left alone on purpose: it means "the member saved their
 * profile", which the stats count as activity.
 */
async function setVerificationStatus(db, uid, {
  status, method = null, by = null, note = "", ageReview, result = null, countAttempt = false,
}) {
  if (!isVerificationStatus(status)) throw new Error(`Unknown verification status: ${status}`);
  const r = refs(db);
  return db.runTransaction(async (tx) => {
    const [recordSnap, profileSnap] = await tx.getAll(r.verification(uid), r.profile(uid));
    const previous = recordSnap.exists ? recordSnap.data() : null;
    const previousStatus = (previous && previous.status) || "none";
    const verified = status === "verified";
    const keepVerifiedAt = verified && previousStatus === "verified" && previous.verifiedAt;
    const photos = profileSnap.exists && Array.isArray(profileSnap.get("photos")) ? profileSnap.get("photos") : [];
    const mainPhotoId = photos[0] && typeof photos[0].id === "string" ? photos[0].id : null;
    const record = {
      uid,
      status,
      method: method || (previous && previous.method) || null,
      verifiedAt: verified ? (keepVerifiedAt ? previous.verifiedAt : FieldValue.serverTimestamp()) : null,
      // The main photo the person was matched against, for the record and for phase 2.
      photoId: verified ? mainPhotoId : (previous && previous.photoId) || null,
      pendingReason: null,
      ageReview: typeof ageReview === "boolean" ? ageReview : !!(previous && previous.ageReview === true),
      attempts: Number((previous && previous.attempts) || 0) + (countAttempt ? 1 : 0),
      lastResult: result || (previous && previous.lastResult) || null,
      reviewedBy: by,
      note: note || "",
      createdAt: (previous && previous.createdAt) || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(r.verification(uid), record);
    if (profileSnap.exists && (profileSnap.get("verified") === true) !== verified) {
      tx.set(r.profile(uid), { verified }, { merge: true });
    }
    return {
      uid, status, previousStatus, verified, ageReview: record.ageReview, attempts: record.attempts,
      profileUpdated: profileSnap.exists,
    };
  });
}

const RESULT_OUTCOMES = ["pending", "pass", "fail", "inconclusive"];

/** Keeps only what is worth storing from a provider result; never the selfie itself. */
function storedResult(result) {
  const out = { outcome: result.outcome };
  if (typeof result.liveness === "boolean") out.liveness = result.liveness;
  if (typeof result.faceMatch === "boolean") out.faceMatch = result.faceMatch;
  if (Number.isFinite(Number(result.ageEstimate)) && result.ageEstimate !== null) out.ageEstimate = Number(result.ageEstimate);
  if (typeof result.provider === "string") out.provider = result.provider.slice(0, 40);
  if (typeof result.providerRef === "string") out.providerRef = result.providerRef.slice(0, 128);
  return out;
}

/**
 * PHASE 2 PLUGS IN HERE.
 *
 * Call this once per selfie check with the provider's result, from whatever receives it
 * (a callable the app calls after the check, or the provider's webhook):
 *
 *   await applyVerificationResult(db, uid, {
 *     outcome: "pass" | "fail" | "inconclusive" | "pending",
 *     liveness: true, faceMatch: true,        // optional; false fails a pass
 *     ageEstimate: 29,                        // optional, in years
 *     provider: "acme", providerRef: "chk_123", method: "selfie",
 *   });
 *
 * It decides the status (trust-policy.js decideVerification: under 18 by estimate is never
 * verified automatically, a large gap from the declared age is verified with ageReview
 * set), counts the attempt, and writes the record and the public badge. Selfies and face
 * templates are never passed in or stored here.
 */
async function applyVerificationResult(db, uid, result) {
  const body = requireObject(result, "result");
  if (!RESULT_OUTCOMES.includes(body.outcome)) {
    throw new HttpsError("invalid-argument", `result.outcome must be one of: ${RESULT_OUTCOMES.join(", ")}.`);
  }
  if (body.liveness !== undefined) requireBoolean(body.liveness, "result.liveness");
  if (body.faceMatch !== undefined) requireBoolean(body.faceMatch, "result.faceMatch");
  const privateSnap = await refs(db).privateProfile(uid).get();
  const declaredAge = ageFromBirthDate(privateSnap.exists ? privateSnap.get("birthDate") : null);
  const decision = decideVerification({ result: body, declaredAge });
  return setVerificationStatus(db, uid, {
    status: decision.status,
    method: typeof body.method === "string" ? body.method.slice(0, 20) : "selfie",
    ageReview: decision.ageReview === null ? undefined : decision.ageReview,
    result: storedResult(body),
    countAttempt: decision.countsAsAttempt,
  });
}

/**
 * The writes that send a verified member back to "pending" because their main photo
 * changed, or null when there is nothing to do (not verified). Pure over the snapshot so
 * callers fold it into the transaction that changes the photos: `profile` merges into the
 * profile write, `record` is merged into verifications/{uid}. Callers apply it only while
 * requireVerification is on.
 */
function mainPhotoRecheck(verificationSnap) {
  if (!verificationSnap || !verificationSnap.exists || verificationSnap.get("status") !== "verified") return null;
  return {
    profile: { verified: false },
    record: {
      status: "pending",
      pendingReason: "main-photo-changed",
      photoChangedAt: FieldValue.serverTimestamp(),
      verifiedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
  };
}

/** mainPhotoRecheck in a transaction of its own, for a change made outside one. */
async function recheckAfterMainPhotoChange(db, uid) {
  const r = refs(db);
  return db.runTransaction(async (tx) => {
    const [verificationSnap, profileSnap] = await tx.getAll(r.verification(uid), r.profile(uid));
    const recheck = mainPhotoRecheck(verificationSnap);
    if (!recheck) return false;
    tx.set(r.verification(uid), recheck.record, { merge: true });
    if (profileSnap.exists) tx.set(r.profile(uid), recheck.profile, { merge: true });
    return true;
  });
}

module.exports = {
  setVerificationStatus, applyVerificationResult, mainPhotoRecheck, recheckAfterMainPhotoChange, RESULT_OUTCOMES,
};
