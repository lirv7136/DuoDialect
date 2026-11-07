/**
 * The message behind "Share with a friend" on a confirmed plan: who, when and where, and
 * a time to raise the alarm, so a friend can check in without needing the app. Only facts
 * already on the plan go in: never a uid, a surname or anything from a profile.
 */
import { formatLocalDate, isValidLocalTime, type Recurrence } from "./schedule";

/** How long after the meeting starts a friend should expect to have heard back. */
export const CHECK_BACK_HOURS = 2;

/** "Aiko" from "Aiko Tanaka". A plan carries the partner's display name; a friend needs only the first word. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** "20:30" two hours after "18:30". Wraps past midnight ("23:30" becomes "01:30"); bad input comes back unchanged. */
export function hoursAfter(localTime: string, hours: number): string {
  if (!isValidLocalTime(localTime)) return localTime;
  const minutes = (Number(localTime.slice(0, 2)) * 60 + Number(localTime.slice(3)) + Math.round(hours * 60)) % (24 * 60);
  const total = minutes < 0 ? minutes + 24 * 60 : minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export type SharablePlan = {
  /** The partner's display name; only the first word is used. */
  partnerName: string;
  /** The date the plan next happens on; for weekly plans the caller passes the next occurrence. */
  localDate: string;
  localTime: string;
  recurrence: Recurrence;
  venue: string;
  /** Set only when the plan's zone differs from the device, so the friend knows which clock the time is on. */
  timeZone?: string;
};

/**
 * One short safety message, ready for the share sheet. Each fact sits on its own line so
 * it reads cleanly in a text message or a chat app.
 */
export function planShareMessage(plan: SharablePlan, appName: string): string {
  const who = firstName(plan.partnerName) || "a partner";
  const zone = plan.timeZone ? ` (${plan.timeZone} time)` : "";
  const weekly = plan.recurrence === "weekly" ? ", then weekly" : "";
  const when = `${formatLocalDate(plan.localDate)} at ${plan.localTime}${zone}${weekly}`;
  const by = hoursAfter(plan.localTime, CHECK_BACK_HOURS);
  return [
    `I’m meeting a language exchange partner from ${appName}.`,
    `Who: ${who}`,
    `When: ${when}`,
    `Where: ${plan.venue.trim()}`,
    `If you don’t hear from me by ${by}, give me a call.`,
  ].join("\n");
}
