const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const exchange = load('src/domain/language-exchange.ts');
const { LANGUAGES, POPULAR_LANGUAGES, displayLanguage, isListedLanguage, searchLanguages } =
  load('src/domain/languages.ts', { './language-exchange': exchange });

test('about forty languages, each listed once regardless of case', () => {
  assert.ok(LANGUAGES.length >= 38 && LANGUAGES.length <= 50, `${LANGUAGES.length} languages`);
  const keys = LANGUAGES.map(option => option.name.toLocaleLowerCase('en'));
  assert.equal(new Set(keys).size, keys.length);
  for (const option of LANGUAGES) {
    assert.equal(option.name, option.name.trim());
    assert.ok(option.name.length <= 40, option.name);
    assert.match(option.name, /^\p{Lu}/u, `${option.name} is capitalised for display`);
  }
});

test('the languages common in Sydney are all present, and popular ones are listed', () => {
  for (const name of ['English', 'Mandarin', 'Cantonese', 'Japanese', 'Korean', 'Spanish', 'Portuguese', 'French', 'Italian',
    'German', 'Vietnamese', 'Thai', 'Indonesian', 'Hindi', 'Arabic', 'Greek', 'Turkish', 'Russian', 'Filipino', 'Nepali',
    'Bengali', 'Punjabi', 'Urdu', 'Tamil', 'Persian', 'Polish', 'Dutch', 'Swedish', 'Hebrew', 'Malay', 'Auslan']) {
    assert.ok(isListedLanguage(name), name);
  }
  for (const name of POPULAR_LANGUAGES) assert.ok(isListedLanguage(name), name);
});

test('stored lower case names display capitalised; unlisted names are kept', () => {
  assert.equal(displayLanguage('japanese'), 'Japanese');
  assert.equal(displayLanguage('  AUSLAN '), 'Auslan');
  assert.equal(displayLanguage('klingon'), 'Klingon');
  assert.equal(displayLanguage(''), '');
  // Matching compares lower cased names, so a picked name matches older free text.
  assert.equal(exchange.normalizeLanguage('Japanese'), exchange.normalizeLanguage(' japanese'));
});

test('search is case insensitive, uses aliases and puts prefix matches first', () => {
  assert.equal(searchLanguages('jap')[0].name, 'Japanese');
  assert.equal(searchLanguages('TAGALOG')[0].name, 'Filipino');
  assert.equal(searchLanguages('farsi')[0].name, 'Persian');
  assert.ok(searchLanguages('chinese').map(o => o.name).includes('Cantonese'));
  assert.equal(searchLanguages('espanol')[0].name, 'Spanish');
  assert.equal(searchLanguages('sign')[0].name, 'Auslan');
  assert.equal(searchLanguages('zzzz').length, 0);
  assert.equal(searchLanguages('').length, LANGUAGES.length);
  const names = searchLanguages('', ['english', 'Japanese']).map(o => o.name);
  assert.ok(!names.includes('English') && !names.includes('Japanese'));
});
