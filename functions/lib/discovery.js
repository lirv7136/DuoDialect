"use strict";

const { requireObject, requireEnum, requireInteger, requireString } = require("./validation");
const { INTENTS, LIMITS } = require("./constants");
const {
  REASON, reject, isUsableProfile, reciprocalExchange, languageFailureReason, datingEligibility, intersect,
} = require("./eligibility");
const { refs } = require("./refs");
const { publicPhotos } = require("./photos");

/** Only these fields ever leave the server for another member. */
function publicCandidate(profile, exchange, myAvailability) {
  return {
    uid: profile.uid,
    displayName: profile.displayName,
    bio: profile.bio || "",
    area: profile.area || "",
    offers: profile.offers || [],
    seeks: profile.seeks || [],
    availability: profile.availability || [],
    interests: profile.interests || [],
    // { id, path } only. Clients fetch through the Storage SDK, gated by storage.rules.
    photos: publicPhotos(profile.photos),
    fluencyAssurance: profile.fluencyAssurance || "self-declared",
    exchange: { theyOffer: exchange.bOffers, youOffer: exchange.aOffers },
    sharedAvailability: intersect(profile.availability || [], myAvailability || []),
  };
}

/**
 * Server side discovery.
 *
 * Candidates are found by the languages they offer, then filtered against the caller's
 * own profile, blocks in both directions and, for dating, both people's private
 * preferences. Age, gender and dating preferences are read here but never returned:
 * the caller learns only that somebody is eligible, never why or what they prefer.
 *
 * Paging is by document id. Scanning is bounded per call; this is not a ranked feed
 * and it does not scale to a large member base without a dedicated index.
 */
async function discoverCandidates(db, uid, payload = {}, now = new Date()) {
  const body = requireObject(payload || {}, "request");
  const mode = body.mode === undefined ? "platonic" : requireEnum(body.mode, "mode", INTENTS);
  const limit = body.limit === undefined ? 10 : requireInteger(body.limit, "limit", 1, LIMITS.discoveryLimit);
  const cursor = body.cursor === undefined || body.cursor === null
    ? null
    : requireString(body.cursor, "cursor", 128);

  const r = refs(db);
  const [meSnap, myPrivateSnap] = await db.getAll(r.profile(uid), r.privateProfile(uid));
  const me = meSnap.exists ? meSnap.data() : null;
  if (!isUsableProfile(me)) {
    throw reject("failed-precondition", REASON.profileIncomplete, "Complete your profile before discovering partners.");
  }
  const myPrivate = myPrivateSnap.exists ? myPrivateSnap.data() : null;

  if (mode === "dating") {
    const selfCheck = datingEligibility(myPrivate, myPrivate, now);
    if (!selfCheck.eligible) {
      throw reject(
        "failed-precondition",
        selfCheck.reason === REASON.datingPreferences ? REASON.datingDisabled : selfCheck.reason,
        selfCheck.reason === REASON.notAdult
          ? "Language dates are available to adults aged 18 and over."
          : "Turn on language dates in your preferences first.",
      );
    }
  }

  const seeks = (me.seeks || []).slice(0, 10);
  if (seeks.length === 0) return { candidates: [], nextCursor: null, scanned: 0 };

  let query = r.profiles()
    .where("discoverable", "==", true)
    .where("offers", "array-contains-any", seeks)
    .orderBy("uid")
    .limit(LIMITS.discoveryScan);
  if (cursor) query = query.startAfter(cursor);

  const snap = await query.get();
  const scanned = snap.size;
  const rows = snap.docs
    .map((doc) => doc.data())
    .filter((profile) => profile.uid && profile.uid !== uid && isUsableProfile(profile));

  // Blocks the caller made.
  const myBlocks = new Set((await r.blocksOf(uid).get()).docs.map((doc) => doc.id));
  const notBlockedByMe = rows.filter((profile) => !myBlocks.has(profile.uid));

  // Blocks made against the caller.
  let visible = notBlockedByMe;
  if (visible.length > 0) {
    const inbound = await db.getAll(...visible.map((profile) => r.block(profile.uid, uid)));
    visible = visible.filter((_, index) => !inbound[index].exists);
  }

  const reciprocal = [];
  for (const profile of visible) {
    const exchange = reciprocalExchange(me, profile);
    if (exchange.reciprocal) reciprocal.push({ profile, exchange });
  }

  let eligible = reciprocal;
  if (mode === "dating" && reciprocal.length > 0) {
    const privates = await db.getAll(...reciprocal.map((row) => r.privateProfile(row.profile.uid)));
    eligible = reciprocal.filter((_, index) => {
      const theirPrivate = privates[index].exists ? privates[index].data() : null;
      return datingEligibility(myPrivate, theirPrivate, now).eligible;
    });
  }

  const page = eligible.slice(0, limit);
  const lastScanned = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].get("uid") : null;
  // Rows are in uid order. When more people qualified than fit on this page, resume just
  // after the last one returned so the rest are not skipped; otherwise resume after the scan.
  const nextCursor = eligible.length > limit
    ? page[page.length - 1].profile.uid
    : snap.size === LIMITS.discoveryScan ? lastScanned : null;

  const result = {
    mode,
    candidates: page.map((row) => publicCandidate(row.profile, row.exchange, me.availability)),
    nextCursor,
    scanned,
  };

  // An empty first page explains itself: who is almost a match, and how many people here
  // want what the caller offers. Only for platonic discovery, and only when the whole
  // scan came up empty, so the extra reads happen when there is nothing else to show.
  if (mode === "platonic" && !cursor && page.length === 0 && nextCursor === null) {
    Object.assign(result, await nearMisses(db, uid, me, visible));
  }
  return result;
}

/** What a near miss reveals: enough to see why, and nothing a candidate card would not. */
function publicNearMiss(profile, reason) {
  return {
    uid: profile.uid,
    displayName: profile.displayName,
    area: profile.area || "",
    offers: profile.offers || [],
    seeks: profile.seeks || [],
    photos: publicPhotos(profile.photos),
    reason,
  };
}

/**
 * The people on either side of a one way match, with the reason it is one way, plus a
 * count of members learning a language the caller offers. Blocks are respected in both
 * directions, as for candidates. Bounded to one extra scan and one count.
 */
async function nearMisses(db, uid, me, alreadyVisible) {
  const r = refs(db);
  const offers = (me.offers || []).slice(0, 10);
  if (offers.length === 0) return { nearMisses: [], learningYourLanguage: 0 };

  const myBlocks = new Set((await r.blocksOf(uid).get()).docs.map((doc) => doc.id));

  // People who want what the caller offers, but do not offer what the caller wants.
  const wantMine = await r.profiles()
    .where("discoverable", "==", true)
    .where("seeks", "array-contains-any", offers)
    .orderBy("uid")
    .limit(LIMITS.nearMissScan)
    .get();
  const learningYourLanguage = wantMine.docs
    .map((doc) => doc.data())
    .filter((profile) => profile.uid && profile.uid !== uid && !myBlocks.has(profile.uid)).length;

  const seen = new Set();
  const pool = [];
  for (const profile of [...alreadyVisible, ...wantMine.docs.map((doc) => doc.data())]) {
    if (!profile.uid || profile.uid === uid || seen.has(profile.uid)) continue;
    if (!isUsableProfile(profile) || myBlocks.has(profile.uid)) continue;
    seen.add(profile.uid);
    if (!reciprocalExchange(me, profile).reciprocal) pool.push(profile);
  }

  let rows = pool.slice(0, LIMITS.nearMissLimit * 2);
  if (rows.length > 0) {
    const inbound = await db.getAll(...rows.map((profile) => r.block(profile.uid, uid)));
    rows = rows.filter((_, index) => !inbound[index].exists);
  }

  return {
    nearMisses: rows.slice(0, LIMITS.nearMissLimit)
      .map((profile) => publicNearMiss(profile, languageFailureReason(me, profile))),
    learningYourLanguage,
  };
}

module.exports = { discoverCandidates, publicCandidate, publicNearMiss };
