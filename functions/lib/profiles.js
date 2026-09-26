"use strict";

const { FieldValue } = require("firebase-admin/firestore");
const {
  requireObject, requireString, optionalString, requireEnum, requireBoolean, requireInteger,
  requireLanguageList, requireShortTextList, requireBirthDate, ageFromBirthDate,
  offeredLanguages, soughtLanguages,
} = require("./validation");
const { GENDERS, LIMITS, AGE_ASSURANCE, FLUENCY_ASSURANCE } = require("./constants");
const { REASON, reject } = require("./eligibility");
const { refs } = require("./refs");
const { cancelPendingInvitationsFor } = require("./invitations");
const { publicPhotos } = require("./photos");

/**
 * Validates a dating preferences block. Callers who are not adults, by their own
 * declared birth date, cannot switch dating on at all.
 */
function requireDatingPreferences(value, field, { age }) {
  const dating = requireObject(value, field);
  const enabled = requireBoolean(dating.enabled, `${field}.enabled`);

  if (!enabled) {
    return { enabled: false, genders: [], ageMin: LIMITS.minAge, ageMax: LIMITS.maxAge };
  }
  if (typeof age !== "number" || age < LIMITS.minAge) {
    throw reject(
      "failed-precondition",
      REASON.notAdult,
      "Language dates are available to adults aged 18 and over.",
    );
  }
  const genders = requireShortTextList(dating.genders, `${field}.genders`, {
    maxItems: GENDERS.length, maxLength: 20, min: 1,
  }).map((entry) => requireEnum(entry.toLocaleLowerCase("en"), `${field}.genders`, GENDERS));
  const ageMin = requireInteger(dating.ageMin, `${field}.ageMin`, LIMITS.minAge, LIMITS.maxAge);
  const ageMax = requireInteger(dating.ageMax, `${field}.ageMax`, LIMITS.minAge, LIMITS.maxAge);
  if (ageMin > ageMax) throw reject("invalid-argument", "dating/age-range", `${field}.ageMin must not exceed ${field}.ageMax.`);
  return { enabled: true, genders: [...new Set(genders)], ageMin, ageMax };
}

/** Gender is optional until dating is on; mutual preference matching needs it then. */
function requireGenderForDating(dating, gender) {
  if (dating.enabled === true && !gender) {
    throw reject("failed-precondition", "dating/gender-required", "Add your gender before turning on language dates.");
  }
}

/**
 * Creates or replaces the caller's profile.
 *
 * The public document holds only what other members may see. Birth date, gender and
 * dating preferences go to privateProfiles/, which no other client can read. Both
 * documents are written in one batch so they cannot drift apart.
 *
 * `offers` and `seeks` are derived here, never accepted from the client, because the
 * discovery query trusts them.
 */
async function upsertProfile(db, uid, payload, now = new Date()) {
  const body = requireObject(payload, "request");
  const r = refs(db);

  const [publicSnap, privateSnap] = await db.getAll(r.profile(uid), r.privateProfile(uid));
  const existingPrivate = privateSnap.exists ? privateSnap.data() : null;
  const isNew = !publicSnap.exists;

  const displayName = requireString(body.displayName, "displayName", LIMITS.displayName);
  const bio = optionalString(body.bio, "bio", LIMITS.bio);
  const area = optionalString(body.area, "area", LIMITS.area);
  const speaks = requireLanguageList(body.speaks, "speaks", { min: 1 });
  const learns = requireLanguageList(body.learns, "learns", { min: 1 });
  const availability = body.availability === undefined ? [] : requireShortTextList(
    body.availability, "availability",
    { maxItems: LIMITS.availability, maxLength: LIMITS.availabilitySlot },
  );
  const interests = body.interests === undefined ? [] : requireShortTextList(
    body.interests, "interests", { maxItems: LIMITS.interests, maxLength: LIMITS.interest },
  );

  const offers = offeredLanguages(speaks);
  const seeks = soughtLanguages(learns);
  if (offers.length === 0) {
    throw reject(
      "failed-precondition",
      REASON.insufficientFluency,
      "List at least one language you speak at native or fluent level.",
    );
  }
  const overlap = offers.filter((lang) => seeks.includes(lang));
  if (overlap.length > 0) {
    throw reject(
      "invalid-argument",
      "language/offered-and-sought",
      `You cannot both offer and practise the same language (${overlap.join(", ")}).`,
    );
  }

  const birthDate = body.birthDate === undefined && existingPrivate
    ? existingPrivate.birthDate
    : requireBirthDate(body.birthDate, "birthDate");
  const age = ageFromBirthDate(birthDate, now);

  // Talkeven is an adults only service, matching the reviewed product. This is a
  // self declared date of birth with no verification behind it; the dating gate in
  // eligibility.js re-checks age independently, so an edited or stale record still fails.
  if (typeof age !== "number" || age < LIMITS.minAge) {
    throw reject(
      "failed-precondition",
      REASON.accountNotAdult,
      "Talkeven is for adults aged 18 and over.",
    );
  }

  // Optional: only dating uses it, and v1 of the app does not offer dating. Omitted or null
  // keeps what is stored; dating refuses to switch on without one (requireGenderForDating).
  const gender = body.gender === undefined || body.gender === null
    ? (existingPrivate && existingPrivate.gender) || null
    : requireEnum(String(body.gender).toLocaleLowerCase("en"), "gender", GENDERS);

  const previousDating = (existingPrivate && existingPrivate.dating) || null;
  let dating;
  if (body.dating !== undefined) {
    dating = requireDatingPreferences(body.dating, "dating", { age });
  } else if (previousDating) {
    // Keep the stored preferences, but never let a stale opt in outlive adult eligibility.
    dating = age < LIMITS.minAge ? { ...previousDating, enabled: false } : previousDating;
  } else {
    dating = { enabled: false, genders: [], ageMin: LIMITS.minAge, ageMax: LIMITS.maxAge };
  }
  requireGenderForDating(dating, gender);

  // `photos` is managed only by setProfilePhotos. It is never written here, and the merge
  // below leaves it untouched, so saving the profile cannot wipe a person's photos.
  const photos = publicPhotos(publicSnap.exists ? publicSnap.get("photos") : null);

  const batch = db.batch();
  batch.set(r.profile(uid), {
    uid,
    displayName,
    bio,
    area,
    speaks,
    learns,
    offers,
    seeks,
    availability,
    interests,
    discoverable: true,
    // Self declared. No fluency test exists in this system.
    fluencyAssurance: FLUENCY_ASSURANCE,
    ...(isNew ? { createdAt: FieldValue.serverTimestamp() } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  batch.set(r.privateProfile(uid), {
    uid,
    birthDate,
    // Self declared. No identity or document check is performed anywhere in this backend.
    ageAssurance: AGE_ASSURANCE,
    gender,
    dating,
    ...(existingPrivate ? {} : { createdAt: FieldValue.serverTimestamp() }),
    updatedAt: FieldValue.serverTimestamp(),
    ...(existingPrivate && existingPrivate.birthDate !== birthDate
      ? { birthDateChangedAt: FieldValue.serverTimestamp(), birthDateChangeCount: FieldValue.increment(1) }
      : {}),
  }, { merge: true });

  await batch.commit();

  // If dating just went off, nothing pending may survive it.
  if (previousDating && previousDating.enabled === true && dating.enabled !== true) {
    await cancelPendingInvitationsFor(db, { uid, intent: "dating", reason: "dating-consent-withdrawn" });
  }

  return {
    profile: {
      uid, displayName, bio, area, speaks, learns, offers, seeks, availability, interests, photos,
      discoverable: true, fluencyAssurance: FLUENCY_ASSURANCE,
    },
    account: {
      birthDate, age, ageAssurance: AGE_ASSURANCE, gender, dating,
      isAdultSelfDeclared: typeof age === "number" && age >= LIMITS.minAge,
    },
  };
}

/**
 * Switch dating on or off and set preferences. Turning it off cancels every pending
 * dating invitation the caller is part of, in either direction.
 */
async function setDatingConsent(db, uid, payload, now = new Date()) {
  const body = requireObject(payload, "request");
  const r = refs(db);
  const snap = await r.privateProfile(uid).get();
  if (!snap.exists) {
    throw reject("failed-precondition", REASON.profileIncomplete, "Complete your profile first.");
  }
  const existing = snap.data();
  const age = ageFromBirthDate(existing.birthDate, now);
  const previous = existing.dating || { enabled: false };
  const dating = requireDatingPreferences(body, "dating", { age });
  requireGenderForDating(dating, existing.gender);

  await r.privateProfile(uid).set({
    dating,
    datingConsentUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  let cancelled = 0;
  if (previous.enabled === true && dating.enabled !== true) {
    ({ cancelled } = await cancelPendingInvitationsFor(db, {
      uid, intent: "dating", reason: "dating-consent-withdrawn",
    }));
  }

  return { dating, cancelledInvitations: cancelled };
}

/** The caller's own private account record. No other user can obtain this. */
async function getMyAccount(db, uid, now = new Date()) {
  const r = refs(db);
  const [publicSnap, privateSnap] = await db.getAll(r.profile(uid), r.privateProfile(uid));
  if (!privateSnap.exists) return { profile: null, account: null };
  const account = privateSnap.data();
  const age = ageFromBirthDate(account.birthDate, now);
  return {
    profile: publicSnap.exists ? { ...publicSnap.data(), photos: publicPhotos(publicSnap.get("photos")) } : null,
    account: {
      birthDate: account.birthDate,
      age,
      ageAssurance: account.ageAssurance || AGE_ASSURANCE,
      gender: account.gender,
      dating: account.dating || { enabled: false, genders: [], ageMin: LIMITS.minAge, ageMax: LIMITS.maxAge },
      isAdultSelfDeclared: typeof age === "number" && age >= LIMITS.minAge,
    },
  };
}

module.exports = { upsertProfile, setDatingConsent, getMyAccount, requireDatingPreferences };
