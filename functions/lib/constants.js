"use strict";

/**
 * Shared vocabulary for the DuoDialect backend.
 *
 * Everything a client may send is constrained to these sets. Free text is length
 * limited elsewhere. Nothing here implies verification: fluency and birth date are
 * self declared by the account holder and are recorded as such.
 */

const LANGUAGE_LEVELS = ["native", "fluent", "intermediate", "beginner"];

/** Levels that qualify someone to offer a language to a partner. */
const TEACHING_LEVELS = ["native", "fluent"];

const GENDERS = ["woman", "man", "nonbinary"];

const INTENTS = ["platonic", "dating"];

const INVITATION_STATUSES = ["pending", "accepted", "declined", "cancelled"];

const RECURRENCE = ["once", "weekly"];

const REPORT_REASONS = [
  "harassment",
  "spam",
  "inappropriate_content",
  "impersonation",
  "safety_concern",
  "other",
];

const LIMITS = {
  displayName: 40,
  bio: 400,
  area: 60,
  interest: 24,
  interests: 8,
  languages: 6,
  availability: 14,
  availabilitySlot: 32,
  note: 400,
  messageText: 2000,
  reportDetail: 1000,
  requestKey: 64,
  clientMessageId: 64,
  discoveryLimit: 20,
  discoveryScan: 60,
  nearMissScan: 60,
  nearMissLimit: 6,
  minAge: 18,
  maxAge: 120,
  photos: 3,
};

/** Self declared age assurance. There is no identity or document verification. */
const AGE_ASSURANCE = "self-declared";

/** Self declared proficiency. There is no fluency test. */
const FLUENCY_ASSURANCE = "self-declared";

module.exports = {
  LANGUAGE_LEVELS,
  TEACHING_LEVELS,
  GENDERS,
  INTENTS,
  INVITATION_STATUSES,
  RECURRENCE,
  REPORT_REASONS,
  LIMITS,
  AGE_ASSURANCE,
  FLUENCY_ASSURANCE,
};
