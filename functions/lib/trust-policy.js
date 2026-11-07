"use strict";

/**
 * The pure rules behind trust and anti fake measures. No Firebase here: everything takes
 * plain values and returns plain values, so tests/trust-policy.test.cjs runs it without
 * the emulator, and the callables (lib/trust.js, lib/verification.js, lib/photos.js, the
 * rate limited callables) stay thin.
 */

const {
  TRUST_DEFAULTS, VERIFICATION_STATUSES, AGE_REVIEW_GAP_YEARS, MIN_FACE_CONFIDENCE, RATE_LIMITS, LIMITS,
} = require("./constants");

const TRUST_REASON = {
  verificationRequiredToMeet: "verification/required-to-meet",
  emailUnconfirmed: "trust/email-unconfirmed",
};

/** A Firestore Timestamp, a Date, an ISO string or epoch milliseconds, as a Date; else null. */
function toDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value.toDate === "function") return toDate(value.toDate());
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

/**
 * config/trust as the callables use it. Only a literal true turns a flag on: anything
 * missing or malformed is off, so an empty or absent document behaves exactly like the
 * backend before phase 1. Unknown fields are ignored.
 */
function normalizeTrustConfig(data) {
  const raw = data && typeof data === "object" ? data : {};
  const config = { ...TRUST_DEFAULTS };
  for (const key of Object.keys(TRUST_DEFAULTS)) config[key] = raw[key] === true;
  return config;
}

/**
 * Verification is needed before the first meetup, not at sign up. So while
 * requireVerification is on, an unverified member signs up, stays discoverable, browses and
 * chats as before, and only creating or accepting an invitation is refused, with
 * verification/required-to-meet so the app can open the selfie check. There is no grace
 * period: the same rule applies to everyone from the moment the flag is on, and plans
 * already accepted carry on untouched.
 */
function mayMakePlans({ config, verified }) {
  if (!config || config.requireVerification !== true || verified === true) return { allowed: true, reason: null };
  return { allowed: false, reason: TRUST_REASON.verificationRequiredToMeet };
}

/** From a verified ID token: a confirmed email, or a Sign in with Apple session. */
function emailConfirmedFromToken(token) {
  if (!token || typeof token !== "object") return false;
  const provider = token.firebase && token.firebase.sign_in_provider;
  return token.email_verified === true || provider === "apple.com";
}

/** From an Admin SDK user record: a confirmed email, or an Apple account. */
function emailConfirmedFromUser(user) {
  if (!user || typeof user !== "object") return false;
  if (user.emailVerified === true) return true;
  return Array.isArray(user.providerData) && user.providerData.some((item) => item && item.providerId === "apple.com");
}

/**
 * The main photo rule, from Cloud Vision FACE_DETECTION: exactly one face, detected with
 * at least MIN_FACE_CONFIDENCE. `problem` says which part failed, for the client copy.
 */
function faceVerdict(annotations, minConfidence = MIN_FACE_CONFIDENCE) {
  const faces = Array.isArray(annotations) ? annotations.filter((face) => face && typeof face === "object") : [];
  const count = faces.length;
  const confidence = count === 0 ? 0 : Math.max(...faces.map((face) => {
    const value = Number(face.detectionConfidence);
    return Number.isFinite(value) ? value : 0;
  }));
  let problem = null;
  if (count === 0) problem = "no-face";
  else if (count > 1) problem = "many-faces";
  else if (confidence < minConfidence) problem = "unclear-face";
  return { ok: problem === null, count, confidence: Math.round(confidence * 1000) / 1000, problem };
}

/**
 * Whether a photo may be the main one. A screening record from before face checks has no
 * `face`, and stays usable, so nobody already on Talkeven is locked out of their photos.
 */
function mayBeMainPhoto(screening) {
  return !(screening && screening.face && screening.face.ok === false);
}

const FACE_PROBLEM_MESSAGES = {
  "no-face": "Your main photo needs to show your face. We couldn’t find one in that photo.",
  "many-faces": "Your main photo needs to show just you. That one has more than one face.",
  "unclear-face": "Your main photo needs to show your face clearly. That one is too unclear.",
};

function faceProblemMessage(problem) {
  return FACE_PROBLEM_MESSAGES[problem] || FACE_PROBLEM_MESSAGES["no-face"];
}

/**
 * Phase 2: what one automated selfie check means for a member's status.
 *
 *   outcome "pending"       the check has started; nothing is decided, no attempt counted
 *   outcome "fail"          failed, or liveness or face match said no
 *   outcome "inconclusive"  review, for a moderator
 *   outcome "pass"          verified, unless the age estimate says otherwise:
 *                           under 18 is never verified automatically (review, ageReview);
 *                           far from the declared age is verified with ageReview set
 */
function decideVerification({ result, declaredAge = null }) {
  const outcome = result && result.outcome;
  if (outcome === "pending") return { status: "pending", ageReview: null, countsAsAttempt: false };
  if (outcome === "inconclusive") return { status: "review", ageReview: null, countsAsAttempt: true };
  if (outcome !== "pass" || result.liveness === false || result.faceMatch === false) {
    return { status: "failed", ageReview: null, countsAsAttempt: true };
  }
  const estimate = Number(result.ageEstimate);
  if (result.ageEstimate === null || result.ageEstimate === undefined || !Number.isFinite(estimate)) {
    return { status: "verified", ageReview: false, countsAsAttempt: true };
  }
  if (estimate < LIMITS.minAge) return { status: "review", ageReview: true, countsAsAttempt: true };
  const gap = typeof declaredAge === "number" ? Math.abs(estimate - declaredAge) : 0;
  return { status: "verified", ageReview: gap > AGE_REVIEW_GAP_YEARS, countsAsAttempt: true };
}

function isVerificationStatus(value) {
  return VERIFICATION_STATUSES.includes(value);
}

/** The UTC calendar day a rate limit counts in, "YYYY-MM-DD". */
function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * One member's rateLimits document against one action. The counts reset when the stored
 * day is not today, so a member who was busy yesterday starts fresh.
 */
function quotaCheck(data, action, now = new Date(), limits = RATE_LIMITS) {
  const limit = limits[action];
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`No rate limit for ${action}.`);
  const day = utcDay(now);
  const today = !!data && data.day === day && !!data.counts && typeof data.counts === "object";
  const counts = today ? { ...data.counts } : {};
  const used = Math.max(0, Math.floor(Number(counts[action]) || 0));
  return { allowed: used < limit, used, limit, day, counts };
}

/** The counts to store after one more `action`. */
function chargedCounts(check, action) {
  return { ...check.counts, [action]: check.used + 1 };
}

module.exports = {
  TRUST_REASON,
  toDate,
  normalizeTrustConfig,
  mayMakePlans,
  emailConfirmedFromToken,
  emailConfirmedFromUser,
  faceVerdict,
  mayBeMainPhoto,
  faceProblemMessage,
  decideVerification,
  isVerificationStatus,
  utcDay,
  quotaCheck,
  chargedCounts,
};
