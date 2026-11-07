import test from 'node:test';
import assert from 'node:assert/strict';
import { PEOPLE, GROUPS } from '../data.js';
import { initialState, validateProfile, reciprocal, mutualDating, matches, eligibleGroups, nextDate, defaultDate, createPlan, parseState, validatePlan } from '../core.js';

test('matches need reciprocal languages, fluent help and shared availability', () => {
  const me = initialState().profile;
  assert.deepEqual(matches(me).map(p => p.id).sort(), ['aiko', 'hana', 'ren', 'sora']);
  assert.equal(matches(me)[0].id, 'aiko', 'A nearby match with more shared time ranks first');
  assert.equal(reciprocal(me, { ...PEOPLE[0], fluent: false }), false);
  assert.equal(reciprocal(me, { ...PEOPLE[0], learns: 'French' }), false);
  assert.equal(matches({ ...me, availability: ['Wednesday evening'] }).length, 0);
  assert.equal(matches({ ...me, speaks: 'Japanese', learns: 'English' }).length, 0);
  assert.deepEqual(matches(me, 'partner', { area: 'Newtown' }).map(p => p.id), ['ren']);
  assert.deepEqual(matches(me, 'partner', { slot: 'Saturday morning' }).map(p => p.id), ['aiko', 'hana']);
  assert.ok(!matches(me, 'partner', {}, ['aiko']).some(p => p.id === 'aiko'));
});
test('dating is default off and requires mutual consent, age and gender preferences', () => {
  const me = initialState().profile, aiko = PEOPLE[0];
  assert.equal(matches(me, 'date').length, 0);
  me.dating = true;
  assert.deepEqual(matches(me, 'date').map(p => p.id), ['aiko', 'hana', 'sora']);
  assert.equal(mutualDating(me, { ...aiko, dating: false }), false);
  assert.equal(mutualDating(me, { ...aiko, adult: false }), false);
  assert.equal(mutualDating({ ...me, age: 17 }, aiko), false);
  assert.equal(mutualDating(me, { ...aiko, age: 17 }), false);
  assert.equal(mutualDating(me, { ...aiko, ageMin: 28 }), false);
  assert.equal(mutualDating(me, { ...aiko, ageMax: 26 }), false);
  assert.equal(mutualDating(me, { ...aiko, datingGenders: ['Man'] }), false);
  assert.equal(mutualDating({ ...me, datingGenders: ['Man'] }, aiko), false);
  assert.equal(mutualDating({ ...me, ageMin: 26, ageMax: 26 }, aiko), true);
  assert.equal(mutualDating({ ...me, ageMin: 27 }, aiko), false);
  assert.equal(matches({ ...me, dating: false }).length, 4, 'Regular partners are independent of dating consent');
});
test('profile validation covers adult boundaries, reciprocal languages and preferences', () => {
  const p = initialState().profile;
  for (const age of [18, 100]) assert.equal(validateProfile({ ...p, age }).age, age);
  for (const age of [17, 101, NaN, 18.5]) assert.throws(() => validateProfile({ ...p, age }), /adults/);
  assert.throws(() => validateProfile({ ...p, adult: false }), /adults/);
  assert.throws(() => validateProfile({ ...p, learns: 'English' }), /different/);
  assert.throws(() => validateProfile({ ...p, availability: [] }), /time/);
  assert.throws(() => validateProfile({ ...p, availability: ['Every day'] }), /time/);
  assert.throws(() => validateProfile({ ...p, dating: true, datingGenders: [] }), /date/);
  assert.throws(() => validateProfile({ ...p, ageMin: 35, ageMax: 24 }), /range/);
  assert.throws(() => validateProfile({ ...p, ageMin: 17 }), /range/);
  assert.equal(validateProfile({ ...p, extra: 'untrusted' }).extra, undefined);
});
test('groups fit both languages and availability; a blocked participant excludes the group', () => {
  const me = initialState().profile;
  assert.equal(eligibleGroups(me).length, 2);
  assert.deepEqual(eligibleGroups(me, ['aiko']).map(g => g.id), ['walk-ja']);
  assert.equal(eligibleGroups({ ...me, learns: 'French' }).length, 0);
  assert.equal(eligibleGroups(me, [], { slot: 'Sunday afternoon' }).length, 0);
});
test('invitations enforce shared times, future dates, mutual intent and duplicate protection', () => {
  const now = new Date(2026, 8, 19, 12), state = initialState();
  const proposal = { kind: 'partner', target: 'aiko', date: '2026-09-24', time: '18:00', venue: 'A café in Surry Hills', repeat: 'weekly', note: 'Hello!' };
  assert.equal(validatePlan(proposal, state, now), true);
  for (const patch of [{ date: '2026-09-18' }, { date: '2026-09-25' }, { time: '10:00' }, { time: '25:00' }, { date: '2026-02-30' }, { date: '2028-09-21' }, { venue: 'My home' }, { repeat: 'daily' }, { target: 'mateo' }, { kind: 'date' }, { note: ' ' }]) assert.throws(() => validatePlan({ ...proposal, ...patch }, state, now));
  const plan = createPlan(state, proposal, now); state.plans.push(plan);
  assert.equal(plan.status, 'pending'); assert.equal(plan.repeat, 'weekly');
  assert.throws(() => createPlan(state, proposal, now), /already/);
  state.plans[0].status = 'cancelled'; assert.ok(createPlan(state, proposal, now));
  state.blocked = ['aiko']; assert.throws(() => createPlan(state, proposal, now), /available/);
});
test('group join requests use the advertised session and date rollover is stable', () => {
  const now = new Date(2026, 8, 19, 12), state = initialState(), g = GROUPS[0];
  const proposal = { kind: 'group', target: g.id, date: nextDate(g.weekday, now), time: g.time, venue: 'A café in Surry Hills', repeat: 'once', note: 'Hello!' };
  assert.equal(proposal.date, '2026-09-26');
  assert.equal(validatePlan(proposal, state, now), true);
  assert.throws(() => validatePlan({ ...proposal, date: '2026-10-03' }, state, now), /scheduled/);
  assert.equal(nextDate(4, new Date(2026, 11, 31)), '2027-01-07');
  assert.match(defaultDate('Saturday morning'), /^\d{4}-\d{2}-\d{2}$/);
});
test('stored state is validated and literal markup survives without gaining fields', () => {
  const s = initialState(); s.profile.name = '<img src=x onerror=alert(1)>';
  s.plans.push({ id: 'one', kind: 'partner', target: 'aiko', date: '2026-09-24', time: '18:00', repeat: 'weekly', venue: 'A café in Surry Hills', status: 'pending', messages: [{ text: '<script>bad()</script>', at: 1 }] });
  assert.deepEqual(parseState(JSON.stringify(s)), s);
  for (const patch of [{ version: 0 }, { blocked: ['stranger'] }, { plans: [{ ...s.plans[0], status: 'confirmed' }] }, { plans: [...s.plans, ...s.plans] }, { plans: [{ ...s.plans[0], time: '99:99' }] }, { reports: [{ target: 'stranger', reason: 'Harassment' }] }]) assert.throws(() => parseState(JSON.stringify({ ...s, ...patch })));
  assert.throws(() => parseState('{broken'));
  assert.equal(parseState(JSON.stringify({ ...s, admin: true })).admin, undefined);
});
