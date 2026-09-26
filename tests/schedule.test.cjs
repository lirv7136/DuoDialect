const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./load-typescript.cjs')('src/domain/schedule.ts');
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

// Wednesday 1 October 2025, 09:00 local time.
const now = new Date(2025, 9, 1, 9, 0);
const draft = (patch = {}) => ({ venue: 'A café in Glebe', localDate: '2025-10-02', localTime: '18:00', recurrence: 'once', note: 'Hi!', ...patch });

test('availability vocabulary fits the backend limits', () => {
  assert.equal(s.AVAILABILITY_SLOTS.length, 21);
  assert.equal(s.AVAILABILITY_SLOTS[0], 'Monday morning');
  assert.ok(s.AVAILABILITY_SLOTS.every(slot => slot.length <= 32));
  assert.equal(s.MAX_AVAILABILITY, 14);
});

test('slots are derived from the calendar date, independent of time zone', () => {
  assert.equal(s.slotFor('2025-10-02', '18:00'), 'Thursday evening');
  assert.equal(s.slotFor('2025-10-04', '09:59'), 'Saturday morning');
  assert.equal(s.slotFor('2025-10-05', '12:00'), 'Sunday afternoon');
  assert.equal(s.slotFor('2025-10-05', '16:59'), 'Sunday afternoon');
  assert.equal(s.slotFor('2025-10-05', '17:00'), 'Sunday evening');
  assert.equal(s.slotFor('2025-02-30', '10:00'), null);
  assert.equal(s.slotFor('2025-10-05', '24:00'), null);
});

test('a valid future meeting in shared availability passes', () => {
  assert.equal(s.validateMeetingDraft(draft(), { now, sharedAvailability: ['Thursday evening'] }), null);
  assert.equal(s.validateMeetingDraft(draft({ recurrence: 'weekly' }), { now }), null);
});

test('invalid venue, date, time, recurrence and note are refused with specific messages', () => {
  assert.match(s.validateMeetingDraft(draft({ venue: '  ' }), { now }), /public place/);
  assert.match(s.validateMeetingDraft(draft({ venue: 'x'.repeat(61) }), { now }), /60/);
  assert.match(s.validateMeetingDraft(draft({ localDate: '2025-13-01' }), { now }), /real date/);
  assert.match(s.validateMeetingDraft(draft({ localDate: '2/10/2025' }), { now }), /real date/);
  assert.match(s.validateMeetingDraft(draft({ localTime: '6pm' }), { now }), /HH:mm/);
  assert.match(s.validateMeetingDraft(draft({ localTime: '25:00' }), { now }), /HH:mm/);
  assert.match(s.validateMeetingDraft(draft({ recurrence: 'daily' }), { now }), /weekly/);
  assert.match(s.validateMeetingDraft(draft({ note: 'x'.repeat(401) }), { now }), /400/);
});

test('past, same-minute and more-than-a-year-out meetings are refused', () => {
  assert.match(s.validateMeetingDraft(draft({ localDate: '2025-10-01', localTime: '08:59' }), { now }), /future/);
  assert.match(s.validateMeetingDraft(draft({ localDate: '2025-10-01', localTime: '09:00' }), { now }), /future/);
  assert.match(s.validateMeetingDraft(draft({ localDate: '2026-10-03' }), { now }), /next year/);
  assert.equal(s.validateMeetingDraft(draft({ localDate: '2026-09-30' }), { now }), null);
});

test('when both people share times, the meeting must fall inside one', () => {
  assert.match(s.validateMeetingDraft(draft({ localTime: '10:00' }), { now, sharedAvailability: ['Thursday evening'] }), /both have available/);
  // No shared times: any time is allowed and details are agreed in the note.
  assert.equal(s.validateMeetingDraft(draft({ localTime: '10:00' }), { now, sharedAvailability: [] }), null);
});

test('suggested times are future, inside the slots, and leave time to reply', () => {
  const suggestions = s.suggestMeetingTimes(['Wednesday morning', 'Thursday evening', 'Saturday morning'], now, 3);
  same(suggestions.map(item => `${item.localDate} ${item.localTime}`), ['2025-10-02 18:00', '2025-10-04 10:00', '2025-10-08 10:00']);
  for (const item of suggestions) assert.equal(s.validateMeetingDraft(draft(item), { now, sharedAvailability: [item.slot] }), null);
  same(s.suggestMeetingTimes([], now), []);
});

test('shared slots and display formatting', () => {
  same(s.sharedSlots(['Monday evening', 'Thursday evening'], ['Thursday evening', 'Sunday morning']), ['Thursday evening']);
  same(s.sharedSlots(undefined, ['x']), []);
  assert.equal(s.formatLocalDate('2025-10-02'), 'Thu 2 Oct');
  assert.equal(s.formatMeeting({ localDate: '2025-10-02', localTime: '18:00', recurrence: 'weekly' }), 'Thu 2 Oct · 18:00 · weekly from this date');
  assert.equal(s.formatMeeting({ localDate: '2025-10-02', localTime: '18:00', recurrence: 'once' }), 'Thu 2 Oct · 18:00 · one meetup');
});
