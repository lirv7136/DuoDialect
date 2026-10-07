const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const { openCheckIns, canAnswer, thanksFor, nextWeek } = load('src/domain/check-in.ts');

const now = new Date('2026-10-01T00:00:00Z');
const at = iso => new Date(iso);
const item = (id, status, dueAt, expiresAt) => ({ id, status, dueAt: at(dueAt), expiresAt: expiresAt ? at(expiresAt) : null });

test('only open check-ins inside their window show, newest first', () => {
  const items = [
    item('old', 'open', '2026-09-20T00:00:00Z', '2026-09-27T00:00:00Z'),
    item('answered', 'answered', '2026-09-29T00:00:00Z', '2026-10-06T00:00:00Z'),
    item('a', 'open', '2026-09-28T00:00:00Z', '2026-10-05T00:00:00Z'),
    item('b', 'open', '2026-09-30T00:00:00Z', '2026-10-07T00:00:00Z'),
    item('no-expiry', 'open', '2026-09-30T00:00:00Z', null),
  ];
  assert.deepEqual(openCheckIns(items, now).map(i => i.id), ['b', 'a']);
});

test('a check-in can be answered until it expires', () => {
  assert.equal(canAnswer({ expiresAt: at('2026-10-01T00:00:01Z') }, now), true);
  assert.equal(canAnswer({ expiresAt: at('2026-10-01T00:00:00Z') }, now), false);
  assert.equal(canAnswer({ expiresAt: null }, now), false);
});

test('the thank you never scores anyone', () => {
  assert.equal(thanksFor({ happened: 'no', meetAgain: null }, 'Aiko'), 'Thanks for letting us know. Plans fall through sometimes.');
  assert.equal(thanksFor({ happened: 'yes', meetAgain: 'yes' }, 'Aiko'), 'Nice one. Keep the swap going with Aiko.');
  assert.equal(thanksFor({ happened: 'yes', meetAgain: 'no' }, 'Aiko'), "Thanks. We won't ask about this plan again.");
  assert.equal(thanksFor({ happened: 'yes', meetAgain: null }, 'Aiko'), 'Thanks for checking in.');
});

test('next week is the same date seven days on, across month and year ends', () => {
  assert.equal(nextWeek('2026-10-10'), '2026-10-17');
  assert.equal(nextWeek('2026-10-28'), '2026-11-04');
  assert.equal(nextWeek('2026-12-30'), '2027-01-06');
});
