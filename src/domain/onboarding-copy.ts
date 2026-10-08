/**
 * The gentle nudge on the last onboarding step. Photos and availability are optional
 * (the backend accepts both empty), but a monogram with no free times is a profile no one
 * can plan with: `suggestMeetingTimes` has nothing to offer and a partner has no face to
 * look for at the café. So the first save with either missing explains why it matters,
 * once per field, and always leaves a way to save anyway.
 */

export type NudgeField = "availability" | "photo";

/** Shown in this order: times first, since they decide whether a meetup can be suggested at all. */
export const NUDGE_FIELDS: readonly NudgeField[] = ["availability", "photo"];

export const NUDGE_COPY: Record<NudgeField, string> = {
  availability: "Partners pick times from your free slots. Add one or two so people can suggest a meetup.",
  photo: "A photo helps your partner find you at the café.",
};

export const SAVE_ANYWAY_LABEL = "Save anyway";

/**
 * The fields still worth a nudge: empty now, and not already nudged. Once a field has
 * been nudged it never is again, so the second tap goes straight through.
 */
export function nudgesFor(
  state: { hasPhoto: boolean; availability: readonly string[] },
  nudged: ReadonlySet<NudgeField>,
): NudgeField[] {
  const empty: Record<NudgeField, boolean> = { availability: state.availability.length === 0, photo: !state.hasPhoto };
  return NUDGE_FIELDS.filter(field => empty[field] && !nudged.has(field));
}

/** One short message, or null when there is nothing to say. */
export function nudgeMessage(fields: readonly NudgeField[]): string | null {
  return fields.length ? fields.map(field => NUDGE_COPY[field]).join(" ") : null;
}
