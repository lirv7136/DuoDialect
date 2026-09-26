/**
 * Carries the languages from the first onboarding step to the second.
 * `upsertProfile` needs the name and the languages in a single call, so nothing is
 * saved until the second step submits. Held in memory only.
 */
import type { UserLang } from "../domain/language-exchange";

let pending: { speaks: UserLang[]; learns: UserLang[] } | null = null;

export const onboardingDraft = {
  set(value: { speaks: UserLang[]; learns: UserLang[] }) {
    pending = { speaks: value.speaks.map(item => ({ ...item })), learns: value.learns.map(item => ({ ...item })) };
  },
  get() {
    return pending;
  },
  clear() {
    pending = null;
  },
};
