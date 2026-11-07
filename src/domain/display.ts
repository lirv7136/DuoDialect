/**
 * Pure helpers for the visual layer: language monograms, short time labels, date
 * blocks, plan status and grouping, and chat message grouping. No React, no platform
 * code, so they are unit tested directly (tests/display.test.cjs).
 */
import { DAY_PARTS, WEEKDAYS, parseLocalDate, toLocalDateString, type DayPart, type Recurrence } from "./schedule";

/** ISO 639-1 style codes for the listed languages; anything else uses its first two letters. */
const CODES: Record<string, string> = {
  english: "EN", mandarin: "ZH", cantonese: "YUE", japanese: "JA", korean: "KO", spanish: "ES", portuguese: "PT",
  french: "FR", italian: "IT", german: "DE", vietnamese: "VI", thai: "TH", indonesian: "ID", malay: "MS", filipino: "FIL",
  hindi: "HI", bengali: "BN", punjabi: "PA", urdu: "UR", tamil: "TA", telugu: "TE", gujarati: "GU", sinhala: "SI",
  nepali: "NE", arabic: "AR", persian: "FA", hebrew: "HE", turkish: "TR", greek: "EL", russian: "RU", ukrainian: "UK",
  polish: "PL", croatian: "HR", serbian: "SR", macedonian: "MK", dutch: "NL", swedish: "SV", danish: "DA",
  norwegian: "NO", finnish: "FI", khmer: "KM", burmese: "MY", swahili: "SW", auslan: "ASL",
};

/** "japanese" → "JA". Shown in monogram discs instead of flags, which stand for countries. */
export function languageCode(language: string): string {
  const key = language.trim().toLocaleLowerCase("en");
  if (!key) return "?";
  if (CODES[key]) return CODES[key];
  return Array.from(key.replace(/[^\p{L}]/gu, "")).slice(0, 2).join("").toLocaleUpperCase("en") || "?";
}

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_PARTS: Record<DayPart, string> = { morning: "am", afternoon: "pm", evening: "eve" };
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type SlotIcon = "sunny-outline" | "partly-sunny-outline" | "moon-outline";
const PART_ICONS: Record<DayPart, SlotIcon> = { morning: "sunny-outline", afternoon: "partly-sunny-outline", evening: "moon-outline" };

/** "Monday evening" → { label: "Mon eve", icon: "moon-outline" }, or null for anything else. */
export function shortSlot(slot: string): { label: string; icon: SlotIcon } | null {
  const [day, part] = slot.trim().split(/\s+/);
  const index = WEEKDAYS.indexOf(day as typeof WEEKDAYS[number]);
  if (index < 0 || !DAY_PARTS.includes(part as DayPart)) return null;
  return { label: `${SHORT_WEEKDAYS[index]} ${SHORT_PARTS[part as DayPart]}`, icon: PART_ICONS[part as DayPart] };
}

/** The part-of-day icon for a slot. */
export function dayPartIcon(part: DayPart): SlotIcon {
  return PART_ICONS[part];
}

/** Availability as a Monday-first 7×3 grid of booleans (morning, afternoon, evening). */
export function availabilityGrid(slots: readonly string[] | undefined): { day: string; short: string; parts: boolean[] }[] {
  const set = new Set(slots ?? []);
  return [1, 2, 3, 4, 5, 6, 0].map(day => ({
    day: WEEKDAYS[day],
    short: SHORT_WEEKDAYS[day],
    parts: DAY_PARTS.map(part => set.has(`${WEEKDAYS[day]} ${part}`)),
  }));
}

/** The big-number date block on a plan card: "2025-10-02" → { day: "2", weekday: "Thu", month: "Oct" }. */
export function dateBlock(localDate: string): { day: string; weekday: string; month: string } | null {
  const date = parseLocalDate(localDate);
  if (!date) return null;
  return { day: String(date.day), weekday: SHORT_WEEKDAYS[date.weekday], month: SHORT_MONTHS[date.month - 1] };
}

/**
 * The next date a plan happens on. A one-off plan is its own date; a weekly plan is the
 * first same-weekday date on or after today (never before its first date).
 */
export function nextOccurrence(localDate: string, recurrence: Recurrence, now: Date = new Date()): string {
  const date = parseLocalDate(localDate);
  if (!date || recurrence !== "weekly") return localDate;
  const first = new Date(date.year, date.month - 1, date.day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (first.getTime() >= today.getTime()) return localDate;
  const days = Math.round((today.getTime() - first.getTime()) / 86_400_000);
  const ahead = (7 - (days % 7)) % 7;
  return toLocalDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() + ahead));
}

/** True once a one-off plan's start time has passed. Weekly plans never end on their own. */
export function isPastMeeting(meeting: { localDate: string; localTime: string; recurrence: Recurrence }, now: Date = new Date()): boolean {
  if (meeting.recurrence === "weekly") return false;
  const date = parseLocalDate(meeting.localDate);
  const time = /^(\d{2}):(\d{2})$/.exec(meeting.localTime);
  if (!date || !time) return false;
  return new Date(date.year, date.month - 1, date.day, Number(time[1]), Number(time[2])).getTime() < now.getTime();
}

export type PlanStatus = "waiting" | "your-turn" | "confirmed" | "declined" | "cancelled";

type PlanLike = {
  fromUid: string;
  toUid: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  meeting: { localDate: string; localTime: string; recurrence: Recurrence };
};

/** State as the badge shows it: an invitation waiting on the other person, or on me. */
export function planStatus(item: PlanLike, uid: string): PlanStatus {
  if (item.status === "pending") return item.fromUid === uid ? "waiting" : "your-turn";
  if (item.status === "accepted") return "confirmed";
  return item.status;
}

export type PlanSegments<T> = { upcoming: T[]; received: T[]; sent: T[]; past: T[] };

/**
 * Plans split for the Upcoming · Invites · Past control. Upcoming: confirmed plans still
 * ahead, soonest first. Invites: pending, split into those waiting for me and those I
 * sent. Past: declined, cancelled and one-off plans whose time has gone, newest first
 * as the server returns them, capped at `pastLimit`.
 */
export function planSegments<T extends PlanLike>(items: readonly T[], uid: string, now: Date = new Date(), pastLimit = 10): PlanSegments<T> {
  const upcoming = items.filter(item => item.status === "accepted" && !isPastMeeting(item.meeting, now));
  const key = (item: T) => `${nextOccurrence(item.meeting.localDate, item.meeting.recurrence, now)} ${item.meeting.localTime}`;
  upcoming.sort((a, b) => key(a).localeCompare(key(b)));
  return {
    upcoming,
    received: items.filter(item => item.status === "pending" && item.toUid === uid),
    sent: items.filter(item => item.status === "pending" && item.fromUid === uid),
    past: items.filter(item => item.status === "declined" || item.status === "cancelled" ||
      (item.status === "accepted" && isPastMeeting(item.meeting, now))).slice(0, pastLimit),
  };
}

/** Which segment opens first: invites that need an answer, otherwise what's coming up. */
export function initialSegment(segments: PlanSegments<unknown>): "upcoming" | "invites" | "past" {
  if (segments.received.length) return "invites";
  if (segments.upcoming.length) return "upcoming";
  if (segments.sent.length) return "invites";
  return segments.past.length ? "past" : "upcoming";
}

export type MessageLike = { id: string; fromUid: string; createdAt: Date | null };

export type MessageRow<T> = {
  message: T;
  mine: boolean;
  /** First of a run of consecutive messages from the same person. */
  first: boolean;
  /** Last of the run: this one shows the time. */
  last: boolean;
  /** A day divider to show above this message, if it starts a new day. */
  divider: string | null;
};

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today", "Yesterday", or "Thu 2 Oct". */
export function dayLabel(date: Date, now: Date = new Date()): string {
  if (sameDay(date, now)) return "Today";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(date, yesterday)) return "Yesterday";
  return `${SHORT_WEEKDAYS[date.getDay()]} ${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
}

/**
 * Groups consecutive messages from the same sender within five minutes, and marks day
 * changes. A message still sending (no createdAt) counts as now.
 */
export function groupMessages<T extends MessageLike>(messages: readonly T[], me: string, now: Date = new Date()): MessageRow<T>[] {
  const GAP = 5 * 60 * 1000;
  const at = (message: T) => message.createdAt ?? now;
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const newDay = !previous || !sameDay(at(previous), at(message));
    const joinsPrevious = !!previous && !newDay && previous.fromUid === message.fromUid && at(message).getTime() - at(previous).getTime() < GAP;
    const joinsNext = !!next && sameDay(at(next), at(message)) && next.fromUid === message.fromUid && at(next).getTime() - at(message).getTime() < GAP;
    return {
      message,
      mine: message.fromUid === me,
      first: !joinsPrevious,
      last: !joinsNext,
      divider: newDay ? dayLabel(at(message), now) : null,
    };
  });
}

/** "now", "5m", "3h", "2d", "1w": the compact age of the last message in a chat row. */
export function relativeTime(date: Date | null, now: Date = new Date()): string {
  if (!date) return "";
  const s = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}
