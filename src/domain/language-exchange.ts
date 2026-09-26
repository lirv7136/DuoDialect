export type LanguageLevel = "native" | "fluent" | "intermediate" | "beginner";
export type UserLang = { lang: string; level: LanguageLevel };
export type ExchangeProfile = {
  /** Server profiles use `displayName`; `name` is accepted for older data. */
  displayName?: string;
  name?: string;
  speaks?: { lang: string; level: string }[];
  learns?: { lang: string; level: string }[];
};

export function normalizeLanguage(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function languageSet(value: unknown, fluentOnly = false): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter(item => item && typeof item.lang === "string" &&
    ["native", "fluent", "intermediate", "beginner"].includes(item.level) &&
    (!fluentOnly || item.level === "native" || item.level === "fluent"))
    .map(item => normalizeLanguage(item.lang)).filter(Boolean));
}

export function exchangeLanguages(me: ExchangeProfile, other: ExchangeProfile) {
  const mine = languageSet(me.speaks, true), theirs = languageSet(other.speaks, true);
  const myLearning = languageSet(me.learns), theirLearning = languageSet(other.learns);
  return {
    iCanHelpWith: [...mine].filter(lang => theirLearning.has(lang)).sort(),
    theyCanHelpWith: [...theirs].filter(lang => myLearning.has(lang)).sort(),
  };
}

export function isReciprocalExchange(me: ExchangeProfile, other: ExchangeProfile): boolean {
  const exchange = exchangeLanguages(me, other);
  return exchange.iCanHelpWith.length > 0 && exchange.theyCanHelpWith.length > 0;
}

export function profileDestination(profile: ExchangeProfile | null) {
  if (!profile || !languageSet(profile.speaks, true).size || !languageSet(profile.learns).size) {
    return "/(onboarding)/languages?next=profile" as const;
  }
  const name = typeof profile.displayName === "string" ? profile.displayName : profile.name;
  if (typeof name !== "string" || !name.trim()) return "/(onboarding)/profile" as const;
  return "/(tabs)" as const;
}
