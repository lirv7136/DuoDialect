const test = require('node:test');
const assert = require('node:assert/strict');
const { newIdempotencyKey, isValidIdempotencyKey, createDraftKeys, MAX_KEY_LENGTH } = require('./load-typescript.cjs')('src/domain/idempotency.ts');

test('keys fit the backend limit and use a safe alphabet', () => {
  for (let i = 0; i < 200; i++) {
    const key = newIdempotencyKey();
    assert.ok(isValidIdempotencyKey(key), key);
    assert.ok(key.length <= MAX_KEY_LENGTH && MAX_KEY_LENGTH === 64);
  }
  assert.equal(new Set(Array.from({ length: 500 }, () => newIdempotencyKey())).size, 500);
  for (const bad of ['', 'x'.repeat(65), 'has space', 'a/b', null, 42]) assert.equal(isValidIdempotencyKey(bad), false);
});

test('a retry or double tap of the same draft reuses the same key', () => {
  const keys = createDraftKeys(Math.random, () => 1000);
  const first = keys.keyFor('{"toUid":"b","venue":"Café"}');
  assert.equal(keys.keyFor('{"toUid":"b","venue":"Café"}'), first);
  assert.equal(keys.keyFor('{"toUid":"b","venue":"Café"}'), first);
});

test('an edited draft gets a new key, and success starts the next draft fresh', () => {
  const keys = createDraftKeys(Math.random, () => 1000);
  const first = keys.keyFor('hello');
  const edited = keys.keyFor('hello there');
  assert.notEqual(edited, first);
  keys.settle();
  // The same text sent again on purpose after a success is a new message.
  assert.notEqual(keys.keyFor('hello there'), edited);
});
