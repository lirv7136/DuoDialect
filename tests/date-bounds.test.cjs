const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const exchange = load('src/domain/language-exchange.ts');
const schedule = load('src/domain/schedule.ts');
const form = load('src/domain/profile-form.ts', { './language-exchange': exchange, './schedule': schedule });
const d = load('src/domain/date-bounds.ts', { './schedule': schedule });

const iso = date => d.toLocalDateString(date);

test('the latest allowed birth date makes someone exactly 18 today, and a day later is under 18', () => {
  for (const now of [new Date(Date.UTC(2026, 8, 26, 12)), new Date(Date.UTC(2026, 0, 1, 0, 30)), new Date(Date.UTC(2026, 11, 31, 23))]) {
    const latest = d.latestAdultBirthDate(now);
    assert.equal(form.ageFromBirthDate(iso(latest), now), 18, iso(latest));
    const dayAfter = new Date(latest.getFullYear(), latest.getMonth(), latest.getDate() + 1);
    assert.equal(form.ageFromBirthDate(iso(dayAfter), now), 17, iso(dayAfter));
  }
  assert.equal(iso(d.latestAdultBirthDate(new Date(Date.UTC(2026, 8, 26, 12)))), '2008-09-26');
});

test('a leap day today falls back to 28 February eighteen years earlier', () => {
  const now = new Date(Date.UTC(2028, 1, 29, 12));
  assert.equal(iso(d.latestAdultBirthDate(now)), '2010-02-28');
  assert.equal(form.ageFromBirthDate('2010-02-28', now), 18);
});

test('the picker opens around 25 years ago, inside the allowed range', () => {
  const now = new Date(Date.UTC(2026, 8, 26, 12));
  const start = d.defaultBirthDate(now);
  assert.equal(iso(start), '2001-09-26');
  assert.ok(start <= d.latestAdultBirthDate(now));
  assert.ok(d.earliestBirthDate(now) < start);
  assert.equal(form.validateProfileDraft({ displayName: 'A', bio: '', area: '', speaks: [{ lang: 'English', level: 'fluent' }],
    learns: [{ lang: 'Japanese', level: 'beginner' }], availability: [], interests: [] },
  { firstSave: true, private: { birthDate: iso(start) }, now }), null);
});

test('meetup dates run from today to a year ahead', () => {
  const now = new Date(2026, 8, 26, 15, 45);
  const { minimumDate, maximumDate } = d.meetingDateBounds(now);
  assert.equal(iso(minimumDate), '2026-09-26');
  assert.equal(iso(maximumDate), '2027-09-26');
});

test('stored formats round trip through Date values', () => {
  assert.equal(iso(d.dateFromLocalDate('1998-04-21')), '1998-04-21');
  assert.equal(d.dateFromLocalDate('1998-02-30'), null);
  assert.equal(d.toLocalTimeString(d.dateFromLocalTime('07:05')), '07:05');
  assert.equal(d.dateFromLocalTime('24:00'), null);
  assert.equal(d.formatLongDate('1998-04-21'), '21 April 1998');
});
