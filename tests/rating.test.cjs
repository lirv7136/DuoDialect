const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const { shouldAskForRating, summariseAsks, isGoodMeetup } = load('src/domain/rating.ts');

const now = new Date('2026-10-08T09:00:00Z');
const daysAgo = days => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const yesYes = { happened: 'yes', meetAgain: 'yes' };
const moment = overrides => ({ meetupsConfirmed: 1, answer: yesYes, askedCount: 0, lastAskedAt: null, now, ...overrides });

test('only a meetup that happened and that they want to repeat is a good moment', () => {
  assert.equal(isGoodMeetup(yesYes), true);
  assert.equal(isGoodMeetup({ happened: 'yes', meetAgain: 'no' }), false);
  assert.equal(isGoodMeetup({ happened: 'yes', meetAgain: null }), false);
  assert.equal(isGoodMeetup({ happened: 'no', meetAgain: null }), false);
});

test('the first confirmed meetup after a yes and yes answer asks', () => {
  assert.equal(shouldAskForRating(moment()), true);
  assert.equal(shouldAskForRating(moment({ meetupsConfirmed: 4 })), true);
});

test('any other answer never asks', () => {
  assert.equal(shouldAskForRating(moment({ answer: { happened: 'yes', meetAgain: 'no' } })), false);
  assert.equal(shouldAskForRating(moment({ answer: { happened: 'yes', meetAgain: null } })), false);
  assert.equal(shouldAskForRating(moment({ answer: { happened: 'no', meetAgain: null } })), false);
});

test('no confirmed meetup yet means no ask, including older profiles without the field', () => {
  assert.equal(shouldAskForRating(moment({ meetupsConfirmed: 0 })), false);
  assert.equal(shouldAskForRating(moment({ meetupsConfirmed: undefined })), false);
  assert.equal(shouldAskForRating(moment({ meetupsConfirmed: null })), false);
});

test('at most three asks in a year', () => {
  assert.equal(shouldAskForRating(moment({ askedCount: 2, lastAskedAt: daysAgo(100) })), true);
  assert.equal(shouldAskForRating(moment({ askedCount: 3, lastAskedAt: daysAgo(100) })), false);
});

test('never within sixty days of the last ask', () => {
  assert.equal(shouldAskForRating(moment({ askedCount: 1, lastAskedAt: daysAgo(59) })), false);
  assert.equal(shouldAskForRating(moment({ askedCount: 1, lastAskedAt: daysAgo(60) })), true);
  assert.equal(shouldAskForRating(moment({ askedCount: 1, lastAskedAt: daysAgo(1) })), false);
});

test('the history summary counts the last year only and keeps the latest ask', () => {
  const empty = summariseAsks([], now);
  assert.equal(empty.askedCount, 0);
  assert.equal(empty.lastAskedAt, null);

  const summary = summariseAsks([daysAgo(400), daysAgo(200), daysAgo(10), daysAgo(80)], now);
  assert.equal(summary.askedCount, 3);
  assert.equal(summary.lastAskedAt.toISOString(), daysAgo(10).toISOString());

  // Exactly a year old falls out of the window.
  assert.equal(summariseAsks([daysAgo(365)], now).askedCount, 0);
  assert.equal(summariseAsks([daysAgo(364)], now).askedCount, 1);
});
