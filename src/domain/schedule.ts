/**
 * Meeting and availability rules for invitations.
 *
 * The server is authoritative (`createInvitation` revalidates everything against the
 * stated IANA time zone). These checks run first so a person sees a precise message
 * before anything is sent. A plan's date and time are wall time in the plan's zone (the
 * city's, which may not be the phone's), so "now" is read on that zone's clock too:
 * pass `wallClockIn(zone)` as `now`. A plain Date is read on the device's clock.
 */

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const DAY_PARTS = ["morning", "afternoon", "evening"] as const;
export type DayPart = typeof DAY_PARTS[number];
export type Recurrence = "once" | "weekly";

/** Monday first, as people usually read a week. */
export const AVAILABILITY_SLOTS: string[] = [1, 2, 3, 4, 5, 6, 0]
  .flatMap(day => DAY_PARTS.map(part => `${WEEKDAYS[day]} ${part}`));

/** Backend limits: `availability` up to 14 entries, `meeting.venue` up to 60, `note` up to 400. */
export const MAX_AVAILABILITY = 14;
export const MAX_VENUE = 60;
export const MAX_NOTE = 400;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PART_START: Record<DayPart, string> = { morning: "10:00", afternoon: "14:00", evening: "18:00" };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** What a clock on the wall reads in one time zone. Month and day count from 1. */
export type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function deviceClock(instant: Date): WallClock {
  return {
    year: instant.getFullYear(), month: instant.getMonth() + 1, day: instant.getDate(),
    hour: instant.getHours(), minute: instant.getMinutes(), second: instant.getSeconds(),
  };
}

/**
 * What a clock in `timeZone` reads at `instant`: the plan's "now", as the server reads it
 * (functions/lib/validation.js resolves the wall time in the same zone). The device's own
 * clock when there is no zone, or the JS engine cannot use the one given.
 */
export function wallClockIn(timeZone: string | null | undefined, instant: Date = new Date()): WallClock {
  if (timeZone) {
    try {
      const parts: Record<string, string> = {};
      for (const part of new Intl.DateTimeFormat("en-US", {
        timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).formatToParts(instant)) parts[part.type] = part.value;
      // Some engines write midnight as 24, and one that ignores hour12 adds AM or PM.
      let hour = Number(parts.hour) % 24;
      if (/pm/i.test(parts.dayPeriod ?? "") && hour < 12) hour += 12;
      if (/am/i.test(parts.dayPeriod ?? "") && hour === 12) hour = 0;
      const clock = {
        year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
        hour, minute: Number(parts.minute), second: Number(parts.second),
      };
      if (Object.values(clock).every(Number.isFinite)) return clock;
    } catch {
      // An unknown zone, or an engine without formatToParts: the device clock below.
    }
  }
  return deviceClock(instant);
}

/** A "now" given either as a wall clock or as an instant, which is read on the device's clock. */
export function asWallClock(now: Date | WallClock): WallClock {
  // Duck typed, not instanceof: a Date from another realm is still a Date.
  return typeof (now as Date).getTime === "function" ? deviceClock(now as Date) : now as WallClock;
}

/** A wall time as milliseconds counted as if it were UTC, so wall times compare and add with no zone involved. */
function wallMs(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

/** "YYYY-MM-DD" for a date made by wallMs. */
function wallDateString(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Parses "YYYY-MM-DD" as a real calendar date, or null. Time zone independent. */
export function parseLocalDate(value: string): { year: number; month: number; day: number; weekday: number } | null {
  if (!DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day, weekday: check.getUTCDay() };
}

export function isValidLocalTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function dayPartFor(localTime: string): DayPart {
  const hour = Number(localTime.slice(0, 2));
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

/** "Thursday evening" for a date and time, matching the availability vocabulary. */
export function slotFor(localDate: string, localTime: string): string | null {
  const date = parseLocalDate(localDate);
  if (!date || !isValidLocalTime(localTime)) return null;
  return `${WEEKDAYS[date.weekday]} ${dayPartFor(localTime)}`;
}

export function sharedSlots(mine: readonly string[] | undefined, theirs: readonly string[] | undefined): string[] {
  const set = new Set(theirs ?? []);
  return (mine ?? []).filter(slot => set.has(slot));
}

export type MeetingDraft = {
  venue: string;
  localDate: string;
  localTime: string;
  recurrence: Recurrence;
  note: string;
};

/**
 * Returns a message describing the first problem, or null when the draft may be sent.
 * `sharedAvailability` is optional: when both people have listed overlapping times, the
 * meeting must fall inside one of them, as in the reviewed prototype. When they share
 * none, any time is allowed and they agree the details in the invitation note.
 */
export function validateMeetingDraft(
  draft: MeetingDraft,
  options: { now?: Date | WallClock; sharedAvailability?: readonly string[] } = {},
): string | null {
  const clock = asWallClock(options.now ?? new Date());
  const now = wallMs(clock.year, clock.month, clock.day, clock.hour, clock.minute, clock.second);
  const venue = draft.venue.trim();
  if (!venue) return "Suggest a public place to meet, such as a café or library.";
  if (venue.length > MAX_VENUE) return `Keep the place to ${MAX_VENUE} characters or fewer.`;
  const date = parseLocalDate(draft.localDate.trim());
  if (!date) return "Enter a real date as YYYY-MM-DD.";
  const localTime = draft.localTime.trim();
  if (!isValidLocalTime(localTime)) return "Enter a time as HH:mm, for example 18:30.";
  if (draft.recurrence !== "once" && draft.recurrence !== "weekly") return "Choose one meetup or weekly practice.";
  const start = wallMs(date.year, date.month, date.day, Number(localTime.slice(0, 2)), Number(localTime.slice(3)));
  if (start <= now) return "Choose a time in the future.";
  if (start > now + 366 * 24 * 60 * 60 * 1000) return "Choose a time within the next year.";
  if (draft.note.length > MAX_NOTE) return `Keep the note to ${MAX_NOTE} characters or fewer.`;
  const shared = options.sharedAvailability ?? [];
  const slot = slotFor(draft.localDate.trim(), localTime);
  if (shared.length > 0 && slot && !shared.includes(slot)) {
    return `Choose a time you both have available: ${shared.join(", ")}.`;
  }
  return null;
}

export type SuggestedTime = { localDate: string; localTime: string; slot: string };

/** The next few concrete times that fall inside the given availability slots, from `now` on the plan's clock. */
export function suggestMeetingTimes(slots: readonly string[], now: Date | WallClock = new Date(), count = 3): SuggestedTime[] {
  const out: SuggestedTime[] = [];
  const wanted = new Set(slots);
  const clock = asWallClock(now);
  const nowMs = wallMs(clock.year, clock.month, clock.day, clock.hour, clock.minute, clock.second);
  for (let offset = 0; offset < 21 && out.length < count; offset++) {
    const day = wallMs(clock.year, clock.month, clock.day + offset);
    for (const part of DAY_PARTS) {
      const slot = `${WEEKDAYS[new Date(day).getUTCDay()]} ${part}`;
      if (!wanted.has(slot)) continue;
      const localTime = PART_START[part];
      const start = day + Number(localTime.slice(0, 2)) * 60 * 60 * 1000;
      // Leave at least two hours to read and answer the invitation.
      if (start - nowMs < 2 * 60 * 60 * 1000) continue;
      out.push({ localDate: wallDateString(day), localTime, slot });
      if (out.length >= count) break;
    }
  }
  return out;
}

/** "Thu 2 Oct" without relying on locale data the JS engine may not ship. */
export function formatLocalDate(localDate: string): string {
  const date = parseLocalDate(localDate);
  if (!date) return localDate;
  return `${SHORT_DAYS[date.weekday]} ${date.day} ${SHORT_MONTHS[date.month - 1]}`;
}

export function formatMeeting(meeting: { localDate: string; localTime: string; recurrence: Recurrence; timeZone?: string }): string {
  const when = `${formatLocalDate(meeting.localDate)} · ${meeting.localTime}`;
  return meeting.recurrence === "weekly" ? `${when} · weekly from this date` : `${when} · one meetup`;
}
