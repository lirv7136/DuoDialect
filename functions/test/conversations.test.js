"use strict";

/**
 * Conversations: messaging authority, retries, unread state, blocks and notifications.
 *
 * Push delivery runs through the stub transport because the Functions emulator is in
 * use, so these tests record what would have been sent and deliver nothing.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clearEmulators, shutdown, makeActor, anonymousActor, expectFailure, expectDenied,
  futureMeeting, admin, waitFor, where, orderBy, serverTimestamp,
} = require("./helpers/env");
const { castOf, CAST } = require("./helpers/actors");

let ren; let stranger;
let pairSeq = 0;

/** A fresh accepted pair with an open conversation. */
async function acceptedPair() {
  const suffix = ++pairSeq;
  const speaker = await makeActor(`chat-speaker${suffix}`);
  const learner = await makeActor(`chat-learner${suffix}`);
  speaker.profile = (await speaker.call("upsertProfile", { ...CAST.alex, displayName: `Speaker ${suffix}` })).profile;
  learner.profile = (await learner.call("upsertProfile", { ...CAST.aiko, displayName: `Learner ${suffix}` })).profile;

  const { invitation } = await speaker.call("createInvitation", {
    toUid: learner.uid, intent: "platonic", requestKey: `chat-${suffix}`,
    note: "Thursday coffee?", meeting: futureMeeting(),
  });
  const accepted = await learner.call("respondToInvitation", {
    invitationId: invitation.id, action: "accept",
  });
  return { speaker, learner, conversationId: accepted.conversationId, invitationId: invitation.id };
}

test.before(async () => {
  await clearEmulators();
  ({ ren } = await castOf("ren"));
  stranger = anonymousActor();
});

test.after(async () => { await shutdown(); });

test("both participants can message, and both can read the thread in order", async () => {
  const { speaker, learner, conversationId } = await acceptedPair();

  await speaker.call("sendMessage", { conversationId, text: "Hello! Thursday works.", clientMessageId: "m1" });
  await learner.call("sendMessage", { conversationId, text: "Great, see you then.", clientMessageId: "m2" });

  for (const actor of [speaker, learner]) {
    const messages = await actor.readAll(`conversations/${conversationId}/messages`, orderBy("createdAt"));
    assert.equal(messages.size, 2);
    assert.deepEqual(messages.docs.map((doc) => doc.get("text")), ["Hello! Thursday works.", "Great, see you then."]);
    assert.deepEqual(messages.docs.map((doc) => doc.get("fromUid")), [speaker.uid, learner.uid]);
  }

  const conversation = await speaker.read(`conversations/${conversationId}`);
  assert.equal(conversation.get("lastMessage").text, "Great, see you then.");
  assert.equal(conversation.get("lastMessage").fromUid, learner.uid);
});

test("the sender is the verified caller, whatever the payload claims", async () => {
  const { speaker, learner, conversationId } = await acceptedPair();

  await speaker.call("sendMessage", {
    conversationId, text: "Signed by someone else?", clientMessageId: "forge-1",
    // All of these are ignored: the sender comes from the auth token.
    fromUid: learner.uid, from: learner.uid, toUid: speaker.uid, participants: [speaker.uid, ren.uid],
  });

  const messages = await learner.readAll(`conversations/${conversationId}/messages`);
  assert.equal(messages.size, 1);
  assert.equal(messages.docs[0].get("fromUid"), speaker.uid, "the message must be attributed to the caller");
  assert.equal(messages.docs[0].get("toUid"), learner.uid);
  assert.deepEqual(messages.docs[0].get("participants"), [speaker.uid, learner.uid].sort());
});

test("messages cannot be written, edited or deleted directly", async () => {
  const { speaker, learner, conversationId } = await acceptedPair();
  await speaker.call("sendMessage", { conversationId, text: "Real message", clientMessageId: "real-1" });

  await expectDenied(
    learner.append(`conversations/${conversationId}/messages`, {
      fromUid: speaker.uid, text: "I never said this", createdAt: serverTimestamp(),
    }),
    "forging a message from the other participant",
  );
  await expectDenied(
    speaker.write(`conversations/${conversationId}/messages/injected`, {
      participants: [speaker.uid, learner.uid].sort(), fromUid: speaker.uid, text: "Injected",
    }),
    "writing a message document directly",
  );

  const existing = await admin().collection(`conversations/${conversationId}/messages`).get();
  const id = existing.docs[0].id;
  await expectDenied(
    speaker.patch(`conversations/${conversationId}/messages/${id}`, { text: "Edited after the fact" }),
    "editing a sent message",
  );
  await expectDenied(
    speaker.remove(`conversations/${conversationId}/messages/${id}`),
    "deleting a sent message",
  );
});

test("an outsider can neither read nor send into a conversation", async () => {
  const { conversationId } = await acceptedPair();

  const error = await expectFailure(
    ren.call("sendMessage", { conversationId, text: "Let me in", clientMessageId: "outsider-1" }),
    "permission-denied",
  );
  assert.equal(error.details.reason, "conversation/not-member");

  await expectDenied(ren.readAll(`conversations/${conversationId}/messages`), "outsider reading the thread");
  await expectDenied(ren.read(`conversations/${conversationId}`), "outsider reading the conversation");
  await expectFailure(
    ren.call("markConversationRead", { conversationId }),
    "permission-denied",
  );
  await expectFailure(
    stranger.call("sendMessage", { conversationId, text: "Anonymous", clientMessageId: "anon-1" }),
    "unauthenticated",
  );
});

test("a retried send with the same client message id writes one message", async () => {
  const { speaker, learner, conversationId } = await acceptedPair();

  const first = await speaker.call("sendMessage", { conversationId, text: "Only once", clientMessageId: "dedupe-1" });
  const second = await speaker.call("sendMessage", { conversationId, text: "Only once", clientMessageId: "dedupe-1" });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.messageId, second.messageId);

  const messages = await learner.readAll(`conversations/${conversationId}/messages`);
  assert.equal(messages.size, 1, "a retry must not duplicate the message");

  // And the unread counter was incremented exactly once.
  const inbox = await learner.read(`userConversations/${learner.uid}/items/${conversationId}`);
  assert.equal(inbox.get("unread"), 1);
});

test("unread counts follow the recipient only, and mark read clears just the caller's", async () => {
  const { speaker, learner, conversationId } = await acceptedPair();

  await speaker.call("sendMessage", { conversationId, text: "One", clientMessageId: "u1" });
  await speaker.call("sendMessage", { conversationId, text: "Two", clientMessageId: "u2" });

  const learnerInbox = await learner.read(`userConversations/${learner.uid}/items/${conversationId}`);
  const speakerInbox = await speaker.read(`userConversations/${speaker.uid}/items/${conversationId}`);
  assert.equal(learnerInbox.get("unread"), 2);
  assert.equal(speakerInbox.get("unread"), 0, "the sender never accrues unread messages");
  assert.equal(learnerInbox.get("lastText"), "Two");

  await learner.call("markConversationRead", { conversationId });
  const cleared = await learner.read(`userConversations/${learner.uid}/items/${conversationId}`);
  assert.equal(cleared.get("unread"), 0);

  // Reading does not touch the other participant's state.
  await learner.call("sendMessage", { conversationId, text: "Back to you", clientMessageId: "u3" });
  const speakerAfter = await speaker.read(`userConversations/${speaker.uid}/items/${conversationId}`);
  assert.equal(speakerAfter.get("unread"), 1);
});

test("a block stops messaging in both directions", async () => {
  const { speaker, learner, conversationId } = await acceptedPair();
  await speaker.call("sendMessage", { conversationId, text: "Before the block", clientMessageId: "b0" });

  await learner.call("setBlock", { otherUid: speaker.uid, blocked: true });

  const fromBlocked = await expectFailure(
    speaker.call("sendMessage", { conversationId, text: "Still here?", clientMessageId: "b1" }),
    "permission-denied",
  );
  assert.equal(fromBlocked.details.reason, "target/unavailable");

  const fromBlocker = await expectFailure(
    learner.call("sendMessage", { conversationId, text: "And from my side", clientMessageId: "b2" }),
    "permission-denied",
  );
  assert.equal(fromBlocker.details.reason, "target/unavailable");

  const messages = await admin().collection(`conversations/${conversationId}/messages`).get();
  assert.equal(messages.size, 1, "no message may be written once a block exists");
});

test("message text is validated", async () => {
  const { speaker, conversationId } = await acceptedPair();

  await expectFailure(speaker.call("sendMessage", { conversationId, text: "   ", clientMessageId: "v1" }), "invalid-argument");
  await expectFailure(speaker.call("sendMessage", { conversationId, text: "hi" }), "invalid-argument");
  await expectFailure(
    speaker.call("sendMessage", { conversationId, text: "x".repeat(2001), clientMessageId: "v2" }),
    "invalid-argument",
  );
  await expectFailure(
    speaker.call("sendMessage", { conversationId: "conv_nope", text: "hello", clientMessageId: "v3" }),
    "not-found",
  );

  // Unicode and a long but permitted message are accepted.
  const ok = await speaker.call("sendMessage", {
    conversationId, text: "こんにちは 👋 " + "x".repeat(100), clientMessageId: "v4",
  });
  assert.equal(ok.created, true);
});

test("a message notification is prepared for the recipient through the stub transport", async () => {
  const { speaker, learner, conversationId } = await acceptedPair();

  await learner.write(`pushTokens/${learner.uid}`, {
    token: `ExponentPushToken[${learner.uid}]`, platform: "ios", updatedAt: serverTimestamp(),
  });

  await speaker.call("sendMessage", { conversationId, text: "See you Thursday", clientMessageId: "push-1" });

  const delivery = await waitFor(async () => {
    const snap = await admin().collection("pushDeliveries").where("toUid", "==", learner.uid).where("data.type", "==", "message").get();
    return snap.empty ? null : snap.docs[0];
  }, { label: "the stubbed push delivery" });

  assert.equal(delivery.get("transport"), "stub", "tests must never use the real transport");
  assert.equal(delivery.get("title"), speaker.profile.displayName);
  assert.equal(delivery.get("body"), "See you Thursday");
  assert.equal(delivery.get("data").conversationId, conversationId);
  assert.equal(delivery.get("data").otherUid, speaker.uid);
  assert.equal(delivery.get("data").type, "message");
});

test("the invitee is notified of a new plan, and the sender when it is accepted", async () => {
  const suffix = ++pairSeq;
  const speaker = await makeActor(`plan-speaker${suffix}`);
  const learner = await makeActor(`plan-learner${suffix}`);
  await speaker.call("upsertProfile", { ...CAST.alex, displayName: `Planner ${suffix}` });
  await learner.call("upsertProfile", { ...CAST.aiko, displayName: `Invitee ${suffix}` });
  for (const actor of [speaker, learner]) {
    await actor.write(`pushTokens/${actor.uid}`, {
      token: `ExponentPushToken[${actor.uid}]`, platform: "ios", updatedAt: serverTimestamp(),
    });
  }

  const { invitation } = await speaker.call("createInvitation", {
    toUid: learner.uid, intent: "platonic", requestKey: `plan-push-${suffix}`,
    note: "Coffee?", meeting: futureMeeting(),
  });
  const invited = await waitFor(async () => {
    const snap = await admin().collection("pushDeliveries").where("toUid", "==", learner.uid).get();
    return snap.empty ? null : snap.docs[0];
  }, { label: "the invitation notification" });
  assert.equal(invited.get("title"), `Planner ${suffix}`);
  assert.match(invited.get("body"), /^Suggested a language swap on /);
  assert.equal(invited.get("data").type, "plan");
  assert.equal(invited.get("data").invitationId, invitation.id);

  const accepted = await learner.call("respondToInvitation", { invitationId: invitation.id, action: "accept" });
  const heard = await waitFor(async () => {
    const snap = await admin().collection("pushDeliveries").where("toUid", "==", speaker.uid).get();
    return snap.empty ? null : snap.docs[0];
  }, { label: "the acceptance notification" });
  assert.equal(heard.get("title"), `Invitee ${suffix}`);
  assert.match(heard.get("body"), /^Accepted your plan for .*Say hello!$/);
  assert.equal(heard.get("data").conversationId, accepted.conversationId);
});

test("no notification is prepared when a block exists", async () => {
  const { speaker, learner, conversationId } = await acceptedPair();
  await learner.write(`pushTokens/${learner.uid}`, {
    token: `ExponentPushToken[${learner.uid}]`, platform: "ios", updatedAt: serverTimestamp(),
  });

  // Write the message with the Admin SDK so the trigger runs while a block exists:
  // sendMessage itself would have refused, so this isolates the trigger's own check.
  await admin().doc(`blocks/${learner.uid}/users/${speaker.uid}`).set({ blockedUid: speaker.uid });
  await admin().doc(`conversations/${conversationId}/messages/manual`).set({
    id: "manual", conversationId, participants: [speaker.uid, learner.uid].sort(),
    fromUid: speaker.uid, toUid: learner.uid, text: "Should not notify",
    createdAt: new Date(),
  });

  await new Promise((resolve) => setTimeout(resolve, 2500));
  const snap = await admin().collection("pushDeliveries").where("toUid", "==", learner.uid).where("data.type", "==", "message").get();
  assert.equal(snap.size, 0, "a blocked recipient must not be notified");
});

test("a report is recorded for moderation and is invisible to the reporter", async () => {
  const { speaker, learner, conversationId } = await acceptedPair();
  await speaker.call("sendMessage", { conversationId, text: "Something upsetting", clientMessageId: "r1" });

  const result = await learner.call("reportUser", {
    reportedUid: speaker.uid, conversationId, reason: "harassment", detail: "Repeated unwanted messages.",
  });
  assert.equal(result.status, "received");

  const stored = await admin().doc(`reports/${result.reportId}`).get();
  assert.equal(stored.get("reporterUid"), learner.uid);
  assert.equal(stored.get("reportedUid"), speaker.uid);
  assert.equal(stored.get("reason"), "harassment");
  assert.equal(stored.get("status"), "received");

  await expectDenied(learner.read(`reports/${result.reportId}`), "the reporter reading their own report");

  // A report cannot be attached to a conversation the reporter is not part of.
  const error = await expectFailure(
    ren.call("reportUser", { reportedUid: speaker.uid, conversationId, reason: "spam" }),
    "permission-denied",
  );
  assert.equal(error.details.reason, "conversation/not-member");

  await expectFailure(
    learner.call("reportUser", { reportedUid: speaker.uid, reason: "not-a-listed-reason" }),
    "invalid-argument",
  );
});

test("a participant cannot rewrite conversation metadata to fake activity", async () => {
  const { speaker, learner, conversationId } = await acceptedPair();

  await expectDenied(
    speaker.merge(`conversations/${conversationId}`, { lastMessage: { text: "Faked", fromUid: learner.uid } }),
    "rewriting the conversation summary",
  );
  await expectDenied(
    speaker.merge(`userConversations/${learner.uid}/items/${conversationId}`, { unread: 0 }),
    "clearing the other participant's unread count",
  );
  await expectDenied(
    speaker.merge(`userConversations/${speaker.uid}/items/${conversationId}`, { unread: 0 }),
    "writing even one's own inbox summary directly",
  );
});
