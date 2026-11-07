"use strict";

/**
 * Contact details: links, email addresses and phone numbers.
 *
 * Talkeven keeps people on Talkeven until they have met, because that is where blocks and
 * reports work, and moving someone to another app straight away is the first step of most
 * romance and investment scams. So the text a stranger sees before anyone has agreed to
 * anything (a profile's name, bio and neighbourhood, and an invitation's note) may not
 * carry any of these, and a chat message that does, before the pair has a confirmed
 * meetup, comes back with a warning for the sender rather than being refused.
 *
 * Deliberately simple and predictable rather than clever: a person who wants to share a
 * number early can spell it out, and that is fine. The aim is to stop the copy and paste
 * spam, not to win an arms race. Pure: tests/contact-details.test.cjs.
 */

/**
 * Top level domains that count for a bare "name.tld" link. Common ones, link shorteners
 * (bit.ly, t.co, wa.me, t.me, discord.gg) and country codes that are not everyday words,
 * so "ok.so" or "do.it" in a sentence typed without spaces is not mistaken for a link.
 */
const TLDS = [
  "com", "net", "org", "info", "biz", "io", "co", "me", "ly", "gg", "app", "dev", "xyz", "link", "site", "online",
  "live", "page", "chat", "social", "club", "shop", "store", "fun", "top", "vip", "pro", "ai", "tv", "cc", "ws",
  "au", "nz", "uk", "ca", "de", "fr", "jp", "cn", "kr", "ru", "br", "mx", "sg", "hk", "tw", "ph", "vn", "th", "nl",
  "ch", "se", "pl", "pt", "ar", "cl", "za", "ie", "es", "eu",
];

const URL_WITH_SCHEME = /\b(?:https?|ftp):\/\/\S+/i;
const URL_WWW = /\bwww\.[a-z0-9-]+\S*/i;
const BARE_DOMAIN = new RegExp(
  `(?:^|[^a-z0-9@._-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${TLDS.join("|")})(?![a-z0-9-])(?:[/:?#]\\S*)?`,
  "i",
);
const EMAIL = /[a-z0-9._%+-]+\s?@\s?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

/**
 * A run of digit groups joined by at most one space, dot, dash or bracket each, with an
 * optional leading +. Counted as a phone number at 8 to 15 digits (15 is the most E.164
 * allows), unless it is shaped like a date, a range of years or a decimal.
 */
const DIGIT_RUN = /\+?\s?\(?\d+\)?(?:[ .\-]?\(?\d+\)?)*/g;
/** Dates, year ranges and plain decimals are long digit runs that are not phone numbers. */
const NOT_A_PHONE = [
  /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/,
  /^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/,
  /^(?:19|20)\d{2}[-.](?:19|20)\d{2}$/,
  /^\d+\.\d+$/,
];
const MIN_PHONE_DIGITS = 8;
const MAX_PHONE_DIGITS = 15;

function hasPhoneNumber(text) {
  for (const match of text.matchAll(DIGIT_RUN)) {
    const run = match[0].trim();
    const digits = run.replace(/\D/g, "");
    if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) continue;
    if (NOT_A_PHONE.some((shape) => shape.test(run))) continue;
    return true;
  }
  return false;
}

/**
 * Which kinds of contact detail `text` contains, in a fixed order: any of "url", "email"
 * and "phone". Empty when there are none. Full width characters are folded first (NFKC),
 * so "０４１２…" and "＠" are caught like their plain forms.
 */
function findContactDetails(value) {
  if (typeof value !== "string" || !value) return [];
  const text = value.normalize("NFKC");
  const kinds = [];

  const emails = text.match(EMAIL) || [];
  // An address also looks like a domain, so it is taken out before looking for links.
  const withoutEmails = emails.reduce((rest, email) => rest.replace(email, " "), text);

  if (URL_WITH_SCHEME.test(withoutEmails) || URL_WWW.test(withoutEmails) || BARE_DOMAIN.test(withoutEmails)) {
    kinds.push("url");
  }
  if (emails.length > 0) kinds.push("email");
  if (hasPhoneNumber(withoutEmails)) kinds.push("phone");
  return kinds;
}

function hasContactDetails(value) {
  return findContactDetails(value).length > 0;
}

/** Refusing an invitation note. */
const CONTACT_DETAILS_MESSAGE = "Share contact details once you’ve agreed to meet.";

/** Refusing a profile field, by field. */
const PROFILE_FIELD_MESSAGES = {
  displayName: "Use just your name, without links, email addresses or phone numbers.",
  bio: "Take links, email addresses and phone numbers out of your bio. You can share them once you’ve met.",
  area: "Use just your neighbourhood, without links, email addresses or phone numbers.",
};

module.exports = { findContactDetails, hasContactDetails, CONTACT_DETAILS_MESSAGE, PROFILE_FIELD_MESSAGES, TLDS };
