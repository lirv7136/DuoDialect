const test = require('node:test');
const assert = require('node:assert/strict');
// The server's own detector (functions/lib), which has no dependencies, run directly.
const { findContactDetails, hasContactDetails, PROFILE_FIELD_MESSAGES } = require('../functions/lib/contact-details.js');

const kinds = text => [...findContactDetails(text)];

test('ordinary plan and profile text has no contact details', () => {
  for (const text of [
    'Coffee and a language swap?',
    'Thursday 18:30 at the cafe near Central?',
    'See you on 2026-11-07 at 18:30',
    '07/11/2026 works for me',
    '7.11.2026 then',
    'Meet at 6.30pm near Circular Quay',
    'Learning Japanese since 2019-2023, then a break',
    'Room 12, level 3',
    'I paid $1,250,000 for it, can you believe',
    'Pi is 3.14159265, more or less',
    'e.g. coffee, i.e. not dinner',
    'ok.so I think Saturday works',
    'St. Kilda at 10',
    'I live near 123 George St',
    'See you @ 6pm',
    'Find me as @aiko_san',
    '',
  ]) assert.deepEqual(kinds(text), [], text);
  assert.deepEqual(kinds(undefined), []);
  assert.deepEqual(kinds(42), []);
});

test('phone numbers are found in the usual shapes, at 8 to 15 digits', () => {
  for (const text of [
    'Call me on 0412 345 678',
    '0412345678',
    '+61 412 345 678',
    '+61412345678',
    'My number: (02) 9876 5432',
    'Text 0412-345-678 any time',
    'US: 555.123.4567',
    'HK 9123 4567',
    'Spaced out: 0 4 1 2 3 4 5 6 7 8',
    // Full width digits are folded first.
    '０４１２ ３４５ ６７８',
  ]) assert.deepEqual(kinds(text), ['phone'], text);
  assert.deepEqual(kinds('Only 7 digits: 123 4567'), []);
  assert.deepEqual(kinds('Sixteen digits 1234 5678 9012 3456'), [], 'longer than any phone number');
});

test('links are found with a scheme, with www, or as a bare domain on a known ending', () => {
  for (const text of [
    'https://instagram.com/aiko',
    'http://example.org/page?x=1',
    'www.example.org',
    'my site is aiko.dev',
    'google.com.au',
    'bit.ly/abc',
    't.me/aiko',
    'discord.gg/xyz',
    'Message me: wa.me/aiko',
  ]) assert.deepEqual(kinds(text), ['url'], text);
});

test('email addresses are found, including with spaces or a full width at sign', () => {
  for (const text of ['text me at aiko@gmail.com', 'aiko.san+talk@mail.example.co.uk', 'aiko @ gmail.com', 'aiko＠gmail．com']) {
    assert.deepEqual(kinds(text), ['email'], text);
  }
});

test('several kinds come back once each, in a fixed order', () => {
  assert.deepEqual(kinds('aiko@gmail.com or 0412 345 678 or https://x.com/aiko'), ['url', 'email', 'phone']);
  assert.deepEqual(kinds('wa.me/61412345678'), ['url', 'phone']);
  assert.equal(hasContactDetails('Coffee?'), false);
  assert.equal(hasContactDetails('0412 345 678'), true);
});

test('every refused profile field has its own plain message', () => {
  assert.deepEqual(Object.keys(PROFILE_FIELD_MESSAGES).sort(), ['area', 'bio', 'displayName']);
  for (const message of Object.values(PROFILE_FIELD_MESSAGES)) assert.match(message, /links, email addresses (or|and) phone numbers/);
});
