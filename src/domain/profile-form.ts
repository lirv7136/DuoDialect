/**
 * Client side checks and payload building for the `upsertProfile` callable.
 *
 * `upsertProfile` replaces the whole public profile: any optional list left out is
 * stored as empty. Edits therefore always send the complete profile, built from the
 * current one plus the change.
 *
 * v1 has no dating. `dating` is never sent, so the server keeps its default of off.
 * `birthDate` is required by the backend on the first save only (see
 * docs/BACKEND-CONTRACT.md); it is private and omitted on later saves so the stored value
 * is kept. Gender is optional on the server and only used for dating, so v1 never asks.
 */
import { normalizeLanguage, type LanguageLevel, type UserLang } from "./language-exchange";
import { MAX_AVAILABILITY } from "./schedule";

export const LANGUAGE_LEVELS: LanguageLevel[] = ["native", "fluent", "intermediate", "beginner"];
export const TEACHING_LEVELS: LanguageLevel[] = ["native", "fluent"];
/** Levels offered for a language being practised. The backend accepts any level. */
export const PRACTISING_LEVELS: LanguageLevel[] = ["beginner", "intermediate", "fluent"];

export const SUGGESTED_LANGUAGES = ["English", "Japanese", "Spanish", "French", "Mandarin", "Korean"];

export const LIMITS = {
  displayName: 40,
  bio: 400,
  area: 60,
  languages: 6,
  language: 40,
  interests: 8,
  interest: 24,
  minAge: 18,
} as const;

export type ProfileDraft = {
  displayName: string;
  bio: string;
  area: string;
  speaks: UserLang[];
  learns: UserLang[];
  availability: string[];
  interests: string[];
};

export type PrivateDraft = { birthDate: string };

export type UpsertProfilePayload = {
  displayName: string;
  bio: string;
  area: string;
  speaks: UserLang[];
  learns: UserLang[];
  availability: string[];
  interests: string[];
  birthDate?: string;
};

export function emptyProfileDraft(): ProfileDraft {
  return { displayName: "", bio: "", area: "", speaks: [], learns: [], availability: [], interests: [] };
}

/** Accepts whatever the server stored and returns a well formed draft. */
export function draftFromProfile(profile: Partial<ProfileDraft> | null | undefined): ProfileDraft {
  const langs = (value: unknown): UserLang[] => Array.isArray(value)
    ? value.filter(item => item && typeof item.lang === "string" && LANGUAGE_LEVELS.includes(item.level))
      // The server stores names lower cased; show them as a person would write them.
      .map(item => ({ lang: capitalise(item.lang), level: item.level }))
    : [];
  const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter(item => typeof item === "string") : [];
  return {
    displayName: typeof profile?.displayName === "string" ? profile.displayName : "",
    bio: typeof profile?.bio === "string" ? profile.bio : "",
    area: typeof profile?.area === "string" ? profile.area : "",
    speaks: langs(profile?.speaks),
    learns: langs(profile?.learns),
    availability: strings(profile?.availability),
    interests: strings(profile?.interests),
  };
}

export function parseInterests(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const value = part.trim();
    const key = value.toLocaleLowerCase("en");
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function ageFromBirthDate(birthDate: string, now: Date = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [year, month, day] = birthDate.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  if (check.getTime() > now.getTime()) return null;
  let age = now.getUTCFullYear() - year;
  if (now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day)) age -= 1;
  return age;
}

function languageListProblem(list: UserLang[], label: string): string | null {
  if (list.length === 0) return `Add at least one language you ${label}.`;
  if (list.length > LIMITS.languages) return `List up to ${LIMITS.languages} languages you ${label}.`;
  const seen = new Set<string>();
  for (const item of list) {
    const lang = normalizeLanguage(item.lang);
    if (!lang) return "Every language needs a name.";
    if (lang.length > LIMITS.language) return `Language names must be ${LIMITS.language} characters or fewer.`;
    if (!LANGUAGE_LEVELS.includes(item.level)) return "Choose a level for every language.";
    if (seen.has(lang)) return `${item.lang.trim()} is listed twice.`;
    seen.add(lang);
  }
  return null;
}

/** Only the language part, used by the first onboarding step. */
export function validateLanguages(speaks: UserLang[], learns: UserLang[]): string | null {
  const speakProblem = languageListProblem(speaks, "speak");
  if (speakProblem) return speakProblem;
  const learnProblem = languageListProblem(learns, "are practising");
  if (learnProblem) return learnProblem;
  if (!speaks.some(item => TEACHING_LEVELS.includes(item.level))) {
    return "List at least one language you speak at native or fluent level, so you have something to offer.";
  }
  const spoken = new Set(speaks.map(item => normalizeLanguage(item.lang)));
  const both = learns.find(item => spoken.has(normalizeLanguage(item.lang)));
  if (both) return `${both.lang.trim()} can’t be both one you speak and one you’re practising.`;
  return null;
}

export function validateProfileDraft(
  draft: ProfileDraft,
  options: { firstSave: boolean; private?: PrivateDraft; now?: Date },
): string | null {
  const name = draft.displayName.trim();
  if (!name) return "Add the name you’d like partners to see.";
  if (name.length > LIMITS.displayName) return `Keep your name to ${LIMITS.displayName} characters or fewer.`;
  if (draft.bio.length > LIMITS.bio) return `Keep your bio to ${LIMITS.bio} characters or fewer.`;
  if (draft.area.length > LIMITS.area) return `Keep your neighbourhood to ${LIMITS.area} characters or fewer.`;
  const languages = validateLanguages(draft.speaks, draft.learns);
  if (languages) return languages;
  if (draft.availability.length > MAX_AVAILABILITY) return `Choose up to ${MAX_AVAILABILITY} times.`;
  if (draft.interests.length > LIMITS.interests) return `Use up to ${LIMITS.interests} interests.`;
  if (draft.interests.some(item => item.length > LIMITS.interest)) return `Keep each interest to ${LIMITS.interest} characters or fewer.`;
  if (options.firstSave) {
    const birthDate = options.private?.birthDate.trim() ?? "";
    const age = ageFromBirthDate(birthDate, options.now);
    if (age === null) return "Enter your date of birth as YYYY-MM-DD.";
    if (age < LIMITS.minAge) return `This service is for adults aged ${LIMITS.minAge} and over.`;
  }
  return null;
}

export function buildUpsertPayload(
  draft: ProfileDraft,
  options: { firstSave: boolean; private?: PrivateDraft },
): UpsertProfilePayload {
  const payload: UpsertProfilePayload = {
    displayName: draft.displayName.trim(),
    bio: draft.bio.trim(),
    area: draft.area.trim(),
    speaks: draft.speaks.map(item => ({ lang: item.lang.trim(), level: item.level })),
    learns: draft.learns.map(item => ({ lang: item.lang.trim(), level: item.level })),
    availability: [...draft.availability],
    interests: [...draft.interests],
  };
  if (options.firstSave && options.private) {
    payload.birthDate = options.private.birthDate.trim();
  }
  return payload;
}

export function capitalise(value: string): string {
  return value ? value.charAt(0).toLocaleUpperCase("en") + value.slice(1) : value;
}

export function formatLanguages(list: UserLang[] | undefined): string {
  if (!list?.length) return "—";
  return list.map(item => `${capitalise(item.lang)} · ${item.level}`).join(", ");
}
