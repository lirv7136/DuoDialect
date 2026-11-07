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

// Plans are in the city's time zone, which need not be the phone's. Node applies a change to
// TZ at once, so these run as if on a phone in another zone. The expected answers are what
// the server's requireMeeting decides for the same wall time and zone at the same instant.
const load = require('./load-typescript.cjs');
const cities = load('src/domain/cities.ts');
const bounds = load('src/domain/date-bounds.ts', { './schedule': s });

function onPhoneIn(zone, run) {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
}
const at = iso => new Date(iso);
const times = list => list.map(item => `${item.localDate} ${item.localTime}`);
const dayOf = date => bounds.toLocalDateString(date);

test('a phone in Perth plans in Sydney time, three hours ahead', () => onPhoneIn('Australia/Perth', () => {
  const zone = cities.meetingTimeZone('sydney', 'Australia/Perth');
  assert.equal(zone, 'Australia/Sydney');

  // 07:30 UTC, Friday 6 November 2026: 15:30 on the phone, 18:30 in Sydney (daylight time).
  const instant = at('2026-11-06T07:30:00Z');
  same(s.wallClockIn(null, instant), { year: 2026, month: 11, day: 6, hour: 15, minute: 30, second: 0 });
  const sydney = s.wallClockIn(zone, instant);
  same(sydney, { year: 2026, month: 11, day: 6, hour: 18, minute: 30, second: 0 });

  // 18:00 on Friday has passed in Sydney, though the phone's clock says 15:30.
  same(times(s.suggestMeetingTimes(['Friday evening'], sydney, 2)), ['2026-11-13 18:00', '2026-11-20 18:00']);
  same(times(s.suggestMeetingTimes(['Friday evening'], instant, 1)), ['2026-11-06 18:00'], 'the phone clock would have offered it');
  assert.match(s.validateMeetingDraft(draft({ localDate: '2026-11-06', localTime: '18:15' }), { now: sydney }), /future/,
    'the server refuses it too: 07:15 UTC is before now');
  assert.equal(s.validateMeetingDraft(draft({ localDate: '2026-11-06', localTime: '18:45' }), { now: sydney }), null);

  // 14:00 UTC: 22:00 Friday on the phone, already 01:00 Saturday in Sydney.
  const late = s.wallClockIn(zone, at('2026-11-06T14:00:00Z'));
  same(late, { year: 2026, month: 11, day: 7, hour: 1, minute: 0, second: 0 });
  const { minimumDate, maximumDate } = bounds.meetingDateBounds(late);
  assert.equal(dayOf(minimumDate), '2026-11-07', 'Friday is over in Sydney');
  assert.equal(dayOf(maximumDate), '2027-11-07');
  assert.equal(dayOf(bounds.meetingDateBounds(at('2026-11-06T14:00:00Z')).minimumDate), '2026-11-06', 'the phone is still on Friday');
  assert.match(s.validateMeetingDraft(draft({ localDate: '2026-11-06', localTime: '23:30' }), { now: late }), /future/);
  same(times(s.suggestMeetingTimes(['Saturday morning'], late, 1)), ['2026-11-07 10:00']);
}));

test('a phone in Sydney in daylight time plans on the Gold Coast, an hour behind', () => onPhoneIn('Australia/Sydney', () => {
  const zone = cities.meetingTimeZone('gold-coast', 'Australia/Sydney');
  assert.equal(zone, 'Australia/Brisbane', 'Queensland keeps standard time all year');

  // 05:30 UTC, Friday 6 November 2026: 16:30 on the phone, 15:30 on the Gold Coast.
  const instant = at('2026-11-06T05:30:00Z');
  const coast = s.wallClockIn(zone, instant);
  same(coast, { year: 2026, month: 11, day: 6, hour: 15, minute: 30, second: 0 });
  // 18:00 is two and a half hours away on the Gold Coast, only an hour and a half on the phone.
  same(times(s.suggestMeetingTimes(['Friday evening'], coast, 1)), ['2026-11-06 18:00']);
  same(times(s.suggestMeetingTimes(['Friday evening'], instant, 1)), ['2026-11-13 18:00'], 'the phone clock would have skipped it');

  // 13:30 UTC: 00:30 Saturday on the phone, still 23:30 Friday on the Gold Coast.
  const late = s.wallClockIn(zone, at('2026-11-06T13:30:00Z'));
  same(late, { year: 2026, month: 11, day: 6, hour: 23, minute: 30, second: 0 });
  assert.equal(dayOf(bounds.meetingDateBounds(late).minimumDate), '2026-11-06', 'Friday can still be picked');
  assert.equal(dayOf(bounds.meetingDateBounds(at('2026-11-06T13:30:00Z')).minimumDate), '2026-11-07', 'the phone has moved on');
  assert.equal(s.validateMeetingDraft(draft({ localDate: '2026-11-06', localTime: '23:45' }), { now: late }), null,
    'the server accepts it too: 13:45 UTC is after now');
  assert.match(s.validateMeetingDraft(draft({ localDate: '2026-11-06', localTime: '23:15' }), { now: late }), /future/);
  assert.match(s.validateMeetingDraft(draft({ localDate: '2026-11-06', localTime: '23:45' }), { now: at('2026-11-06T13:30:00Z') }), /future/,
    'the phone clock would have refused it');
}));

test('the wall clock reads midnight as 0 and falls back to the phone without a usable zone', () => onPhoneIn('Australia/Perth', () => {
  const instant = at('2026-11-06T13:00:00Z');
  same(s.wallClockIn('Australia/Sydney', instant), { year: 2026, month: 11, day: 7, hour: 0, minute: 0, second: 0 });
  const phone = { year: 2026, month: 11, day: 6, hour: 21, minute: 0, second: 0 };
  same(s.wallClockIn(undefined, instant), phone);
  same(s.wallClockIn('Mars/Olympus_Mons', instant), phone);
  same(s.asWallClock(instant), phone);
  same(s.asWallClock(phone), phone);
}));
