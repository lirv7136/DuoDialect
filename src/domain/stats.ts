/**
 * Stats, as the moderator only Stats screen reads them. The shapes mirror the `getStats`
 * callable (functions/lib, moderators only); nothing here talks to the server. The
 * screen reads these helpers for percentages, App Store totals, the language pair
 * lines and the "updated N minutes ago" label, so they are unit tested directly
 * (tests/stats.test.cjs).
 */
import { cityLabel } from "./cities";
import { displayLanguage } from "./languages";
import { parseLocalDate } from "./schedule";

export type StatsCity = { id: string; name: string; members: number; active7: number; new30: number; unmatched: number };

/**
 * Language pair liquidity in one city. `a` < `b` alphabetically, both lower case.
 * `aSide` speak `a` and learn `b`; `bSide` speak `b` and learn `a`.
 */
export type StatsPair = { city: string; a: string; b: string; aSide: number; bSide: number; meetups: number };

export type StatsSnapshot = {
  /** Milliseconds since the epoch. */
  generatedAt: number;
  /** "YYYY-MM-DD", the Sydney date. */
  day: string;
  /** `withoutProfile` signed up but never finished onboarding. */
  accounts: { total: number; withProfile: number; withoutProfile: number };
  members: {
    total: number;
    discoverable: number;
    /** Profiles created in the last 7 and 30 days. */
    new7: number;
    new30: number;
    /** Did something in the last 7 days: a profile edit, a plan or a chat. */
    active7: number;
    /** Have at least one confirmed meetup. */
    withMeetup: number;
    /** Discoverable members with nobody reciprocal in their city. */
    unmatched: number;
  };
  plans: { total: number; new7: number; pending: number; accepted: number; declined: number; cancelled: number };
  /** Both people checked in "yes, we met". */
  meetups: { confirmed: number; confirmed30: number };
  /** Only cities with members, most members first. */
  cities: StatsCity[];
  /** Sorted by the smaller side, largest first. Up to 30. */
  pairs: StatsPair[];
  /** True when there were too many profiles to scan fully, so counts are partial. */
  truncated: boolean;
};

export type StatsDay = { day: string; accounts: number; members: number; active7: number; plans: number; meetups: number };

export type AppStoreDay = { day: string; downloads: number; redownloads: number; updates: number };

export type AppStoreStats = {
  /** Milliseconds; null until App Store Connect is connected. */
  lastSyncAt: number | null;
  lastError: string | null;
  /** Newest first, up to 30 days. */
  days: AppStoreDay[];
};

export type StatsResponse = {
  /** Null until the first snapshot exists. */
  latest: StatsSnapshot | null;
  /** Newest first, up to 30 days. */
  history: StatsDay[];
  appStore: AppStoreStats;
};

/**
 * Fills in the lists and the App Store block if the server left them out, so a partial
 * response renders as "nothing yet" rather than crashing the screen.
 */
export function normaliseStats(value: Partial<StatsResponse> | null | undefined): StatsResponse {
  const appStore: Partial<AppStoreStats> = value?.appStore ?? {};
  return {
    latest: value?.latest ?? null,
    history: Array.isArray(value?.history) ? value.history : [],
    appStore: {
      lastSyncAt: typeof appStore.lastSyncAt === "number" ? appStore.lastSyncAt : null,
      lastError: typeof appStore.lastError === "string" && appStore.lastError ? appStore.lastError : null,
      days: Array.isArray(appStore.days) ? appStore.days : [],
    },
  };
}

/** Whole percent of `part` in `whole`, or null when there is nothing to divide by. */
export function percent(part: number, whole: number): number | null {
  if (!(whole > 0) || !Number.isFinite(part)) return null;
  return Math.round((part / whole) * 100);
}

/** "42%", or an en dash when the whole is zero. */
export function percentLabel(part: number, whole: number): string {
  return formatPercent(percent(part, whole));
}

/** A percentage from `percent`: "42%", or an en dash for null. */
export function formatPercent(value: number | null): string {
  return value === null ? "–" : `${value}%`;
}

/** 1234567 → "1,234,567", without relying on locale data the JS engine may not ship. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "–";
  const sign = value < 0 ? "-" : "";
  return sign + String(Math.round(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "1 member", "3 members". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/** Share of accounts that finished onboarding (have a profile). */
export function onboardingRate(accounts: StatsSnapshot["accounts"]): number | null {
  return percent(accounts.withProfile, accounts.total);
}

/** Share of members who did something in the last 7 days. */
export function activeShare(members: StatsSnapshot["members"]): number | null {
  return percent(members.active7, members.total);
}

export type FunnelStep = {
  label: string;
  count: number;
  /** Of the first step, accounts. Null when there are no accounts. */
  ofTotal: number | null;
  /** Of the step before; null on the first step. */
  ofPrevious: number | null;
};

/** Accounts → finished onboarding → discoverable → had a meetup. */
export function funnel(snapshot: Pick<StatsSnapshot, "accounts" | "members">): FunnelStep[] {
  const steps = [
    { label: "Accounts", count: snapshot.accounts.total },
    { label: "Finished onboarding", count: snapshot.accounts.withProfile },
    { label: "Discoverable", count: snapshot.members.discoverable },
    { label: "Had a meetup", count: snapshot.members.withMeetup },
  ];
  const total = steps[0].count;
  return steps.map((step, index) => ({
    ...step,
    ofTotal: percent(step.count, total),
    ofPrevious: index === 0 ? null : percent(step.count, steps[index - 1].count),
  }));
}

const DAY_MS = 86_400_000;

/** Days since 1970 for a "YYYY-MM-DD", or null. Time zone independent. */
function dayNumber(day: string): number | null {
  const date = parseLocalDate(day);
  return date ? Math.round(Date.UTC(date.year, date.month - 1, date.day) / DAY_MS) : null;
}

export type AppStoreTotals = {
  downloads: number;
  redownloads: number;
  updates: number;
  /** How many reported days fell inside the window. */
  days: number;
  /** The newest reported day, the end of the window, or null with no data. */
  through: string | null;
};

/**
 * Totals over the `span` days ending on the newest reported day. App Store Connect
 * reports lag a day or two, so the window ends where the data does rather than today,
 * and a day missing from the report counts as nothing rather than pulling in an older one.
 */
export function appStoreTotals(days: readonly AppStoreDay[], span: number): AppStoreTotals {
  const dated = days.map(item => ({ item, n: dayNumber(item.day) })).filter(entry => entry.n !== null) as { item: AppStoreDay; n: number }[];
  const empty: AppStoreTotals = { downloads: 0, redownloads: 0, updates: 0, days: 0, through: null };
  if (!dated.length || span <= 0) return empty;
  const newest = dated.reduce((best, entry) => (entry.n > best.n ? entry : best));
  const inside = dated.filter(entry => entry.n > newest.n - span);
  const sum = (key: "downloads" | "redownloads" | "updates") =>
    inside.reduce((total, entry) => total + (Number.isFinite(entry.item[key]) ? entry.item[key] : 0), 0);
  return { downloads: sum("downloads"), redownloads: sum("redownloads"), updates: sum("updates"), days: inside.length, through: newest.item.day };
}

/** Not connected until the first App Store Connect sync has run. */
export function appStoreConnected(appStore: Pick<AppStoreStats, "lastSyncAt">): boolean {
  return typeof appStore.lastSyncAt === "number";
}

/** "just now", "1 minute ago", "3 hours ago", "2 days ago". A time in the future reads as just now. */
export function timeAgo(at: number, now: number = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (!(minutes >= 1)) return "just now";
  if (minutes < 60) return `${plural(minutes, "minute")} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${plural(hours, "hour")} ago`;
  return `${plural(Math.floor(hours / 24), "day")} ago`;
}

/** "Updated 5 minutes ago". */
export function updatedLabel(generatedAt: number, now: number = Date.now()): string {
  return `Updated ${timeAgo(generatedAt, now)}`;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-04" → "4 Nov", for chart ends. Anything else is shown as it came. */
export function shortDay(day: string): string {
  const date = parseLocalDate(day);
  return date ? `${date.day} ${SHORT_MONTHS[date.month - 1]}` : day;
}

/**
 * The display name for a city in the stats. Accepts an id or a name: the snapshot's own
 * city list first, then the app's list ("Sydney, Australia"), then the value as given.
 */
export function statsCityName(value: string, cities: readonly Pick<StatsCity, "id" | "name">[] = []): string {
  const listed = cities.find(city => city.id === value);
  if (listed?.name) return listed.name;
  return cityLabel(value) || value;
}

/** "English ⇄ Japanese". */
export function pairTitle(pair: Pick<StatsPair, "a" | "b">): string {
  return `${displayLanguage(pair.a)} ⇄ ${displayLanguage(pair.b)}`;
}

export type PairSide = {
  count: number;
  /** "5 speak English learning Japanese". */
  text: string;
  /** The smaller side, which limits how many pairs can form. Never both. */
  scarce: boolean;
};

/** Both sides of a pair, with the scarce one marked. Equal sides mark neither. */
export function pairSides(pair: Pick<StatsPair, "a" | "b" | "aSide" | "bSide">): [PairSide, PairSide] {
  const a = displayLanguage(pair.a);
  const b = displayLanguage(pair.b);
  return [
    { count: pair.aSide, text: `${formatCount(pair.aSide)} speak ${a} learning ${b}`, scarce: pair.aSide < pair.bSide },
    { count: pair.bSide, text: `${formatCount(pair.bSide)} speak ${b} learning ${a}`, scarce: pair.bSide < pair.aSide },
  ];
}

/** The whole pair as one line, for screen readers and copying. */
export function pairSummary(pair: StatsPair): string {
  const [a, b] = pairSides(pair);
  return `${pairTitle(pair)} — ${a.text} · ${b.text} · ${plural(pair.meetups, "meetup")}`;
}

export type CityPairs = { city: string; name: string; pairs: StatsPair[] };

/**
 * Pairs grouped by city, in the order of the snapshot's city list (most members first),
 * then any city the list does not have. Pairs keep the server's order within a city.
 */
export function pairsByCity(pairs: readonly StatsPair[], cities: readonly Pick<StatsCity, "id" | "name">[] = []): CityPairs[] {
  const groups = new Map<string, StatsPair[]>();
  for (const pair of pairs) {
    const group = groups.get(pair.city);
    if (group) group.push(pair);
    else groups.set(pair.city, [pair]);
  }
  const rank = (id: string) => {
    const index = cities.findIndex(city => city.id === id || city.name === id);
    return index < 0 ? cities.length : index;
  };
  return [...groups.entries()]
    .map(([city, items], order) => ({ city, items, order }))
    .sort((x, y) => rank(x.city) - rank(y.city) || x.order - y.order)
    .map(({ city, items }) => ({ city, name: statsCityName(city, cities), pairs: items }));
}

export type HistoryPoint = { day: string; value: number; ratio: number };

export type HistorySeries = {
  points: HistoryPoint[];
  max: number;
  first: HistoryPoint | null;
  last: HistoryPoint | null;
};

/**
 * One measure from the history, oldest first, each with its height as a share of the
 * largest value so bars start from zero. Days that are not real dates are skipped.
 */
export function historySeries(history: readonly StatsDay[], key: "accounts" | "members" | "active7" | "plans" | "meetups"): HistorySeries {
  const values = history
    .filter(day => dayNumber(day.day) !== null)
    .map(day => ({ day: day.day, value: Number.isFinite(day[key]) ? Math.max(0, day[key]) : 0 }))
    .sort((x, y) => x.day.localeCompare(y.day));
  const max = values.reduce((best, point) => Math.max(best, point.value), 0);
  const points = values.map(point => ({ ...point, ratio: max > 0 ? point.value / max : 0 }));
  return { points, max, first: points[0] ?? null, last: points[points.length - 1] ?? null };
}

/** "120 → 134 over 30 days", or the one value when there is a single day. */
export function seriesChange(series: HistorySeries): string {
  if (!series.first || !series.last) return "";
  if (series.points.length === 1) return formatCount(series.last.value);
  const from = dayNumber(series.first.day);
  const to = dayNumber(series.last.day);
  const span = from !== null && to !== null ? to - from + 1 : series.points.length;
  return `${formatCount(series.first.value)} → ${formatCount(series.last.value)} over ${plural(span, "day")}`;
}

/** "+3 this week", or "None new this week". */
export function newThisWeek(count: number): string {
  return count > 0 ? `+${formatCount(count)} this week` : "None new this week";
}
