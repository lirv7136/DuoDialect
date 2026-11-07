const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const schedule = load('src/domain/schedule.ts');
const { firstName, hoursAfter, planShareMessage, CHECK_BACK_HOURS } = load('src/domain/share-plan.ts', { './schedule': schedule });

const plan = (patch = {}) => ({
  partnerName: 'Aiko Tanaka', localDate: '2026-10-15', localTime: '18:30', recurrence: 'once', venue: 'A café in Glebe', ...patch,
});

test('only the first name of the partner is shared', () => {
  assert.equal(firstName('Aiko Tanaka'), 'Aiko');
  assert.equal(firstName('  Aiko  '), 'Aiko');
  assert.equal(firstName('Aiko'), 'Aiko');
  assert.equal(firstName(''), '');
});

test('the check back time is two hours after the start and wraps past midnight', () => {
  assert.equal(CHECK_BACK_HOURS, 2);
  assert.equal(hoursAfter('18:30', 2), '20:30');
  assert.equal(hoursAfter('23:30', 2), '01:30');
  assert.equal(hoursAfter('09:05', 2), '11:05');
  assert.equal(hoursAfter('not a time', 2), 'not a time');
});

test('the message carries who, when, where and when to call, one per line', () => {
  assert.equal(planShareMessage(plan(), 'Talkeven'), [
    'I’m meeting a language exchange partner from Talkeven.',
    'Who: Aiko',
    'When: Thu 15 Oct at 18:30',
    'Where: A café in Glebe',
    'If you don’t hear from me by 20:30, give me a call.',
  ].join('\n'));
});

test('weekly plans and a foreign time zone are spelled out', () => {
  const message = planShareMessage(plan({ recurrence: 'weekly', timeZone: 'Australia/Sydney' }), 'Talkeven');
  assert.match(message, /When: Thu 15 Oct at 18:30 \(Australia\/Sydney time\), then weekly/);
});

test('the message never leaks a surname or anything beyond the plan', () => {
  const message = planShareMessage(plan({ partnerName: 'Aiko Tanaka', venue: '  Glebe Library ' }), 'Talkeven');
  assert.doesNotMatch(message, /Tanaka/);
  assert.match(message, /Where: Glebe Library\n/);
  assert.match(planShareMessage(plan({ partnerName: '' }), 'Talkeven'), /Who: a partner/);
});
