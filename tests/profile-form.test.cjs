const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const exchange = load('src/domain/language-exchange.ts');
const schedule = load('src/domain/schedule.ts');
const f = load('src/domain/profile-form.ts', { './language-exchange': exchange, './schedule': schedule });

const now = new Date(Date.UTC(2026, 8, 26));
const draft = (patch = {}) => ({
  displayName: 'Alex', bio: '', area: 'Surry Hills',
  speaks: [{ lang: 'English', level: 'fluent' }], learns: [{ lang: 'Japanese', level: 'beginner' }],
  availability: ['Thursday evening'], interests: [], ...patch,
});
const first = (birthDate = '1998-04-21') => ({ firstSave: true, private: { birthDate }, now });

test('a complete first profile passes; later saves need no private fields', () => {
  assert.equal(f.validateProfileDraft(draft(), first()), null);
  assert.equal(f.validateProfileDraft(draft(), { firstSave: false }), null);
});

test('language rules mirror the server: something to offer, no overlap, no duplicates, bounded', () => {
  assert.match(f.validateLanguages([], [{ lang: 'Japanese', level: 'beginner' }]), /speak/);
  assert.match(f.validateLanguages([{ lang: 'English', level: 'fluent' }], []), /practising/);
  assert.match(f.validateLanguages([{ lang: 'English', level: 'intermediate' }], [{ lang: 'Japanese', level: 'beginner' }]), /native or fluent/);
  assert.match(f.validateLanguages([{ lang: 'English', level: 'native' }], [{ lang: ' english ', level: 'beginner' }]), /both/);
  assert.match(f.validateLanguages([{ lang: 'English', level: 'native' }, { lang: 'ENGLISH', level: 'fluent' }], [{ lang: 'Japanese', level: 'beginner' }]), /twice/);
  assert.match(f.validateLanguages([{ lang: '  ', level: 'native' }], [{ lang: 'Japanese', level: 'beginner' }]), /name/);
  const seven = Array.from({ length: 7 }, (_, i) => ({ lang: `L${i}`, level: 'fluent' }));
  assert.match(f.validateLanguages(seven, [{ lang: 'Japanese', level: 'beginner' }]), /up to 6/);
  assert.match(f.validateLanguages([{ lang: 'English', level: 'expert' }], [{ lang: 'Japanese', level: 'beginner' }]), /level/);
});

test('name, bio, area, availability and interest limits', () => {
  assert.match(f.validateProfileDraft(draft({ displayName: ' ' }), { firstSave: false }), /name/);
  assert.match(f.validateProfileDraft(draft({ displayName: 'x'.repeat(41) }), { firstSave: false }), /40/);
  assert.match(f.validateProfileDraft(draft({ bio: 'x'.repeat(401) }), { firstSave: false }), /400/);
  assert.match(f.validateProfileDraft(draft({ area: 'x'.repeat(61) }), { firstSave: false }), /60/);
  assert.match(f.validateProfileDraft(draft({ availability: schedule.AVAILABILITY_SLOTS.slice(0, 15) }), { firstSave: false }), /14/);
  assert.match(f.validateProfileDraft(draft({ interests: Array(9).fill('a') }), { firstSave: false }), /8/);
  assert.match(f.validateProfileDraft(draft({ interests: ['x'.repeat(25)] }), { firstSave: false }), /24/);
});

test('first save requires a real adult birth date, as the backend does', () => {
  assert.match(f.validateProfileDraft(draft(), first('21/04/1998')), /YYYY-MM-DD/);
  assert.match(f.validateProfileDraft(draft(), first('1998-02-30')), /YYYY-MM-DD/);
  assert.match(f.validateProfileDraft(draft(), first('2030-01-01')), /YYYY-MM-DD/);
  assert.match(f.validateProfileDraft(draft(), first('2008-09-27')), /18/);
  assert.equal(f.validateProfileDraft(draft(), first('2008-09-26')), null);
  assert.equal(f.ageFromBirthDate('2008-09-26', now), 18);
  assert.equal(f.ageFromBirthDate('2008-09-27', now), 17);
});

test('payloads are complete, trimmed, and never carry dating fields or gender', () => {
  const payload = f.buildUpsertPayload(draft({ displayName: ' Alex ', speaks: [{ lang: ' English ', level: 'fluent' }] }), first());
  assert.equal(payload.displayName, 'Alex');
  assert.equal(payload.speaks[0].lang, 'English');
  assert.equal(payload.birthDate, '1998-04-21');
  assert.equal('gender' in payload, false);
  assert.equal('dating' in payload, false);
  for (const key of ['bio', 'area', 'availability', 'interests']) assert.ok(key in payload, key);
  const later = f.buildUpsertPayload(draft(), { firstSave: false, private: { birthDate: '1998-04-21' } });
  assert.equal('birthDate' in later, false);
  assert.equal('gender' in later, false);
  assert.equal('dating' in later, false);
});

test('stored profiles become well formed drafts; interests are parsed and de-duplicated', () => {
  const d = f.draftFromProfile({ displayName: 'Aiko', speaks: [{ lang: 'japanese', level: 'native' }, { lang: 'x', level: 'bogus' }, null], availability: ['Saturday morning', 3] });
  assert.equal(d.speaks.length, 1);
  assert.equal(d.speaks[0].lang, 'Japanese');
  assert.equal(JSON.stringify(d.availability), JSON.stringify(['Saturday morning']));
  assert.equal(d.bio, '');
  assert.equal(JSON.stringify(f.parseInterests(' Coffee, coffee ,Film,, ')), JSON.stringify(['Coffee', 'Film']));
});
