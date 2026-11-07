"use strict";

/**
 * Discovery near misses: an empty first page says who almost matches and why, and how
 * many people want what the caller offers. Nothing private leaves the server, blocks
 * hide people, and a page with partners carries no near misses.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { clearEmulators, shutdown, makeActor } = require("./helpers/env");
const { CAST } = require("./helpers/actors");

let alex, mei, sam, aiko;

test.before(async () => {
  await clearEmulators();
  alex = await makeActor("nm-alex");
  mei = await makeActor("nm-mei");
  sam = await makeActor("nm-sam");
  aiko = await makeActor("nm-aiko");
  await alex.call("upsertProfile", CAST.alex); // English native, learning Japanese
  await mei.call("upsertProfile", CAST.mei);   // Japanese intermediate only, learning English
  await sam.call("upsertProfile", CAST.sam);   // Spanish native, learning French
});
test.after(async () => { await shutdown(); });

test("an empty Discover explains who almost matches, and counts who wants your language", async () => {
  const result = await alex.call("discoverCandidates", { mode: "platonic", limit: 20 });
  assert.deepEqual(result.candidates, []);
  assert.equal(result.nextCursor, null);

  const miss = result.nearMisses.find((item) => item.uid === mei.uid);
  assert.ok(miss, "Mei wants English and has some Japanese");
  assert.equal(miss.reason, "language/insufficient-fluency");
  assert.deepEqual(Object.keys(miss).sort(), ["area", "displayName", "offers", "photos", "reason", "seeks", "uid"]);
  assert.equal(result.nearMisses.some((item) => item.uid === sam.uid), false, "Sam wants nothing Alex offers");
  assert.equal(result.nearMisses.some((item) => item.uid === alex.uid), false);
  assert.equal(result.learningYourLanguage, 1);
});

test("a block hides the near miss and leaves the count", async () => {
  await mei.call("setBlock", { otherUid: alex.uid, blocked: true });
  const blocked = await alex.call("discoverCandidates", { mode: "platonic", limit: 20 });
  assert.equal(blocked.nearMisses.some((item) => item.uid === mei.uid), false);
  await mei.call("setBlock", { otherUid: alex.uid, blocked: false });

  await alex.call("setBlock", { otherUid: mei.uid, blocked: true });
  const mine = await alex.call("discoverCandidates", { mode: "platonic", limit: 20 });
  assert.equal(mine.nearMisses.some((item) => item.uid === mei.uid), false);
  assert.equal(mine.learningYourLanguage, 0);
  await alex.call("setBlock", { otherUid: mei.uid, blocked: false });
});

test("a page with partners carries no near misses", async () => {
  await aiko.call("upsertProfile", CAST.aiko); // Japanese fluent, learning English
  const result = await alex.call("discoverCandidates", { mode: "platonic", limit: 20 });
  assert.ok(result.candidates.some((item) => item.uid === aiko.uid));
  assert.equal(result.nearMisses, undefined);
  assert.equal(result.learningYourLanguage, undefined);
});
