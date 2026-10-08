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

/**
 * The cities Talkeven runs in. Discovery, near misses and match notices never cross a
 * city, so a Melbourne member is not shown Sydney people. Ids are stable and lower case;
 * the display names are what the app shows. The client mirrors this list in
 * src/domain/cities.ts, and both must change together.
 */
const CITIES = [
  { id: "sydney", name: "Sydney" },
  { id: "melbourne", name: "Melbourne" },
  { id: "brisbane", name: "Brisbane" },
  { id: "perth", name: "Perth" },
  { id: "adelaide", name: "Adelaide" },
  { id: "canberra", name: "Canberra" },
  { id: "hobart", name: "Hobart" },
  { id: "darwin", name: "Darwin" },
  { id: "gold-coast", name: "Gold Coast" },
  { id: "auckland", name: "Auckland" },
  { id: "wellington", name: "Wellington" },
];

const CITY_IDS = CITIES.map((city) => city.id);

/**
 * Where every profile saved before 1.1.2 lives. The 1.0.1 and 1.1.0 apps never send a
 * city, and the backfill script stamps this onto every profile that lacks one.
 */
const DEFAULT_CITY = "sydney";

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
  CITIES,
  CITY_IDS,
  DEFAULT_CITY,
  LIMITS,
  AGE_ASSURANCE,
  FLUENCY_ASSURANCE,
};
