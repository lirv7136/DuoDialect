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

test('the empty state counts who wants your language', () => {
  assert.equal(copy.learningYourLanguageLine(0, ['english']), '');
  assert.equal(copy.learningYourLanguageLine(1, ['english']), '1 person here is learning English.');
  assert.equal(copy.learningYourLanguageLine(3, ['english', 'spanish']), '3 people here are learning English or Spanish.');
});

test('a near miss is explained from my side without blame', () => {
  const me = { offers: ['english'], seeks: ['japanese'] };
  assert.equal(copy.nearMissReason('language/insufficient-fluency', me, { offers: [], seeks: ['english'] }),
    'You share a pair, but one of you isn’t fluent enough to teach it yet.');
  assert.equal(copy.nearMissReason('language/not-reciprocal', me, { offers: ['korean'], seeks: ['english'] }),
    'Wants English, but doesn’t speak Japanese.');
  assert.equal(copy.nearMissReason('language/not-reciprocal', me, { offers: ['japanese'], seeks: ['french'] }),
    'Speaks Japanese, but isn’t learning English.');
  assert.equal(copy.nearMissReason('language/not-reciprocal', me, { offers: ['korean'], seeks: ['french'] }), 'Not a two way match yet.');
});
