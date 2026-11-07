/**
 * The cities Talkeven runs in. Mirrors CITIES in functions/lib/constants.js: the backend
 * is the authority and rejects any id not on its list, so the two must change together.
 *
 * Discovery never crosses a city, so this is the one profile field that decides who a
 * person can see at all. Ids are stable and lower case; names are for display.
 */
export const CITIES = [
  { id: "sydney", name: "Sydney" },
  { id: "melbourne", name: "Melbourne" },
  { id: "brisbane", name: "Brisbane" },
  { id: "perth", name: "Perth" },
  { id: "adelaide", name: "Adelaide" },
  { id: "canberra", name: "Canberra" },
  { id: "hobart", name: "Hobart" },
  { id: "darwin", name: "Darwin" },
  { id: "gold-coast", name: "Gold Coast" },
  { id: "auckland", name: "Auckland" },
  { id: "wellington", name: "Wellington" },
] as const;

export type CityId = typeof CITIES[number]["id"];

/** Where everyone was before 1.1.2, and what a new draft starts on. */
export const DEFAULT_CITY: CityId = "sydney";

export function isCityId(value: unknown): value is CityId {
  return typeof value === "string" && CITIES.some(city => city.id === value);
}

/** The display name for an id, or "" for anything the list does not know. */
export function cityName(id: string | null | undefined): string {
  return CITIES.find(city => city.id === id)?.name ?? "";
}
