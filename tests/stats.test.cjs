const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const languages = load('src/domain/languages.ts', { './language-exchange': load('src/domain/language-exchange.ts') });
const s = load('src/domain/stats.ts', {
  './cities': load('src/domain/cities.ts'),
  './languages': languages,
  './schedule': load('src/domain/schedule.ts'),
});

const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);

test('a partial response fills in empty lists and a disconnected App Store', () => {
  same(s.normaliseStats(null), { latest: null, history: [], appStore: { lastSyncAt: null, lastError: null, days: [] } });
  same(s.normaliseStats({ latest: null, history: [], appStore: { lastSyncAt: 5, lastError: '', days: [] } }).appStore,
    { lastSyncAt: 5, lastError: null, days: [] }, 'an empty error string is no error');
  const day = { day: '2026-11-04', downloads: 3, redownloads: 1, updates: 7 };
  same(s.normaliseStats({ history: [{ day: '2026-11-05' }], appStore: { lastSyncAt: 1, lastError: 'Key expired', days: [day] } }),
    { latest: null, history: [{ day: '2026-11-05' }], appStore: { lastSyncAt: 1, lastError: 'Key expired', days: [day] } });
});

test('percentages round to whole numbers and never divide by zero', () => {
  assert.equal(s.percent(1, 3), 33);
  assert.equal(s.percent(2, 3), 67);
  assert.equal(s.percent(0, 0), null);
  assert.equal(s.percent(5, 0), null);
  assert.equal(s.percentLabel(9, 10), '90%');
  assert.equal(s.percentLabel(3, 0), '–');
  assert.equal(s.formatPercent(15), '15%');
  assert.equal(s.formatPercent(null), '–');
});

test('onboarding completion and the active share come from the snapshot', () => {
  assert.equal(s.onboardingRate({ total: 40, withProfile: 30, withoutProfile: 10 }), 75);
  assert.equal(s.onboardingRate({ total: 0, withProfile: 0, withoutProfile: 0 }), null);
  assert.equal(s.activeShare({ total: 80, active7: 20 }), 25);
});

test('counts read with thousands separators and plurals', () => {
  assert.equal(s.formatCount(0), '0');
  assert.equal(s.formatCount(999), '999');
  assert.equal(s.formatCount(1234567), '1,234,567');
  assert.equal(s.formatCount(-4200), '-4,200');
  assert.equal(s.formatCount(NaN), '–');
  assert.equal(s.plural(1, 'meetup'), '1 meetup');
  assert.equal(s.plural(0, 'meetup'), '0 meetups');
  assert.equal(s.plural(2400, 'person', 'people'), '2,400 people');
  assert.equal(s.newThisWeek(3), '+3 this week');
  assert.equal(s.newThisWeek(0), 'None new this week');
});

test('the funnel runs accounts, onboarding, discoverable, meetup with both percentages', () => {
  const steps = s.funnel({
    accounts: { total: 200, withProfile: 150, withoutProfile: 50 },
    members: { discoverable: 120, withMeetup: 30 },
  });
  same(steps.map(step => step.label), ['Accounts', 'Finished onboarding', 'Discoverable', 'Had a meetup']);
  same(steps.map(step => step.count), [200, 150, 120, 30]);
  same(steps.map(step => step.ofTotal), [100, 75, 60, 15]);
  same(steps.map(step => step.ofPrevious), [null, 75, 80, 25]);
  const empty = s.funnel({ accounts: { total: 0, withProfile: 0, withoutProfile: 0 }, members: { discoverable: 0, withMeetup: 0 } });
  same(empty.map(step => step.ofTotal), [null, null, null, null]);
});

test('App Store totals cover the days up to the newest report, not every row', () => {
  const days = [
    { day: '2026-11-04', downloads: 5, redownloads: 1, updates: 10 },
    { day: '2026-11-02', downloads: 3, redownloads: 0, updates: 4 },
    { day: '2026-10-29', downloads: 2, redownloads: 2, updates: 1 },
    { day: '2026-10-28', downloads: 7, redownloads: 0, updates: 0 },
    { day: '2026-10-06', downloads: 100, redownloads: 9, updates: 9 },
    { day: '2026-10-05', downloads: 1000, redownloads: 90, updates: 90 },
  ];
  same(s.appStoreTotals(days, 7), { downloads: 10, redownloads: 3, updates: 15, days: 3, through: '2026-11-04' },
    '29 Oct is the 7th day to 4 Nov; 28 Oct is the 8th');
  same(s.appStoreTotals(days, 30), { downloads: 117, redownloads: 12, updates: 24, days: 5, through: '2026-11-04' },
    '6 Oct is the 30th day to 4 Nov; 5 Oct is the 31st');
  same(s.appStoreTotals([], 7), { downloads: 0, redownloads: 0, updates: 0, days: 0, through: null });
  same(s.appStoreTotals([{ day: 'nonsense', downloads: 9, redownloads: 0, updates: 0 }], 7).through, null);
  assert.equal(s.appStoreTotals([...days].reverse(), 7).through, '2026-11-04', 'order does not matter');
});

test('App Store is connected once a sync has run', () => {
  assert.equal(s.appStoreConnected({ lastSyncAt: null }), false);
  assert.equal(s.appStoreConnected({ lastSyncAt: 0 }), true);
  assert.equal(s.appStoreConnected({ lastSyncAt: 1762400000000 }), true);
});

test('the updated label counts minutes, hours, then days', () => {
  const now = Date.UTC(2026, 10, 6, 12, 0);
  const ago = minutes => now - minutes * 60_000;
  assert.equal(s.updatedLabel(now, now), 'Updated just now');
  assert.equal(s.updatedLabel(now + 90_000, now), 'Updated just now', 'a clock ahead of ours is not negative');
  assert.equal(s.updatedLabel(ago(0.5), now), 'Updated just now');
  assert.equal(s.updatedLabel(ago(1), now), 'Updated 1 minute ago');
  assert.equal(s.updatedLabel(ago(12), now), 'Updated 12 minutes ago');
  assert.equal(s.updatedLabel(ago(60), now), 'Updated 1 hour ago');
  assert.equal(s.updatedLabel(ago(185), now), 'Updated 3 hours ago');
  assert.equal(s.updatedLabel(ago(60 * 24 * 2 + 5), now), 'Updated 2 days ago');
  assert.equal(s.timeAgo(ago(5), now), '5 minutes ago');
});

test('days shorten for chart ends', () => {
  assert.equal(s.shortDay('2026-11-04'), '4 Nov');
  assert.equal(s.shortDay('2026-01-31'), '31 Jan');
  assert.equal(s.shortDay('soon'), 'soon');
});

test('a city in the stats reads by name, whether the server sent an id or a name', () => {
  const cities = [{ id: 'sydney', name: 'Sydney' }, { id: 'atlantis', name: 'Atlantis' }];
  assert.equal(s.statsCityName('sydney', cities), 'Sydney');
  assert.equal(s.statsCityName('atlantis', cities), 'Atlantis', 'the snapshot list knows cities the app may not');
  assert.equal(s.statsCityName('gold-coast'), 'Gold Coast, Australia', 'falls back to the app list, with the country');
  assert.equal(s.statsCityName('london-gb'), 'London, United Kingdom');
  assert.equal(s.statsCityName('Sydney', cities), 'Sydney', 'a name passes through');
});

test('a language pair reads both ways and marks the scarce side', () => {
  const pair = { city: 'sydney', a: 'english', b: 'japanese', aSide: 5, bSide: 2, meetups: 3 };
  assert.equal(s.pairTitle(pair), 'English ⇄ Japanese');
  const [a, b] = s.pairSides(pair);
  same(a, { count: 5, text: '5 speak English learning Japanese', scarce: false });
  same(b, { count: 2, text: '2 speak Japanese learning English', scarce: true });
  assert.equal(s.pairSummary(pair),
    'English ⇄ Japanese — 5 speak English learning Japanese · 2 speak Japanese learning English · 3 meetups');
  const even = s.pairSides({ a: 'french', b: 'korean', aSide: 4, bSide: 4 });
  same(even.map(side => side.scarce), [false, false], 'equal sides mark neither');
  assert.equal(s.pairSummary({ city: 'perth', a: 'auslan', b: 'xhosa', aSide: 0, bSide: 1, meetups: 1 }),
    'Auslan ⇄ Xhosa — 0 speak Auslan learning Xhosa · 1 speak Xhosa learning Auslan · 1 meetup');
});

test('pairs group by city in the city list order, keeping the server order inside', () => {
  const cities = [{ id: 'melbourne', name: 'Melbourne' }, { id: 'sydney', name: 'Sydney' }];
  const pairs = [
    { city: 'sydney', a: 'english', b: 'japanese', aSide: 9, bSide: 8, meetups: 0 },
    { city: 'melbourne', a: 'english', b: 'korean', aSide: 4, bSide: 4, meetups: 1 },
    { city: 'hobart', a: 'english', b: 'french', aSide: 3, bSide: 3, meetups: 0 },
    { city: 'sydney', a: 'english', b: 'mandarin', aSide: 2, bSide: 7, meetups: 2 },
  ];
  const groups = s.pairsByCity(pairs, cities);
  same(groups.map(group => group.name), ['Melbourne', 'Sydney', 'Hobart, Australia']);
  same(groups[1].pairs.map(pair => pair.b), ['japanese', 'mandarin']);
  same(s.pairsByCity([], cities), []);
});

test('history becomes an oldest first series scaled from zero', () => {
  const history = [
    { day: '2026-11-06', accounts: 30, members: 20, active7: 8, plans: 5, meetups: 1 },
    { day: '2026-11-05', accounts: 28, members: 18, active7: 6, plans: 4, meetups: 1 },
    { day: 'bad', accounts: 1, members: 99, active7: 1, plans: 0, meetups: 0 },
    { day: '2026-11-01', accounts: 20, members: 10, active7: 0, plans: 2, meetups: 0 },
  ];
  const members = s.historySeries(history, 'members');
  same(members.points.map(point => point.day), ['2026-11-01', '2026-11-05', '2026-11-06']);
  assert.equal(members.max, 20);
  same(members.points.map(point => point.ratio), [0.5, 0.9, 1]);
  assert.equal(members.first.value, 10);
  assert.equal(members.last.value, 20);
  assert.equal(s.seriesChange(members), '10 → 20 over 6 days');
  const active = s.historySeries(history, 'active7');
  assert.equal(active.points[0].ratio, 0);
  const none = s.historySeries([], 'members');
  same(none, { points: [], max: 0, first: null, last: null });
  assert.equal(s.seriesChange(none), '');
  assert.equal(s.seriesChange(s.historySeries([history[0]], 'members')), '20');
  same(s.historySeries([{ day: '2026-11-06', members: 0 }], 'members').points[0].ratio, 0, 'all zeros stay flat');
});
