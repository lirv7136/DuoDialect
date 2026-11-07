const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const {
  meetupsLabel, verifiedBadge, trustNotices, needsEmailConfirmation, resendWaitSeconds, emailCheckCopy, CONTACT_WARNING,
  VERIFIED_EXPLAINER, RESEND_COOLDOWN_MS,
} = load('src/domain/trust.ts');

const trust = (restrictions, verification = {}) => ({
  verified: false,
  verification: { status: 'none', method: null, verifiedAt: null, photoChangedAt: null, ...verification },
  emailConfirmed: false,
  requirements: { verificationToMeet: true, emailConfirmation: true },
  restrictions,
});

test('nothing is shown until a meetup has been confirmed', () => {
  assert.equal(meetupsLabel(0), null);
  assert.equal(meetupsLabel(-2), null);
  assert.equal(meetupsLabel(0.5), null);
  assert.equal(meetupsLabel(undefined), null);
  assert.equal(meetupsLabel(null), null);
  assert.equal(meetupsLabel(NaN), null);
});

test('the label counts meetups, not partners, and never implies verification', () => {
  // Spread first: the module runs in its own vm realm, so strict deepEqual sees a foreign prototype.
  assert.deepEqual({ ...meetupsLabel(1) }, {
    label: 'Met once',
    accessibilityLabel: 'Met language partners once, confirmed by both people each time',
  });
  assert.equal(meetupsLabel(3).label, 'Met 3 times');
  assert.equal(meetupsLabel(3).accessibilityLabel, 'Met language partners 3 times, confirmed by both people each time');
  assert.equal(meetupsLabel(12.9).label, 'Met 12 times');
  for (const n of [1, 3, 40]) assert.doesNotMatch(meetupsLabel(n).accessibilityLabel, /verif/i);
});

test('the Verified badge shows only when the server says exactly true', () => {
  assert.deepEqual({ ...verifiedBadge(true) }, { label: 'Verified', accessibilityLabel: 'Verified by Talkeven' });
  for (const value of [false, undefined, null, 'true', 1]) assert.equal(verifiedBadge(value), null, String(value));
  assert.match(VERIFIED_EXPLAINER, /real/);
});

test('trust notices explain each restriction once, and a photo change says why', () => {
  assert.deepEqual([...trustNotices(null)], []);
  assert.deepEqual([...trustNotices(trust([]))], []);
  assert.deepEqual([...trustNotices(trust(['verification/required-to-meet']))],
    ['Verify your profile to make plans. It’s how members know you’re real.']);
  assert.match(trustNotices(trust(['verification/required-to-meet'], { status: 'pending', photoChangedAt: '2026-11-07T00:00:00.000Z' }))[0],
    /changed your main photo/);
  assert.deepEqual([...trustNotices(trust(['trust/email-unconfirmed']))], ['Confirm your email so other members can find you on Discover.']);
  assert.deepEqual([...trustNotices(trust(['trust/email-unconfirmed']), { email: false })], [], 'the email card covers it');
  assert.deepEqual([...trustNotices(trust(['something/new']))], [], 'an unknown reason is not guessed at');
});

test('only a password account with an unconfirmed email is asked to check its email', () => {
  assert.equal(needsEmailConfirmation({ provider: 'password', emailVerified: false }), true);
  assert.equal(needsEmailConfirmation({ provider: 'password', emailVerified: undefined }), true);
  assert.equal(needsEmailConfirmation({ provider: 'password', emailVerified: true }), false);
  assert.equal(needsEmailConfirmation({ provider: 'apple.com', emailVerified: false }), false, 'Apple counts as confirmed');
});

test('"Send again" waits a minute after the last email, rounded up to whole seconds', () => {
  assert.equal(RESEND_COOLDOWN_MS, 60000);
  assert.equal(resendWaitSeconds(null, 1000), 0);
  assert.equal(resendWaitSeconds(0, 0), 60);
  assert.equal(resendWaitSeconds(0, 59001), 1);
  assert.equal(resendWaitSeconds(0, 60000), 0);
  assert.equal(resendWaitSeconds(0, 120000), 0);
});

test('the email card names the address, and the chat warning is advice, not a refusal', () => {
  assert.deepEqual({ ...emailCheckCopy(' aiko@example.com ') },
    { title: 'Check your email', body: 'We sent a link to aiko@example.com. Tap it to confirm your address.' });
  assert.equal(emailCheckCopy(null).body, 'We sent you a link. Tap it to confirm your address.');
  assert.match(CONTACT_WARNING, /^Careful sharing contact details before you’ve met/);
  for (const text of [CONTACT_WARNING, emailCheckCopy('a@b.co').body]) assert.doesNotMatch(text, /\w-\w+ed\b/, 'no hyphenated compounds');
});
