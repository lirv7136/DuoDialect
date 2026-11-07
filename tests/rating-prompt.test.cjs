const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const rating = load('src/domain/rating.ts');

const now = new Date('2026-10-08T09:00:00Z');
const daysAgo = days => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const yesYes = { happened: 'yes', meetAgain: 'yes' };

// Each fixture is a fresh app launch over the same (or a new) install storage, with a store
// that can be told whether review is possible and whether it fails.
function launch({ storage = new Map(), broken = false, available = true, hasAction = true, storeFails = false } = {}) {
  const fail = () => { throw new Error('storage unavailable'); };
  const AsyncStorage = {
    getItem: async key => broken ? fail() : storage.get(key) ?? null,
    setItem: async (key, value) => { if (broken) fail(); storage.set(key, value); },
  };
  const calls = { requestReview: 0 };
  const StoreReview = {
    hasAction: async () => hasAction,
    isAvailableAsync: async () => available,
    requestReview: async () => { calls.requestReview += 1; if (storeFails) throw new Error('store said no'); },
  };
  const { maybeAskForRating } = load('src/lib/rating.ts', {
    '@react-native-async-storage/async-storage': AsyncStorage,
    'expo-store-review': StoreReview,
    '../domain/rating': rating,
  });
  return { ask: input => maybeAskForRating({ meetupsConfirmed: 1, answer: yesYes, now, ...input }), calls, storage };
}

const recorded = storage => JSON.parse(storage.get('rating.asked.v1') ?? '[]');

test('the first confirmed meetup asks once and remembers it on this install', async () => {
  const first = launch();
  assert.equal(await first.ask(), true);
  assert.equal(first.calls.requestReview, 1);
  assert.deepEqual(recorded(first.storage), [now.toISOString()]);

  // Same install, next launch, another good meetup a week later: too soon.
  const second = launch({ storage: first.storage });
  assert.equal(await second.ask({ now: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) }), false);
  assert.equal(second.calls.requestReview, 0);
});

test('a poor answer or no confirmed meetup never reaches the store', async () => {
  const app = launch();
  assert.equal(await app.ask({ answer: { happened: 'yes', meetAgain: 'no' } }), false);
  assert.equal(await app.ask({ meetupsConfirmed: 0 }), false);
  assert.equal(app.calls.requestReview, 0);
  assert.equal(app.storage.has('rating.asked.v1'), false);
});

test('three asks in a year is the limit, and old asks fall out of the record', async () => {
  const storage = new Map([['rating.asked.v1', JSON.stringify([daysAgo(400), daysAgo(300), daysAgo(200), daysAgo(100)].map(d => d.toISOString()))]]);
  const full = launch({ storage });
  assert.equal(await full.ask(), false);

  const lighter = new Map([['rating.asked.v1', JSON.stringify([daysAgo(400), daysAgo(200), daysAgo(100)].map(d => d.toISOString()))]]);
  const app = launch({ storage: lighter });
  assert.equal(await app.ask(), true);
  assert.deepEqual(recorded(lighter), [daysAgo(200), daysAgo(100), now].map(d => d.toISOString()));
});

test('an unavailable store, such as TestFlight or web, means no ask and nothing recorded', async () => {
  const noAction = launch({ hasAction: false });
  assert.equal(await noAction.ask(), false);
  const testFlight = launch({ available: false });
  assert.equal(await testFlight.ask(), false);
  assert.equal(noAction.calls.requestReview + testFlight.calls.requestReview, 0);
  assert.equal(noAction.storage.has('rating.asked.v1'), false);
});

test('a broken storage or a failing store never throws', async () => {
  const broken = launch({ broken: true });
  assert.equal(await broken.ask(), false);
  assert.equal(broken.calls.requestReview, 0);

  const failing = launch({ storeFails: true });
  assert.equal(await failing.ask(), false);
  // The ask still counts: the sheet may well have shown before the failure surfaced.
  assert.deepEqual(recorded(failing.storage), [now.toISOString()]);
});

test('a corrupt record is treated as no history', async () => {
  const app = launch({ storage: new Map([['rating.asked.v1', '{"nope":1}']]) });
  assert.equal(await app.ask(), true);
  assert.deepEqual(recorded(app.storage), [now.toISOString()]);
});
