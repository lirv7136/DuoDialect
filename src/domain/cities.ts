/**
 * The cities a profile can belong to: every city of 100,000 people or more and every
 * capital, worldwide. The list is functions/data/cities.json, built from GeoNames
 * (CC BY 4.0) by scripts/build-world-cities.cjs. The backend validates `city` against the
 * same file, so there is one list and nothing to keep in step.
 *
 * Discovery never crosses a city, so this is the one profile field that decides who a
 * person can see at all. Ids are stable and lower case: the eleven cities from before the
 * world list keep their bare ids (sydney, melbourne, ...), and every other city is
 * `<name>-<country>`, such as london-gb, or `<name>-<country>-<region>` where a country
 * has two of one name, such as springfield-us-il.
 */
import data from "../../functions/data/cities.json";

export type CityId = string;

export type City = {
  id: CityId;
  /** As the city spells itself where that is Latin script: "São Paulo", "Kraków". */
  name: string;
  /** ISO 3166-1 alpha-2, such as "BR". */
  country: string;
  countryName: string;
  /** Only where a country has two cities of one name: "Illinois". Otherwise "". */
  region: string;
  /** IANA name, such as "America/Sao_Paulo". Meetups there are arranged in this zone. */
  timeZone: string;
  population: number;
};

type Row = [id: string, name: string, country: string, zone: number, population: number, geonameid: number, region?: string];
const dataset = data as unknown as { countries: Record<string, string>; zones: string[]; cities: Row[] };

/** Every city, biggest first. */
export const CITIES: readonly City[] = dataset.cities.map(([id, name, country, zone, population, , region]) => ({
  id, name, country, countryName: dataset.countries[country] ?? country, region: region ?? "", timeZone: dataset.zones[zone], population,
}));

const BY_ID = new Map(CITIES.map(city => [city.id, city]));

/** The cities Talkeven had before the world list. Apps up to 1.1.2 know only these. */
export const LEGACY_CITY_IDS = [
  "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra", "hobart", "darwin", "gold-coast", "auckland", "wellington",
] as const;

/** Where a profile from before 1.1.2, which has no city, lives. */
export const DEFAULT_CITY: CityId = "sydney";

export function isCityId(value: unknown): value is CityId {
  return typeof value === "string" && BY_ID.has(value);
}

export function cityById(id: string | null | undefined): City | null {
  return typeof id === "string" ? BY_ID.get(id) ?? null : null;
}

/** The short display name for an id, "London", or "" for anything the list does not know. */
export function cityName(id: string | null | undefined): string {
  return cityById(id)?.name ?? "";
}

/** "London, United Kingdom", or "Springfield, Illinois, United States"; "" when unknown. */
export function cityLabel(city: City | string | null | undefined): string {
  const found = typeof city === "object" && city !== null ? city : cityById(city);
  return found ? [found.name, found.region, found.countryName].filter(Boolean).join(", ") : "";
}

/** The IANA time zone meetups in this city are arranged in, or null for an unknown id. */
export function cityTimeZone(id: string | null | undefined): string | null {
  return cityById(id)?.timeZone ?? null;
}

/**
 * The zone a new plan is arranged in. Discovery keeps both people in the sender's city, so
 * it is that city's zone, wherever the phone happens to be; the phone's own zone only
 * when the city is unknown, and null when neither is known.
 */
export function meetingTimeZone(cityId: string | null | undefined, deviceZone: string | null | undefined): string | null {
  return cityTimeZone(cityId) ?? (deviceZone || null);
}

/**
 * Older names some devices and browsers still report, mapped to the name GeoNames uses.
 * Anything not here is looked up as given.
 */
const ZONE_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata", "Asia/Saigon": "Asia/Ho_Chi_Minh", "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon", "Asia/Ulan_Bator": "Asia/Ulaanbaatar", "Asia/Chongqing": "Asia/Shanghai",
  "Asia/Chungking": "Asia/Shanghai", "Asia/Harbin": "Asia/Shanghai", "Asia/Macao": "Asia/Macau", "Asia/Dacca": "Asia/Dhaka",
  "Asia/Istanbul": "Europe/Istanbul", "Asia/Tel_Aviv": "Asia/Jerusalem", "Europe/Kiev": "Europe/Kyiv",
  "Europe/Belfast": "Europe/London", "Atlantic/Faeroe": "Atlantic/Faroe", "America/Godthab": "America/Nuuk",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires", "America/Cordoba": "America/Argentina/Cordoba",
  "America/Indianapolis": "America/Indiana/Indianapolis", "America/Louisville": "America/Kentucky/Louisville",
  "America/Montreal": "America/Toronto", "Australia/ACT": "Australia/Sydney", "Australia/Canberra": "Australia/Sydney",
  "Australia/NSW": "Australia/Sydney", "Australia/Victoria": "Australia/Melbourne", "Australia/Queensland": "Australia/Brisbane",
  "Australia/West": "Australia/Perth", "Australia/South": "Australia/Adelaide", "Australia/Tasmania": "Australia/Hobart",
  "Australia/North": "Australia/Darwin", "NZ": "Pacific/Auckland", "GB": "Europe/London", "PRC": "Asia/Shanghai",
  "Japan": "Asia/Tokyo", "ROK": "Asia/Seoul", "Singapore": "Asia/Singapore", "Hongkong": "Asia/Hong_Kong",
  "US/Eastern": "America/New_York", "US/Central": "America/Chicago", "US/Mountain": "America/Denver",
  "US/Pacific": "America/Los_Angeles", "US/Arizona": "America/Phoenix", "US/Alaska": "America/Anchorage", "US/Hawaii": "Pacific/Honolulu",
  "Canada/Eastern": "America/Toronto", "Canada/Pacific": "America/Vancouver", "Brazil/East": "America/Sao_Paulo",
  "Mexico/General": "America/Mexico_City",
};

/** The biggest cities in a time zone, such as the device's: the likely home of a new member. */
export function citiesInTimeZone(zone: string | null | undefined, limit = 3): City[] {
  if (!zone) return [];
  const wanted = ZONE_ALIASES[zone] ?? zone;
  const found: City[] = [];
  for (const city of CITIES) {
    if (city.timeZone !== wanted) continue;
    found.push(city);
    if (found.length >= limit) break;
  }
  return found;
}

/** The biggest city in a time zone, or null when the zone has none on the list (UTC, say). */
export function likelyCity(zone: string | null | undefined): City | null {
  return citiesInTimeZone(zone, 1)[0] ?? null;
}

/** Letters that do not decompose into a base letter and an accent. */
const SPECIAL_LETTERS: Record<string, string> = { "ł": "l", "ø": "o", "đ": "d", "ð": "d", "ß": "ss", "æ": "ae", "œ": "oe", "ı": "i", "þ": "th" };

/** Lower case, without accents or punctuation: "São Paulo" → "sao paulo", "Xi'an" → "xian". */
export function foldForSearch(text: string): string {
  let value = text.toLowerCase();
  try { value = value.normalize("NFD"); } catch { /* without normalize, unaccented names still match */ }
  return value
    .replace(/[̀-ͯ]/g, "")
    .replace(/[łøđðßæœıþ]/g, letter => SPECIAL_LETTERS[letter] ?? letter)
    .replace(/['’‘`ʻʼ]/g, "")
    .replace(/[\s,.\-–—()/]+/g, " ")
    .trim();
}

/** What people call a country besides its GeoNames name, so "london uk" finds London. */
const COUNTRY_ALIASES: Record<string, string> = {
  GB: "uk britain great britain england scotland wales northern ireland",
  US: "usa america united states of america",
  AE: "uae emirates",
  NL: "netherlands holland",
  KR: "korea",
  CZ: "czech republic",
  CI: "cote divoire",
  MM: "burma",
  TR: "turkiye",
  CD: "congo drc",
  CG: "congo",
  CV: "cape verde",
  SZ: "swaziland",
  MK: "macedonia",
};

type Indexed = { city: City; name: string; nameWords: string[]; words: string[] };
let index: Indexed[] | null = null;

/** Built on the first search, not at start up. */
function searchIndex(): Indexed[] {
  if (!index) {
    index = CITIES.map(city => {
      const name = foldForSearch(city.name);
      const rest = [city.region, city.countryName, city.country, COUNTRY_ALIASES[city.country] ?? "", city.id].map(foldForSearch).join(" ");
      return { city, name, nameWords: name.split(" "), words: `${name} ${rest}`.split(" ").filter(Boolean) };
    });
  }
  return index;
}

/**
 * Cities matching what a person typed, best first. Every word typed must start a word of
 * the city's name, region or country ("new york", "paris fr", "springfield illinois").
 * Cities whose name starts with the whole query come first, then those with a word of the
 * name starting with the first word typed, then the rest; the bigger city first in each.
 */
export function searchCities(query: string, limit = 8): City[] {
  const folded = foldForSearch(query);
  if (!folded) return [];
  const tokens = folded.split(" ");
  const tiers: City[][] = [[], [], []];
  for (const item of searchIndex()) {
    if (tiers[0].length >= limit) break;
    if (!tokens.every(token => item.words.some(word => word.startsWith(token)))) continue;
    const tier = item.name.startsWith(folded) ? 0 : item.nameWords.some(word => word.startsWith(tokens[0])) ? 1 : 2;
    tiers[tier].push(item.city);
  }
  return [...tiers[0], ...tiers[1], ...tiers[2]].slice(0, limit);
}
