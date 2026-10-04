"use strict";

const { FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const { requireObject, requireString, requireEnum, wallTimeToInstant } = require("./validation");
const { reject } = require("./eligibility");
const { refs, shortHash } = require("./refs");
const { deliver } = require("./notifier");
const { checkInNotice } = require("./notifications");

/**
 * Post meetup check-ins.
 *
 * The day after an accepted plan, each person is privately asked whether the meetup
 * happened and whether they would meet again. Answers are never shown to the other
 * person. When both say it happened, the server records a confirmed meetup, which is
 * the only evidence the product has that people actually met.
 *
 *   invitations/{id}.nextCheckInAt           when the next check-in is due; null when none
 *   invitations/{id}.nextCheckInOccurrence   the local date of the meeting it asks about
 *   checkIns/{checkInId}                     one per person per occurrence; owner reads
 *   checkInMutes/{muteId}                    server only; "stop asking me about this plan"
 *   confirmedMeetups/{meetupId}              server only; both people said it happened
 *
 * Scheduling is driven by sweepCheckIns, run hourly. Everything it does is keyed by
 * derived ids, so a sweep that runs twice, or overlaps another, creates nothing twice.
 */

/** Check-ins arrive at this local time on the day after the meetup. */
const CHECK_IN_LOCAL_TIME = "10:00";

/** How long a check-in can be answered. Matches the weekly cadence. */
const ANSWER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A weekly plan stops asking after this many occurrences in a row nobody confirmed. */
const MAX_QUIET_OCCURRENCES = 3;

/** Bounded so one sweep cannot run away. The next sweep picks up the rest. */
const SWEEP_LIMIT = 200;

const REASON = {
  notFound: "checkin/not-found",
  expired: "checkin/expired",
};

/** "2026-09-28" plus a number of calendar days, independent of any time zone. */
function addDays(localDate, days) {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/** 10:00 local time on the day after the meeting, as an instant. */
function checkInTimeFor(localDate, timeZone) {
  return wallTimeToInstant(addDays(localDate, 1), CHECK_IN_LOCAL_TIME, timeZone);
}

function checkInId(invitationIdValue, localDate, uid) {
  return `chk_${shortHash(invitationIdValue, localDate, uid)}`;
}

function meetupId(invitationIdValue, localDate) {
  return `met_${shortHash(invitationIdValue, localDate)}`;
}

function muteId(uid, invitationIdValue) {
  return `mute_${shortHash(uid, invitationIdValue)}`;
}

/** The fields set on an invitation when it is accepted, so its first check-in is due. */
function initialSchedule(meeting) {
  return {
    nextCheckInAt: checkInTimeFor(meeting.localDate, meeting.timeZone),
    nextCheckInOccurrence: meeting.localDate,
  };
}

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
}

/** Fields returned to the owner. */
function serializeCheckIn(id, data) {
  return {
    id,
    invitationId: data.invitationId,
    otherUid: data.otherUid,
    conversationId: data.conversationId || null,
    occurrence: data.occurrence,
    languages: data.languages,
    status: data.status,
    answer: data.answer || null,
    dueAt: toIso(data.dueAt),
    expiresAt: toIso(data.expiresAt),
  };
}

/**
 * The occurrence a sweep at `now` should ask about. A weekly plan whose sweeps were
 * missed skips forward to the latest occurrence already due, rather than sending a
 * backlog of check-ins for weeks gone by.
 */
function dueOccurrence(invitation, now) {
  let localDate = invitation.nextCheckInOccurrence;
  const { timeZone, recurrence } = invitation.meeting;
  if (recurrence === "weekly") {
    while (checkInTimeFor(addDays(localDate, 7), timeZone).getTime() <= now.getTime()) {
      localDate = addDays(localDate, 7);
    }
  }
  const dueAt = checkInTimeFor(localDate, timeZone);
  return { localDate, dueAt, expiresAt: new Date(dueAt.getTime() + ANSWER_WINDOW_MS) };
}

/** Whether either person said the previous occurrence of this plan happened. */
async function previousConfirmedByAnyone(tx, db, invitationIdValue, localDate, participants) {
  const r = refs(db);
  const snaps = await tx.getAll(...participants.map((uid) => r.checkIn(checkInId(invitationIdValue, localDate, uid))));
  return snaps.some((snap) => snap.exists && snap.get("answer.happened") === "yes");
}

/**
 * Creates the due check-ins for one invitation and moves its schedule on. Returns the
 * check-ins created, so the caller can notify their owners outside the transaction.
 */
async function processInvitation(db, invitationRef, now) {
  const r = refs(db);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(invitationRef);
    if (!snap.exists) return [];
    const invitation = snap.data();
    const nextAt = toMillis(invitation.nextCheckInAt);
    if (invitation.status !== "accepted" || nextAt === null || nextAt > now.getTime()) return [];

    const participants = invitation.participants || [];
    const [a, b] = participants;
    const [blockAB, blockBA] = await tx.getAll(r.block(a, b), r.block(b, a));
    if (blockAB.exists || blockBA.exists) {
      tx.update(invitationRef, { nextCheckInAt: null, checkInsStopped: "blocked" });
      return [];
    }

    const weekly = invitation.meeting.recurrence === "weekly";
    const occurrence = dueOccurrence(invitation, now);

    // A one-off plan whose check-in window passed before any sweep ran is left alone.
    if (occurrence.expiresAt.getTime() <= now.getTime()) {
      tx.update(invitationRef, { nextCheckInAt: null, checkInsStopped: "missed" });
      return [];
    }

    // A weekly plan nobody has confirmed for a while stops asking.
    let quiet = Number(invitation.checkInQuietCount || 0);
    if (weekly && invitation.lastCheckInOccurrence) {
      const confirmed = await previousConfirmedByAnyone(
        tx, db, snap.id, invitation.lastCheckInOccurrence, participants,
      );
      quiet = confirmed ? 0 : quiet + 1;
      if (quiet >= MAX_QUIET_OCCURRENCES) {
        tx.update(invitationRef, { nextCheckInAt: null, checkInsStopped: "inactive", checkInQuietCount: quiet });
        return [];
      }
    }

    const ids = participants.map((uid) => checkInId(snap.id, occurrence.localDate, uid));
    const existing = await tx.getAll(...ids.map((id) => r.checkIn(id)));
    const mutes = await tx.getAll(...participants.map((uid) => r.checkInMute(muteId(uid, snap.id))));

    const created = [];
    participants.forEach((uid, index) => {
      if (existing[index].exists || mutes[index].exists) return;
      const otherUid = participants.find((value) => value !== uid);
      const isSender = uid === invitation.fromUid;
      const doc = {
        id: ids[index],
        uid,
        otherUid,
        invitationId: snap.id,
        conversationId: invitation.conversationId || null,
        occurrence: {
          localDate: occurrence.localDate,
          localTime: invitation.meeting.localTime,
          timeZone: invitation.meeting.timeZone,
          recurrence: invitation.meeting.recurrence,
        },
        // From the owner's side: the language they offered, and the one they practised.
        languages: {
          gave: isSender ? invitation.languages.fromOffers : invitation.languages.toOffers,
          received: isSender ? invitation.languages.toOffers : invitation.languages.fromOffers,
        },
        status: "open",
        answer: null,
        dueAt: occurrence.dueAt,
        expiresAt: occurrence.expiresAt,
        createdAt: FieldValue.serverTimestamp(),
        answeredAt: null,
      };
      tx.set(r.checkIn(ids[index]), doc);
      created.push(doc);
    });

    const nextOccurrence = weekly ? addDays(occurrence.localDate, 7) : null;
    tx.update(invitationRef, {
      nextCheckInAt: nextOccurrence ? checkInTimeFor(nextOccurrence, invitation.meeting.timeZone) : null,
      nextCheckInOccurrence: nextOccurrence,
      lastCheckInOccurrence: occurrence.localDate,
      checkInQuietCount: quiet,
    });
    return created;
  });
}

/** Notification failures are logged by deliver and never undo the check-in. */
async function notifyCheckIn(db, checkIn) {
  const other = await refs(db).profile(checkIn.otherUid).get();
  const name = other.exists ? other.get("displayName") : null;
  await deliver(db, {
    toUid: checkIn.uid,
    ...checkInNotice(checkIn, name),
    data: {
      type: "checkIn",
      checkInId: checkIn.id,
      invitationId: checkIn.invitationId,
      otherUid: checkIn.otherUid,
    },
  });
}

/**
 * Creates every check-in due at `now`. Run hourly by the scheduler; safe to run more
 * often, or twice at once. Needs the (status, nextCheckInAt) index on invitations.
 */
async function sweepCheckIns(db, now = new Date(), { limit = SWEEP_LIMIT } = {}) {
  const r = refs(db);
  const due = await r.invitations()
    .where("status", "==", "accepted")
    .where("nextCheckInAt", "<=", now)
    .orderBy("nextCheckInAt")
    .limit(limit)
    .get();

  const result = { invitations: due.size, created: 0, failed: 0 };
  for (const doc of due.docs) {
    try {
      const created = await processInvitation(db, doc.ref, now);
      result.created += created.length;
      for (const checkIn of created) await notifyCheckIn(db, checkIn);
    } catch (error) {
      // One bad document must not stop the rest of the sweep.
      result.failed += 1;
      logger.error("Check-in sweep failed for an invitation", { invitationId: doc.id, error: String(error) });
    }
  }
  return result;
}

/**
 * Answer a check-in. Only its owner can, and only until it expires; a changed mind
 * inside the window replaces the earlier answer.
 *
 * meetAgain "no" mutes future check-ins for this plan for the caller only; "yes"
 * lifts the mute. When both people say the meetup happened, and neither has blocked
 * the other, a confirmed meetup is recorded; if either later says it did not, the
 * record is removed.
 */
async function answerCheckIn(db, uid, payload, now = new Date()) {
  const body = requireObject(payload, "request");
  const id = requireString(body.checkInId, "checkInId", 128);
  const happened = requireEnum(body.happened, "happened", ["yes", "no"]);
  const meetAgain = body.meetAgain === undefined || body.meetAgain === null
    ? null
    : requireEnum(body.meetAgain, "meetAgain", ["yes", "no"]);
  const r = refs(db);

  return db.runTransaction(async (tx) => {
    const ref = r.checkIn(id);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("uid") !== uid) {
      // Someone else's check-in reads the same as one that does not exist.
      throw reject("not-found", REASON.notFound, "This check-in no longer exists.");
    }
    const data = snap.data();
    if (toMillis(data.expiresAt) <= now.getTime()) {
      throw reject("failed-precondition", REASON.expired, "This check-in has closed.");
    }

    const answer = { happened, meetAgain };
    const previous = data.answer || null;
    const changed = !previous || previous.happened !== happened || previous.meetAgain !== meetAgain;

    const otherId = checkInId(data.invitationId, data.occurrence.localDate, data.otherUid);
    const meetRef = r.confirmedMeetup(meetupId(data.invitationId, data.occurrence.localDate));
    const [other, blockOut, blockIn] = await tx.getAll(
      r.checkIn(otherId), r.block(uid, data.otherUid), r.block(data.otherUid, uid),
    );

    if (changed) {
      tx.update(ref, { answer, status: "answered", answeredAt: FieldValue.serverTimestamp() });
    }

    const muteRef = r.checkInMute(muteId(uid, data.invitationId));
    if (meetAgain === "no") {
      tx.set(muteRef, { uid, invitationId: data.invitationId, createdAt: FieldValue.serverTimestamp() });
    } else if (meetAgain === "yes") {
      tx.delete(muteRef);
    }

    const bothSaidYes = happened === "yes" && other.exists && other.get("answer.happened") === "yes";
    if (bothSaidYes && !blockOut.exists && !blockIn.exists) {
      tx.set(meetRef, {
        invitationId: data.invitationId,
        participants: [uid, data.otherUid].sort(),
        localDate: data.occurrence.localDate,
        timeZone: data.occurrence.timeZone,
        // Keyed by uid: what each person offered in this meetup.
        gave: { [uid]: data.languages.gave, [data.otherUid]: data.languages.received },
        confirmedAt: FieldValue.serverTimestamp(),
      });
    } else if (happened === "no") {
      tx.delete(meetRef);
    }

    return { checkIn: serializeCheckIn(id, { ...data, answer, status: "answered" }), changed };
  });
}

module.exports = {
  CHECK_IN_LOCAL_TIME,
  ANSWER_WINDOW_MS,
  MAX_QUIET_OCCURRENCES,
  REASON,
  addDays,
  checkInTimeFor,
  checkInId,
  meetupId,
  muteId,
  initialSchedule,
  serializeCheckIn,
  sweepCheckIns,
  answerCheckIn,
};
