"use strict";

const { Timestamp } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { DEFAULT_CITY, cityLabel } = require("./constants");
const { refs } = require("./refs");

/**
 * Operator stats.
 *
 * How the community is doing, for the people running it: who signed up, who finished
 * onboarding, who is active, whether plans turn into meetups and, because liquidity per
 * language pair per city is the whole game (docs/GROWTH-NOTES-2026-10-07.md), who has
 * nobody to meet yet.
 *
 *   stats/latest              server only; the newest snapshot
 *   statsDaily/{YYYY-MM-DD}   server only; the last snapshot of each Sydney day, for trends
 *
 * Totals use aggregation queries. Cities, language pairs and the unmatched count need
 * every profile, so profiles are read once, bounded by PROFILE_SCAN_LIMIT; past it the
 * snapshot says it is truncated. Nothing here holds a name, an email or a message, only
 * counts. Built once a day by snapshotStats and on demand by getStats (moderators only).
 */

const STATS_TIME_ZONE = "Australia/Sydney";

/** Bounded so one snapshot cannot run away. Far above today's community. */
const PROFILE_SCAN_LIMIT = 5000;
const ACTIVITY_SCAN_LIMIT = 5000;
const MEETUP_SCAN_LIMIT = 5000;

const TOP_PAIRS = 30;
const HISTORY_DAYS = 30;

/** A refresh this soon after the last snapshot returns that snapshot instead. */
const REFRESH_COOLDOWN_MS = 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-11-06" for an instant, in a time zone. */
function localDay(instant, timeZone = STATS_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(instant);
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return null;
}

function languagesOf(value) {
  return Array.isArray(value) ? value.filter((lang) => typeof lang === "string" && lang) : [];
}

/** The first language in a value stored either as a string or as a list. */
function firstLanguage(value) {
  if (typeof value === "string") return value || null;
  return languagesOf(value)[0] || null;
}

/**
 * Everything that needs the profiles themselves, as a pure function so it can be tested
 * without a database.
 *
 * A discoverable member is unmatched when nobody else discoverable in their city speaks
 * a language they are learning and is learning a language they speak. That is reciprocity
 * by language only; discovery also applies blocks and age, so this is the generous count.
 *
 * `meetups` are confirmed meetups as { participants, languages: [a, b] }, credited to
 * the city of their first participant still on file.
 */
function summarisePeople(people, { activeUids = new Set(), since30 = 0, meetups = [] } = {}) {
  const cities = new Map();
  const cityOf = new Map();
  const pairs = new Map();
  // Per city, how many discoverable members can give each language for each language
  // they want: key `${gives}>${wants}`.
  const exchanges = new Map();

  const cityRow = (id) => {
    if (!cities.has(id)) {
      // "Sydney, Australia": with the country, since cities span the world.
      cities.set(id, { id, name: cityLabel(id), members: 0, active7: 0, new30: 0, unmatched: 0 });
    }
    return cities.get(id);
  };
  const pairRow = (city, x, y) => {
    const [a, b] = x < y ? [x, y] : [y, x];
    const key = `${city}|${a}|${b}`;
    if (!pairs.has(key)) pairs.set(key, { city, a, b, aSide: 0, bSide: 0, meetups: 0 });
    return pairs.get(key);
  };

  for (const person of people) {
    const city = person.city || DEFAULT_CITY;
    cityOf.set(person.uid, city);
    const row = cityRow(city);
    row.members += 1;
    if (activeUids.has(person.uid)) row.active7 += 1;
    if (person.createdAt !== null && person.createdAt >= since30) row.new30 += 1;
    if (!person.discoverable) continue;

    if (!exchanges.has(city)) exchanges.set(city, new Map());
    const counts = exchanges.get(city);
    for (const gives of person.offers) {
      for (const wants of person.seeks) {
        if (gives === wants) continue;
        const key = `${gives}>${wants}`;
        counts.set(key, (counts.get(key) || 0) + 1);
        const pair = pairRow(city, gives, wants);
        if (gives === pair.a) pair.aSide += 1; else pair.bSide += 1;
      }
    }
  }

  let unmatched = 0;
  for (const person of people) {
    if (!person.discoverable) continue;
    const city = cityOf.get(person.uid);
    const counts = exchanges.get(city) || new Map();
    // A partner gives what this person wants and wants what this person gives. Offers and
    // seeks never overlap (upsertProfile refuses it), so this person is never their own match.
    const hasPartner = person.seeks.some((wants) =>
      person.offers.some((gives) => (counts.get(`${wants}>${gives}`) || 0) > 0));
    if (!hasPartner) {
      unmatched += 1;
      cityRow(city).unmatched += 1;
    }
  }

  for (const meetup of meetups) {
    const [x, y] = meetup.languages;
    if (!x || !y || x === y) continue;
    const city = meetup.participants.map((uid) => cityOf.get(uid)).find(Boolean);
    if (!city) continue;
    pairRow(city, x, y).meetups += 1;
  }

  const scarce = (pair) => Math.min(pair.aSide, pair.bSide);
  return {
    unmatched,
    cities: [...cities.values()].sort((p, q) => q.members - p.members || p.id.localeCompare(q.id)),
    pairs: [...pairs.values()]
      .sort((p, q) => scarce(q) - scarce(p)
        || (q.aSide + q.bSide) - (p.aSide + p.bSide)
        || q.meetups - p.meetups
        || `${p.city}${p.a}${p.b}`.localeCompare(`${q.city}${q.a}${q.b}`))
      .slice(0, TOP_PAIRS),
  };
}

async function countOf(query) {
  const snap = await query.count().get();
  return snap.data().count;
}

/** Every Auth account, including the ones that never finished onboarding. */
async function countAccounts() {
  const auth = getAuth();
  let total = 0;
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    total += page.users.length;
    pageToken = page.pageToken;
  } while (pageToken);
  return total;
}

/**
 * Who did something in the window: saved their profile, sent or answered a plan, or sent
 * or read a message. Each of those moves an updatedAt the server owns.
 */
async function activeUidsSince(db, since) {
  const r = refs(db);
  const cutoff = Timestamp.fromDate(since);
  const [profiles, invitations, conversations] = await Promise.all([
    r.profiles().where("updatedAt", ">=", cutoff).select().limit(ACTIVITY_SCAN_LIMIT).get(),
    r.invitations().where("updatedAt", ">=", cutoff).select("participants").limit(ACTIVITY_SCAN_LIMIT).get(),
    r.conversations().where("updatedAt", ">=", cutoff).select("participants").limit(ACTIVITY_SCAN_LIMIT).get(),
  ]);
  const uids = new Set(profiles.docs.map((doc) => doc.id));
  for (const doc of [...invitations.docs, ...conversations.docs]) {
    for (const uid of languagesOf(doc.get("participants"))) uids.add(uid);
  }
  return uids;
}

/** One snapshot of the whole community, as it is at `now`. */
async function buildSnapshot(db, now = new Date()) {
  const r = refs(db);
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const at = (date) => Timestamp.fromDate(date);
  const plansWith = (status) => countOf(r.invitations().where("status", "==", status));

  const [
    accounts, members, discoverable, new7, new30, withMeetup,
    plans, plansNew7, pending, accepted, declined, cancelled,
    confirmed, confirmed30, profileSnap, meetupSnap, active,
  ] = await Promise.all([
    countAccounts(),
    countOf(r.profiles()),
    countOf(r.profiles().where("discoverable", "==", true)),
    countOf(r.profiles().where("createdAt", ">=", at(since7))),
    countOf(r.profiles().where("createdAt", ">=", at(since30))),
    countOf(r.profiles().where("meetupsConfirmed", ">", 0)),
    countOf(r.invitations()),
    countOf(r.invitations().where("createdAt", ">=", at(since7))),
    plansWith("pending"),
    plansWith("accepted"),
    plansWith("declined"),
    plansWith("cancelled"),
    countOf(r.confirmedMeetups()),
    countOf(r.confirmedMeetups().where("confirmedAt", ">=", at(since30))),
    r.profiles().select("city", "offers", "seeks", "discoverable", "createdAt")
      .limit(PROFILE_SCAN_LIMIT + 1).get(),
    r.confirmedMeetups().select("participants", "gave").limit(MEETUP_SCAN_LIMIT + 1).get(),
    activeUidsSince(db, since7),
  ]);

  const truncated = profileSnap.size > PROFILE_SCAN_LIMIT || meetupSnap.size > MEETUP_SCAN_LIMIT;
  const people = profileSnap.docs.slice(0, PROFILE_SCAN_LIMIT).map((doc) => ({
    uid: doc.id,
    city: doc.get("city") || DEFAULT_CITY,
    offers: languagesOf(doc.get("offers")),
    seeks: languagesOf(doc.get("seeks")),
    discoverable: doc.get("discoverable") === true,
    createdAt: toMillis(doc.get("createdAt")),
  }));
  // Activity on plans or chats of an account that has since been deleted is not a member.
  const onFile = new Set(people.map((person) => person.uid));
  const activeUids = new Set([...active].filter((uid) => onFile.has(uid)));
  const meetups = meetupSnap.docs.slice(0, MEETUP_SCAN_LIMIT).map((doc) => {
    const participants = languagesOf(doc.get("participants"));
    const gave = doc.get("gave") || {};
    return { participants, languages: participants.map((uid) => firstLanguage(gave[uid])) };
  });
  const summary = summarisePeople(people, { activeUids, since30: since30.getTime(), meetups });

  return {
    generatedAt: Timestamp.fromDate(now),
    day: localDay(now),
    accounts: { total: accounts, withProfile: members, withoutProfile: Math.max(0, accounts - members) },
    members: {
      total: members, discoverable, new7, new30, active7: activeUids.size, withMeetup,
      unmatched: summary.unmatched,
    },
    plans: { total: plans, new7: plansNew7, pending, accepted, declined, cancelled },
    meetups: { confirmed, confirmed30 },
    cities: summary.cities,
    pairs: summary.pairs,
    truncated,
  };
}

/** Saves a snapshot as the latest and as its day's entry. */
async function saveSnapshot(db, snapshot) {
  const r = refs(db);
  const batch = db.batch();
  batch.set(r.statsLatest(), snapshot);
  batch.set(r.statsDay(snapshot.day), snapshot);
  await batch.commit();
  return snapshot;
}

function serializeSnapshot(data) {
  return { ...data, generatedAt: toMillis(data.generatedAt) };
}

/** The handful of numbers the trend needs, from one day's snapshot. */
function historyEntry(data) {
  return {
    day: data.day,
    accounts: data.accounts ? data.accounts.total : 0,
    members: data.members ? data.members.total : 0,
    active7: data.members ? data.members.active7 : 0,
    plans: data.plans ? data.plans.total : 0,
    meetups: data.meetups ? data.meetups.confirmed : 0,
  };
}

/**
 * Moderators only (enforced by the callable wrapper). Returns the latest snapshot,
 * building the first one if none exists yet, plus the daily trend and App Store units.
 * `refresh: true` rebuilds now, unless the latest is under a minute old.
 */
async function getStats(db, _uid, payload = {}, now = new Date()) {
  const r = refs(db);
  const refresh = Boolean(payload && payload.refresh === true);
  const latestSnap = await r.statsLatest().get();
  let latest = latestSnap.exists ? latestSnap.data() : null;
  const age = latest ? now.getTime() - toMillis(latest.generatedAt) : Infinity;
  if (!latest || (refresh && age > REFRESH_COOLDOWN_MS)) {
    latest = await saveSnapshot(db, await buildSnapshot(db, now));
  }

  const [days, storeDays, sync] = await Promise.all([
    r.statsDays().orderBy("day", "desc").limit(HISTORY_DAYS).get(),
    r.appStoreDays().orderBy("day", "desc").limit(HISTORY_DAYS).get(),
    r.appStoreSync().get(),
  ]);

  return {
    latest: serializeSnapshot(latest),
    history: days.docs.map((doc) => historyEntry(doc.data())),
    appStore: {
      lastSyncAt: sync.exists ? toMillis(sync.get("lastRunAt")) : null,
      lastError: sync.exists ? sync.get("lastError") || null : null,
      days: storeDays.docs.map((doc) => ({
        day: doc.get("day"),
        downloads: Number(doc.get("downloads") || 0),
        redownloads: Number(doc.get("redownloads") || 0),
        updates: Number(doc.get("updates") || 0),
      })),
    },
  };
}

module.exports = {
  STATS_TIME_ZONE,
  PROFILE_SCAN_LIMIT,
  TOP_PAIRS,
  REFRESH_COOLDOWN_MS,
  localDay,
  summarisePeople,
  buildSnapshot,
  saveSnapshot,
  getStats,
  toMillis,
};
