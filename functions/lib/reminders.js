"use strict";

const logger = require("firebase-functions/logger");
const { wallTimeToInstant } = require("./validation");
const { refs } = require("./refs");
const { deliver } = require("./notifier");
const { reminderNotice } = require("./notifications");
const { addDays } = require("./checkins");

/**
 * Meetup reminders.
 *
 * The evening before an accepted plan, each person is reminded. Flaky partners are the
 * most common complaint about every language exchange product, and a reminder with the
 * time is the cheapest fix. Weekly plans are reminded before every occurrence until
 * their check-ins stop (nobody confirmed for a while, or a block).
 *
 *   invitations/{id}.nextReminderAt           when the next reminder is due; null when none
 *   invitations/{id}.nextReminderOccurrence   the local date of the meeting it is about
 *
 * Driven by sweepReminders, run hourly beside sweepCheckIns. Sending moves the schedule
 * on first, so a sweep that runs twice sends once.
 */

/** Reminders arrive at this local time on the day before the meetup. */
const REMINDER_LOCAL_TIME = "18:00";

/** Bounded so one sweep cannot run away. The next sweep picks up the rest. */
const SWEEP_LIMIT = 200;

/** 18:00 local time on the day before the meeting, as an instant. */
function reminderTimeFor(localDate, timeZone) {
  return wallTimeToInstant(addDays(localDate, -1), REMINDER_LOCAL_TIME, timeZone);
}

/**
 * The first occurrence of a plan whose reminder is still in the future. A plan accepted
 * after its reminder time (a meetup tomorrow, accepted tonight) gets no reminder for
 * that occurrence rather than one that would arrive late.
 */
function firstReminder(meeting, now) {
  let localDate = meeting.localDate;
  let at = reminderTimeFor(localDate, meeting.timeZone);
  if (at.getTime() > now.getTime()) return { nextReminderAt: at, nextReminderOccurrence: localDate };
  if (meeting.recurrence !== "weekly") return { nextReminderAt: null, nextReminderOccurrence: null };
  // Bounded: a weekly plan cannot be more than a year out, see requireMeeting.
  for (let i = 0; i < 60; i += 1) {
    localDate = addDays(localDate, 7);
    at = reminderTimeFor(localDate, meeting.timeZone);
    if (at.getTime() > now.getTime()) return { nextReminderAt: at, nextReminderOccurrence: localDate };
  }
  return { nextReminderAt: null, nextReminderOccurrence: null };
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
}

/**
 * Claims one due reminder: moves the schedule on inside a transaction and returns the
 * invitation to remind about, or null when nothing is due or the plan has stopped.
 */
async function claimReminder(db, invitationRef, now) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(invitationRef);
    if (!snap.exists) return null;
    const invitation = snap.data();
    const at = toMillis(invitation.nextReminderAt);
    if (invitation.status !== "accepted" || at === null || at > now.getTime()) return null;

    if (invitation.checkInsStopped) {
      tx.update(invitationRef, { nextReminderAt: null, nextReminderOccurrence: null });
      return null;
    }

    const weekly = invitation.meeting.recurrence === "weekly";
    const occurrence = invitation.nextReminderOccurrence;
    const next = weekly ? firstReminder({ ...invitation.meeting, localDate: addDays(occurrence, 7) }, now)
      : { nextReminderAt: null, nextReminderOccurrence: null };
    tx.update(invitationRef, next);

    // A reminder more than a day late is for a meetup already gone. Skip it quietly.
    const meetupAt = wallTimeToInstant(occurrence, invitation.meeting.localTime, invitation.meeting.timeZone);
    if (meetupAt.getTime() <= now.getTime()) return null;
    return { id: snap.id, invitation };
  });
}

/** One reminder per participant, naming the other person. Blocks silence it. */
async function remind(db, id, invitation) {
  const r = refs(db);
  const participants = invitation.participants || [];
  const [a, b] = participants;
  const [blockAB, blockBA] = await db.getAll(r.block(a, b), r.block(b, a));
  if (blockAB.exists || blockBA.exists) return 0;

  const profiles = await db.getAll(...participants.map((uid) => r.profile(uid)));
  let sent = 0;
  for (let i = 0; i < participants.length; i += 1) {
    const uid = participants[i];
    const other = profiles[1 - i];
    await deliver(db, {
      toUid: uid,
      ...reminderNotice(invitation, other.exists ? other.get("displayName") : null),
      data: {
        type: "plan",
        invitationId: id,
        otherUid: participants[1 - i],
        conversationId: invitation.conversationId || null,
      },
    });
    sent += 1;
  }
  return sent;
}

/**
 * Sends every reminder due at `now`. Run hourly; safe to run more often or twice at
 * once. Needs the (status, nextReminderAt) index on invitations.
 */
async function sweepReminders(db, now = new Date(), { limit = SWEEP_LIMIT } = {}) {
  const r = refs(db);
  const due = await r.invitations()
    .where("status", "==", "accepted")
    .where("nextReminderAt", "<=", now)
    .orderBy("nextReminderAt")
    .limit(limit)
    .get();

  const result = { invitations: due.size, sent: 0, failed: 0 };
  for (const doc of due.docs) {
    try {
      const claimed = await claimReminder(db, doc.ref, now);
      if (claimed) result.sent += await remind(db, claimed.id, claimed.invitation);
    } catch (error) {
      result.failed += 1;
      logger.error("Reminder sweep failed for an invitation", { invitationId: doc.id, error: String(error) });
    }
  }
  return result;
}

module.exports = { REMINDER_LOCAL_TIME, reminderTimeFor, firstReminder, sweepReminders };
