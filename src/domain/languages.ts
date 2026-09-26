/**
 * The languages offered in the picker: common in Sydney and worldwide.
 *
 * `name` is what the client sends; the backend lower cases it, so matching between
 * members is unchanged from free text. `aliases` only help search. People can still
 * add a language that isn't listed.
 */
import { normalizeLanguage } from "./language-exchange";

export type LanguageOption = { name: string; aliases?: string[] };

export const LANGUAGES: LanguageOption[] = [
  { name: "English" },
  { name: "Mandarin", aliases: ["Chinese", "Putonghua"] },
  { name: "Cantonese", aliases: ["Chinese", "Yue"] },
  { name: "Japanese" },
  { name: "Korean" },
  { name: "Spanish", aliases: ["Español", "Castilian"] },
  { name: "Portuguese", aliases: ["Português", "Brazilian"] },
  { name: "French", aliases: ["Français"] },
  { name: "Italian", aliases: ["Italiano"] },
  { name: "German", aliases: ["Deutsch"] },
  { name: "Vietnamese", aliases: ["Tiếng Việt"] },
  { name: "Thai" },
  { name: "Indonesian", aliases: ["Bahasa Indonesia"] },
  { name: "Malay", aliases: ["Bahasa Melayu"] },
  { name: "Filipino", aliases: ["Tagalog"] },
  { name: "Hindi" },
  { name: "Bengali", aliases: ["Bangla"] },
  { name: "Punjabi", aliases: ["Panjabi"] },
  { name: "Urdu" },
  { name: "Tamil" },
  { name: "Telugu" },
  { name: "Gujarati" },
  { name: "Sinhala", aliases: ["Sinhalese"] },
  { name: "Nepali" },
  { name: "Arabic" },
  { name: "Persian", aliases: ["Farsi", "Dari"] },
  { name: "Hebrew" },
  { name: "Turkish" },
  { name: "Greek" },
  { name: "Russian" },
  { name: "Ukrainian" },
  { name: "Polish" },
  { name: "Croatian" },
  { name: "Serbian" },
  { name: "Macedonian" },
  { name: "Dutch", aliases: ["Nederlands", "Flemish"] },
  { name: "Swedish" },
  { name: "Danish" },
  { name: "Norwegian" },
  { name: "Finnish" },
  { name: "Khmer", aliases: ["Cambodian"] },
  { name: "Burmese", aliases: ["Myanmar"] },
  { name: "Swahili", aliases: ["Kiswahili"] },
  { name: "Auslan", aliases: ["Australian Sign Language", "Sign language"] },
];

/** Shown before someone searches. */
export const POPULAR_LANGUAGES = ["English", "Mandarin", "Japanese", "Korean", "Spanish", "Cantonese", "Vietnamese", "French"];

const byKey = new Map(LANGUAGES.map(option => [normalizeLanguage(option.name), option]));

/** The label for a stored (lower cased) language name. Unlisted names are capitalised. */
export function displayLanguage(value: string): string {
  const trimmed = value.trim();
  const listed = byKey.get(normalizeLanguage(trimmed));
  if (listed) return listed.name;
  return trimmed ? trimmed.charAt(0).toLocaleUpperCase("en") + trimmed.slice(1) : trimmed;
}

export function isListedLanguage(value: string): boolean {
  return byKey.has(normalizeLanguage(value));
}

/** Case and accent insensitive search over names and aliases; prefix matches first. */
export function searchLanguages(query: string, exclude: Iterable<string> = []): LanguageOption[] {
  const skip = new Set([...exclude].map(normalizeLanguage));
  const fold = (text: string) => normalizeLanguage(text).normalize("NFD").replace(/[̀-ͯ]/g, "");
  const q = fold(query);
  const available = LANGUAGES.filter(option => !skip.has(normalizeLanguage(option.name)));
  if (!q) return available;
  const terms = (option: LanguageOption) => [option.name, ...(option.aliases ?? [])].map(fold);
  const prefix = available.filter(option => terms(option).some(term => term.startsWith(q) || term.split(/\s+/).some(word => word.startsWith(q))));
  const inside = available.filter(option => !prefix.includes(option) && terms(option).some(term => term.includes(q)));
  return [...prefix, ...inside];
}
