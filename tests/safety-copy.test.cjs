const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const c = require('./load-typescript.cjs')('src/domain/safety-copy.ts');

test('the block confirmation says what blocking does, including that invitations are cancelled', () => {
  assert.match(c.BLOCK_CONFIRM_BODY, /find, invite or message each other/);
  assert.match(c.BLOCK_CONFIRM_BODY, /Open invitations are cancelled, even if you unblock later/);
  assert.match(c.BLOCK_CONFIRM_BODY, /Unblock anytime in Profile/);
  assert.equal(c.blockTitle('Aiko'), 'Block Aiko?');
  assert.equal(c.blockTitle(''), 'Block this member?');
});

test('Person, Chat and Report all confirm a block through the one shared helper', () => {
  for (const screen of ['app/person/[uid].tsx', 'app/chat/[chatId].tsx', 'app/report/[uid].tsx']) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', screen), 'utf8');
    assert.match(source, /confirmBlock\(/, screen);
    assert.doesNotMatch(source, /Alert\.alert\(`Block/, `${screen} must not carry its own block wording`);
  }
});

test('safety tips keep all four habits, and the emergency number', () => {
  assert.equal(c.SAFETY_TIPS.length, 4);
  assert.match(c.SAFETY_TIPS.map(t => t.text).join(' '), /public.*friend.*Leave anytime.*address or money/);
  assert.match(c.EMERGENCY_LINE, /000/);
});
