const test = require('node:test');
const assert = require('node:assert/strict');
// The server's pure trust rules (functions/lib), run directly.
const {
  normalizeTrustConfig, mayMakePlans, emailConfirmedFromToken, emailConfirmedFromUser, faceVerdict, mayBeMainPhoto,
  faceProblemMessage, decideVerification, quotaCheck, chargedCounts, utcDay, toDate, TRUST_REASON,
} = require('../functions/lib/trust-policy.js');
const { RATE_LIMITS, MIN_FACE_CONFIDENCE } = require('../functions/lib/constants.js');

const plain = value => JSON.parse(JSON.stringify(value));

test('every trust flag is off unless config/trust says exactly true', () => {
  const off = { requireVerification: false, requireEmailVerification: false, requireProfilePhoto: false };
  assert.deepEqual(plain(normalizeTrustConfig(null)), off);
  assert.deepEqual(plain(normalizeTrustConfig({})), off);
  assert.deepEqual(plain(normalizeTrustConfig({ requireVerification: 'true', requireEmailVerification: 1, extra: true })), off);
  assert.deepEqual(plain(normalizeTrustConfig({ requireVerification: true, requireProfilePhoto: true })),
    { ...off, requireVerification: true, requireProfilePhoto: true });
});

test('verification is only needed to make plans, and only while the flag is on', () => {
  const off = normalizeTrustConfig({});
  const on = normalizeTrustConfig({ requireVerification: true });
  assert.equal(mayMakePlans({ config: off, verified: false }).allowed, true);
  assert.equal(mayMakePlans({ config: on, verified: true }).allowed, true);
  const refused = mayMakePlans({ config: on, verified: false });
  assert.equal(refused.allowed, false);
  assert.equal(refused.reason, 'verification/required-to-meet');
  assert.equal(TRUST_REASON.verificationRequiredToMeet, 'verification/required-to-meet');
  // Anything but a literal true is unverified.
  assert.equal(mayMakePlans({ config: on, verified: 'yes' }).allowed, false);
  assert.equal(mayMakePlans({ config: null, verified: false }).allowed, true);
});

test('an email counts as confirmed when Firebase says so, and Sign in with Apple always counts', () => {
  assert.equal(emailConfirmedFromToken({ email_verified: true, firebase: { sign_in_provider: 'password' } }), true);
  assert.equal(emailConfirmedFromToken({ email_verified: false, firebase: { sign_in_provider: 'password' } }), false);
  assert.equal(emailConfirmedFromToken({ email_verified: false, firebase: { sign_in_provider: 'apple.com' } }), true);
  assert.equal(emailConfirmedFromToken(null), false);
  assert.equal(emailConfirmedFromUser({ emailVerified: true, providerData: [] }), true);
  assert.equal(emailConfirmedFromUser({ emailVerified: false, providerData: [{ providerId: 'password' }] }), false);
  assert.equal(emailConfirmedFromUser({ emailVerified: false, providerData: [{ providerId: 'apple.com' }] }), true);
  assert.equal(emailConfirmedFromUser(undefined), false);
});

test('a main photo needs exactly one face, detected clearly enough', () => {
  const face = confidence => ({ detectionConfidence: confidence });
  assert.deepEqual(plain(faceVerdict([face(0.97)])), { ok: true, count: 1, confidence: 0.97, problem: null });
  assert.deepEqual(plain(faceVerdict([])), { ok: false, count: 0, confidence: 0, problem: 'no-face' });
  assert.deepEqual(plain(faceVerdict(undefined)), { ok: false, count: 0, confidence: 0, problem: 'no-face' });
  assert.equal(faceVerdict([face(0.99), face(0.95)]).problem, 'many-faces');
  assert.equal(faceVerdict([face(0.2)]).problem, 'unclear-face');
  assert.equal(faceVerdict([face(MIN_FACE_CONFIDENCE)]).ok, true, 'the threshold itself passes');
  assert.equal(faceVerdict([{}]).problem, 'unclear-face', 'a face with no confidence is unclear');
  assert.equal(faceVerdict([null, face(0.9)]).ok, true, 'junk entries are ignored');
});

test('a photo screened before face checks may still be the main photo', () => {
  assert.equal(mayBeMainPhoto({ status: 'approved' }), true);
  assert.equal(mayBeMainPhoto({ status: 'approved', face: { ok: true } }), true);
  assert.equal(mayBeMainPhoto({ status: 'approved', face: { ok: false, problem: 'no-face' } }), false);
  assert.equal(mayBeMainPhoto(undefined), true);
  for (const problem of ['no-face', 'many-faces', 'unclear-face', 'anything']) assert.match(faceProblemMessage(problem), /main photo/);
});

test('phase 2: what one selfie check means for a member', () => {
  const decide = (result, declaredAge = 30) => plain(decideVerification({ result, declaredAge }));
  assert.deepEqual(decide({ outcome: 'pending' }), { status: 'pending', ageReview: null, countsAsAttempt: false });
  assert.deepEqual(decide({ outcome: 'fail' }), { status: 'failed', ageReview: null, countsAsAttempt: true });
  assert.deepEqual(decide({ outcome: 'inconclusive' }), { status: 'review', ageReview: null, countsAsAttempt: true });
  assert.deepEqual(decide({ outcome: 'pass' }), { status: 'verified', ageReview: false, countsAsAttempt: true });
  assert.equal(decide({ outcome: 'pass', liveness: false }).status, 'failed');
  assert.equal(decide({ outcome: 'pass', faceMatch: false }).status, 'failed');
  assert.equal(decide({ outcome: 'surprise' }).status, 'failed', 'an unknown outcome never verifies');
  // Under 18 by estimate is never verified automatically.
  assert.deepEqual(decide({ outcome: 'pass', ageEstimate: 16 }), { status: 'review', ageReview: true, countsAsAttempt: true });
  // Far from the declared age: verified, with the birth date flagged for a look.
  assert.deepEqual(decide({ outcome: 'pass', ageEstimate: 45 }, 25), { status: 'verified', ageReview: true, countsAsAttempt: true });
  assert.deepEqual(decide({ outcome: 'pass', ageEstimate: 31 }, 25), { status: 'verified', ageReview: false, countsAsAttempt: true });
  assert.equal(decide({ outcome: 'pass', ageEstimate: 40 }, null).ageReview, false, 'no declared age, no gap');
});

test('daily limits count per UTC day and reset when the day changes', () => {
  const now = new Date('2026-11-07T23:30:00Z');
  assert.equal(utcDay(now), '2026-11-07');
  const fresh = quotaCheck(null, 'sendMessage', now);
  assert.deepEqual(plain(fresh), { allowed: true, used: 0, limit: RATE_LIMITS.sendMessage, day: '2026-11-07', counts: {} });

  const busy = { day: '2026-11-07', counts: { createInvitation: RATE_LIMITS.createInvitation, sendMessage: 4 } };
  assert.equal(quotaCheck(busy, 'createInvitation', now).allowed, false);
  const messages = quotaCheck(busy, 'sendMessage', now);
  assert.equal(messages.allowed, true);
  assert.deepEqual(plain(chargedCounts(messages, 'sendMessage')), { createInvitation: RATE_LIMITS.createInvitation, sendMessage: 5 });

  // Yesterday's counts are forgotten, all of them.
  const yesterday = { day: '2026-11-06', counts: { createInvitation: 999, reportUser: 999 } };
  const today = quotaCheck(yesterday, 'createInvitation', now);
  assert.equal(today.allowed, true);
  assert.deepEqual(plain(chargedCounts(today, 'createInvitation')), { createInvitation: 1 });
  assert.equal(quotaCheck({ day: '2026-11-07', counts: { reportUser: 'junk' } }, 'reportUser', now).used, 0);
  assert.throws(() => quotaCheck(null, 'somethingElse', now), /No rate limit/);
});

test('the default limits are generous for a person and small for a flood', () => {
  assert.deepEqual(plain(RATE_LIMITS), { createInvitation: 20, sendMessage: 300, reportUser: 10 });
});

test('dates come from Timestamps, Dates, strings and numbers alike', () => {
  const when = new Date('2026-11-07T00:00:00Z');
  assert.equal(toDate({ toDate: () => when }).getTime(), when.getTime());
  assert.equal(toDate(when.toISOString()).getTime(), when.getTime());
  assert.equal(toDate(when.getTime()).getTime(), when.getTime());
  assert.equal(toDate('not a date'), null);
  assert.equal(toDate(null), null);
});
