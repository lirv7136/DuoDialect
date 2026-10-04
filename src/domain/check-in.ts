/**
 * Post meetup check-ins, as the app shows them. The server creates one per person the
 * morning after a plan (docs/BACKEND-CONTRACT.md, `answerCheckIn`). Answers are private:
 * nothing here ever describes what the other person said.
 */

export type CheckInAnswer = { happened: "yes" | "no"; meetAgain: "yes" | "no" | null };

export type CheckInLike = {
  id: string;
  status: "open" | "answered";
  expiresAt: Date | null;
  dueAt: Date | null;
};

/** Open check-ins still inside their window, newest first. Expired ones quietly vanish. */
export function openCheckIns<T extends CheckInLike>(items: readonly T[], now: Date = new Date()): T[] {
  return items
    .filter(item => item.status === "open" && !!item.expiresAt && item.expiresAt.getTime() > now.getTime())
    .sort((a, b) => (b.dueAt?.getTime() ?? 0) - (a.dueAt?.getTime() ?? 0));
}

/** Whether this check-in can still be answered, or re-answered. */
export function canAnswer(item: Pick<CheckInLike, "expiresAt">, now: Date = new Date()): boolean {
  return !!item.expiresAt && item.expiresAt.getTime() > now.getTime();
}

/** What the person sees once they have answered. Warm, short, and never a score. */
export function thanksFor(answer: CheckInAnswer, name: string): string {
  if (answer.happened === "no") return "Thanks for letting us know. Plans fall through sometimes.";
  if (answer.meetAgain === "yes") return `Nice one. Keep the swap going with ${name}.`;
  if (answer.meetAgain === "no") return "Thanks. We won't ask about this plan again.";
  return "Thanks for checking in.";
}
