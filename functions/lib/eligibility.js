"use strict";

const { HttpsError } = require("firebase-functions/v2/https");
const { LIMITS } = require("./constants");
const { ageFromBirthDate, offeredLanguages, soughtLanguages, normalizeLanguage } = require("./validation");
const { refs } = require("./refs");

/**
 * Machine readable rejection reasons. Clients should branch on these rather than
 * on message text. Block related failures deliberately use one opaque reason so a
 * caller cannot learn who blocked whom, or that a block exists at all.
 */
const REASON = {
  profileMissing: "profile/not-found",
  profileIncomplete: "profile/incomplete",
  selfTarget: "target/self",
  unavailable: "target/unavailable",
  notReciprocal: "language/not-reciprocal",
  insufficientFluency: "language/insufficient-fluency",
  languageNotOffered: "language/not-offered",
  accountNotAdult: "account/not-adult",
  notAdult: "dating/not-adult",
  datingDisabled: "dating/not-enabled",
  datingPreferences: "dating/preferences-mismatch",
  invitationDuplicate: "invitation/duplicate-active",
  invitationNotPending: "invitation/not-pending",
  invitationNotRecipient: "invitation/not-recipient",
  invitationNotSender: "invitation/not-sender",
  invitationNotFound: "invitation/not-found",
  conversationNotMember: "conversation/not-member",
  conversationNotFound: "conversation/not-found",
  photoNotFound: "photo/not-found",
  photoNotScreened: "photo/not-screened",
};

function reject(code, reason, message) {
  return new HttpsError(code, message, { reason });
}

/** A profile can take part once it offers at least one language and seeks at least one. */
function isUsableProfile(profile) {
  if (!profile) return false;
  if (typeof profile.displayName !== "string" || !profile.displayName.trim()) return false;
  return offeredLanguages(profile.speaks).length > 0 && soughtLanguages(profile.learns).length > 0;
}

function intersect(a, b) {
  const set = new Set(b);
  return a.filter((value) => set.has(value)).sort();
}

/** Every language either side lists, regardless of level. Used only to explain failures. */
function allLanguages(entries) {
  return [...new Set((Array.isArray(entries) ? entries : [])
    .filter((item) => item && typeof item.lang === "string")
    .map((item) => normalizeLanguage(item.lang)))].sort();
}

/**
 * The exchange is reciprocal only when each side can offer, at native or fluent level,
 * a language the other side is practising. Intermediate and beginner never qualify to teach.
 */
function reciprocalExchange(profileA, profileB) {
  const aOffers = intersect(offeredLanguages(profileA && profileA.speaks), soughtLanguages(profileB && profileB.learns));
  const bOffers = intersect(offeredLanguages(profileB && profileB.speaks), soughtLanguages(profileA && profileA.learns));
  return { aOffers, bOffers, reciprocal: aOffers.length > 0 && bOffers.length > 0 };
}

/**
 * Distinguishes "you do not share a usable pair" from "you share a pair but one side
 * is not fluent enough to teach it", which is the more common and more useful message.
 */
function languageFailureReason(profileA, profileB) {
  const loose = {
    aOffers: intersect(allLanguages(profileA && profileA.speaks), soughtLanguages(profileB && profileB.learns)),
    bOffers: intersect(allLanguages(profileB && profileB.speaks), soughtLanguages(profileA && profileA.learns)),
  };
  if (loose.aOffers.length > 0 && loose.bOffers.length > 0) return REASON.insufficientFluency;
  return REASON.notReciprocal;
}

function adultAge(privateProfile, now) {
  const age = ageFromBirthDate(privateProfile && privateProfile.birthDate, now);
  return typeof age === "number" ? age : null;
}

/**
 * Dating requires, on both sides: a self declared adult age, dating switched on,
 * and each person's gender inside the other's stated preferences and age range.
 * A missing private profile fails closed.
 */
function datingEligibility(privateA, privateB, now = new Date()) {
  const ageA = adultAge(privateA, now);
  const ageB = adultAge(privateB, now);
  if (ageA === null || ageB === null) return { eligible: false, reason: REASON.notAdult };
  if (ageA < LIMITS.minAge || ageB < LIMITS.minAge) return { eligible: false, reason: REASON.notAdult };

  const datingA = (privateA && privateA.dating) || {};
  const datingB = (privateB && privateB.dating) || {};
  if (datingA.enabled !== true || datingB.enabled !== true) {
    return { eligible: false, reason: REASON.datingDisabled };
  }

  const genderA = privateA && privateA.gender;
  const genderB = privateB && privateB.gender;
  const wantsB = Array.isArray(datingA.genders) && datingA.genders.includes(genderB);
  const wantsA = Array.isArray(datingB.genders) && datingB.genders.includes(genderA);
  const ageBOk = ageB >= datingA.ageMin && ageB <= datingA.ageMax;
  const ageAOk = ageA >= datingB.ageMin && ageA <= datingB.ageMax;
  if (!wantsA || !wantsB || !ageAOk || !ageBOk) {
    return { eligible: false, reason: REASON.datingPreferences };
  }
  return { eligible: true, reason: null, ages: { a: ageA, b: ageB } };
}

/**
 * Loads both sides of a relationship in one round trip: public profiles, private
 * profiles and the two block documents. Callables re-load this at every decision
 * point, because consent and blocks can change between creating and accepting.
 */
async function loadPair(db, uidA, uidB) {
  const r = refs(db);
  const [profileA, profileB, privateA, privateB, blockAB, blockBA] = await db.getAll(
    r.profile(uidA),
    r.profile(uidB),
    r.privateProfile(uidA),
    r.privateProfile(uidB),
    r.block(uidA, uidB),
    r.block(uidB, uidA),
  );
  return {
    profileA: profileA.exists ? profileA.data() : null,
    profileB: profileB.exists ? profileB.data() : null,
    privateA: privateA.exists ? privateA.data() : null,
    privateB: privateB.exists ? privateB.data() : null,
    blockedEither: blockAB.exists || blockBA.exists,
  };
}

/**
 * The single gate every invitation, acceptance and message passes through.
 * `uidA` is the acting user. Throws an HttpsError carrying a REASON on failure.
 */
function assertPairEligible({ uidA, uidB, intent, pair, now = new Date() }) {
  if (uidA === uidB) throw reject("invalid-argument", REASON.selfTarget, "You cannot invite yourself.");

  // A block in either direction makes the other person indistinguishable from absent.
  if (pair.blockedEither) {
    throw reject("permission-denied", REASON.unavailable, "This person is not available.");
  }
  if (!pair.profileA) {
    throw reject("failed-precondition", REASON.profileIncomplete, "Complete your own profile first.");
  }
  if (!pair.profileB) {
    throw reject("not-found", REASON.profileMissing, "This person is not available.");
  }
  if (!isUsableProfile(pair.profileA)) {
    throw reject("failed-precondition", REASON.profileIncomplete, "Complete your own profile first.");
  }
  if (!isUsableProfile(pair.profileB)) {
    throw reject("failed-precondition", REASON.profileIncomplete, "This person is not available.");
  }

  const exchange = reciprocalExchange(pair.profileA, pair.profileB);
  if (!exchange.reciprocal) {
    const reason = languageFailureReason(pair.profileA, pair.profileB);
    throw reject(
      "failed-precondition",
      reason,
      reason === REASON.insufficientFluency
        ? "Both people must be native or fluent in the language they offer."
        : "You do not have a reciprocal language exchange with this person.",
    );
  }

  if (intent === "dating") {
    const dating = datingEligibility(pair.privateA, pair.privateB, now);
    if (!dating.eligible) {
      throw reject(
        "failed-precondition",
        dating.reason,
        dating.reason === REASON.notAdult
          ? "Language dates are available to adults aged 18 and over."
          : "Language dates need both people to opt in and match each other's preferences.",
      );
    }
  }

  return exchange;
}

module.exports = {
  REASON,
  reject,
  isUsableProfile,
  reciprocalExchange,
  languageFailureReason,
  datingEligibility,
  loadPair,
  assertPairEligible,
  intersect,
};
