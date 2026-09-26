const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const exchange = load('src/domain/language-exchange.ts');
const languages = load('src/domain/languages.ts', { './language-exchange': exchange });
const copy = load('src/domain/invite-copy.ts', { './languages': languages });

test('empty Discover names the person’s actual exchange and city', () => {
  assert.equal(copy.emptyDiscoverTitle(['english'], ['japanese'], 'Sydney'), 'No one in Sydney fits English ⇄ Japanese yet.');
  assert.equal(copy.emptyDiscoverTitle(['english'], ['japanese', 'korean'], 'Sydney'), 'No one in Sydney fits English ⇄ Japanese or Korean yet.');
  assert.equal(copy.emptyDiscoverTitle([], ['japanese'], 'Sydney'), 'No one in Sydney fits your exchange yet.');
});

test('the invite message asks for the complementary speaker', () => {
  assert.equal(copy.inviteMessage(['english'], ['japanese'], 'Talkeven', 'https://talkeven.com'),
    'I’m swapping English ⇄ Japanese on Talkeven. Know a Japanese speaker who wants to practise English? https://talkeven.com');
  assert.match(copy.inviteMessage([], [], 'Talkeven', 'https://talkeven.com'), /Know someone who wants a language partner\? https:\/\/talkeven\.com$/);
});
