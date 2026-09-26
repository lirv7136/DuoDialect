"use strict";

const crypto = require("crypto");

/**
 * Collection layout.
 *
 * profiles/{uid}                              public, readable by signed in users
 * privateProfiles/{uid}                       owner readable only (birth date, gender, dating prefs)
 * blocks/{uid}/users/{otherUid}               owner readable only
 * invitations/{invitationId}                  participants only
 * invitationLocks/{pairKey}                   server only; one active invitation per pair and intent
 * conversations/{conversationId}              participants only; membership immutable
 * conversations/{id}/messages/{messageId}     participants read; server writes
 * userConversations/{uid}/items/{convId}      owner readable inbox summary
 * pushTokens/{uid}                            owner read and write
 * reports/{reportId}                          server only
 * pushDeliveries/{deliveryId}                 server only; stubbed transport record
 * accountStatus/{uid}                         server only; suspension state
 * deletionRequests/{uid}                      server only; deletion audit trail
 * moderationActions/{actionId}                server only; who did what, and why
 * photoScreening/{uid}_{photoId}              owner may get; server writes; screening verdict
 */
const COLLECTIONS = {
  profiles: "profiles",
  privateProfiles: "privateProfiles",
  blocks: "blocks",
  invitations: "invitations",
  invitationLocks: "invitationLocks",
  conversations: "conversations",
  messages: "messages",
  userConversations: "userConversations",
  pushTokens: "pushTokens",
  reports: "reports",
  pushDeliveries: "pushDeliveries",
  accountStatus: "accountStatus",
  deletionRequests: "deletionRequests",
  moderationActions: "moderationActions",
  photoScreening: "photoScreening",
};

function shortHash(...parts) {
  return crypto.createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
}

/** Stable, order independent key for a pair of users. */
function pairKey(a, b) {
  return [a, b].sort().join("__");
}

/** Sorted participant array. Membership is always stored sorted so it can be compared. */
function participantsOf(a, b) {
  return [a, b].sort();
}

/**
 * Invitation ids are derived from the sender, recipient, intent and the caller's
 * requestKey, so a retried create resolves to the same document instead of a duplicate.
 */
function invitationId(fromUid, toUid, intent, requestKey) {
  return `inv_${shortHash(fromUid, toUid, intent, requestKey)}`;
}

function invitationLockId(a, b, intent) {
  return `lock_${shortHash(pairKey(a, b), intent)}`;
}

/** One conversation per pair and intent, reused by later accepted invitations. */
function conversationId(a, b, intent) {
  return `conv_${shortHash(pairKey(a, b), intent)}`;
}

/** Message ids are derived from the sender's clientMessageId so retries are idempotent. */
function messageId(conversationIdValue, senderUid, clientMessageId) {
  return `msg_${shortHash(conversationIdValue, senderUid, clientMessageId)}`;
}

/**
 * One screening record per uploaded photo. Photo ids never contain an underscore, so the
 * owner is everything before the last one; firestore.rules relies on that.
 */
function photoScreeningId(uid, photoId) {
  return `${uid}_${photoId}`;
}

function refs(db) {
  return {
    profile: (uid) => db.collection(COLLECTIONS.profiles).doc(uid),
    privateProfile: (uid) => db.collection(COLLECTIONS.privateProfiles).doc(uid),
    block: (uid, otherUid) =>
      db.collection(COLLECTIONS.blocks).doc(uid).collection("users").doc(otherUid),
    blocksOf: (uid) => db.collection(COLLECTIONS.blocks).doc(uid).collection("users"),
    invitation: (id) => db.collection(COLLECTIONS.invitations).doc(id),
    invitations: () => db.collection(COLLECTIONS.invitations),
    invitationLock: (id) => db.collection(COLLECTIONS.invitationLocks).doc(id),
    conversation: (id) => db.collection(COLLECTIONS.conversations).doc(id),
    message: (conversationIdValue, id) =>
      db.collection(COLLECTIONS.conversations).doc(conversationIdValue)
        .collection(COLLECTIONS.messages).doc(id),
    userConversation: (uid, conversationIdValue) =>
      db.collection(COLLECTIONS.userConversations).doc(uid)
        .collection("items").doc(conversationIdValue),
    pushToken: (uid) => db.collection(COLLECTIONS.pushTokens).doc(uid),
    reports: () => db.collection(COLLECTIONS.reports),
    pushDeliveries: () => db.collection(COLLECTIONS.pushDeliveries),
    profiles: () => db.collection(COLLECTIONS.profiles),
    conversations: () => db.collection(COLLECTIONS.conversations),
    messagesOf: (conversationIdValue) =>
      db.collection(COLLECTIONS.conversations).doc(conversationIdValue)
        .collection(COLLECTIONS.messages),
    userConversationsRoot: (uid) => db.collection(COLLECTIONS.userConversations).doc(uid),
    userConversationsOf: (uid) =>
      db.collection(COLLECTIONS.userConversations).doc(uid).collection("items"),
    blocksRoot: (uid) => db.collection(COLLECTIONS.blocks).doc(uid),
    accountStatus: (uid) => db.collection(COLLECTIONS.accountStatus).doc(uid),
    deletionRequest: (uid) => db.collection(COLLECTIONS.deletionRequests).doc(uid),
    moderationActions: () => db.collection(COLLECTIONS.moderationActions),
    report: (id) => db.collection(COLLECTIONS.reports).doc(id),
    photoScreening: (uid, photoId) =>
      db.collection(COLLECTIONS.photoScreening).doc(photoScreeningId(uid, photoId)),
    photoScreenings: () => db.collection(COLLECTIONS.photoScreening),
  };
}

module.exports = {
  COLLECTIONS,
  refs,
  pairKey,
  participantsOf,
  invitationId,
  invitationLockId,
  conversationId,
  messageId,
  photoScreeningId,
  shortHash,
};
