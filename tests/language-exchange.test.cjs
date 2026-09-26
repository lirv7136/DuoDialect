const test = require('node:test');
const assert = require('node:assert/strict');
const { isReciprocalExchange, exchangeLanguages, profileDestination } = require('./load-typescript.cjs')('src/domain/language-exchange.ts');
const english = { lang: 'English', level: 'fluent' }, japanese = { lang: 'Japanese', level: 'native' };
const me = { name: 'Alex', speaks: [english], learns: [{ ...japanese, level: 'beginner' }] };
const other = { name: 'Aiko', speaks: [japanese], learns: [{ ...english, level: 'intermediate' }] };

test('native app requires useful languages in both directions', () => {
  assert.equal(isReciprocalExchange(me, other), true);
  assert.equal(isReciprocalExchange(me, { ...other, learns: [{ lang: 'French', level: 'beginner' }] }), false);
  assert.equal(isReciprocalExchange(me, { ...other, speaks: [{ lang: 'Spanish', level: 'fluent' }] }), false);
});
test('native or fluent speakers qualify; beginners and intermediates cannot be offered as fluent', () => {
  for (const level of ['native', 'fluent']) assert.equal(isReciprocalExchange(me, { ...other, speaks: [{ ...japanese, level }] }), true);
  for (const level of ['beginner', 'intermediate', 'unknown']) {
    assert.equal(isReciprocalExchange(me, { ...other, speaks: [{ ...japanese, level }] }), false);
    assert.equal(isReciprocalExchange({ ...me, speaks: [{ ...english, level }] }, other), false);
  }
});
test('normalization, duplicates and malformed old profile data are handled', () => {
  const result = exchangeLanguages(me, { ...other, speaks: [{ lang: ' JAPANESE ', level: 'fluent' }, japanese] });
  assert.equal(JSON.stringify(result), JSON.stringify({ iCanHelpWith: ['english'], theyCanHelpWith: ['japanese'] }));
  for (const speaks of [null, 'Japanese', [null], [{}], [{ lang: 1, level: 'fluent' }], [{ lang: '', level: 'fluent' }]]) {
    assert.equal(isReciprocalExchange(me, { ...other, speaks }), false);
  }
});
test('new and incomplete accounts go through onboarding before discovering people', () => {
  assert.equal(profileDestination(null), '/(onboarding)/languages?next=profile');
  assert.equal(profileDestination({ name: 'Alex', speaks: [], learns: [] }), '/(onboarding)/languages?next=profile');
  assert.equal(profileDestination({ ...me, speaks: [{ ...english, level: 'beginner' }] }), '/(onboarding)/languages?next=profile');
  assert.equal(profileDestination({ ...me, name: ' ' }), '/(onboarding)/profile');
  assert.equal(profileDestination(me), '/(tabs)/discover');
});
test('server profiles carry displayName rather than name', () => {
  const server = { displayName: 'Alex', speaks: me.speaks, learns: me.learns };
  assert.equal(profileDestination(server), '/(tabs)/discover');
  assert.equal(profileDestination({ ...server, displayName: '  ' }), '/(onboarding)/profile');
});
