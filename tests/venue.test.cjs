const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const schedule = load('src/domain/schedule.ts');
const v = load('src/domain/venue.ts', { './schedule': schedule });
// Values cross a vm context, so compare by shape as schedule.test.cjs does.
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

test('a place type and an area become the venue string the server already accepts', () => {
  assert.equal(v.venueFor('cafe', 'Glebe'), 'A café in Glebe');
  assert.equal(v.venueFor('shopping', ' Chatswood '), 'A shopping centre in Chatswood');
  assert.equal(v.venueFor('library', ''), 'A library');
  assert.ok(v.venueFor('shopping', 'x'.repeat(80)).length <= schedule.MAX_VENUE);
  assert.ok(v.PLACE_TYPES.every(place => v.venueFor(place.key, 'Glebe').length <= schedule.MAX_VENUE));
});

test('the partner’s neighbourhood comes first; one chip when only one exists or both match', () => {
  const both = v.areaChoices({ name: 'Aiko', area: 'Glebe' }, 'Newtown');
  same(both.map(c => [c.key, c.area]), [['theirs', 'Glebe'], ['mine', 'Newtown']]);
  assert.equal(both[0].label, 'Glebe · near Aiko');
  assert.equal(both[1].label, 'Newtown · near you');
  same(v.areaChoices({ name: 'Aiko', area: '' }, 'Newtown').map(c => [c.key, c.label]), [['mine', 'Newtown']]);
  same(v.areaChoices({ name: 'Aiko', area: 'Glebe' }, '').map(c => [c.key, c.label]), [['theirs', 'Glebe']]);
  same(v.areaChoices({ name: 'Aiko', area: 'glebe' }, 'Glebe').map(c => [c.key, c.label]), [['theirs', 'glebe']]);
  same(v.areaChoices({ name: 'Aiko', area: '' }, ''), []);
});

test('a venue the picker produced reopens on the same chips', () => {
  const choices = v.areaChoices({ name: 'Aiko', area: 'Glebe' }, 'Newtown');
  same(v.matchVenue('A café in Glebe', choices), { key: 'cafe', areaKey: 'theirs' });
  same(v.matchVenue('A park in Newtown', choices), { key: 'park', areaKey: 'mine' });
  same(v.matchVenue('A library', choices), { key: 'library', areaKey: null });
  assert.equal(v.matchVenue('Flat White Café, Glebe', choices), null);
  assert.equal(v.matchVenue('', choices), null);
});

test('home addresses and dwellings look private', () => {
  for (const venue of [
    'Unit 3, 12 Glebe Point Rd', 'Apt 7 Oxford Street', 'Flat 2', 'my apartment', 'My place', 'my house', 'at home', 'Home',
    '12 Glebe Point Rd', '3/45 King Street', '7 Bay Ave.', '100 Pacific Hwy', '5 Market Lane', '18 Rose Cres', '2a Short St',
  ]) assert.equal(v.looksPrivate(venue), true, venue);
});

test('public places do not trip the warning', () => {
  for (const venue of [
    'A café in Glebe', 'Flat White Café', 'Glebe Library', 'Westfield Bondi Junction', 'Hyde Park', 'USYD Fisher Library',
    'Homebush Aquatic Centre', 'Café 2 Go', 'The Grounds of Alexandria', 'Food court, level 2', '', '   ',
  ]) assert.equal(v.looksPrivate(venue), false, venue);
});

test('the copy states the rule once', () => {
  assert.equal(v.PUBLIC_PLACE_HINT, 'Somewhere public, with other people around.');
  assert.match(v.PRIVATE_VENUE_WARNING, /home address/);
});
