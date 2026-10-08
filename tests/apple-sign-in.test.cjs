const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const {
  NONCE_BYTES, nonceFromBytes, isAppleCancelled, signInProviderFrom, showAppleButton, givenNameFrom,
} = load('src/domain/apple-sign-in.ts');

test('a nonce is lowercase hex, two characters per byte, with zero padding kept', () => {
  assert.equal(nonceFromBytes(new Uint8Array([0, 1, 15, 16, 255])), '00010f10ff');
  const bytes = new Uint8Array(NONCE_BYTES).map((_, i) => i * 7 % 256);
  const nonce = nonceFromBytes(bytes);
  assert.equal(nonce.length, NONCE_BYTES * 2);
  assert.match(nonce, /^[0-9a-f]+$/);
  assert.ok(NONCE_BYTES >= 16, 'at least 128 bits of entropy');
});

test('only the Apple sheet dismissal code counts as a cancel', () => {
  assert.equal(isAppleCancelled({ code: 'ERR_REQUEST_CANCELED' }), true);
  assert.equal(isAppleCancelled({ code: 'ERR_REQUEST_FAILED' }), false);
  assert.equal(isAppleCancelled(new Error('ERR_REQUEST_CANCELED')), false);
  assert.equal(isAppleCancelled(null), false);
  assert.equal(isAppleCancelled(undefined), false);
});

test('the provider is Apple whenever apple.com is linked, else password', () => {
  assert.equal(signInProviderFrom([{ providerId: 'password' }]), 'password');
  assert.equal(signInProviderFrom([{ providerId: 'apple.com' }]), 'apple.com');
  assert.equal(signInProviderFrom([{ providerId: 'password' }, { providerId: 'apple.com' }]), 'apple.com');
  assert.equal(signInProviderFrom([]), 'password');
  assert.equal(signInProviderFrom(null), 'password');
  assert.equal(signInProviderFrom(undefined), 'password');
});

test('the Apple button shows on iOS when the native sheet is available, nowhere else', () => {
  assert.equal(showAppleButton({ platform: 'ios', available: true }), true);
  assert.equal(showAppleButton({ platform: 'ios', available: false }), false);
  assert.equal(showAppleButton({ platform: 'android', available: true }), false);
  assert.equal(showAppleButton({ platform: 'web', available: true }), false);
});

test('the given name is trimmed and anything empty is null', () => {
  assert.equal(givenNameFrom({ givenName: '  Aiko ' }), 'Aiko');
  assert.equal(givenNameFrom({ givenName: '   ' }), null);
  assert.equal(givenNameFrom({ givenName: null, familyName: 'Tanaka' }), null);
  assert.equal(givenNameFrom(null), null);
  assert.equal(givenNameFrom(undefined), null);
});
