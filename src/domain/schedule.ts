/**
 * Meeting and availability rules for invitations.
 *
 * The server is authoritative (`createInvitation` revalidates everything against the
 * stated IANA time zone). These checks run first so a person sees a precise message
 * before anything is sent. They interpret the wall time in the device's own zone,
 * which is the zone the client sends.
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
  options: { now?: Date; sharedAvailability?: readonly string[] } = {},
): string | null {
  const now = options.now ?? new Date();
  const venue = draft.venue.trim();
  if (!venue) return "Suggest a public place to meet, such as a café or library.";
  if (venue.length > MAX_VENUE) return `Keep the place to ${MAX_VENUE} characters or fewer.`;
  const date = parseLocalDate(draft.localDate.trim());
  if (!date) return "Enter a real date as YYYY-MM-DD.";
  const localTime = draft.localTime.trim();
  if (!isValidLocalTime(localTime)) return "Enter a time as HH:mm, for example 18:30.";
  if (draft.recurrence !== "once" && draft.recurrence !== "weekly") return "Choose one meetup or weekly practice.";
  const start = new Date(date.year, date.month - 1, date.day, Number(localTime.slice(0, 2)), Number(localTime.slice(3)));
  if (start.getTime() <= now.getTime()) return "Choose a time in the future.";
  if (start.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1000) return "Choose a time within the next year.";
  if (draft.note.length > MAX_NOTE) return `Keep the note to ${MAX_NOTE} characters or fewer.`;
  const shared = options.sharedAvailability ?? [];
  const slot = slotFor(draft.localDate.trim(), localTime);
  if (shared.length > 0 && slot && !shared.includes(slot)) {
    return `Choose a time you both have available: ${shared.join(", ")}.`;
  }
  return null;
}

export type SuggestedTime = { localDate: string; localTime: string; slot: string };

/** The next few concrete times that fall inside the given availability slots. */
export function suggestMeetingTimes(slots: readonly string[], now: Date = new Date(), count = 3): SuggestedTime[] {
  const out: SuggestedTime[] = [];
  const wanted = new Set(slots);
  for (let offset = 0; offset < 21 && out.length < count; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    for (const part of DAY_PARTS) {
      const slot = `${WEEKDAYS[day.getDay()]} ${part}`;
      if (!wanted.has(slot)) continue;
      const localTime = PART_START[part];
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(localTime.slice(0, 2)), 0);
      // Leave at least two hours to read and answer the invitation.
      if (start.getTime() - now.getTime() < 2 * 60 * 60 * 1000) continue;
      out.push({ localDate: toLocalDateString(day), localTime, slot });
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
