"use strict";

const { HttpsError } = require("firebase-functions/v2/https");
const {
  LANGUAGE_LEVELS,
  TEACHING_LEVELS,
  GENDERS,
  INTENTS,
  RECURRENCE,
  REPORT_REASONS,
  LIMITS,
} = require("./constants");

function invalid(message, details) {
  return new HttpsError("invalid-argument", message, details);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value, field) {
  if (!isPlainObject(value)) throw invalid(`${field} must be an object.`);
  return value;
}

function requireString(value, field, max) {
  if (typeof value !== "string") throw invalid(`${field} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed) throw invalid(`${field} must not be empty.`);
  if (trimmed.length > max) throw invalid(`${field} must be ${max} characters or fewer.`);
  return trimmed;
}

function optionalString(value, field, max) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw invalid(`${field} must be a string.`);
  if (value.length > max) throw invalid(`${field} must be ${max} characters or fewer.`);
  return value.trim();
}

function requireEnum(value, field, allowed) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw invalid(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}

function requireBoolean(value, field) {
  if (typeof value !== "boolean") throw invalid(`${field} must be true or false.`);
  return value;
}

function requireInteger(value, field, min, max) {
  if (!Number.isInteger(value)) throw invalid(`${field} must be a whole number.`);
  if (value < min || value > max) throw invalid(`${field} must be between ${min} and ${max}.`);
  return value;
}

/**
 * Firebase Auth UIDs are opaque. We only require a sane, bounded, non-self value
 * so a caller cannot smuggle a path segment or an unbounded key into a document id.
 */
function requireUid(value, field) {
  const uid = requireString(value, field, 128);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw invalid(`${field} is not a valid user id.`);
  return uid;
}

function normalizeLanguage(value) {
  return String(value).trim().toLocaleLowerCase("en");
}

/**
 * Accepts [{ lang, level }] and returns a normalised, de-duplicated list.
 * Historical profiles may contain unknown levels; those entries are rejected here
 * rather than silently coerced, because proficiency decides matching eligibility.
 */
function requireLanguageList(value, field, { min }) {
  if (!Array.isArray(value)) throw invalid(`${field} must be an array.`);
  if (value.length > LIMITS.languages) {
    throw invalid(`${field} must contain ${LIMITS.languages} entries or fewer.`);
  }
  const seen = new Set();
  const out = [];
  for (const entry of value) {
    requireObject(entry, `${field} entry`);
    const lang = normalizeLanguage(requireString(entry.lang, `${field}.lang`, 40));
    const level = requireEnum(entry.level, `${field}.level`, LANGUAGE_LEVELS);
    if (seen.has(lang)) throw invalid(`${field} lists "${lang}" more than once.`);
    seen.add(lang);
    out.push({ lang, level });
  }
  if (out.length < min) throw invalid(`${field} must contain at least ${min} entry.`);
  return out;
}

function requireShortTextList(value, field, { maxItems, maxLength, min = 0 }) {
  if (!Array.isArray(value)) throw invalid(`${field} must be an array.`);
  if (value.length > maxItems) throw invalid(`${field} must contain ${maxItems} entries or fewer.`);
  const seen = new Set();
  const out = [];
  for (const entry of value) {
    const text = requireString(entry, `${field} entry`, maxLength);
    const key = text.toLocaleLowerCase("en");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  if (out.length < min) throw invalid(`${field} must contain at least ${min} entry.`);
  return out;
}

/** Languages the person is able to offer to a partner (native or fluent only). */
function offeredLanguages(speaks) {
  return [...new Set(
    (Array.isArray(speaks) ? speaks : [])
      .filter((item) => item && typeof item.lang === "string" && TEACHING_LEVELS.includes(item.level))
      .map((item) => normalizeLanguage(item.lang))
      .filter(Boolean),
  )].sort();
}

/** Languages the person wants to practise, at any level. */
function soughtLanguages(learns) {
  return [...new Set(
    (Array.isArray(learns) ? learns : [])
      .filter((item) => item && typeof item.lang === "string" && LANGUAGE_LEVELS.includes(item.level))
      .map((item) => normalizeLanguage(item.lang))
      .filter(Boolean),
  )].sort();
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function requireBirthDate(value, field) {
  const raw = requireString(value, field, 10);
  if (!DATE_PATTERN.test(raw)) throw invalid(`${field} must be formatted YYYY-MM-DD.`);
  const [year, month, day] = raw.split("-").map(Number);
  const asUtc = Date.UTC(year, month - 1, day);
  const check = new Date(asUtc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw invalid(`${field} is not a real calendar date.`);
  }
  if (asUtc > Date.now()) throw invalid(`${field} must be in the past.`);
  return raw;
}

/**
 * Whole years elapsed, computed in UTC. This is a self declared figure: it is only
 * as accurate as the birth date the account holder entered.
 */
function ageFromBirthDate(birthDate, now = new Date()) {
  if (typeof birthDate !== "string" || !DATE_PATTERN.test(birthDate)) return null;
  const [year, month, day] = birthDate.split("-").map(Number);
  let age = now.getUTCFullYear() - year;
  const beforeBirthday =
    now.getUTCMonth() + 1 < month ||
    (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function zoneOffsetMs(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(instant)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/**
 * Convert a wall clock date/time in an IANA zone to an absolute instant.
 * Two passes settle daylight saving transitions. Times that do not exist or occur
 * twice on a transition day resolve to a single deterministic instant; the stored
 * localDate/localTime/timeZone remain the authoritative human description.
 */
function wallTimeToInstant(localDate, localTime, timeZone) {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = new Date(naive - zoneOffsetMs(new Date(naive), timeZone));
  instant = new Date(naive - zoneOffsetMs(instant, timeZone));
  return instant;
}

/**
 * A meeting is stored as the explicit local description plus the resolved instant.
 * Recurrence is recorded as a stated intention only; see BACKEND-CONTRACT.md.
 */
function requireMeeting(value, field, now = new Date()) {
  const meeting = requireObject(value, field);
  const venue = requireString(meeting.venue, `${field}.venue`, LIMITS.area);
  const localDate = requireString(meeting.localDate, `${field}.localDate`, 10);
  if (!DATE_PATTERN.test(localDate)) throw invalid(`${field}.localDate must be formatted YYYY-MM-DD.`);
  const localTime = requireString(meeting.localTime, `${field}.localTime`, 5);
  if (!TIME_PATTERN.test(localTime)) throw invalid(`${field}.localTime must be formatted HH:mm.`);
  const timeZone = requireString(meeting.timeZone, `${field}.timeZone`, 64);
  if (!isValidTimeZone(timeZone)) throw invalid(`${field}.timeZone must be an IANA time zone name.`);
  const recurrence = requireEnum(meeting.recurrence, `${field}.recurrence`, RECURRENCE);

  const startAt = wallTimeToInstant(localDate, localTime, timeZone);
  if (!Number.isFinite(startAt.getTime())) throw invalid(`${field} does not resolve to a real time.`);
  if (startAt.getTime() <= now.getTime()) throw invalid("The meeting time must be in the future.");
  const oneYearOut = now.getTime() + 366 * 24 * 60 * 60 * 1000;
  if (startAt.getTime() > oneYearOut) throw invalid("The meeting time must be within the next year.");

  return { venue, localDate, localTime, timeZone, recurrence, startAt };
}

module.exports = {
  invalid,
  isPlainObject,
  requireObject,
  requireString,
  optionalString,
  requireEnum,
  requireBoolean,
  requireInteger,
  requireUid,
  requireLanguageList,
  requireShortTextList,
  requireMeeting,
  requireBirthDate,
  ageFromBirthDate,
  isValidTimeZone,
  wallTimeToInstant,
  normalizeLanguage,
  offeredLanguages,
  soughtLanguages,
  GENDERS,
  INTENTS,
  REPORT_REASONS,
};
