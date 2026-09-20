"use strict";

const { FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const logger = require("firebase-functions/logger");
const { requireObject, requireString } = require("./validation");
const { REASON, reject } = require("./eligibility");
const { refs, invitationLockId } = require("./refs");

/**
 * Account deletion.
 *
 * Required by both stores, and the right default regardless. The order below matters:
 * the account stops being reachable before the slow work starts, and the Auth user is
 * removed last so a failure part way through can simply be retried.
 *
 * Every step is a delete, so the whole operation is idempotent: calling it again after a
 * partial failure resumes rather than corrupting anything.
 *
 * What is removed:
 *   profile, private profile, push token, account status
 *   blocks the person made, and blocks other people made against them
 *   every invitation they are part of, and its duplicate lock
 *   every conversation they are part of, including all its messages
 *   both participants' inbox entries for those conversations
 *   the Firebase Auth user
 *
 * What is kept, deliberately:
 *   reports filed by or about this person. Safety records must outlive the account they
 *   describe, or deleting an account becomes a way to erase a complaint. They are flagged
 *   so a moderator can see the account is gone. This is a retention exception and must be
 *   disclosed in the privacy policy and the store data declarations.
 *
 * A 1:1 conversation is deleted for both people. The other participant loses the thread.
 * That is the norm for this product category and it avoids leaving them a thread they can
 * never use, but it is a product decision and it is reversible in design.
 */

/** Bounded so a single request cannot run away. See BACKEND-HANDOFF.md on scale. */
const WORK_LIMIT = 500;

async function deleteQueryDocs(db, query, onDoc) {
  const snap = await query.limit(WORK_LIMIT).get();
  let count = 0;
  for (const doc of snap.docs) {
    await onDoc(doc);
    count += 1;
  }
  return count;
}

async function requestAccountDeletion(db, uid, payload) {
  const body = requireObject(payload || {}, "request");
  const confirmation = requireString(body.confirmation, "confirmation", 32);
  if (confirmation !== "DELETE") {
    throw reject(
      "invalid-argument",
      "deletion/not-confirmed",
      'Send confirmation: "DELETE" to delete this account.',
    );
  }

  const r = refs(db);
  const progress = {
    invitations: 0, conversations: 0, inboxEntries: 0,
    blocksMade: 0, blocksReceived: 0, reportsRetained: 0,
  };

  await r.deletionRequest(uid).set({
    uid,
    status: "in_progress",
    requestedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // 1. Stop the account being reachable at all, before the slow work begins.
  await Promise.all([
    r.profile(uid).delete(),
    r.privateProfile(uid).delete(),
    r.pushToken(uid).delete(),
  ]);

  // 2. Invitations, and the locks that would otherwise block a future pair.
  progress.invitations = await deleteQueryDocs(
    db,
    r.invitations().where("participants", "array-contains", uid),
    async (doc) => {
      await r.invitationLock(
        invitationLockId(doc.get("fromUid"), doc.get("toUid"), doc.get("intent")),
      ).delete();
      await doc.ref.delete();
    },
  );

  // 3. Conversations, their messages, and both people's inbox entries.
  progress.conversations = await deleteQueryDocs(
    db,
    r.conversations().where("participants", "array-contains", uid),
    async (doc) => {
      const participants = doc.get("participants") || [];
      for (const participant of participants) {
        await r.userConversation(participant, doc.id).delete();
        progress.inboxEntries += 1;
      }
      // recursiveDelete removes the messages subcollection as well as the document.
      await db.recursiveDelete(doc.ref);
    },
  );

  // 4. Any inbox entry left over, for a conversation already gone.
  progress.inboxEntries += await deleteQueryDocs(
    db, r.userConversationsOf(uid), async (doc) => { await doc.ref.delete(); },
  );
  await db.recursiveDelete(r.userConversationsRoot(uid));

  // 5. Blocks in both directions. The uid is about to stop existing, so a block
  //    document pointing at it is dead weight for whoever created it.
  progress.blocksMade = await deleteQueryDocs(
    db, r.blocksOf(uid), async (doc) => { await doc.ref.delete(); },
  );
  await db.recursiveDelete(r.blocksRoot(uid));

  progress.blocksReceived = await deleteQueryDocs(
    db,
    db.collectionGroup("users").where("blockedUid", "==", uid),
    async (doc) => { await doc.ref.delete(); },
  );

  // 6. Reports are kept. Flag them so a moderator knows the account is gone.
  for (const [field, flag] of [["reporterUid", "reporterDeleted"], ["reportedUid", "reportedUserDeleted"]]) {
    progress.reportsRetained += await deleteQueryDocs(
      db,
      r.reports().where(field, "==", uid),
      async (doc) => {
        await doc.ref.set({ [flag]: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      },
    );
  }

  await r.accountStatus(uid).delete();

  // 7. The Auth user goes last. Until this succeeds the caller can retry the whole
  //    operation, because every step above is a delete.
  let authDeleted = false;
  try {
    await getAuth().deleteUser(uid);
    authDeleted = true;
  } catch (error) {
    if (error && error.code === "auth/user-not-found") {
      authDeleted = true;
    } else {
      logger.error("Account deletion could not remove the auth user", { uid, error: String(error) });
    }
  }

  await r.deletionRequest(uid).set({
    status: authDeleted ? "completed" : "needs_retry",
    authDeleted,
    progress,
    completedAt: authDeleted ? FieldValue.serverTimestamp() : null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  logger.info("Account deletion finished", { uid, authDeleted, progress });

  return {
    status: authDeleted ? "completed" : "needs_retry",
    deleted: progress,
    retained: {
      reports: progress.reportsRetained,
      reason: "Safety reports are retained after account deletion and are disclosed as a retention exception.",
    },
  };
}

/**
 * Suspension state, read on every authenticated call. Absent for almost every account,
 * so this is normally a missing document read.
 */
async function assertNotSuspended(db, uid) {
  const snap = await refs(db).accountStatus(uid).get();
  if (snap.exists && snap.get("suspended") === true) {
    throw reject(
      "permission-denied",
      "account/suspended",
      "This account is suspended. Contact support if you think that is wrong.",
    );
  }
}

module.exports = { requestAccountDeletion, assertNotSuspended, WORK_LIMIT };
