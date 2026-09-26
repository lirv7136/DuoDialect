const test = require('node:test');
const assert = require('node:assert/strict');
const { toCallableFailure, describeFailure, errorMessage, isRetryable } = require('./load-typescript.cjs')('src/domain/errors.ts');

const callableError = (code, reason, message = 'server text') => Object.assign(new Error(message), { code: `functions/${code}`, details: reason ? { reason } : undefined });

test('callable errors are normalised: functions/ prefix stripped, details.reason kept', () => {
  const failure = toCallableFailure(callableError('already-exists', 'invitation/duplicate-active'));
  assert.equal(failure.code, 'already-exists');
  assert.equal(failure.reason, 'invitation/duplicate-active');
  const bare = toCallableFailure(null);
  assert.equal(bare.code, 'unknown'); assert.equal(bare.reason, null);
});

test('messages branch on details.reason, not on server message text', () => {
  const duplicate = errorMessage(callableError('already-exists', 'invitation/duplicate-active', 'anything at all'));
  assert.match(duplicate, /already have an open invitation/);
  assert.match(errorMessage(callableError('permission-denied', 'account/suspended')), /suspended.*delete/i);
  assert.match(errorMessage(callableError('failed-precondition', 'profile/incomplete')), /Finish your profile/);
  // The block reason must not reveal direction or that a block exists.
  assert.equal(errorMessage(callableError('permission-denied', 'target/unavailable')), 'This person isn’t available.');
});

test('every contract reason used by v1 flows has specific copy', () => {
  const reasons = ['account/not-adult', 'account/suspended', 'profile/incomplete', 'profile/not-found', 'target/self',
    'target/unavailable', 'language/not-reciprocal', 'language/insufficient-fluency', 'language/not-offered',
    'language/offered-and-sought', 'invitation/duplicate-active', 'invitation/not-pending', 'invitation/not-recipient',
    'invitation/not-sender', 'invitation/not-found', 'conversation/not-found', 'conversation/not-member', 'deletion/not-confirmed',
    'photo/not-found', 'photo/not-screened'];
  const generic = describeFailure({ code: 'failed-precondition', reason: null, message: '' });
  for (const reason of reasons) {
    const text = describeFailure({ code: 'failed-precondition', reason, message: '' });
    assert.notEqual(text, generic, reason);
    assert.doesNotMatch(text, /dating/i, reason);
  }
});

test('dating reasons never surface dating copy in the v1 client', () => {
  for (const reason of ['dating/not-enabled', 'dating/preferences-mismatch', 'dating/not-adult', 'dating/age-range', 'dating/new-one']) {
    assert.doesNotMatch(describeFailure({ code: 'failed-precondition', reason, message: 'dating is off' }), /dating/i);
  }
});

test('validation failures show the server message; unknown codes fall back safely', () => {
  assert.equal(describeFailure({ code: 'invalid-argument', reason: null, message: 'The meeting time must be in the future.' }), 'The meeting time must be in the future.');
  assert.match(describeFailure({ code: 'internal', reason: null, message: 'stack trace' }), /Something went wrong/);
  assert.match(describeFailure({ code: 'unavailable', reason: null, message: '' }), /connection/);
  assert.match(describeFailure({ code: 'weird', reason: null, message: 'x' }), /Something went wrong/);
  assert.match(describeFailure({ code: 'auth/wrong-password', reason: null, message: '' }), /password/);
});

test('only transport and server faults are offered as retryable', () => {
  assert.equal(isRetryable({ code: 'unavailable', reason: null, message: '' }), true);
  assert.equal(isRetryable({ code: 'deadline-exceeded', reason: null, message: '' }), true);
  assert.equal(isRetryable({ code: 'already-exists', reason: 'invitation/duplicate-active', message: '' }), false);
  assert.equal(isRetryable({ code: 'invalid-argument', reason: null, message: '' }), false);
});

test('Firebase Auth codes map to friendly sign in and sign up copy', () => {
  const { authErrorMessage } = require('./load-typescript.cjs')('src/domain/errors.ts');
  const authError = code => Object.assign(new Error(`Firebase: Error (${code}).`), { code });
  assert.equal(authErrorMessage(authError('auth/invalid-credential')),
    'That email and password don’t match. Try again or reset your password.');
  assert.match(authErrorMessage(authError('auth/weak-password')), /at least 6 characters/);
  assert.match(authErrorMessage(authError('auth/email-already-in-use')), /already uses that email/);
  assert.match(authErrorMessage(authError('auth/invalid-email')), /doesn’t look like an email/);
  assert.match(authErrorMessage(authError('auth/too-many-requests')), /Too many attempts/);
  assert.match(authErrorMessage(authError('auth/network-request-failed')), /connection/);
  // Unknown codes never leak Firebase's raw message.
  const unknown = authErrorMessage(authError('auth/something-new'));
  assert.doesNotMatch(unknown, /Firebase/);
  assert.equal(unknown, 'Something went wrong. Please try again.');
});
