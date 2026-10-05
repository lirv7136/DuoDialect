"use strict";

const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const {
  requireUid, requireEnum, requireString, requireMeeting, optionalString, requireObject,
} = require("./validation");
const { INTENTS, LIMITS } = require("./constants");
const {
  REASON, reject, assertPairEligible, reciprocalExchange, datingEligibility, loadPair,
} = require("./eligibility");
const {
  refs, invitationId, invitationLockId, conversationId, participantsOf, pairKey,
} = require("./refs");
const { initialSchedule } = require("./checkins");

/** Accepts a Firestore Timestamp, a Date, or null. */
function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

/** Fields returned to clients. The stored document has no other reader visible data. */
function serializeInvitation(id, data) {
  return {
    id,
    fromUid: data.fromUid,
    toUid: data.toUid,
    participants: data.participants,
    intent: data.intent,
    status: data.status,
    languages: data.languages,
    meeting: {
      venue: data.meeting.venue,
      localDate: data.meeting.localDate,
      localTime: data.meeting.localTime,
      timeZone: data.meeting.timeZone,
      recurrence: data.meeting.recurrence,
      startAt: toIso(data.meeting.startAt),
    },
    note: data.note,
    conversationId: data.conversationId || null,
    resolution: data.resolution || null,
  };
}

/**
 * The caller may name which language each side will offer. Anything they name must be
 * inside the reciprocal set the server computed; otherwise the server picks the first.
 */
function resolveLanguages(input, exchange) {
  if (input === undefined || input === null) {
    return { fromOffers: exchange.aOffers[0], toOffers: exchange.bOffers[0] };
  }
  const languages = requireObject(input, "languages");
  const fromOffers = requireString(languages.fromOffers, "languages.fromOffers", 40).toLocaleLowerCase("en");
  const toOffers = requireString(languages.toOffers, "languages.toOffers", 40).toLocaleLowerCase("en");
  if (!exchange.aOffers.includes(fromOffers) || !exchange.bOffers.includes(toOffers)) {
    throw reject(
      "failed-precondition",
      REASON.languageNotOffered,
      "Choose a language each of you can actually offer and is practising.",
    );
  }
  return { fromOffers, toOffers };
}

/** Re-runs the full gate against documents read inside a transaction. */
function assertStillEligible(snapshots, fromUid, toUid, intent, now) {
  const pair = {
    profileA: snapshots.profileFrom.exists ? snapshots.profileFrom.data() : null,
    profileB: snapshots.profileTo.exists ? snapshots.profileTo.data() : null,
    privateA: snapshots.privateFrom.exists ? snapshots.privateFrom.data() : null,
    privateB: snapshots.privateTo.exists ? snapshots.privateTo.data() : null,
    blockedEither: snapshots.blockFromTo.exists || snapshots.blockToFrom.exists,
  };
  return assertPairEligible({ uidA: fromUid, uidB: toUid, intent, pair, now });
}

async function readPairSnapshots(tx, db, fromUid, toUid) {
  const r = refs(db);
  const [profileFrom, profileTo, privateFrom, privateTo, blockFromTo, blockToFrom] = await tx.getAll(
    r.profile(fromUid), r.profile(toUid),
    r.privateProfile(fromUid), r.privateProfile(toUid),
    r.block(fromUid, toUid), r.block(toUid, fromUid),
  );
  return { profileFrom, profileTo, privateFrom, privateTo, blockFromTo, blockToFrom };
}

/**
 * Create a two-person invitation.
 *
 * Idempotent on requestKey: a retry with the same key returns the invitation already
 * created rather than a second one. At most one pending invitation may exist per pair
 * per intent, enforced by a lock document written in the same transaction.
 */
async function createInvitation(db, callerUid, payload, now = new Date()) {
  const body = requireObject(payload, "request");
  const toUid = requireUid(body.toUid, "toUid");
  const intent = requireEnum(body.intent, "intent", INTENTS);
  const requestKey = requireString(body.requestKey, "requestKey", LIMITS.requestKey);
  const note = optionalString(body.note, "note", LIMITS.note);
  const meeting = requireMeeting(body.meeting, "meeting", now);

  if (callerUid === toUid) {
    throw reject("invalid-argument", REASON.selfTarget, "You cannot invite yourself.");
  }

  // First pass outside the transaction so the caller gets a precise reason.
  const pair = await loadPair(db, callerUid, toUid);
  const exchange = assertPairEligible({ uidA: callerUid, uidB: toUid, intent, pair, now });
  const languages = resolveLanguages(body.languages, exchange);

  const id = invitationId(callerUid, toUid, intent, requestKey);
  const lockId = invitationLockId(callerUid, toUid, intent);
  const r = refs(db);

  return db.runTransaction(async (tx) => {
    const inviteRef = r.invitation(id);
    const lockRef = r.invitationLock(lockId);

    const existing = await tx.get(inviteRef);
    if (existing.exists) {
      // Same requestKey: this is a retry of a call that already succeeded.
      return { invitation: serializeInvitation(id, existing.data()), created: false };
    }

    const lock = await tx.get(lockRef);
    if (lock.exists) {
      const lockedId = lock.get("invitationId");
      const locked = lockedId ? await tx.get(r.invitation(lockedId)) : null;
      if (locked && locked.exists && locked.get("status") === "pending") {
        throw reject(
          "already-exists",
          REASON.invitationDuplicate,
          "You already have an open invitation with this person.",
        );
      }
      // Stale lock left by a resolved invitation; this call takes it over.
    }

    // Final check against state that may have changed since the first pass.
    const snapshots = await readPairSnapshots(tx, db, callerUid, toUid);
    const freshExchange = assertStillEligible(snapshots, callerUid, toUid, intent, now);
    if (!freshExchange.aOffers.includes(languages.fromOffers) ||
        !freshExchange.bOffers.includes(languages.toOffers)) {
      throw reject(
        "failed-precondition",
        REASON.languageNotOffered,
        "The chosen languages are no longer part of your exchange.",
      );
    }

    const doc = {
      id,
      fromUid: callerUid,
      toUid,
      participants: participantsOf(callerUid, toUid),
      pairKey: pairKey(callerUid, toUid),
      intent,
      status: "pending",
      languages,
      meeting: {
        venue: meeting.venue,
        localDate: meeting.localDate,
        localTime: meeting.localTime,
        timeZone: meeting.timeZone,
        recurrence: meeting.recurrence,
        startAt: meeting.startAt,
      },
      note,
      requestKey,
      conversationId: null,
      resolution: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      respondedAt: null,
    };

    tx.set(inviteRef, doc);
    tx.set(lockRef, {
      invitationId: id,
      participants: doc.participants,
      intent,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { invitation: serializeInvitation(id, doc), created: true };
  });
}

/**
 * Accept or decline. Only the recipient may respond.
 *
 * Acceptance re-reads both profiles, both private profiles and both block documents
 * inside the transaction, so consent withdrawn or a block added after the invitation
 * was sent stops the acceptance. Two concurrent accepts resolve to one conversation.
 */
async function respondToInvitation(db, callerUid, payload, now = new Date()) {
  const body = requireObject(payload, "request");
  const id = requireString(body.invitationId, "invitationId", 128);
  const action = requireEnum(body.action, "action", ["accept", "decline"]);
  const r = refs(db);

  return db.runTransaction(async (tx) => {
    const inviteRef = r.invitation(id);
    const snap = await tx.get(inviteRef);
    if (!snap.exists) {
      throw reject("not-found", REASON.invitationNotFound, "This invitation no longer exists.");
    }
    const data = snap.data();

    if (data.toUid !== callerUid) {
      // Senders and outsiders are told the same thing.
      throw reject("permission-denied", REASON.invitationNotRecipient, "You cannot respond to this invitation.");
    }

    if (action === "accept" && data.status === "accepted") {
      return { invitation: serializeInvitation(id, data), conversationId: data.conversationId, changed: false };
    }
    if (action === "decline" && data.status === "declined") {
      return { invitation: serializeInvitation(id, data), conversationId: null, changed: false };
    }
    if (data.status !== "pending") {
      throw reject(
        "failed-precondition",
        REASON.invitationNotPending,
        `This invitation is already ${data.status}.`,
      );
    }

    const lockRef = r.invitationLock(invitationLockId(data.fromUid, data.toUid, data.intent));

    if (action === "decline") {
      const lock = await tx.get(lockRef);
      tx.update(inviteRef, {
        status: "declined",
        resolution: { by: callerUid, reason: "declined" },
        respondedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (lock.exists && lock.get("invitationId") === id) tx.delete(lockRef);
      return {
        invitation: serializeInvitation(id, { ...data, status: "declined", resolution: { by: callerUid, reason: "declined" } }),
        conversationId: null,
        changed: true,
      };
    }

    // Accept: everything is re-validated against current state.
    const convId = conversationId(data.fromUid, data.toUid, data.intent);
    const convRef = r.conversation(convId);
    const snapshots = await readPairSnapshots(tx, db, data.fromUid, data.toUid);
    const freshExchange = assertStillEligible(snapshots, data.fromUid, data.toUid, data.intent, now);
    if (!freshExchange.aOffers.includes(data.languages.fromOffers) ||
        !freshExchange.bOffers.includes(data.languages.toOffers)) {
      throw reject(
        "failed-precondition",
        REASON.languageNotOffered,
        "The agreed languages are no longer part of this exchange.",
      );
    }

    const conv = await tx.get(convRef);
    const lock = await tx.get(lockRef);
    const participants = participantsOf(data.fromUid, data.toUid);

    if (conv.exists) {
      // Membership is immutable. A mismatch means the document was tampered with.
      const current = conv.get("participants") || [];
      const same = Array.isArray(current) && current.length === participants.length &&
        current.every((uid, i) => uid === participants[i]);
      if (!same) {
        throw new HttpsError("internal", "This conversation cannot be reused.", {
          reason: "conversation/membership-mismatch",
        });
      }
      tx.update(convRef, {
        updatedAt: FieldValue.serverTimestamp(),
        acceptedInvitationIds: FieldValue.arrayUnion(id),
      });
    } else {
      tx.set(convRef, {
        id: convId,
        participants,
        pairKey: pairKey(data.fromUid, data.toUid),
        intent: data.intent,
        originInvitationId: id,
        acceptedInvitationIds: [id],
        languages: data.languages,
        lastMessage: null,
        readAt: {},
        typing: {},
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    for (const uid of participants) {
      const otherUid = participants.find((value) => value !== uid);
      tx.set(r.userConversation(uid, convId), {
        conversationId: convId,
        otherUid,
        intent: data.intent,
        unread: 0,
        lastText: "",
        lastFromUid: null,
        lastAt: null,
        lastReadAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    tx.update(inviteRef, {
      status: "accepted",
      conversationId: convId,
      resolution: { by: callerUid, reason: "accepted" },
      respondedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      // The first post meetup check-in; see lib/checkins.js.
      ...initialSchedule(data.meeting),
    });
    if (lock.exists && lock.get("invitationId") === id) tx.delete(lockRef);

    return {
      invitation: serializeInvitation(id, {
        ...data, status: "accepted", conversationId: convId,
        resolution: { by: callerUid, reason: "accepted" },
      }),
      conversationId: convId,
      changed: true,
    };
  });
}

/** Cancel a pending invitation. Only the sender may cancel; repeat calls are harmless. */
async function cancelInvitation(db, callerUid, payload) {
  const body = requireObject(payload, "request");
  const id = requireString(body.invitationId, "invitationId", 128);
  const r = refs(db);

  return db.runTransaction(async (tx) => {
    const inviteRef = r.invitation(id);
    const snap = await tx.get(inviteRef);
    if (!snap.exists) {
      throw reject("not-found", REASON.invitationNotFound, "This invitation no longer exists.");
    }
    const data = snap.data();
    if (data.fromUid !== callerUid) {
      throw reject("permission-denied", REASON.invitationNotSender, "You cannot cancel this invitation.");
    }
    if (data.status === "cancelled") {
      return { invitation: serializeInvitation(id, data), changed: false };
    }
    if (data.status !== "pending") {
      throw reject("failed-precondition", REASON.invitationNotPending, `This invitation is already ${data.status}.`);
    }

    const lockRef = r.invitationLock(invitationLockId(data.fromUid, data.toUid, data.intent));
    const lock = await tx.get(lockRef);
    tx.update(inviteRef, {
      status: "cancelled",
      resolution: { by: callerUid, reason: "cancelled" },
      respondedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (lock.exists && lock.get("invitationId") === id) tx.delete(lockRef);
    return {
      invitation: serializeInvitation(id, { ...data, status: "cancelled", resolution: { by: callerUid, reason: "cancelled" } }),
      changed: true,
    };
  });
}

/**
 * Cancel every pending invitation that a change in consent or a block has invalidated.
 * Used when dating is switched off and when one person blocks another.
 */
async function cancelPendingInvitationsFor(db, { uid, otherUid = null, intent = null, reason }) {
  const r = refs(db);
  let query = r.invitations().where("participants", "array-contains", uid).where("status", "==", "pending");
  if (intent) query = query.where("intent", "==", intent);
  const snap = await query.get();

  const targets = snap.docs.filter((doc) => !otherUid || (doc.get("participants") || []).includes(otherUid));
  if (targets.length === 0) return { cancelled: 0 };

  const batch = db.batch();
  for (const doc of targets) {
    batch.update(doc.ref, {
      status: "cancelled",
      resolution: { by: uid, reason },
      respondedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.delete(r.invitationLock(invitationLockId(doc.get("fromUid"), doc.get("toUid"), doc.get("intent"))));
  }
  await batch.commit();
  return { cancelled: targets.length };
}

module.exports = {
  createInvitation,
  respondToInvitation,
  cancelInvitation,
  cancelPendingInvitationsFor,
  serializeInvitation,
};
