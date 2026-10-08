const test = require('node:test');
const assert = require('node:assert/strict');
// Modules run in their own vm context, so arrays compare by shape, not by prototype.
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const c = load('src/domain/onboarding-copy.ts');

const complete = { hasPhoto: true, availability: ['Thursday evening'] };
const bare = { hasPhoto: false, availability: [] };

test('a complete profile is never nudged', () => {
  same(c.nudgesFor(complete, new Set()), []);
  assert.equal(c.nudgeMessage([]), null);
});

test('empty fields are nudged, times first, each only once', () => {
  const nudged = new Set();
  const first = c.nudgesFor(bare, nudged);
  same(first, ['availability', 'photo']);
  first.forEach(field => nudged.add(field));
  same(c.nudgesFor(bare, nudged), [], 'the second tap goes straight through');
  same(c.nudgesFor({ hasPhoto: false, availability: ['Saturday morning'] }, new Set()), ['photo']);
  same(c.nudgesFor({ hasPhoto: true, availability: [] }, new Set(['photo'])), ['availability']);
});

test('the copy says why each field matters and offers a way through', () => {
  assert.equal(c.nudgeMessage(['availability']), 'Partners pick times from your free slots. Add one or two so people can suggest a meetup.');
  assert.equal(c.nudgeMessage(['photo']), 'A photo helps your partner find you at the café.');
  assert.equal(c.nudgeMessage(['availability', 'photo']), `${c.NUDGE_COPY.availability} ${c.NUDGE_COPY.photo}`);
  assert.equal(c.SAVE_ANYWAY_LABEL, 'Save anyway');
  for (const text of [...Object.values(c.NUDGE_COPY), c.SAVE_ANYWAY_LABEL]) assert.doesNotMatch(text, /\w-\w/, 'no hyphenated compounds');
});

test('the onboarding screen nudges through the shared copy and keeps a save anyway path', () => {
  const screen = fs.readFileSync(path.resolve(__dirname, '..', 'app/(onboarding)/profile.tsx'), 'utf8');
  assert.match(screen, /nudgesFor\(/);
  assert.match(screen, /SAVE_ANYWAY_LABEL/);
  assert.doesNotMatch(screen, /Alert\.alert/, 'the nudge is inline, not a modal');
});
