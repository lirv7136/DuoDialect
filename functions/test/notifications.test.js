"use strict";

/** Plan notification wording. Pure: no emulator state is touched. */

const test = require("node:test");
const assert = require("node:assert/strict");
const { describeWhen, invitationNotice, acceptedNotice, reminderNotice, matchNotice } = require("../lib/notifications");

const meeting = { localDate: "2026-09-28", localTime: "18:00", recurrence: "once", venue: "A cafe", timeZone: "Australia/Sydney" };

test("the meeting time reads naturally", () => {
  assert.equal(describeWhen(meeting), "Mon 28 Sep, 18:00");
  assert.equal(describeWhen({ localDate: "bad", localTime: "09:30" }), "09:30");
});

test("invitations name the sender and say whether the plan repeats", () => {
  assert.deepEqual(invitationNotice({ meeting }, "Aiko"), {
    title: "Aiko", body: "Suggested a language swap on Mon 28 Sep, 18:00.",
  });
  assert.equal(invitationNotice({ meeting: { ...meeting, recurrence: "weekly" } }, "Aiko").body,
    "Suggested a weekly language swap on Mon 28 Sep, 18:00.");
  assert.equal(invitationNotice({ meeting }, "  ").title, "A language partner");
});

test("acceptances invite a hello, and never include the venue or note", () => {
  const notice = acceptedNotice({ meeting, note: "private note" }, "Kenji");
  assert.deepEqual(notice, { title: "Kenji", body: "Accepted your plan for Mon 28 Sep, 18:00. Say hello!" });
  assert.equal(JSON.stringify(notice).includes("A cafe"), false);
  assert.equal(JSON.stringify(notice).includes("private note"), false);
});

test("the reminder names the partner and the time, never the place", () => {
  const notice = reminderNotice({ meeting: { localDate: "2026-09-28", localTime: "18:00", venue: "Secret cafe" } }, "Aiko");
  assert.deepEqual(notice, { title: "Aiko tomorrow", body: "Your language swap is tomorrow at 18:00. Open the plan for the place." });
  assert.equal(notice.body.includes("Secret"), false);
  assert.equal(reminderNotice({ meeting: {} }, "").title, "A language partner tomorrow");
});

test("the match notice says who joined and which way the exchange runs", () => {
  assert.deepEqual(matchNotice("Aiko", { theyOffer: ["japanese"], youOffer: ["english"] }), {
    title: "A new language partner",
    body: "Aiko speaks Japanese and is learning English. Take a look.",
  });
  assert.equal(matchNotice("", {}).body, "A language partner fits your exchange. Take a look.");
});
