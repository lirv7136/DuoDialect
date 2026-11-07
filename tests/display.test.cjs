const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const schedule = load('src/domain/schedule.ts');
const d = load('src/domain/display.ts', { './schedule': schedule });

const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);

test('languages become monograms, not flags', () => {
  assert.equal(d.languageCode('japanese'), 'JA');
  assert.equal(d.languageCode(' English '), 'EN');
  assert.equal(d.languageCode('Cantonese'), 'YUE');
  assert.equal(d.languageCode('xhosa'), 'XH', 'unlisted languages use their first two letters');
  assert.equal(d.languageCode('Tiếng'), 'TI');
  assert.equal(d.languageCode(''), '?');
  assert.equal(d.languageCode('123'), '?');
});

test('availability slots shorten to icon chips and a Monday-first grid', () => {
  same(d.shortSlot('Monday evening'), { label: 'Mon eve', icon: 'moon-outline' });
  same(d.shortSlot('Saturday morning'), { label: 'Sat am', icon: 'sunny-outline' });
  same(d.shortSlot('Sunday afternoon'), { label: 'Sun pm', icon: 'partly-sunny-outline' });
  assert.equal(d.shortSlot('Funday evening'), null);
  assert.equal(d.shortSlot('Monday midnight'), null);
  const grid = d.availabilityGrid(['Monday evening', 'Sunday morning', 'nonsense']);
  assert.equal(grid.length, 7);
  assert.equal(grid[0].day, 'Monday');
  assert.equal(grid[6].short, 'Sun');
  same(grid[0].parts, [false, false, true]);
  same(grid[6].parts, [true, false, false]);
  same(d.availabilityGrid(undefined)[3].parts, [false, false, false]);
});

test('date blocks and the next weekly occurrence', () => {
  same(d.dateBlock('2025-10-02'), { day: '2', weekday: 'Thu', month: 'Oct' });
  assert.equal(d.dateBlock('2025-02-30'), null);
  const now = new Date(2025, 9, 10, 12, 0); // Friday 10 October 2025
  assert.equal(d.nextOccurrence('2025-10-02', 'once', now), '2025-10-02', 'one-off plans keep their date');
  assert.equal(d.nextOccurrence('2025-10-02', 'weekly', now), '2025-10-16', 'a Thursday weekly moves to the next Thursday');
  assert.equal(d.nextOccurrence('2025-10-03', 'weekly', now), '2025-10-10', 'today counts');
  assert.equal(d.nextOccurrence('2025-10-20', 'weekly', now), '2025-10-20', 'never before its first date');
  assert.equal(d.isPastMeeting({ localDate: '2025-10-10', localTime: '11:30', recurrence: 'once' }, now), true);
  assert.equal(d.isPastMeeting({ localDate: '2025-10-10', localTime: '18:00', recurrence: 'once' }, now), false);
  assert.equal(d.isPastMeeting({ localDate: '2025-01-01', localTime: '18:00', recurrence: 'weekly' }, now), false);
});

test('plans split into upcoming, invites for me, invites I sent, and past', () => {
  const now = new Date(2025, 9, 10, 12, 0);
  const plan = (id, patch) => ({ id, fromUid: 'me', toUid: 'aiko', status: 'pending',
    meeting: { localDate: '2025-10-20', localTime: '18:00', recurrence: 'once' }, ...patch });
  const items = [
    plan('sent', {}),
    plan('forMe', { fromUid: 'aiko', toUid: 'me' }),
    plan('later', { status: 'accepted', meeting: { localDate: '2025-10-25', localTime: '10:00', recurrence: 'once' } }),
    plan('sooner', { status: 'accepted', meeting: { localDate: '2025-10-01', localTime: '09:00', recurrence: 'weekly' } }),
    plan('gone', { status: 'accepted', meeting: { localDate: '2025-10-01', localTime: '09:00', recurrence: 'once' } }),
    plan('no', { status: 'declined' }),
    plan('off', { status: 'cancelled' }),
  ];
  const s = d.planSegments(items, 'me', now);
  same(s.upcoming.map(i => i.id), ['sooner', 'later'], 'weekly plans sort by their next date');
  same(s.received.map(i => i.id), ['forMe']);
  same(s.sent.map(i => i.id), ['sent']);
  same(s.past.map(i => i.id), ['gone', 'no', 'off']);
  assert.equal(d.planSegments(items, 'me', now, 2).past.length, 2);

  assert.equal(d.planStatus(items[0], 'me'), 'waiting');
  assert.equal(d.planStatus(items[1], 'me'), 'your-turn');
  assert.equal(d.planStatus(items[2], 'me'), 'confirmed');
  assert.equal(d.planStatus(items[5], 'me'), 'declined');
  assert.equal(d.planStatus(items[6], 'me'), 'cancelled');

  assert.equal(d.initialSegment(s), 'invites', 'an invite waiting for me opens first');
  assert.equal(d.initialSegment({ ...s, received: [] }), 'upcoming');
  assert.equal(d.initialSegment({ upcoming: [], received: [], sent: [1], past: [] }), 'invites');
  assert.equal(d.initialSegment({ upcoming: [], received: [], sent: [], past: [1] }), 'past');
  assert.equal(d.initialSegment({ upcoming: [], received: [], sent: [], past: [] }), 'upcoming');
});

test('chat messages group by sender and time, with day dividers', () => {
  const now = new Date(2025, 9, 10, 12, 0);
  const at = (day, h, m) => new Date(2025, 9, day, h, m);
  const msgs = [
    { id: 'a', fromUid: 'aiko', createdAt: at(9, 18, 0) },
    { id: 'b', fromUid: 'aiko', createdAt: at(9, 18, 2) },
    { id: 'c', fromUid: 'me', createdAt: at(9, 18, 3) },
    { id: 'd', fromUid: 'me', createdAt: at(10, 9, 0) },
    { id: 'e', fromUid: 'me', createdAt: at(10, 11, 58) },
    { id: 'f', fromUid: 'me', createdAt: null },
  ];
  const rows = d.groupMessages(msgs, 'me', now);
  same(rows.map(r => [r.message.id, r.mine, r.first, r.last, r.divider]), [
    ['a', false, true, false, 'Yesterday'],
    ['b', false, false, true, null],
    ['c', true, true, true, null],
    ['d', true, true, true, 'Today'],
    ['e', true, true, false, null],
    ['f', true, false, true, null],
  ]);
  assert.equal(d.dayLabel(at(2, 10, 0), now), 'Thu 2 Oct');
  same(d.groupMessages([], 'me', now), []);
});

test('relative times for chat rows', () => {
  const now = new Date(2025, 9, 10, 12, 0);
  assert.equal(d.relativeTime(null, now), '');
  assert.equal(d.relativeTime(new Date(now.getTime() - 30e3), now), 'now');
  assert.equal(d.relativeTime(new Date(now.getTime() - 5 * 60e3), now), '5m');
  assert.equal(d.relativeTime(new Date(now.getTime() - 3 * 3600e3), now), '3h');
  assert.equal(d.relativeTime(new Date(now.getTime() - 2 * 86400e3), now), '2d');
  assert.equal(d.relativeTime(new Date(now.getTime() - 15 * 86400e3), now), '2w');
});
