const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { CITIES, DEFAULT_CITY, cityName, isCityId } = load('src/domain/cities.ts');

test('ids are lower case with hyphens only inside, unique, and each has a display name', () => {
  const ids = CITIES.map(city => city.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const city of CITIES) {
    assert.match(city.id, /^[a-z]+(-[a-z]+)*$/, city.id);
    assert.ok(city.name.trim().length > 0, city.id);
    assert.match(city.name, /^\p{Lu}/u, `${city.name} is capitalised for display`);
  }
  assert.ok(ids.includes(DEFAULT_CITY));
  assert.equal(DEFAULT_CITY, 'sydney');
});

test('the client list is the same as the backend allow list', () => {
  // The backend is the authority; a city added on one side only would be rejected or unlistable.
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'functions', 'lib', 'constants.js'), 'utf8');
  const backend = [...source.matchAll(/\{ id: "([a-z-]+)", name: "([^"]+)" \}/g)].map(m => ({ id: m[1], name: m[2] }));
  assert.equal(JSON.stringify(backend), JSON.stringify(CITIES.map(city => ({ id: city.id, name: city.name }))));
});

test('cityName and isCityId know the list and nothing else', () => {
  assert.equal(cityName('sydney'), 'Sydney');
  assert.equal(cityName('gold-coast'), 'Gold Coast');
  assert.equal(cityName('atlantis'), '');
  assert.equal(cityName(undefined), '');
  assert.equal(cityName(null), '');
  assert.equal(isCityId('auckland'), true);
  assert.equal(isCityId('Sydney'), false);
  assert.equal(isCityId(''), false);
  assert.equal(isCityId(3), false);
});
