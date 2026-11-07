/**
 * Safety wording that must read the same wherever it appears. Block is offered from a
 * person's profile, from the chat menu and after a report; all three confirm with this.
 */

export function blockTitle(name: string): string {
  return `Block ${name || "this member"}?`;
}

/** Never shortened further: it says what blocking does, and that it cancels invitations for good. */
export const BLOCK_CONFIRM_BODY =
  "You won’t be able to find, invite or message each other. Open invitations are cancelled, even if you unblock later. Unblock anytime in Profile.";

export const SAFETY_TIPS = [
  { icon: "storefront-outline", text: "Meet somewhere public and busy." },
  { icon: "people-outline", text: "Tell a friend where you’ll be." },
  { icon: "exit-outline", text: "Leave anytime. That’s fine." },
  { icon: "lock-closed-outline", text: "Never share your address or money details." },
] as const;

export const SAFETY_FOOTNOTE = "Uncomfortable? Report or block via ⋯.";

export const EMERGENCY_LINE = "Unsafe right now? Call 000.";
