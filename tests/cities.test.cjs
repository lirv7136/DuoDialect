const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const c = load('src/domain/cities.ts');
const backend = require('../functions/lib/constants.js');

// Array.from, not map: the module runs in its own realm, and deepEqual compares prototypes.
const ids = list => Array.from(list, city => city.id);
const labels = list => Array.from(list, city => c.cityLabel(city));

test('every id is lower case with hyphens only inside, unique, and each city is complete', () => {
  assert.ok(c.CITIES.length > 5000, 'every city of 100,000 people and every capital');
  assert.equal(new Set(ids(c.CITIES)).size, c.CITIES.length);
  for (const city of c.CITIES) {
    assert.match(city.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, city.id);
    assert.ok(city.name.trim().length > 0, city.id);
    assert.match(city.country, /^[A-Z]{2}$/, city.id);
    assert.ok(city.countryName && city.countryName !== city.country, `${city.id} has a country name`);
    assert.ok(Number.isInteger(city.population) && city.population >= 0, city.id);
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: city.timeZone }), `${city.id}: ${city.timeZone}`);
  }
  for (let i = 1; i < c.CITIES.length; i += 1) assert.ok(c.CITIES[i - 1].population >= c.CITIES[i].population, 'biggest first');
});

test('the eleven original ids are kept exactly, on the right cities and clocks', () => {
  const expected = {
    sydney: ['Sydney', 'AU', 'Australia/Sydney'], melbourne: ['Melbourne', 'AU', 'Australia/Melbourne'],
    brisbane: ['Brisbane', 'AU', 'Australia/Brisbane'], perth: ['Perth', 'AU', 'Australia/Perth'],
    adelaide: ['Adelaide', 'AU', 'Australia/Adelaide'], canberra: ['Canberra', 'AU', 'Australia/Sydney'],
    hobart: ['Hobart', 'AU', 'Australia/Hobart'], darwin: ['Darwin', 'AU', 'Australia/Darwin'],
    'gold-coast': ['Gold Coast', 'AU', 'Australia/Brisbane'], auckland: ['Auckland', 'NZ', 'Pacific/Auckland'],
    wellington: ['Wellington', 'NZ', 'Pacific/Auckland'],
  };
  assert.deepEqual([...c.LEGACY_CITY_IDS].sort(), Object.keys(expected).sort());
  for (const [id, [name, country, zone]] of Object.entries(expected)) {
    const city = c.cityById(id);
    assert.ok(city, id);
    assert.deepEqual([city.name, city.country, city.timeZone], [name, country, zone], id);
    assert.equal(c.isCityId(id), true);
  }
  assert.equal(c.DEFAULT_CITY, 'sydney');
  // No second Sydney under a world id: the original id keeps the city.
  assert.equal(c.isCityId('sydney-au'), false);
});

test('the app and the backend read the same file, so they accept the same ids', () => {
  assert.deepEqual(ids(c.CITIES), backend.CITY_IDS);
  assert.deepEqual([...c.LEGACY_CITY_IDS], backend.LEGACY_CITY_IDS);
  assert.equal(c.DEFAULT_CITY, backend.DEFAULT_CITY);
  for (const id of ['sydney', 'gold-coast', 'london-gb', 'springfield-us-il']) assert.equal(c.cityLabel(id), backend.cityLabel(id));
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'domain', 'cities.ts'), 'utf8');
  assert.match(source, /from "\.\.\/\.\.\/functions\/data\/cities\.json"/, 'one list, under functions/ so the backend deploys it');
});

test('names, labels, time zones and ids know the list and nothing else', () => {
  assert.equal(c.cityName('sydney'), 'Sydney');
  assert.equal(c.cityName('gold-coast'), 'Gold Coast');
  assert.equal(c.cityLabel('sydney'), 'Sydney, Australia');
  assert.equal(c.cityLabel('london-gb'), 'London, United Kingdom');
  assert.equal(c.cityLabel('sao-paulo-br'), 'São Paulo, Brazil', 'accents are kept');
  assert.equal(c.cityLabel('springfield-us-il'), 'Springfield, Illinois, United States', 'a region only where a country has two of one name');
  assert.equal(c.cityLabel('springfield-us-ma'), 'Springfield, Massachusetts, United States');
  assert.equal(c.cityLabel(c.cityById('paris-fr')), 'Paris, France');
  assert.equal(c.cityTimeZone('london-gb'), 'Europe/London');
  assert.equal(c.cityTimeZone('new-york-city-us'), 'America/New_York');
  for (const unknown of ['atlantis', 'Sydney', 'London-GB', '', undefined, null]) {
    assert.equal(c.cityName(unknown), '');
    assert.equal(c.cityLabel(unknown), '');
    assert.equal(c.cityTimeZone(unknown), null);
    assert.equal(c.isCityId(unknown), false);
  }
  assert.equal(c.isCityId(3), false);
  assert.equal(c.isCityId('auckland'), true);
  assert.equal(c.isCityId('tokyo-jp'), true);
});

test('a plan is arranged on the city clock, not the phone clock', () => {
  assert.equal(c.meetingTimeZone('london-gb', 'Australia/Sydney'), 'Europe/London', 'a Londoner whose phone is still on Sydney time');
  assert.equal(c.meetingTimeZone('sydney', 'Europe/London'), 'Australia/Sydney');
  assert.equal(c.meetingTimeZone('perth', 'Australia/Perth'), 'Australia/Perth');
  assert.equal(c.meetingTimeZone(undefined, 'Asia/Tokyo'), 'Asia/Tokyo', 'the phone only while the city is unknown');
  assert.equal(c.meetingTimeZone('atlantis', null), null);
});

test('search finds a city by the start of its name, region or country, biggest first', () => {
  assert.equal(c.searchCities('').length, 0);
  assert.equal(c.searchCities('   ').length, 0);
  assert.equal(c.searchCities('lon')[0].id, 'london-gb');
  assert.ok(c.searchCities('lon', 8).length <= 8);
  assert.equal(c.searchCities('London, UK')[0].id, 'london-gb');
  assert.equal(c.searchCities('london canada')[0].id, 'london-ca');
  assert.equal(c.searchCities('new york')[0].id, 'new-york-city-us');
  assert.equal(c.searchCities('sao paulo')[0].id, 'sao-paulo-br', 'accents are optional');
  assert.equal(c.searchCities('São Paulo')[0].id, 'sao-paulo-br');
  assert.equal(c.searchCities('zurich')[0].id, 'zuerich-ch');
  assert.equal(c.searchCities('lodz')[0].name, 'Łódź');
  assert.equal(c.searchCities('izmir')[0].name, 'İzmir');
  assert.equal(c.searchCities('xian')[0].name, "Xi'an");
  assert.equal(c.searchCities('syd')[0].id, 'sydney');
  assert.equal(c.searchCities('gold')[0].id, 'gold-coast');
  assert.deepEqual(labels(c.searchCities('springfield')), [
    'Springfield, Missouri, United States', 'Springfield, Massachusetts, United States', 'Springfield, Illinois, United States',
  ]);
  assert.deepEqual(ids(c.searchCities('springfield illinois')), ['springfield-us-il']);
  assert.equal(c.searchCities('paris fr')[0].id, 'paris-fr');
  assert.equal(c.searchCities('qqqzzz').length, 0);
  // A name starting with the query comes before a later word or a country match.
  const sanJose = c.searchCities('san jose', 3).map(city => city.name);
  assert.ok(sanJose.every(name => /^San Jos[eé]/.test(name)), sanJose.join(', '));
});

test('boroughs and districts listed on their own are folded into their city', () => {
  // Discover never crosses a city, so a separate Brooklyn would split New York in two.
  for (const id of ['brooklyn-us', 'queens-us', 'manhattan-us', 'pudong-cn', 'iztapalapa-mx', 'kowloon-hk']) {
    assert.equal(c.isCityId(id), false, id);
  }
  assert.deepEqual(labels(c.searchCities('paris')), ['Paris, France'], 'no Paris arrondissements');
  // Capitals always stay, however small or close to a bigger city.
  for (const id of ['vaduz-li', 'vatican-city-va', 'canberra', 'wellington']) assert.equal(c.isCityId(id), true, id);
});

test('the device time zone suggests its biggest cities, old zone names included', () => {
  assert.equal(c.likelyCity('Australia/Sydney').id, 'sydney');
  assert.ok(ids(c.citiesInTimeZone('Australia/Sydney', 5)).includes('canberra'));
  assert.deepEqual(ids(c.citiesInTimeZone('Australia/Brisbane', 2)), ['brisbane', 'gold-coast']);
  assert.equal(c.likelyCity('Europe/London').id, 'london-gb');
  assert.equal(c.likelyCity('America/New_York').id, 'new-york-city-us');
  assert.equal(c.likelyCity('Pacific/Auckland').id, 'auckland');
  assert.equal(c.likelyCity('Asia/Calcutta').id, c.likelyCity('Asia/Kolkata').id, 'an old alias still finds the city');
  assert.equal(c.likelyCity('Europe/Kiev').id, 'kyiv-ua');
  assert.equal(c.likelyCity('Australia/ACT').id, 'sydney');
  assert.equal(c.citiesInTimeZone('America/New_York', 3).length, 3);
  for (const zone of ['UTC', 'Etc/UTC', 'Middle/Earth', '', null, undefined]) {
    assert.equal(c.likelyCity(zone), null, String(zone));
    assert.equal(c.citiesInTimeZone(zone).length, 0);
  }
});

test('old zone names a phone reports are the same zone as the city list\'s name for it', () => {
  assert.equal(c.canonicalTimeZone('Asia/Calcutta'), 'Asia/Kolkata');
  assert.equal(c.canonicalTimeZone('Europe/Kiev'), 'Europe/Kyiv');
  assert.equal(c.canonicalTimeZone('Asia/Saigon'), 'Asia/Ho_Chi_Minh');
  assert.equal(c.canonicalTimeZone('Europe/Paris'), 'Europe/Paris', 'a current name stays as it is');
  // A plan in Kolkata, Kyiv or Ho Chi Minh City carries the list's zone; the phone may say the old one.
  for (const [city, phone] of [['kolkata-in', 'Asia/Calcutta'], ['kyiv-ua', 'Europe/Kiev'], ['ho-chi-minh-city-vn', 'Asia/Saigon']]) {
    const zone = c.cityTimeZone(city);
    assert.ok(zone, city);
    assert.equal(c.sameTimeZone(zone, phone), true, `${city} on a phone set to ${phone}`);
    assert.equal(c.sameTimeZone(phone, zone), true, 'either way round');
  }
  assert.equal(c.sameTimeZone('Australia/Sydney', 'Australia/ACT'), true);
  assert.equal(c.sameTimeZone('Australia/Sydney', 'Australia/Sydney'), true);
  assert.equal(c.sameTimeZone('Australia/Sydney', 'Australia/Brisbane'), false, 'same offset in winter, still another zone');
  assert.equal(c.sameTimeZone('Australia/Sydney', null), false, 'an unknown phone zone is not the same');
  assert.equal(c.sameTimeZone(undefined, undefined), false);
});

test('folding for search drops case, accents and punctuation', () => {
  assert.equal(c.foldForSearch('São Paulo'), 'sao paulo');
  assert.equal(c.foldForSearch('  Kraków, Poland '), 'krakow poland');
  assert.equal(c.foldForSearch("Xi'an"), 'xian');
  assert.equal(c.foldForSearch('Łódź'), 'lodz');
  assert.equal(c.foldForSearch('Düsseldorf'), 'dusseldorf');
  assert.equal(c.foldForSearch('Ust’-Ilimsk'), 'ust ilimsk');
});

test('the data file is compact and carries its attribution', () => {
  const file = path.resolve(__dirname, '..', 'functions', 'data', 'cities.json');
  assert.ok(fs.statSync(file).size < 600 * 1024, 'small enough to ship in the app bundle');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.match(data.about, /GeoNames/);
  assert.match(data.about, /CC BY 4\.0/);
  assert.deepEqual(data.fields, ['id', 'name', 'country', 'zone', 'population', 'geonameid', 'region']);
});
