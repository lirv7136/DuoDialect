/**
 * The curated venue picker for a new invitation. A place type plus a neighbourhood
 * becomes the same "A café in Glebe" string the server already accepts, so the picker
 * changes nothing in the payload. Public places only: the picker offers no private
 * option, and a typed venue that reads like a home address gets a gentle warning.
 */
import { MAX_VENUE } from "./schedule";

export const PLACE_TYPES = [
  { key: "cafe", label: "Café", noun: "café" },
  { key: "library", label: "Library", noun: "library" },
  { key: "park", label: "Park", noun: "park" },
  { key: "campus", label: "Campus", noun: "campus" },
  { key: "shopping", label: "Shopping centre", noun: "shopping centre" },
] as const;

export type PlaceKey = typeof PLACE_TYPES[number]["key"];

/** The one line of product rule the picker shows. */
export const PUBLIC_PLACE_HINT = "Somewhere public, with other people around.";

export const PRIVATE_VENUE_WARNING = "That looks like a home address. Pick somewhere public, with other people around.";

/** "A café in Glebe", or "A café" when nobody has listed a neighbourhood. Trimmed to the backend limit. */
export function venueFor(key: PlaceKey, area: string): string {
  const noun = PLACE_TYPES.find(place => place.key === key)?.noun ?? "café";
  const where = area.trim();
  return (where ? `A ${noun} in ${where}` : `A ${noun}`).slice(0, MAX_VENUE);
}

export type AreaChoice = { key: "theirs" | "mine"; area: string; label: string };

/**
 * Whose neighbourhood to meet in. The partner's comes first, as the invitation is for
 * them; one chip when only one person has an area, or when both share it.
 */
export function areaChoices(partner: { name: string; area: string }, myArea: string): AreaChoice[] {
  const theirs = partner.area.trim(), mine = myArea.trim();
  if (theirs && mine && theirs.toLowerCase() === mine.toLowerCase()) return [{ key: "theirs", area: theirs, label: theirs }];
  const out: AreaChoice[] = [];
  if (theirs) out.push({ key: "theirs", area: theirs, label: mine ? `${theirs} · near ${partner.name}` : theirs });
  if (mine) out.push({ key: "mine", area: mine, label: theirs ? `${mine} · near you` : mine });
  return out;
}

/**
 * Recognises a venue the picker itself produced, so a prefilled plan ("same time next
 * week?") reopens on the right chips instead of in the free text field.
 */
export function matchVenue(venue: string, choices: readonly AreaChoice[]): { key: PlaceKey; areaKey: AreaChoice["key"] | null } | null {
  const wanted = venue.trim();
  if (!wanted) return null;
  for (const place of PLACE_TYPES) {
    for (const choice of choices) {
      if (venueFor(place.key, choice.area) === wanted) return { key: place.key, areaKey: choice.key };
    }
    if (venueFor(place.key, "") === wanted) return { key: place.key, areaKey: null };
  }
  return null;
}

// "Unit 3", "Apt 12", "Flat 2", "3/12 Smith St". "Flat" alone is left out so "Flat White Café" passes.
const DWELLING = /\b(?:unit|apt|flat)\s*\d|\bapartment\b|\bmy (?:place|house|home)\b|\bour place\b|\bat home\b|\bhome\b/i;
const STREET_TYPES = "st|street|rd|road|ave|avenue|pde|parade|cres|crescent|ln|lane|dr|drive|pl|place|ct|court|cl|close|tce|terrace|hwy|highway|way|blvd|boulevard|esp|esplanade";
// A street number (with an optional unit prefix) followed by a street name and type: "12 Glebe Point Rd".
const STREET_ADDRESS = new RegExp(`(?:^|[^\\w/])\\d+[a-z]?(?:/\\d+)?\\s+[\\w'’]+(?:\\s+[\\w'’]+){0,2}\\s+(?:${STREET_TYPES})\\b`, "i");

/**
 * True when a typed venue reads like somewhere private. A hint, not a block: the server
 * accepts any text, and a shopping centre's street address is a legitimate false alarm.
 */
export function looksPrivate(venue: string): boolean {
  const text = venue.trim();
  if (!text) return false;
  return DWELLING.test(text) || STREET_ADDRESS.test(text);
}
