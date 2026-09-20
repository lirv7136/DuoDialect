"use strict";

const { requireObject, requireEnum, requireInteger, requireString } = require("./validation");
const { INTENTS, LIMITS } = require("./constants");
const { REASON, reject, isUsableProfile, reciprocalExchange, datingEligibility, intersect } = require("./eligibility");
const { refs } = require("./refs");

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
  const nextCursor = snap.size === LIMITS.discoveryScan ? lastScanned : null;

  return {
    mode,
    candidates: page.map((row) => publicCandidate(row.profile, row.exchange, me.availability)),
    nextCursor,
    scanned,
  };
}

module.exports = { discoverCandidates, publicCandidate };
