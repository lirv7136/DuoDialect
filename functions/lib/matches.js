"use strict";

const { FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const { isUsableProfile, reciprocalExchange } = require("./eligibility");
const { refs, shortHash } = require("./refs");
const { deliver } = require("./notifier");
const { matchNotice } = require("./notifications");
const { LIMITS } = require("./constants");

/**
 * "A match joined" notifications.
 *
 * When a profile is created, or its languages change, the members it now forms a
 * reciprocal exchange with are told once each. This is what makes the empty Discover
 * screen's promise ("we'll let you know when someone joins") true.
 *
 *   matchNotices/{noticeId}   server only; one per (recipient, newcomer), so a person
 *                             is never told about the same member twice
 *
 * Bounded: one scan of the discovery index and at most MAX_NOTICES sends per change.
 * Blocks in either direction suppress the notice, as they do everywhere else.
 */
const MAX_NOTICES = 50;

function noticeId(toUid, aboutUid) {
  return `mn_${shortHash(toUid, aboutUid)}`;
}

function sameLanguages(a, b) {
  const key = (profile) => JSON.stringify([
    [...((profile && profile.offers) || [])].sort(),
    [...((profile && profile.seeks) || [])].sort(),
  ]);
  return key(a) === key(b);
}

/**
 * Whether a change to a profile should fan out notices: the first usable version of a
 * profile, a profile becoming discoverable again, or a change to its offered or sought
 * languages. Edits to the bio, area or photos never notify anyone.
 */
function shouldNotify(before, after) {
  if (!after || after.discoverable !== true || !isUsableProfile(after)) return false;
  if (!before || before.discoverable !== true || !isUsableProfile(before)) return true;
  return !sameLanguages(before, after);
}

/**
 * Finds the members the newcomer now matches and notifies each of them once.
 * Returns counts so the caller can log them. Never throws for a single bad recipient.
 */
async function notifyNewMatches(db, { uid, before, after }) {
  if (!shouldNotify(before, after)) return { candidates: 0, notified: 0, skipped: 0 };

  const r = refs(db);
  const seeks = (after.seeks || []).slice(0, 10);
  if (seeks.length === 0) return { candidates: 0, notified: 0, skipped: 0 };

  // The same index discovery uses: people who offer something the newcomer is learning.
  const snap = await r.profiles()
    .where("discoverable", "==", true)
    .where("offers", "array-contains-any", seeks)
    .orderBy("uid")
    .limit(LIMITS.discoveryScan)
    .get();

  const matches = [];
  for (const doc of snap.docs) {
    const profile = doc.data();
    if (!profile.uid || profile.uid === uid || !isUsableProfile(profile)) continue;
    // From the recipient's side: what the newcomer offers them, what they offer back.
    const exchange = reciprocalExchange(profile, after);
    if (exchange.reciprocal) matches.push({ profile, exchange: { theyOffer: exchange.bOffers, youOffer: exchange.aOffers } });
  }

  const result = { candidates: matches.length, notified: 0, skipped: 0 };
  for (const { profile, exchange } of matches.slice(0, MAX_NOTICES)) {
    const toUid = profile.uid;
    try {
      const noticeRef = r.matchNotice(noticeId(toUid, uid));
      const [notice, blockOut, blockIn] = await db.getAll(noticeRef, r.block(toUid, uid), r.block(uid, toUid));
      if (notice.exists || blockOut.exists || blockIn.exists) {
        result.skipped += 1;
        continue;
      }
      // Recorded before sending, so a retried trigger cannot send twice.
      await noticeRef.set({ toUid, aboutUid: uid, createdAt: FieldValue.serverTimestamp() });
      await deliver(db, {
        toUid,
        ...matchNotice(after.displayName, exchange),
        data: { type: "match", otherUid: uid },
      });
      result.notified += 1;
    } catch (error) {
      result.skipped += 1;
      logger.error("Match notice failed", { toUid, aboutUid: uid, error: String(error) });
    }
  }
  return result;
}

module.exports = { MAX_NOTICES, noticeId, shouldNotify, notifyNewMatches };
