"use strict";

/**
 * The part of the stats snapshot that needs every profile, without a database: members
 * per city, language pairs from both sides, who has nobody to meet, and who counts as
 * active (only the person who acted).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { summarisePeople, activeMembers, localDay, TOP_PAIRS, TOP_CITIES } = require("../lib/stats");

const NOW = Date.parse("2026-11-06T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function person(uid, offers, seeks, extra = {}) {
  return { uid, city: "sydney", offers, seeks, discoverable: true, createdAt: NOW - 2 * DAY, ...extra };
}

test("pairs count both sides, and a member with nobody reciprocal in their city is unmatched", () => {
  const people = [
    person("alex", ["english"], ["japanese"]),
    person("aiko", ["japanese"], ["english"]),
    person("ren", ["japanese"], ["english"]),
    person("sam", ["spanish"], ["french"]),
    // Speaks Japanese and learns English, but in Melbourne: no partner there.
    person("mia", ["japanese"], ["english"], { city: "melbourne" }),
    // Not discoverable: counted as a member, never as a match or as unmatched.
    person("hid", ["english"], ["japanese"], { discoverable: false, createdAt: NOW - 40 * DAY }),
  ];
  const summary = summarisePeople(people, {
    activeUids: new Set(["alex", "aiko"]),
    since30: NOW - 30 * DAY,
    meetups: [{ participants: ["aiko", "alex"], languages: ["japanese", "english"] }],
  });

  assert.equal(summary.unmatched, 2, "sam and mia");
  assert.deepEqual(summary.cities.map((c) => [c.id, c.members, c.active7, c.new30, c.unmatched]), [
    ["sydney", 5, 2, 4, 1],
    ["melbourne", 1, 0, 1, 1],
  ]);
  assert.equal(summary.cities[0].name, "Sydney, Australia", "named with the country");
  assert.equal(summary.cities[1].name, "Melbourne, Australia");

  const sydneyJaEn = summary.pairs.find((p) => p.city === "sydney" && p.a === "english" && p.b === "japanese");
  assert.deepEqual(sydneyJaEn, { city: "sydney", a: "english", b: "japanese", aSide: 1, bSide: 2, meetups: 1 });
  const frEs = summary.pairs.find((p) => p.a === "french" && p.b === "spanish");
  assert.deepEqual(frEs, { city: "sydney", a: "french", b: "spanish", aSide: 0, bSide: 1, meetups: 0 });
  assert.equal(summary.pairs[0], sydneyJaEn, "the pair with the most on its scarce side comes first");
});

test("several languages on each side, an old profile without a city, and the pair cap", () => {
  const people = [
    person("a", ["english", "french"], ["japanese"], { city: undefined }),
    person("b", ["japanese"], ["french"]),
  ];
  const summary = summarisePeople(people);
  assert.equal(summary.unmatched, 0, "b gives Japanese and wants French, which a gives");
  assert.equal(summary.cities[0].id, "sydney");

  const many = [];
  for (let i = 0; i < TOP_PAIRS + 10; i += 1) many.push(person(`p${i}`, [`lang${i}`], ["english"]));
  assert.equal(summarisePeople(many).pairs.length, TOP_PAIRS);
});

test("the snapshot day is the Sydney date", () => {
  assert.equal(localDay(new Date("2026-11-05T14:00:00Z")), "2026-11-06");
  assert.equal(localDay(new Date("2026-11-05T12:00:00Z")), "2026-11-05");
});

test("only the top cities by members are kept, and the snapshot says when there were more", () => {
  const people = [];
  for (let i = 0; i < TOP_CITIES + 5; i += 1) {
    // City i has i + 1 members, so the biggest are the last ones made.
    for (let j = 0; j <= i; j += 1) people.push(person(`c${i}m${j}`, ["english"], ["japanese"], { city: `city${i}` }));
  }
  const summary = summarisePeople(people);
  assert.equal(summary.cities.length, TOP_CITIES);
  assert.equal(summary.citiesTruncated, true);
  assert.equal(summary.cities[0].id, `city${TOP_CITIES + 4}`);
  assert.equal(summary.cities[0].members, TOP_CITIES + 5);
  assert.equal(summary.cities[TOP_CITIES - 1].members, 6, "the five smallest cities are left out");
  assert.equal(summary.unmatched, people.length, "the totals still count every city");

  assert.equal(summarisePeople([person("a", ["english"], ["japanese"])]).citiesTruncated, false);
});

test("only the person who acted is active, never the other side", () => {
  const since = NOW - 7 * DAY;
  const inside = NOW - DAY;
  const before = NOW - 8 * DAY;
  const active = activeMembers({
    profiles: [
      { uid: "edited", lastEditedAt: inside, updatedAt: inside },
      // A moderator suspended them: updatedAt moved, their own last edit did not.
      { uid: "suspended", lastEditedAt: before, updatedAt: inside },
      // Saved before lastEditedAt existed, so updatedAt is all there is.
      { uid: "legacy", updatedAt: inside },
      { uid: "stale-legacy", updatedAt: before },
      { uid: "never-edited", lastEditedAt: null, updatedAt: inside },
    ],
    invitations: [
      // Sent in the window and not answered: the sender only, not the recipient.
      { fromUid: "sender", createdAt: inside, respondedBy: undefined, respondedAt: null },
      // Sent earlier, accepted in the window: the person who accepted only.
      { fromUid: "old-sender", createdAt: before, respondedBy: "accepter", respondedAt: inside },
      // Sent and answered earlier; something else moved updatedAt.
      { fromUid: "quiet-sender", createdAt: before, respondedBy: "quiet-answerer", respondedAt: before },
    ],
    conversations: [
      // The latest message was sent in the window; the recipient has not opened it.
      { lastMessageFromUid: "writer", lastMessageAt: inside, readAt: { reader: before } },
      // An old last message; the other side read it in the window.
      { lastMessageFromUid: "old-writer", lastMessageAt: before, readAt: { "late-reader": inside, "old-writer": before } },
      // From before lastMessageAt existed: the sender is not credited from the message.
      { lastMessageFromUid: "legacy-writer", lastMessageAt: null, readAt: {} },
    ],
  }, since);
  assert.deepEqual([...active].sort(), ["accepter", "edited", "late-reader", "legacy", "sender", "writer"]);
  assert.equal(activeMembers({}, since).size, 0);
});
