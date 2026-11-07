/**
 * Trust signals the app shows, and the copy around them.
 *
 * The meetup count: how many meetups both people said happened. It is two people's word,
 * not a check, so the wording claims only that, and nothing is shown until there is at
 * least one. Verification, further down, is a separate signal the server sets.
 *
 * The count is per meetup, not per distinct partner. A weekly plan with one person
 * confirmed three times is three, so "Met 3 times" is the truthful label; "Met 3
 * partners" would overstate it. No React, no platform code; see tests/trust.test.cjs.
 */
export type MeetupsLabel = { label: string; accessibilityLabel: string };

/** "Met once" / "Met 3 times", or null when there is nothing honest to show. */
export function meetupsLabel(count: number | null | undefined): MeetupsLabel | null {
  if (typeof count !== "number" || !Number.isFinite(count)) return null;
  const n = Math.floor(count);
  if (n < 1) return null;
  const times = n === 1 ? "once" : `${n} times`;
  return {
    label: `Met ${times}`,
    accessibilityLabel: `Met language partners ${times}, confirmed by both people each time`,
  };
}

// ── Verification (trust, phase 1) ───────────────────────────────────────────────────
//
// Separate from the meetup count above: "Verified" is a check Talkeven made, set only by
// the server (profiles/{uid}.verified). In phase 1 a moderator makes it by hand; phase 2
// adds a selfie check in the app. Nothing here is shown unless the server says so.

export type VerificationStatus = "none" | "pending" | "verified" | "failed" | "review";

/** What getMyAccount says about the caller's own trust state (docs/BACKEND-CONTRACT.md). */
export type TrustSummary = {
  verified: boolean;
  verification: {
    status: VerificationStatus;
    method: string | null;
    verifiedAt: string | null;
    /** Set when a new main photo sent a verified member back to pending. */
    photoChangedAt: string | null;
  };
  emailConfirmed: boolean;
  requirements: { verificationToMeet: boolean; emailConfirmation: boolean };
  /** Reason codes for what is holding the caller back right now; empty when nothing is. */
  restrictions: string[];
};

export type VerifiedBadge = { label: string; accessibilityLabel: string };

/** "Verified", only when the server says so with a literal true. */
export function verifiedBadge(verified: unknown): VerifiedBadge | null {
  return verified === true ? { label: "Verified", accessibilityLabel: "Verified by Talkeven" } : null;
}

/** For the info sheet and the "only show verified members" switch. */
export const VERIFIED_EXPLAINER = "Verified members have shown Talkeven that they’re real and look like their photos.";

/**
 * One line per restriction the server reports, in the order it reports them. A
 * verification needed because the main photo changed says so, since otherwise it would
 * come as a surprise to someone who was verified yesterday. `email: false` leaves out the
 * email line, for a screen that shows the email card with its own buttons.
 */
export function trustNotices(trust: TrustSummary | null | undefined, options: { email?: boolean } = {}): string[] {
  if (!trust || !Array.isArray(trust.restrictions)) return [];
  return trust.restrictions.flatMap(reason => {
    if (reason === "verification/required-to-meet") {
      return [trust.verification?.photoChangedAt
        ? "You changed your main photo, so we need to check it’s still you before you make plans."
        : "Verify your profile to make plans. It’s how members know you’re real."];
    }
    if (reason === "trust/email-unconfirmed") {
      return options.email === false ? [] : ["Confirm your email so other members can find you on Discover."];
    }
    return [];
  });
}

/** Whether to ask someone to confirm their email: a password account not confirmed yet. */
export function needsEmailConfirmation(state: { provider: string; emailVerified: boolean | null | undefined }): boolean {
  return state.provider === "password" && state.emailVerified !== true;
}

/** How long "Send again" waits after the last email, so nobody hammers the button. */
export const RESEND_COOLDOWN_MS = 60_000;

/** Whole seconds until another confirmation email may be sent; 0 when it may be now. */
export function resendWaitSeconds(lastSentAt: number | null, now: number, cooldownMs: number = RESEND_COOLDOWN_MS): number {
  if (lastSentAt === null || !Number.isFinite(lastSentAt)) return 0;
  return Math.max(0, Math.ceil((lastSentAt + cooldownMs - now) / 1000));
}

/** "Check your email": the confirmation notice, naming the address the link went to. */
export function emailCheckCopy(email: string | null | undefined): { title: string; body: string } {
  const address = (email ?? "").trim();
  return {
    title: "Check your email",
    body: address
      ? `We sent a link to ${address}. Tap it to confirm your address.`
      : "We sent you a link. Tap it to confirm your address.",
  };
}

/**
 * Shown to the sender when a message carried a link, an email address or a phone number
 * before the two have a confirmed meetup. The server sends it anyway; this is advice.
 */
export const CONTACT_WARNING = "Careful sharing contact details before you’ve met. Keep chatting here until you’re sure.";
