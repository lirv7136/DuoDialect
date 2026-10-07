"use strict";

/**
 * Meetup reminders: scheduled on acceptance, sent the evening before, once, to both
 * people; weekly plans roll forward; stopped plans and blocks stay quiet.
 *
 * The sweep is a scheduled function, so these tests run lib/reminders.js directly
 * against the emulator with an explicit clock, like the check-in tests.
 */

process.env.DUODIALECT_PUSH_TRANSPORT = "stub";

const test = require("node:test");
const assert = require("node:assert/strict");
const { clearEmulators, shutdown, makeActor, futureMeeting, admin, serverTimestamp } = require("./helpers/env");
const { CAST } = require("./helpers/actors");
const { sweepReminders, reminderTimeFor, firstReminder } = require("../lib/reminders");
const { addDays } = require("../lib/checkins");

const HOUR = 60 * 60 * 1000;
let pairSeq = 0;

async function acceptedPlan({ recurrence = "once", days = 7 } = {}) {
  const suffix = ++pairSeq;
  const speaker = await makeActor(`rem-speaker${suffix}`);
  const learner = await makeActor(`rem-learner${suffix}`);
  await speaker.call("upsertProfile", { ...CAST.alex, displayName: `Speaker ${suffix}` });
  await learner.call("upsertProfile", { ...CAST.aiko, displayName: `Learner ${suffix}` });
  for (const actor of [speaker, learner]) {
    await actor.write(`pushTokens/${actor.uid}`, {
      token: `ExponentPushToken[${actor.uid}]`, platform: "ios", updatedAt: serverTimestamp(),
    });
  }
  const meeting = futureMeeting({ days, recurrence });
  const { invitation } = await speaker.call("createInvitation", {
    toUid: learner.uid, intent: "platonic", requestKey: `rem-${suffix}`, note: "Coffee?", meeting,
  });
  await learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" });
  return { speaker, learner, invitationId: invitation.id, meeting };
}

const invitationDoc = async (id) => (await admin().doc(`invitations/${id}`).get()).data();

async function remindersFor(invitationId) {
  const snap = await admin().collection("pushDeliveries")
    .where("data.type", "==", "plan").where("data.invitationId", "==", invitationId).get();
  return snap.docs.map((doc) => doc.data()).filter((item) => /tomorrow$/.test(item.title));
}

test.before(async () => { await clearEmulators(); });
test.after(async () => { await shutdown(); });

test("reminders are 18:00 local the evening before, and a late acceptance skips to the next occurrence", () => {
  assert.equal(reminderTimeFor("2026-10-10", "Australia/Sydney").toISOString(), "2026-10-09T07:00:00.000Z");
  const meeting = { localDate: "2026-10-10", localTime: "10:00", timeZone: "Australia/Sydney", recurrence: "once" };
  const early = new Date("2026-10-01T00:00:00Z");
  assert.deepEqual(firstReminder(meeting, early), {
    nextReminderAt: reminderTimeFor("2026-10-10", "Australia/Sydney"), nextReminderOccurrence: "2026-10-10",
  });
  const late = new Date("2026-10-09T08:00:00Z");
  assert.deepEqual(firstReminder(meeting, late), { nextReminderAt: null, nextReminderOccurrence: null });
  assert.deepEqual(firstReminder({ ...meeting, recurrence: "weekly" }, late), {
    nextReminderAt: reminderTimeFor("2026-10-17", "Australia/Sydney"), nextReminderOccurrence: "2026-10-17",
  });
});

test("accepting schedules the reminder; the sweep sends it once to both people and clears a one-off plan", async () => {
  const plan = await acceptedPlan();
  const invitation = await invitationDoc(plan.invitationId);
  assert.equal(invitation.nextReminderOccurrence, plan.meeting.localDate);
  assert.equal(
    invitation.nextReminderAt.toDate().toISOString(),
    reminderTimeFor(plan.meeting.localDate, plan.meeting.timeZone).toISOString(),
  );

  const due = invitation.nextReminderAt.toMillis();
  await sweepReminders(admin(), new Date(due - HOUR));
  assert.equal((await remindersFor(plan.invitationId)).length, 0);

  const result = await sweepReminders(admin(), new Date(due + HOUR));
  assert.equal(result.sent, 2);
  const sent = await remindersFor(plan.invitationId);
  assert.equal(sent.length, 2);
  const toSpeaker = sent.find((item) => item.toUid === plan.speaker.uid);
  assert.equal(toSpeaker.title, `Learner ${pairSeq} tomorrow`);
  assert.equal(toSpeaker.body, `Your language swap is tomorrow at ${plan.meeting.localTime}. Open the plan for the place.`);
  assert.equal(toSpeaker.body.includes(plan.meeting.venue), false);
  assert.equal(toSpeaker.data.otherUid, plan.learner.uid);

  assert.equal((await invitationDoc(plan.invitationId)).nextReminderAt, null);
  await sweepReminders(admin(), new Date(due + 2 * HOUR));
  assert.equal((await remindersFor(plan.invitationId)).length, 2);
});

test("a weekly plan is reminded before every occurrence until its check-ins stop", async () => {
  const plan = await acceptedPlan({ recurrence: "weekly" });
  const first = (await invitationDoc(plan.invitationId)).nextReminderAt.toMillis();
  await sweepReminders(admin(), new Date(first + HOUR));
  const after = await invitationDoc(plan.invitationId);
  assert.equal(after.nextReminderOccurrence, addDays(plan.meeting.localDate, 7));
  assert.equal(after.nextReminderAt.toMillis(), reminderTimeFor(after.nextReminderOccurrence, plan.meeting.timeZone).getTime());
  assert.equal((await remindersFor(plan.invitationId)).length, 2);

  await admin().doc(`invitations/${plan.invitationId}`).update({ checkInsStopped: "inactive" });
  await sweepReminders(admin(), new Date(after.nextReminderAt.toMillis() + HOUR));
  assert.equal((await remindersFor(plan.invitationId)).length, 2);
  assert.equal((await invitationDoc(plan.invitationId)).nextReminderAt, null);
});

test("a block silences the reminder", async () => {
  const plan = await acceptedPlan();
  await plan.learner.call("setBlock", { otherUid: plan.speaker.uid, blocked: true });
  const due = (await invitationDoc(plan.invitationId)).nextReminderAt;
  if (due) await sweepReminders(admin(), new Date(due.toMillis() + HOUR));
  assert.equal((await remindersFor(plan.invitationId)).length, 0);
});
