"use strict";

const { FieldValue } = require("firebase-admin/firestore");
const { requireObject, requireString } = require("./validation");
const { LIMITS } = require("./constants");
const { REASON, reject } = require("./eligibility");
const { refs, messageId } = require("./refs");

function otherParticipant(participants, uid) {
  return participants.find((value) => value !== uid) || null;
}

/**
 * Send a message into an accepted conversation.
 *
 * The sender is taken from the verified auth token, never from the payload, so a
 * message cannot be attributed to somebody else. Membership is read from the stored
 * conversation, so a client cannot message its way into a conversation it is not in.
 * The message id is derived from the caller's clientMessageId, so a retry after a
 * timeout writes the same document instead of a duplicate, and the unread counter is
 * incremented in the same transaction as the message itself.
 */
async function sendMessage(db, uid, payload) {
  const body = requireObject(payload, "request");
  const conversationId = requireString(body.conversationId, "conversationId", 128);
  const text = requireString(body.text, "text", LIMITS.messageText);
  const clientMessageId = requireString(body.clientMessageId, "clientMessageId", LIMITS.clientMessageId);

  const r = refs(db);
  const id = messageId(conversationId, uid, clientMessageId);

  return db.runTransaction(async (tx) => {
    const convRef = r.conversation(conversationId);
    const convSnap = await tx.get(convRef);
    if (!convSnap.exists) {
      throw reject("not-found", REASON.conversationNotFound, "This conversation does not exist.");
    }
    const participants = convSnap.get("participants") || [];
    if (!participants.includes(uid)) {
      throw reject("permission-denied", REASON.conversationNotMember, "You are not part of this conversation.");
    }
    const toUid = otherParticipant(participants, uid);
    if (!toUid) {
      throw reject("failed-precondition", "conversation/membership-invalid", "This conversation is not usable.");
    }

    const [blockOut, blockIn, existing] = await tx.getAll(
      r.block(uid, toUid), r.block(toUid, uid), r.message(conversationId, id),
    );
    if (blockOut.exists || blockIn.exists) {
      throw reject("permission-denied", REASON.unavailable, "This person is not available.");
    }
    if (existing.exists) {
      // Retry of a message that already landed.
      return { messageId: id, conversationId, created: false };
    }

    tx.set(r.message(conversationId, id), {
      id,
      conversationId,
      // Copied from the conversation so the read rule needs no cross document lookup.
      participants,
      fromUid: uid,
      toUid,
      text,
      clientMessageId,
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.update(convRef, {
      lastMessage: { text, fromUid: uid, messageId: id },
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(r.userConversation(uid, conversationId), {
      conversationId,
      otherUid: toUid,
      lastText: text,
      lastFromUid: uid,
      lastAt: FieldValue.serverTimestamp(),
      unread: 0,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    tx.set(r.userConversation(toUid, conversationId), {
      conversationId,
      otherUid: uid,
      lastText: text,
      lastFromUid: uid,
      lastAt: FieldValue.serverTimestamp(),
      unread: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { messageId: id, conversationId, created: true };
  });
}

/** Clear the caller's own unread count. Never touches the other participant's state. */
async function markConversationRead(db, uid, payload) {
  const body = requireObject(payload, "request");
  const conversationId = requireString(body.conversationId, "conversationId", 128);
  const r = refs(db);

  const convSnap = await r.conversation(conversationId).get();
  if (!convSnap.exists) {
    throw reject("not-found", REASON.conversationNotFound, "This conversation does not exist.");
  }
  if (!(convSnap.get("participants") || []).includes(uid)) {
    throw reject("permission-denied", REASON.conversationNotMember, "You are not part of this conversation.");
  }

  await Promise.all([
    r.conversation(conversationId).set(
      { readAt: { [uid]: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    ),
    r.userConversation(uid, conversationId).set(
      { unread: 0, lastReadAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    ),
  ]);

  return { conversationId, unread: 0 };
}

module.exports = { sendMessage, markConversationRead };
