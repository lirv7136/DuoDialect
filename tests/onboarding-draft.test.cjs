const test = require('node:test');
const assert = require('node:assert/strict');
// Modules run in their own vm context, so arrays compare by shape, not by prototype.
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
const load = require('./load-typescript.cjs');
const exchange = load('src/domain/language-exchange.ts');
const schedule = load('src/domain/schedule.ts');
const profileForm = load('src/domain/profile-form.ts', { './language-exchange': exchange, './schedule': schedule, './cities': load('src/domain/cities.ts') });

// Each fixture is a fresh app launch: new module memory over the same (or a new) install storage.
function launch({ uid = 'alice', storage = new Map(), broken = false } = {}) {
  const auth = { currentUser: uid ? { uid } : null };
  const fail = () => { throw new Error('storage unavailable'); };
  const AsyncStorage = {
    getItem: async key => broken ? fail() : storage.get(key) ?? null,
    setItem: async (key, value) => { if (broken) fail(); storage.set(key, value); },
    removeItem: async key => { if (broken) fail(); storage.delete(key); },
  };
  const { onboardingDraft } = load('src/lib/onboarding-draft.ts', {
    '@react-native-async-storage/async-storage': AsyncStorage,
    '../domain/profile-form': profileForm,
    './firebase': { auth },
  });
  return { draft: onboardingDraft, auth, storage };
}

const languages = { speaks: [{ lang: 'English', level: 'fluent' }], learns: [{ lang: 'Japanese', level: 'beginner' }] };

test('a set draft survives a relaunch for the same account', async () => {
  const first = launch();
  await first.draft.set(languages);
  same(first.draft.get(), languages);
  assert.ok(first.storage.has('onboardingDraft.v1.alice'), 'written through under the account key');

  const relaunched = launch({ storage: first.storage });
  assert.equal(relaunched.draft.get(), null, 'memory is empty until load');
  same(await relaunched.draft.load(), languages);
  same(relaunched.draft.get(), languages, 'load fills memory for synchronous reads');
});

test('one account never sees another account’s draft on the same phone', async () => {
  const alice = launch();
  await alice.draft.set(languages);
  const bob = launch({ uid: 'bob', storage: alice.storage });
  assert.equal(await bob.draft.load(), null);
  assert.equal(bob.draft.get(), null);
  // Switching accounts inside one launch drops the memory copy too.
  alice.auth.currentUser = { uid: 'bob' };
  assert.equal(alice.draft.get(), null);
  assert.equal(await alice.draft.load(), null);
});

test('clear forgets the draft in memory and on the install', async () => {
  const app = launch();
  await app.draft.set(languages);
  await app.draft.clear();
  assert.equal(app.draft.get(), null);
  assert.equal(app.storage.size, 0);
  assert.equal(await launch({ storage: app.storage }).draft.load(), null);
});

test('set stays in memory when there is no signed in account, and nothing is written', async () => {
  const app = launch({ uid: null });
  await app.draft.set(languages);
  assert.equal(app.storage.size, 0);
  assert.equal(await app.draft.load(), null);
});

test('a corrupt or empty stored draft reads as nothing; valid languages are kept as a person would write them', async () => {
  const storage = new Map([['onboardingDraft.v1.alice', 'not json']]);
  assert.equal(await launch({ storage }).draft.load(), null);
  storage.set('onboardingDraft.v1.alice', JSON.stringify({ speaks: [], learns: [] }));
  assert.equal(await launch({ storage }).draft.load(), null);
  storage.set('onboardingDraft.v1.alice', JSON.stringify({ speaks: [{ lang: 'english', level: 'fluent' }, { lang: 'x', level: 'bogus' }], learns: 'nope' }));
  same(await launch({ storage }).draft.load(), { speaks: [{ lang: 'English', level: 'fluent' }], learns: [] });
});

test('storage failures never break the in memory flow', async () => {
  const app = launch({ broken: true });
  await app.draft.set(languages);
  same(app.draft.get(), languages);
  same(await app.draft.load(), languages);
  await app.draft.clear();
  assert.equal(app.draft.get(), null);
});

test('set returns a copy, so later edits on the screen do not change the draft', async () => {
  const app = launch();
  const value = { speaks: [{ lang: 'English', level: 'fluent' }], learns: [{ lang: 'Japanese', level: 'beginner' }] };
  await app.draft.set(value);
  value.speaks[0].lang = 'French';
  assert.equal(app.draft.get().speaks[0].lang, 'English');
});
