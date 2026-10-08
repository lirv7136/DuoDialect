const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const { deviceIdFromToken, parseRegistration, staleRegistration } = load('src/domain/push-device.ts');
// The loader runs modules in another context, so compare structure rather than prototypes.
const same = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));

test('a device id is a stable hash of the token, never the token itself', () => {
  const token = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
  const id = deviceIdFromToken(token);
  assert.match(id, /^d_[0-9a-f]{16}$/);
  assert.equal(deviceIdFromToken(token), id);
  assert.notEqual(deviceIdFromToken('ExponentPushToken[yyyyyyyyyyyyyyyyyyyyyy]'), id);
  assert.notEqual(deviceIdFromToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxY]'), id, 'one character apart still differs');
  assert.ok(!id.includes('xxxx'));
});

test('a stored registration is read back, and anything malformed counts as none', () => {
  const stored = { uid: 'alice', deviceId: 'd_1', token: 'ExponentPushToken[a]' };
  same(parseRegistration(JSON.stringify(stored)), stored);
  for (const raw of [null, undefined, '', 'not json', '42', '{}', JSON.stringify({ uid: 'alice' }), JSON.stringify({ uid: '', deviceId: 'd', token: 't' })]) {
    assert.equal(parseRegistration(raw), null, `raw=${String(raw)}`);
  }
});

test('a registration is stale when it belongs to a different account than the one signed in', () => {
  const alice = { uid: 'alice', deviceId: 'd_1', token: 'ExponentPushToken[a]' };
  assert.equal(staleRegistration(null, 'alice'), null);
  assert.equal(staleRegistration(alice, 'alice'), null, 'the same account simply re-registers');
  assert.equal(staleRegistration(alice, 'bob'), alice, 'another account must revoke it first');
  assert.equal(staleRegistration(alice, null), alice, 'with nobody signed in it is still outstanding');
});
