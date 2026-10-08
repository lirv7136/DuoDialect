/**
 * Cancelling a confirmed plan. Either person may, because people get sick, plans change
 * and someone may want out for safety reasons. The other person is told, so the reason
 * is a fixed choice rather than free text, and the wording here is the whole of what
 * they will read. Mirrors `CANCEL_REASONS` in functions/lib/constants.js.
 */

export const CANCEL_REASONS = [
  { value: "cant-make-it", label: "Can’t make it" },
  { value: "reschedule", label: "Need to reschedule" },
  { value: "other", label: "Something else" },
] as const;
export type CancelReason = typeof CANCEL_REASONS[number]["value"];

/** The question above the reason choice. */
export const CANCEL_REASON_PROMPT = { title: "Cancel plan", body: "Let them know why, if you like." } as const;

/** What the other person reads for a reason, as the server pushes it. "Something else" says nothing more. */
export function cancelReasonPhrase(reason: CancelReason | null | undefined): string {
  if (reason === "cant-make-it") return "Can’t make it.";
  if (reason === "reschedule") return "Wants to reschedule.";
  return "";
}

/**
 * The confirmation before a cancel goes out. Says the other person will be told, and
 * for a weekly plan that the whole series goes, because there is no cancelling one week.
 */
export function cancelPlanConfirm(name: string, weekly: boolean): { title: string; body: string; confirm: string; cancel: string } {
  const who = name || "Your partner";
  return {
    title: "Cancel this plan?",
    body: weekly ? `${who} will be told. This cancels every week.` : `${who} will be told.`,
    confirm: "Cancel plan",
    cancel: "Keep plan",
  };
}

/** True for a plan that was confirmed and then cancelled by one of its two people. */
export function wasCancelledAfterAccept(item: { status: string; resolution?: { reason: string } | null }): boolean {
  return item.status === "cancelled" && item.resolution?.reason === "cancelled-after-accept";
}
