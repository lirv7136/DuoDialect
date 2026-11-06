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

/** Why an accepted plan was cancelled. A fixed set, never free text, because it is pushed to the other person. */
const CANCEL_REASONS = ["cant-make-it", "reschedule", "other"];

/**
 * The cities a profile can belong to: every city of 100,000 people or more and every
 * capital, worldwide, from data/cities.json. That file is built from GeoNames (CC BY 4.0)
 * by scripts/build-world-cities.cjs at the repository root, and the app imports the same
 * file for its picker, so there is one list.
 *
 * Discovery, near misses and match notices never cross a city, so a Melbourne member is
 * not shown Sydney people. Ids are stable and lower case and are never removed from the
 * file: the eleven cities from before the world list keep their bare ids (sydney,
 * melbourne, ...) and every other city is `<name>-<country>`, such as london-gb.
 */
const WORLD_CITIES = require("../data/cities.json");

const CITIES = WORLD_CITIES.cities.map(([id, name, country, zone, population, , region]) => ({
  id,
  name,
  country,
  countryName: WORLD_CITIES.countries[country] || country,
  region: region || "",
  timeZone: WORLD_CITIES.zones[zone],
  population,
}));

const CITIES_BY_ID = new Map(CITIES.map((city) => [city.id, city]));

const CITY_IDS = CITIES.map((city) => city.id);

/** The cities from before the world list, the only ones the 1.1.2 app knows. */
const LEGACY_CITY_IDS = [
  "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra", "hobart", "darwin", "gold-coast", "auckland", "wellington",
];

/**
 * Where every profile saved before 1.1.2 lives. The 1.0.1 and 1.1.0 apps never send a
 * city, and the backfill script stamps this onto every profile that lacks one.
 */
const DEFAULT_CITY = "sydney";

function isCityId(value) {
  return typeof value === "string" && CITIES_BY_ID.has(value);
}

/** "Sydney, Australia", or "Springfield, Illinois, United States"; the id itself when unknown. */
function cityLabel(id) {
  const city = CITIES_BY_ID.get(id);
  return city ? [city.name, city.region, city.countryName].filter(Boolean).join(", ") : String(id);
}

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
  CANCEL_REASONS,
  REPORT_REASONS,
  CITIES,
  CITY_IDS,
  LEGACY_CITY_IDS,
  DEFAULT_CITY,
  isCityId,
  cityLabel,
  LIMITS,
  AGE_ASSURANCE,
  FLUENCY_ASSURANCE,
};
