/**
 * When to ask for an App Store rating. Apple's rule: a few asks a year at most, only after a
 * good moment, and only through the system sheet (`StoreReview.requestReview`), which the OS
 * is free to ignore. Our good moment is a check-in answered "yes, we met" and "yes, meet
 * again" once at least one meetup is confirmed by both people. Pure, so the gate is tested.
 */
import type { CheckInAnswer } from "./check-in";

const DAY_MS = 24 * 60 * 60 * 1000;

/** No more than this many asks in any rolling year. */
export const MAX_ASKS_PER_YEAR = 3;
export const YEAR_MS = 365 * DAY_MS;
/** And never two asks closer together than this. */
export const ASK_GAP_MS = 60 * DAY_MS;

export type RatingMoment = {
  /** The person's own count of meetups both people said happened. Absent on older profiles. */
  meetupsConfirmed: number | null | undefined;
  answer: CheckInAnswer;
  /** Asks on this install in the last 365 days, and the most recent one ever. */
  askedCount: number;
  lastAskedAt: Date | null;
  now?: Date;
};

/** A meetup that happened and that the person wants to repeat: the only moment worth asking at. */
export function isGoodMeetup(answer: CheckInAnswer): boolean {
  return answer.happened === "yes" && answer.meetAgain === "yes";
}

export function shouldAskForRating({ meetupsConfirmed, answer, askedCount, lastAskedAt, now = new Date() }: RatingMoment): boolean {
  if (!isGoodMeetup(answer)) return false;
  // The first meetup confirmed from both sides is the moment; an unconfirmed one is not yet.
  if (!meetupsConfirmed || meetupsConfirmed < 1) return false;
  if (askedCount >= MAX_ASKS_PER_YEAR) return false;
  if (lastAskedAt && now.getTime() - lastAskedAt.getTime() < ASK_GAP_MS) return false;
  return true;
}

/** Boils an install's ask history down to what the gate needs. */
export function summariseAsks(askedAt: readonly Date[], now: Date = new Date()): { askedCount: number; lastAskedAt: Date | null } {
  const askedCount = askedAt.filter(at => now.getTime() - at.getTime() < YEAR_MS).length;
  const lastAskedAt = askedAt.reduce<Date | null>((latest, at) => (!latest || at.getTime() > latest.getTime() ? at : latest), null);
  return { askedCount, lastAskedAt };
}
