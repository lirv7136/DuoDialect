"use strict";

/**
 * Post meetup check-ins: scheduling on acceptance, the sweep, answering, privacy,
 * mutual confirmation, weekly plans, blocks and account deletion.
 *
 * The sweep is a scheduled function, which the emulator does not fire on its own, so
 * these tests run lib/checkins.js directly against the emulator through the Admin SDK
 * with an explicit clock. Push delivery is forced to the stub transport first, so the
 * sweep can never reach a real device from here.
 */

process.env.DUODIALECT_PUSH_TRANSPORT = "stub";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clearEmulators, shutdown, makeActor, expectFailure, expectDenied, futureMeeting,
  admin, where, serverTimestamp,
} = require("./helpers/env");
const { CAST } = require("./helpers/actors");
const {
  sweepCheckIns, checkInTimeFor, addDays, checkInId, meetupId, ANSWER_WINDOW_MS, MAX_QUIET_OCCURRENCES,
} = require("../lib/checkins");
const { checkInNotice } = require("../lib/notifications");

const HOUR = 60 * 60 * 1000;
let pairSeq = 0;

/** A fresh reciprocal pair with push tokens and an accepted plan. */
async function acceptedPlan({ recurrence = "once", days = 7 } = {}) {
  const suffix = ++pairSeq;
  const speaker = await makeActor(`chk-speaker${suffix}`);
  const learner = await makeActor(`chk-learner${suffix}`);
  await speaker.call("upsertProfile", { ...CAST.alex, displayName: `Speaker ${suffix}` });
  await learner.call("upsertProfile", { ...CAST.aiko, displayName: `Learner ${suffix}` });
  for (const actor of [speaker, learner]) {
    await actor.write(`pushTokens/${actor.uid}`, {
      token: `ExponentPushToken[${actor.uid}]`, platform: "ios", updatedAt: serverTimestamp(),
    });
  }
  const meeting = futureMeeting({ days, recurrence });
  const { invitation } = await speaker.call("createInvitation", {
    toUid: learner.uid, intent: "platonic", requestKey: `chk-${suffix}`, note: "Coffee?", meeting,
  });
  const accepted = await learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" });
  return { speaker, learner, invitationId: invitation.id, meeting, conversationId: accepted.conversationId };
}

async function invitationDoc(id) {
  return (await admin().doc(`invitations/${id}`).get()).data();
}

/** Runs the sweep an hour after the plan's next check-in is due. */
async function sweepWhenDue(invitationId, extraMs = HOUR) {
  const invitation = await invitationDoc(invitationId);
  const now = new Date(invitation.nextCheckInAt.toMillis() + extraMs);
  return { now, result: await sweepCheckIns(admin(), now) };
}

const idFor = (plan, actor, localDate = plan.meeting.localDate) => checkInId(plan.invitationId, localDate, actor.uid);

test.before(async () => { await clearEmulators(); });
test.after(async () => { await shutdown(); });

test("check-ins arrive at 10:00 local time the next day, across a daylight saving change", () => {
  assert.equal(addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(addDays("2026-12-31", 7), "2027-01-07");
  // Sydney is UTC+10 before 4 Oct 2026 and UTC+11 from then.
  assert.equal(checkInTimeFor("2026-09-20", "Australia/Sydney").toISOString(), "2026-09-21T00:00:00.000Z");
  assert.equal(checkInTimeFor("2026-10-03", "Australia/Sydney").toISOString(), "2026-10-03T23:00:00.000Z");
});

test("the check-in notice asks, names the partner and the day, and reveals nothing else", () => {
  const notice = checkInNotice({ occurrence: { localDate: "2026-09-28" }, answer: { happened: "no" } }, "Aiko");
  assert.deepEqual(notice, { title: "How did your swap go?", body: "Did you meet Aiko on Mon 28 Sep? Tap to check in." });
  assert.equal(checkInNotice({ occurrence: { localDate: "2026-09-28" } }, "").body.includes("A language partner"), true);
});

test("accepting a plan schedules its first check-in, and a pending one schedules nothing", async () => {
  const plan = await acceptedPlan();
  const invitation = await invitationDoc(plan.invitationId);
  assert.equal(invitation.nextCheckInOccurrence, plan.meeting.localDate);
  assert.equal(
    invitation.nextCheckInAt.toDate().toISOString(),
    checkInTimeFor(plan.meeting.localDate, plan.meeting.timeZone).toISOString(),
  );

  const { invitation: pending } = await plan.speaker.call("createInvitation", {
    toUid: plan.learner.uid, intent: "platonic", requestKey: `pending-${pairSeq}`, meeting: futureMeeting({ days: 9 }),
  });
  assert.equal((await invitationDoc(pending.id)).nextCheckInAt, undefined);
});

test("nothing is created before it is due; once due, each person gets one private check-in and a push", async () => {
  const plan = await acceptedPlan();
  const invitation = await invitationDoc(plan.invitationId);

  const early = await sweepCheckIns(admin(), new Date(invitation.nextCheckInAt.toMillis() - HOUR));
  assert.equal((await admin().doc(`checkIns/${idFor(plan, plan.speaker)}`).get()).exists, false);
  assert.equal(early.created >= 0, true);

  const { now } = await sweepWhenDue(plan.invitationId);

  const mine = await plan.speaker.read(`checkIns/${idFor(plan, plan.speaker)}`);
  assert.equal(mine.exists(), true);
  assert.equal(mine.get("status"), "open");
  assert.equal(mine.get("otherUid"), plan.learner.uid);
  assert.equal(mine.get("conversationId"), plan.conversationId);
  assert.deepEqual(mine.get("languages"), { gave: "english", received: "japanese" });
  assert.equal(mine.get("expiresAt").toMillis(), mine.get("dueAt").toMillis() + ANSWER_WINDOW_MS);

  const theirs = await plan.learner.read(`checkIns/${idFor(plan, plan.learner)}`);
  assert.deepEqual(theirs.get("languages"), { gave: "japanese", received: "english" });

  // Neither can read the other's, and a list must be filtered to their own.
  await expectDenied(plan.speaker.read(`checkIns/${idFor(plan, plan.learner)}`), "reading the partner's check-in");
  await expectDenied(plan.speaker.readAll("checkIns"), "listing every check-in");
  const listed = await plan.speaker.readAll("checkIns", where("uid", "==", plan.speaker.uid));
  assert.deepEqual(listed.docs.map((doc) => doc.id), [idFor(plan, plan.speaker)]);

  const pushes = await admin().collection("pushDeliveries")
    .where("data.type", "==", "checkIn").where("data.invitationId", "==", plan.invitationId).get();
  assert.equal(pushes.size, 2);
  const toSpeaker = pushes.docs.find((doc) => doc.get("toUid") === plan.speaker.uid);
  assert.equal(toSpeaker.get("transport"), "stub", "tests must never use the real transport");
  assert.equal(toSpeaker.get("title"), "How did your swap go?");
  assert.match(toSpeaker.get("body"), new RegExp(`^Did you meet Learner ${pairSeq} on `));
  assert.equal(toSpeaker.get("data").checkInId, idFor(plan, plan.speaker));

  // A one-off plan is done, and a second sweep creates nothing more.
  const after = await invitationDoc(plan.invitationId);
  assert.equal(after.nextCheckInAt, null);
  assert.equal(after.lastCheckInOccurrence, plan.meeting.localDate);
  await sweepCheckIns(admin(), new Date(now.getTime() + HOUR));
  const again = await admin().collection("pushDeliveries")
    .where("data.type", "==", "checkIn").where("data.invitationId", "==", plan.invitationId).get();
  assert.equal(again.size, 2);
});

test("clients cannot write check-ins or read the server only records", async () => {
  const plan = await acceptedPlan();
  await sweepWhenDue(plan.invitationId);
  await expectDenied(
    plan.speaker.patch(`checkIns/${idFor(plan, plan.speaker)}`, { status: "answered" }),
    "writing a check-in directly",
  );
  await expectDenied(
    plan.speaker.read(`confirmedMeetups/${meetupId(plan.invitationId, plan.meeting.localDate)}`),
    "reading a confirmed meetup",
  );
  await expectDenied(plan.speaker.readAll("checkInMutes"), "reading check-in mutes");
});

test("only the owner can answer, answers are validated, and a changed mind replaces the answer", async () => {
  const plan = await acceptedPlan();
  await sweepWhenDue(plan.invitationId);
  const mine = idFor(plan, plan.speaker);

  await expectFailure(plan.speaker.call("answerCheckIn", { checkInId: mine, happened: "maybe" }), "invalid-argument");
  await expectFailure(plan.speaker.call("answerCheckIn", { checkInId: mine }), "invalid-argument");
  const stranger = await expectFailure(
    plan.learner.call("answerCheckIn", { checkInId: mine, happened: "yes" }), "not-found",
  );
  assert.equal(stranger.details.reason, "checkin/not-found");

  const first = await plan.speaker.call("answerCheckIn", { checkInId: mine, happened: "yes", meetAgain: "yes" });
  assert.equal(first.changed, true);
  assert.deepEqual(first.checkIn.answer, { happened: "yes", meetAgain: "yes" });
  const repeat = await plan.speaker.call("answerCheckIn", { checkInId: mine, happened: "yes", meetAgain: "yes" });
  assert.equal(repeat.changed, false);

  await plan.speaker.call("answerCheckIn", { checkInId: mine, happened: "no" });
  const stored = await plan.speaker.read(`checkIns/${mine}`);
  assert.deepEqual(stored.get("answer"), { happened: "no", meetAgain: null });
  assert.equal(stored.get("status"), "answered");
});

test("a closed check-in cannot be answered", async () => {
  const plan = await acceptedPlan();
  await sweepWhenDue(plan.invitationId);
  const mine = idFor(plan, plan.speaker);
  await admin().doc(`checkIns/${mine}`).update({ expiresAt: new Date(Date.now() - HOUR) });
  const closed = await expectFailure(
    plan.speaker.call("answerCheckIn", { checkInId: mine, happened: "yes" }), "failed-precondition",
  );
  assert.equal(closed.details.reason, "checkin/expired");
});

test("a meetup is confirmed only when both say it happened, and unconfirmed if either takes it back", async () => {
  const plan = await acceptedPlan();
  await sweepWhenDue(plan.invitationId);
  const meetRef = admin().doc(`confirmedMeetups/${meetupId(plan.invitationId, plan.meeting.localDate)}`);

  await plan.speaker.call("answerCheckIn", { checkInId: idFor(plan, plan.speaker), happened: "yes" });
  assert.equal((await meetRef.get()).exists, false, "one yes is not a confirmation");

  await plan.learner.call("answerCheckIn", { checkInId: idFor(plan, plan.learner), happened: "yes", meetAgain: "yes" });
  const confirmed = await meetRef.get();
  assert.equal(confirmed.exists, true);
  assert.deepEqual(confirmed.get("participants"), [plan.speaker.uid, plan.learner.uid].sort());
  assert.deepEqual(confirmed.get("gave"), { [plan.speaker.uid]: "english", [plan.learner.uid]: "japanese" });

  await plan.speaker.call("answerCheckIn", { checkInId: idFor(plan, plan.speaker), happened: "no" });
  assert.equal((await meetRef.get()).exists, false);
});

test("a weekly plan asks again each week, skips missed weeks, and honours one person's mute", async () => {
  const plan = await acceptedPlan({ recurrence: "weekly" });
  await sweepWhenDue(plan.invitationId);
  const week2 = addDays(plan.meeting.localDate, 7);

  const scheduled = await invitationDoc(plan.invitationId);
  assert.equal(scheduled.nextCheckInOccurrence, week2);

  // The speaker says it happened but does not want to meet again: they stop being asked.
  await plan.speaker.call("answerCheckIn", { checkInId: idFor(plan, plan.speaker), happened: "yes", meetAgain: "no" });
  await sweepWhenDue(plan.invitationId);
  assert.equal((await admin().doc(`checkIns/${idFor(plan, plan.speaker, week2)}`).get()).exists, false);
  assert.equal((await admin().doc(`checkIns/${idFor(plan, plan.learner, week2)}`).get()).exists, true);

  // Sweeps missed for three weeks: only the latest week is asked about, not a backlog.
  const week3 = addDays(plan.meeting.localDate, 14);
  const week5 = addDays(plan.meeting.localDate, 28);
  await sweepWhenDue(plan.invitationId, 2 * 7 * 24 * HOUR + HOUR);
  assert.equal((await admin().doc(`checkIns/${idFor(plan, plan.learner, week3)}`).get()).exists, false);
  assert.equal((await admin().doc(`checkIns/${idFor(plan, plan.learner, week5)}`).get()).exists, true);
});

test("a weekly plan nobody confirms stops asking", async () => {
  const plan = await acceptedPlan({ recurrence: "weekly" });
  for (let week = 0; week < MAX_QUIET_OCCURRENCES + 2; week += 1) await sweepWhenDue(plan.invitationId).catch(() => {});
  const invitation = await invitationDoc(plan.invitationId);
  assert.equal(invitation.nextCheckInAt, null);
  assert.equal(invitation.checkInsStopped, "inactive");
});

test("a blocked pair gets no check-in, and no confirmation", async () => {
  const plan = await acceptedPlan();
  await plan.learner.call("setBlock", { otherUid: plan.speaker.uid, blocked: true });
  await sweepWhenDue(plan.invitationId);
  assert.equal((await admin().doc(`checkIns/${idFor(plan, plan.speaker)}`).get()).exists, false);
  const invitation = await invitationDoc(plan.invitationId);
  assert.equal(invitation.nextCheckInAt, null);
  assert.equal(invitation.checkInsStopped, "blocked");

  // A block after the check-ins went out still prevents a confirmation.
  const other = await acceptedPlan();
  await sweepWhenDue(other.invitationId);
  await other.speaker.call("answerCheckIn", { checkInId: idFor(other, other.speaker), happened: "yes" });
  await other.speaker.call("setBlock", { otherUid: other.learner.uid, blocked: true });
  await other.learner.call("answerCheckIn", { checkInId: idFor(other, other.learner), happened: "yes" });
  const meet = await admin().doc(`confirmedMeetups/${meetupId(other.invitationId, other.meeting.localDate)}`).get();
  assert.equal(meet.exists, false);
});

test("account deletion removes check-ins by and about the person, mutes and confirmed meetups", async () => {
  const plan = await acceptedPlan({ recurrence: "weekly" });
  await sweepWhenDue(plan.invitationId);
  await plan.speaker.call("answerCheckIn", { checkInId: idFor(plan, plan.speaker), happened: "yes", meetAgain: "no" });
  await plan.learner.call("answerCheckIn", { checkInId: idFor(plan, plan.learner), happened: "yes" });
  const meetRef = admin().doc(`confirmedMeetups/${meetupId(plan.invitationId, plan.meeting.localDate)}`);
  assert.equal((await meetRef.get()).exists, true);

  const result = await plan.speaker.call("requestAccountDeletion", { confirmation: "DELETE" });
  assert.equal(result.status, "completed");
  assert.equal(result.deleted.checkIns, 3, "own check-in, the partner's about them, and the mute");
  assert.equal(result.deleted.confirmedMeetups, 1);

  const db = admin();
  assert.equal((await db.doc(`checkIns/${idFor(plan, plan.speaker)}`).get()).exists, false);
  assert.equal((await db.doc(`checkIns/${idFor(plan, plan.learner)}`).get()).exists, false);
  assert.equal((await db.collection("checkInMutes").where("uid", "==", plan.speaker.uid).get()).empty, true);
  assert.equal((await meetRef.get()).exists, false);
});
