# Backend handoff

19 September 2026, extended 20 September; status updated 7 October 2026.

**Current status (7 Oct).** The backend is committed and deployed. Staging
(`duodialect-staging`, Sydney) was deployed 30 Sep, and check-ins were verified live there
2 to 4 Oct. Production (`duodialect`) has functions, rules and indexes, including the two
check-in indexes, deployed 4 to 5 Oct; Cloud Scheduler for the hourly `sweepCheckIns` was
enabled automatically and the sweep runs clean. There are 16+ callables plus
`answerCheckIn`, and 115 emulator tests pass. Check-in code was committed in 7088a70 on
`feat-checkins`, merged to `feat-server-push` through PR #1 (1d1be40). The `backend-access`
release gate is passed. iOS 1.0.1 is live on this backend. What is genuinely left is under
"Remaining work" at the end.

The sections below record the original 19 to 20 September work. At that time everything was
uncommitted and undeployed, groups and dating were still in scope (both have since been
dropped from the product), and tests ran against local emulators with the demo project id
`demo-duodialect`.

The integration surface is in `docs/BACKEND-CONTRACT.md`. This document records what
changed, what was actually verified, what the native client must change, and what remains.

## Files changed

Added:

| File | Purpose |
| --- | --- |
| `firestore.rules` | Authorization. Default deny; the legacy collections are closed. |
| `firestore.indexes.json` | The five composite indexes the queries need. |
| `functions/lib/constants.js` | Shared vocabulary and limits. |
| `functions/lib/validation.js` | Input validation, language normalisation, time zone handling. |
| `functions/lib/refs.js` | Collection layout and deterministic document ids. |
| `functions/lib/eligibility.js` | The single gate: reciprocal languages, adult age, dating consent, blocks. |
| `functions/lib/profiles.js` | `upsertProfile`, `setDatingConsent`, `getMyAccount`. |
| `functions/lib/discovery.js` | Server side candidate search. |
| `functions/lib/invitations.js` | Create, accept, decline, cancel, and the cancellation cascades. |
| `functions/lib/conversations.js` | `sendMessage`, `markConversationRead`. |
| `functions/lib/safety.js` | `setBlock`, `reportUser`. |
| `functions/lib/accounts.js` | `requestAccountDeletion` and the suspension check. |
| `functions/lib/moderation.js` | `listReports`, `getReportContext`, `actOnReport`. |
| `functions/scripts/set-moderator.js` | Grants or revokes the `moderator` auth claim. |
| `functions/lib/notifier.js` | Push transport, stubbed under the emulator. |
| `functions/test/helpers/env.js` | Emulator harness: multiple signed in actors, assertions. |
| `functions/test/helpers/actors.js` | The standing cast, created through the real callables. |
| `functions/test/rules.test.js` | 14 tests: authorization. |
| `functions/test/eligibility.test.js` | 17 tests: matching, age, consent, blocks, discovery. |
| `functions/test/invitations.test.js` | 19 tests: transitions, retries, races, revocation. |
| `functions/test/conversations.test.js` | 12 tests: messaging, forgery, idempotency, notifications. |
| `functions/test/deletion.test.js` | 12 tests: the deletion cascade, retention, retry, suspension. |
| `functions/test/moderation.test.js` | 10 tests: operator identity, audit trail, suspension. |
| `docs/BACKEND-CONTRACT.md` | Integration contract. |
| `docs/BACKEND-HANDOFF.md` | This document. |

Modified:

- `functions/index.js` — rewritten. Fifteen callables plus the message notification
  trigger. The shared wrapper now also enforces suspension and the moderator claim. The previous `onMessageCreated` trigger on `chats/{chatId}/messages` is
  replaced by `onConversationMessageCreated` on `conversations/{id}/messages`.
- `functions/package.json` — added `firebase` as a dev dependency for the tests, and a
  `test` script that runs the suite inside `firebase emulators:exec`.
- `functions/package-lock.json` — the install.
- `firebase.json` — added the `firestore` block and emulator ports. The existing
  `functions` block is unchanged.

Nothing outside the agreed ownership was touched. `app/**`, `src/**`, `prototype/**`,
`app.json`, `eas.json`, the root `package.json` and `package-lock.json`, `docs/RELEASE-PLAN.md`
and `docs/release-readiness.json` are exactly as they were. The uncommitted native work in
the tree was left alone.

## Review of the existing message notification function

The previous trigger took the sender from the message payload and read membership from
`chats/{chatId}`, a document any client could write, including a client that added itself
to the members array. Those inputs are now server owned, so the replacement can trust
them. It still re-checks blocks in both directions, because a block can be created between
the send and the trigger running. Its behaviour of skipping delivery on a missing or
malformed token is preserved.

If the old function is currently deployed, deploying this codebase will remove it, since
the export no longer exists.

## Commands run, and what they produced

```sh
cd ~/dev/lingoswipe/functions
npm install --save-dev firebase          # added 40 packages
npm test                                 # the full suite
```

`npm test` expands to:

```sh
firebase emulators:exec --project demo-duodialect --config ../firebase.json \
  --only auth,firestore,functions "node --test --test-concurrency=1 test/*.test.js"
```

Result, on the last run:

```
# tests 84
# pass 84
# fail 0
```

Six files: rules 14, eligibility 17, invitations 19, conversations 12, deletion 12,
moderation 10. They run serially and take roughly 45 seconds.

To watch the emulators while working, `npm run serve` in `functions/` starts the same
three emulators against the same demo project.

The suite needs Java for the Firestore emulator (OpenJDK 21 is installed here) and the
global `firebase-tools` (15.1.0). Test dependencies live entirely inside `functions/`.

### What the tests actually exercise

Three signed in members and one unauthenticated client, against the real emulators. The
callables are invoked over the wire with real auth tokens; direct database access goes
through the real rules. No backend logic is reimplemented in a mock. The only stub is the
push transport, which records what would have been sent instead of contacting Expo.

Successful flows:

- A reciprocal pair invite, accept, and hold a two way conversation.
- Discovery returns reciprocal partners in platonic mode, and only mutually eligible
  people in dating mode.
- Meeting time, time zone and recurrence are stored explicitly, and the derived instant is
  checked to be 18:30 in `Australia/Sydney`, not in the server's own zone.
- Unread counts rise for the recipient only, and `markConversationRead` clears just the
  caller's.
- A message notification is prepared for the recipient with the right title, body and
  deep link data.
- A report is recorded for moderation, appears in the moderator's queue with both
  parties named, and can be claimed, dismissed, warned on, actioned or reinstated.
- A moderator reads the reported thread for context, and that read is itself audited.
- An account deletes itself: profile, private profile, push token, blocks in both
  directions, invitations and their locks, the conversation and all of its messages, both
  inbox entries, and the Firebase Auth user.
- A report about a deleted account still opens, showing the account is gone.

Adversarial attempts, each asserted to fail:

- Unauthenticated reads of profiles, private profiles, invitations and conversations;
  unauthenticated calls to all eleven callables.
- Reading another member's private profile, push token, inbox or blocks.
- Listing the member base, listing invitations that are not the caller's.
- Writing one's own or another member's public profile, private profile or block document.
- Granting oneself a different birth date or dating consent.
- Creating an invitation or a conversation directly, in `accepted` state.
- Replacing conversation membership, as a participant and as an outsider.
- Forging a message from the other participant; editing or deleting a sent message;
  sending a message with a payload that claims a different sender.
- An outsider sending into, reading, or marking read a conversation they are not in.
- Writing to `users/`, `chats/`, `matches/`, `swipes/`, `reports/`, `invitationLocks/`,
  `pushDeliveries/`, and to an undeclared collection.
- Push token documents with an unknown platform or extra fields.
- Non reciprocal pairs; a pair sharing a language where the offering side is only
  intermediate; a profile with no language it can offer; a profile offering and
  practising the same language.
- A self declared 16 year old creating an account.
- Dating with the other side opted out, with the caller opted out, with mismatched age
  ranges, and with mismatched gender preferences, in both directions.
- Dating discovery without the caller's own consent.
- Inviting or discovering a member who blocked the caller, and one the caller blocked.
- Inviting oneself; naming a language outside the reciprocal set; a meeting in the past,
  in an unknown time zone, or at an impossible clock time.
- A second open invitation for a pair and intent, in either direction.
- The sender accepting their own invitation; an outsider accepting or declining; the
  recipient cancelling.
- Accepting a declined or cancelled invitation.
- Messages that are empty, whitespace, over 2000 characters, or missing the client id.
- Deletion without the literal `"DELETE"` confirmation, and deletion by an anonymous
  caller. A refused attempt leaves the account untouched.
- Reading or writing `deletionRequests`, `accountStatus` and `moderationActions` from a
  client, including from a client holding the moderator claim.
- Every moderation callable invoked by an ordinary member and by an anonymous caller.
- A suspended account trying to discover, message or invite.

Retries, races and changes of mind:

- A repeated create with the same `requestKey` returns the same invitation and leaves one
  document.
- A repeated send with the same `clientMessageId` writes one message and increments
  unread once.
- Repeated accept, decline and cancel are idempotent.
- Two simultaneous acceptances produce exactly one conversation and one `changed: true`.
- Blocking cancels the pending invitation; withdrawing dating consent cancels pending
  dating invitations but not platonic ones.
- With the cascade deliberately bypassed by writing the block or the consent change
  directly with the Admin SDK, acceptance still fails, proving the acceptance transaction
  revalidates rather than relying on the cascade. The invitation is left untouched and no
  conversation is created.
- Changing a language so the exchange no longer holds stops a later acceptance.
- Cancelling releases the duplicate lock so a new invitation can be sent.
- A deletion that already lost its profile document completes on a retry rather than
  failing on the missing document.
- A suspended account can still delete itself, and the suspension record goes with it.
- Safety reports survive deletion and are flagged on both sides.

## Required native client changes

The current client writes directly to collections that are now closed. These are
incompatibilities, not regressions to work around: the writes were unsafe. Most visibly,
`app/(tabs)/index.tsx` writes `matches/{otherUid}/with/{me}` and `app/chat/[chatId].tsx`
writes the same document to bump unread, both of which are writes into another person's
data, and the old swipe flow created an accepted match from one side alone.

| Current client code | Status | Replacement |
| --- | --- | --- |
| `src/lib/profile.ts` `ensureUserProfile` / `updateUserProfile` writing `users/{uid}` | closed | `upsertProfile` callable |
| `src/lib/profile.ts` `getUserProfile` reading `users/{uid}` | closed | `getMyAccount` for self, `doc(db, "profiles", uid)` for others |
| `app/(tabs)/index.tsx` `query(collection(db, "users"), limit(50))` | closed | `discoverCandidates` callable, paged with `cursor` |
| `app/(tabs)/index.tsx` writes to `swipes/**` | removed | no equivalent; the swipe model is replaced by invitations |
| `app/(tabs)/index.tsx` writes to `matches/{me}/with/**` and `matches/{other}/with/**` | closed | `createInvitation`, then `respondToInvitation` by the recipient |
| `app/(tabs)/matches.tsx` and `app/(tabs)/_layout.tsx` reading `matches/{me}/with` | closed | `userConversations/{uid}/items`, ordered by `lastAt` |
| `app/(tabs)/matches.tsx` patching match documents | closed | server written; use `markConversationRead` |
| `src/lib/chat.ts` `ensureChat` and `chatIdFor` | closed | the conversation id comes back from `respondToInvitation`; membership is never healed |
| `app/chat/[chatId].tsx` `addDoc` to `chats/{id}/messages` with a client `from` | closed | `sendMessage` callable with a `clientMessageId` |
| `app/chat/[chatId].tsx` chat metadata, `readAt` and unread writes | closed | written by the server; `markConversationRead` for read state |
| `app/chat/[chatId].tsx` typing indicator writes | closed | not implemented; see limitations |
| `src/lib/safety.ts` `blockUser` writing `blocks/**` and deleting a match | closed | `setBlock` callable, which also cancels invitations |
| `src/lib/safety.ts` `reportUser` adding to `reports` | closed | `reportUser` callable |
| `src/lib/push.ts` writing `pushTokens/{uid}` | **compatible** | unchanged; the rules accept exactly `{ token, platform, updatedAt }` with `platform` in `ios` or `android` |
| no account deletion anywhere in `src/lib/auth.ts` | **new screen needed** | reauthenticate, confirm, then `requestAccountDeletion` with `confirmation: "DELETE"` |
| no public deletion page | **new web route needed** | a page on the website that signs the person in and calls the same callable, for people who uninstalled |

Two client behaviours to add rather than port:

- **Idempotency keys.** Generate a `requestKey` per invitation and a `clientMessageId` per
  message, persist them across a retry, and reuse them. Without this, a retry after a
  timeout is a new operation.
- **Query shapes.** A Firestore `list` must carry the filter its rule depends on. Listing
  invitations or conversations without `where("participants", "array-contains", uid)`
  fails with `permission-denied` even for documents the caller may read. The contract
  lists every permitted read shape.

One profile field change worth noting: the public profile uses `displayName`, not `name`.

## Known limitations

- **Age and fluency are self declared.** `ageAssurance` and `fluencyAssurance` are both
  the literal string `"self-declared"`. There is no verification mechanism anywhere in
  this backend, and the UI must not imply one.
- **Adults only is enforced at account creation.** A self declared birth date under 18 is
  refused. That matches the reviewed prototype's stated scope. The dating gate re-checks
  age independently, so an edited or stale record still fails. Whether the product should
  instead admit under 18s for platonic exchange only is a product decision, and it would
  need its own child safety review before being considered.
- **Recurrence is stored, not managed.** `recurrence: "weekly"` is recorded and returned.
  No occurrences are materialised, none can be cancelled individually, nothing reschedules
  them, and there are no reminders.
- **Notifications cover messages, new invitations, acceptances and check-ins** (since
  extended; see the contract). Declines and cancellations send nothing.
- **A profile change does not cancel pending invitations.** If somebody changes the
  languages that made an exchange reciprocal, the invitation stays pending and fails at
  acceptance with `language/not-reciprocal`. Blocks and dating consent do cascade. A
  cascade on language change would be an improvement.
- **Discovery does not scale.** It scans up to 60 public profiles per call, then filters in
  memory, and in dating mode reads one private document per surviving candidate. It is
  correct and it does not leak, but it is not a ranked feed and it will need a dedicated
  index well before a large member base. It also has no ranking at all: results come back
  in document id order.
- **Unblocking does not revive cancelled invitations,** by design. They must be resent.
- **No typing indicators, no read receipts between participants.** `markConversationRead`
  writes a `readAt` entry on the conversation, which the other participant can read, but
  nothing surfaces it and typing state is not implemented.
- **No rate limiting and no abuse throttles.** A signed in account can call the callables
  as fast as it likes. This matters most for `createInvitation` and `sendMessage`.
- **App Check is not enforced.** The callables verify the user but not the app instance.
- **No message editing or deletion, and no conversation archiving or deletion.**
- **Deletion runs in one request.** It processes up to 500 documents per collection and
  is given a 540 second timeout. That is comfortable at current volumes and it retries
  safely, but a very large account would need a queued worker rather than a callable.
- **Deletion is immediate and irreversible.** There is no grace period and no undo, and
  the backend does not require a recent login, so the client must reauthenticate before
  calling.
- **Deleting an account deletes the shared conversation** for the other participant too.
  Deliberate, and reversible in design if you would rather tombstone it.
- **Moderation has no operator interface.** There are callables and an audit trail, but
  no screen. Until one exists, a moderator has to drive it from a script or a console.
- **Moderation is entirely reactive.** No automated detection, no notification to either
  party, no appeals process, no rate limits on reporting, so the report queue itself can
  be spammed.
- **Suspension costs one document read on every authenticated call.** `accountStatus` is
  absent for almost every account, so it is normally a missing document read, but it is
  on the hot path for every callable.
- **`functions/package.json` declares Node 24.** The local Node is 20, so the emulator
  warns and runs on 20. Confirm the runtime is actually available for Cloud Functions
  before deploying, and pin it to a supported version if not.
- **The emulator suite runs serially** (`--test-concurrency=1`) because each file clears
  the emulator state. It takes about 30 seconds.

## Indexes and environment configuration

`firestore.indexes.json` declares seven composite indexes:

| Collection | Fields | Used by |
| --- | --- | --- |
| `profiles` | `discoverable`, `offers` (array), `uid` | `discoverCandidates` |
| `invitations` | `participants` (array), `status` | the cancellation cascades |
| `invitations` | `participants` (array), `status`, `intent` | the dating consent cascade |
| `invitations` | `participants` (array), `createdAt` desc | the client's invitation list |
| `conversations` | `participants` (array), `updatedAt` desc | the client's conversation list |
| `reports` | `status`, `createdAt` desc | the moderator queue |
| `users` (collection group) | `blockedUid` | clearing inbound blocks on deletion |

The emulator does not enforce indexes. They have since been deployed with the rules to
staging and production, and the deployed queries run against them.

Environment:

- `DUODIALECT_PUSH_TRANSPORT` selects the push transport, `stub` or `expo`. When unset it
  is `stub` whenever the Functions emulator is running and `expo` otherwise, so a local
  run can never deliver to a real device.
- No secrets, service account keys or API keys were added, and none are needed for the
  emulator suite.
- `firebase.json` now points at `firestore.rules` and `firestore.indexes.json`, and pins
  emulator ports: auth 9099, firestore 8080, functions 5001, UI disabled.
- `.firebaserc` names the production `duodialect` project as its only (default) alias, so
  pass `--project duodialect-staging` explicitly for staging. Changes are verified on
  staging before production.

## Post meetup check-ins (added 29 Sep)

`lib/checkins.js`, the `answerCheckIn` callable and the hourly `sweepCheckIns` scheduled
function. Covered by `test/checkins.test.js` (12 tests), which runs the sweep directly with
an explicit clock because the emulator does not fire scheduled functions. See
`answerCheckIn` in BACKEND-CONTRACT.md for behaviour.

Deploy steps (all done: staging 30 Sep, production 4 to 5 Oct):

- [x] Deploy the two new indexes in `firestore.indexes.json` (invitations by `status` and
  `nextCheckInAt`; checkIns by `uid`, `status`, `dueAt`) before the functions, or the
  first sweeps fail on a missing index.
- [x] Enable Cloud Scheduler on the project for the hourly sweep. `firebase deploy`
  enabled it automatically, and the sweep runs clean.
- [x] Backfill of `nextCheckInAt` for plans accepted before the 4 Oct production deploy:
  not needed. Production had no accepted invitations at the deploy (only 2 pending,
  created 2026-10-06), so no plan missed a check-in. If one is ever needed, it can set
  `nextCheckInAt` from `meeting.localDate` with `initialSchedule`.
- The client side is built: `app/check-in/[checkInId].tsx` (the questions, plus a report
  link), a "How did it go?" card at the top of Plans (`components/check-in-card.tsx`), and
  `type: "checkIn"` push routing. Builds released before it ignore a `checkIn` push
  (`notificationTarget` returns null for unknown types), so the backend can ship first.

## Remaining work

Done since the original handoff: the native screens against the contract, client side
idempotency keys, the in app deletion screen, the public deletion page
(https://talkeven.com/delete-account/), the privacy policy (including the report retention
exception), the store data declarations, a named operator and child safety contact on
talkeven.com, notifications for invitations and acceptances, the staging project, and the
deploys to staging and production. Groups were removed from the app in 1.0.1 and dating is
out of scope, so neither is backend work now.

**App Check and rate limits**

App Check is not enforced: the callables verify the user but not the app instance. There is
no rate limiting or abuse throttling; this matters most for `createInvitation`,
`sendMessage` and `reportUser`, where a signed in account can call as fast as it likes and
the report queue itself can be spammed.

**Moderation operator tools**

There is an operator role, a queue, a context read, a stop button and an audit trail that
covers looking as well as acting. Grant the claim with
`node scripts/set-moderator.js <email> --project <id>`; the person must sign in again
before it applies.

Still needed: an operator screen, since there is no UI; a response to the reporter, who
currently hears nothing; and a decision on what a warning actually consists of, because
`warn` presently only records that one was issued.

**Push token lifecycle**

One token per account, and the token document is the only thing clients still write
directly. Still needed: installation based tokens so two devices both work, revocation on
logout and on account switch, cleanup driven by Expo receipts and `DeviceNotRegistered`,
and deep link navigation tests. Nothing currently prevents a notification reaching a device
where a different account has since signed in.

**Discovery scaling**

Discovery scans up to 60 public profiles per call and filters in memory, with no ranking.
It needs a dedicated index and query well before a large member base.

**Single call deletion**

`requestAccountDeletion` runs in one request (up to 500 documents per collection, 540
second timeout). That is comfortable at current volumes and retries safely, but a very large
account would need a queued worker rather than a callable.

**Also open**

- Run the emulator suite against the deployed rules file as a regression gate in CI.
- Walk one report end to end on staging with the moderator claim, if not already done.

None of this blocks the current iOS release. Android device testing, the signed AAB and the
Google Play closed test remain separate release requirements, as recorded in
`docs/RELEASE-PLAN.md`.
