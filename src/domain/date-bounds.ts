/**
 * Bounds and conversions for the native date and time pickers. Values stay in the
 * formats the backend already uses: dates as YYYY-MM-DD and times as HH:mm.
 */
import { parseLocalDate, toLocalDateString } from "./schedule";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The same calendar day `years` earlier, with 29 February falling back to the 28th. */
function yearsBefore(year: number, month: number, day: number, years: number): Date {
  const target = year - years;
  const lastDay = new Date(target, month + 1, 0).getDate();
  return new Date(target, month, Math.min(day, lastDay));
}

/**
 * The latest birth date that makes someone `minAge` today. It uses the UTC calendar
 * day, as ageFromBirthDate does, so a date the picker allows always passes validation.
 */
export function latestAdultBirthDate(now: Date = new Date(), minAge = 18): Date {
  return yearsBefore(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), minAge);
}

/** Where the birth date picker opens: about 25 years ago. */
export function defaultBirthDate(now: Date = new Date()): Date {
  return yearsBefore(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 25);
}

export function earliestBirthDate(now: Date = new Date()): Date {
  return yearsBefore(now.getUTCFullYear(), 0, 1, 110);
}

/** Meetups: from today to a year ahead, matching validateMeetingDraft. */
export function meetingDateBounds(now: Date = new Date()): { minimumDate: Date; maximumDate: Date } {
  const minimumDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const maximumDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 365);
  return { minimumDate, maximumDate };
}

/** A local midnight Date for "YYYY-MM-DD", or null. */
export function dateFromLocalDate(value: string): Date | null {
  const parsed = parseLocalDate(value.trim());
  return parsed ? new Date(parsed.year, parsed.month - 1, parsed.day) : null;
}

/** A Date on today's date at "HH:mm", or null. */
export function dateFromLocalTime(value: string, base: Date = new Date()): Date | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), Number(match[1]), Number(match[2]));
}

export { toLocalDateString };

export function toLocalTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** "21 April 1998" without relying on locale data the JS engine may not ship. */
export function formatLongDate(value: string): string {
  const parsed = parseLocalDate(value.trim());
  return parsed ? `${parsed.day} ${MONTHS[parsed.month - 1]} ${parsed.year}` : value;
}
