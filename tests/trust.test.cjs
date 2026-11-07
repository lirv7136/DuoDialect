const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const { meetupsLabel } = load('src/domain/trust.ts');

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
