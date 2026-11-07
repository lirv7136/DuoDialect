"use strict";

const { HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { refs } = require("./refs");
const { RATE_LIMITS } = require("./constants");
const {
  TRUST_REASON, normalizeTrustConfig, mayMakePlans, emailConfirmedFromToken, emailConfirmedFromUser, quotaCheck,
  chargedCounts, toDate,
} = require("./trust-policy");

/**
 * Trust, phase 1: the server flags in config/trust, what they hold back, and per member
 * rate limits. The rules themselves are pure and live in trust-policy.js; this file reads
 * the documents and the auth records they need.
 *
 * Every flag is off by default, so with no config/trust document nothing here changes
 * what any client sees. The 1.1.2 and 1.2.0 apps cannot verify anyone, which is why
 * requireVerification must stay off until they are retired.
 */

function trustReject(code, reason, message) {
  return new HttpsError(code, message, { reason });
}

async function readTrustConfig(db) {
  const snap = await refs(db).trustConfig().get();
  return normalizeTrustConfig(snap.exists ? snap.data() : null);
}

/**
 * While requireVerification is on, the caller must be verified to create or to accept an
 * invitation: verification comes before the first meetup. Only the caller is checked, so a
 * verified member may invite someone who is not verified yet, and that person is asked to
 * verify when they go to accept. Declining, cancelling and plans already accepted are
 * never affected.
 */
function assertMayMakePlans(config, profile) {
  const check = mayMakePlans({ config, verified: !!profile && profile.verified === true });
  if (!check.allowed) {
    throw trustReject("failed-precondition", check.reason, "Verify your profile before you meet anyone.");
  }
}

/** The uids, out of `uids`, whose email is confirmed or who signed in with Apple. */
async function confirmedEmails(uids) {
  const confirmed = new Set();
  const unique = [...new Set(uids.filter(Boolean))];
  for (let start = 0; start < unique.length; start += 100) {
    const { users } = await getAuth().getUsers(unique.slice(start, start + 100).map((uid) => ({ uid })));
    for (const user of users) if (emailConfirmedFromUser(user)) confirmed.add(user.uid);
  }
  return confirmed;
}

/**
 * The items whose profile may be shown to the caller: with a confirmed email when that is
 * required, and verified when the caller asked for verified members only. Verification
 * itself never hides anyone, since unverified members are needed for there to be anyone
 * to meet. `profileOf` picks the public profile out of each item. Reads auth records only
 * when requireEmailVerification is on.
 */
async function visibleUnderTrust(config, items, { profileOf = (item) => item, verifiedOnly = false } = {}) {
  let rows = verifiedOnly ? items.filter((item) => profileOf(item).verified === true) : items;
  if (config.requireEmailVerification && rows.length > 0) {
    const confirmed = await confirmedEmails(rows.map((item) => profileOf(item).uid));
    rows = rows.filter((item) => confirmed.has(profileOf(item).uid));
  }
  return rows;
}

/** Whether one stored profile is visible to others under the current flags. */
async function discoverableUnderTrust(config, profile) {
  return (await visibleUnderTrust(config, [profile])).length === 1;
}

/**
 * What the caller's own app needs to explain itself: whether they are verified, whether
 * their email counts as confirmed, what the server currently requires, and which of those
 * requirements is holding them back right now (reason codes, empty when nothing is).
 */
async function trustSummary(db, config, { uid, profile, token }) {
  const record = await refs(db).verification(uid).get();
  const verification = record.exists ? record.data() : {};
  let emailConfirmed = emailConfirmedFromToken(token);
  if (!emailConfirmed && config.requireEmailVerification) {
    // A token minted before the person clicked the link still says unconfirmed.
    try {
      emailConfirmed = emailConfirmedFromUser(await getAuth().getUser(uid));
    } catch {
      emailConfirmed = false;
    }
  }
  const plans = mayMakePlans({ config, verified: !!profile && profile.verified === true });
  const restrictions = [];
  if (!plans.allowed) restrictions.push(plans.reason);
  if (config.requireEmailVerification && !emailConfirmed) restrictions.push(TRUST_REASON.emailUnconfirmed);
  const verifiedAt = toDate(verification.verifiedAt);
  const photoChangedAt = toDate(verification.photoChangedAt);
  return {
    verified: !!profile && profile.verified === true,
    verification: {
      status: verification.status || "none",
      method: verification.method || null,
      verifiedAt: verifiedAt ? verifiedAt.toISOString() : null,
      // Set when a new main photo sent a verified member back to pending.
      photoChangedAt: verification.status === "pending" && photoChangedAt ? photoChangedAt.toISOString() : null,
    },
    emailConfirmed,
    requirements: {
      verificationToMeet: config.requireVerification,
      emailConfirmation: config.requireEmailVerification,
    },
    restrictions,
  };
}

// ── Rate limits ─────────────────────────────────────────────────────────────────────

const RATE_LIMIT_REASONS = {
  createInvitation: "rate-limit/invitations",
  sendMessage: "rate-limit/messages",
  reportUser: "rate-limit/reports",
};

const RATE_LIMIT_MESSAGES = {
  createInvitation: "You’ve sent a lot of plans today. You can send more tomorrow.",
  sendMessage: "You’ve sent a lot of messages today. You can send more tomorrow.",
  reportUser: "You’ve sent a lot of reports today. If you need help now, contact support.",
};

/**
 * Checks one action against the counter read inside the caller's transaction, and throws
 * resource-exhausted once today's limit is used. Returns the check for chargeQuota.
 */
function assertQuota(snapshot, action, now = new Date()) {
  const check = quotaCheck(snapshot && snapshot.exists ? snapshot.data() : null, action, now);
  if (!check.allowed) {
    throw new HttpsError("resource-exhausted", RATE_LIMIT_MESSAGES[action], {
      reason: RATE_LIMIT_REASONS[action],
      limit: check.limit,
      resetsAt: new Date(Date.parse(`${check.day}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  return check;
}

/** Counts one action, in the same transaction as the write it allows. */
function chargeQuota(tx, db, uid, check, action) {
  tx.set(refs(db).rateLimit(uid), {
    uid,
    day: check.day,
    counts: chargedCounts(check, action),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

module.exports = {
  readTrustConfig,
  assertMayMakePlans,
  confirmedEmails,
  visibleUnderTrust,
  discoverableUnderTrust,
  trustSummary,
  assertQuota,
  chargeQuota,
  RATE_LIMITS,
  RATE_LIMIT_REASONS,
};
