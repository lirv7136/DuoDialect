/**
 * The one trust signal the product can honestly show: how many meetups both people
 * said happened. No verification exists anywhere in the system, so the wording claims
 * only that, and nothing is shown until there is at least one.
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
