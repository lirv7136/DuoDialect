# DuoDialect backend contract

Status: implemented and tested against the local emulator suite on 19 September 2026.
Nothing here has been deployed. This document is the integration surface for the native
client; `docs/BACKEND-HANDOFF.md` records what changed and what is still missing.

## The shape of the system

Every write that carries an invariant goes through a Cloud Function callable. Clients
write almost nothing directly. Firestore rules are the second, independent layer: they
deny direct writes to everything the callables own, and they scope reads to the people
entitled to them.

The callables run with the Admin SDK, which bypasses Firestore rules completely. Each one
therefore verifies its own caller from the verified auth token and revalidates its inputs.
Neither layer is trusted to cover for the other.

Two rules are worth stating plainly, because the client must not try to work around them:

- **The sender of a message is the auth token, never the payload.** Any `fromUid` in a
  request body is ignored.
- **Conversation membership is written once, on acceptance, and can never change.** There
  is no operation that adds or removes a participant.

## Collections

| Path | Who may read | Who may write | Holds |
| --- | --- | --- | --- |
| `profiles/{uid}` | any signed in member, one document at a time, unless blocked | server only | public profile: display name, bio, area, languages, availability, interests, derived `offers` and `seeks` |
| `privateProfiles/{uid}` | the owner only | server only | birth date, gender, dating preferences |
| `blocks/{uid}/users/{otherUid}` | the owner only | server only | blocks the owner has made |
| `invitations/{invitationId}` | its two participants | server only | one two person invitation and its state |
| `invitationLocks/{lockId}` | nobody | server only | one open invitation per pair per intent |
| `conversations/{conversationId}` | its two participants | server only | membership, intent, agreed languages, last message |
| `conversations/{id}/messages/{messageId}` | the conversation's participants | server only | messages |
| `userConversations/{uid}/items/{conversationId}` | the owner only | server only | inbox summary and unread count |
| `pushTokens/{uid}` | the owner only | **the owner**, shape constrained | one Expo push token per account |
| `reports/{reportId}` | nobody | server only | reports awaiting moderation |
| `pushDeliveries/{id}` | nobody | server only | stubbed notification records, emulator only |
| `accountStatus/{uid}` | nobody | server only | suspension state, checked on every authenticated call |
| `deletionRequests/{uid}` | nobody | server only | deletion audit trail, kept after the account is gone |
| `moderationActions/{id}` | nobody | server only | what a moderator looked at and did |

`users/`, `chats/`, `matches/` and `swipes/` are closed to all access. They were written
directly by the earlier client; see the handoff for the replacement for each.

### Public and private separation

The public profile contains no birth date, no age, no gender and no dating preferences.
Those live in `privateProfiles/{uid}`, which only the owner can read, and are never
returned to another member by any callable. A caller can learn that somebody is eligible
for a language date; they cannot learn that person's age, gender, preferences, or why
somebody else was excluded.

## Queries the rules permit

Firestore refuses a `list` when a rule reads `resource.data` and the query cannot be shown
to return only permitted documents. In practice that means **a query must carry the filter
its rule depends on**, or it fails with `permission-denied` even when every document in
range would have been readable. The permitted read shapes are:

```ts
// Invitations involving me.
query(collection(db, "invitations"), where("participants", "array-contains", uid))
// Optionally also: where("status", "==", "pending"), orderBy("createdAt", "desc")

// My conversations.
query(collection(db, "conversations"), where("participants", "array-contains", uid))

// One conversation, and its thread. The message rule reads membership from the parent
// conversation, so the thread needs no participants filter.
doc(db, "conversations", conversationId)
query(collection(db, "conversations", conversationId, "messages"), orderBy("createdAt"))

// My inbox.
query(collection(db, "userConversations", uid, "items"), orderBy("lastAt", "desc"))

// One public profile.
doc(db, "profiles", otherUid)
```

`collection(db, "profiles")` cannot be listed at all. Discovery is `discoverCandidates`.

## Callables

All callables are v2 `onCall` in `australia-southeast1` (Sydney, beside the Firestore database). They require a signed in caller and reject
anyone else with `unauthenticated`. Call them with the Functions SDK:

```ts
import { getFunctions, httpsCallable } from "firebase/functions";
const fns = getFunctions(app, "australia-southeast1");
const result = await httpsCallable(fns, "createInvitation")(payload);
// result.data is the shape documented below
```

### `upsertProfile`

Creates or replaces the caller's profile. Writes the public and private documents in one
batch, so they cannot drift apart.

```ts
{
  displayName: string,                 // 1..40 chars, required
  bio?: string,                        // up to 400
  area?: string,                       // up to 60
  speaks: { lang: string, level: "native"|"fluent"|"intermediate"|"beginner" }[],
  learns: { lang: string, level: "native"|"fluent"|"intermediate"|"beginner" }[],
  availability?: string[],             // up to 14 entries, 32 chars each
  interests?: string[],                // up to 8 entries, 24 chars each
  birthDate: string,                   // "YYYY-MM-DD"; required on first save
  gender?: "woman"|"man"|"nonbinary",  // optional; only dating uses it, and dating needs it
  dating?: {
    enabled: boolean,
    genders?: ("woman"|"man"|"nonbinary")[],  // required and non empty when enabled
    ageMin?: number, ageMax?: number          // 18..120, ageMin <= ageMax
  }
}
```

Returns `{ profile, account }`. `profile` is the public document plus the derived `offers`
and `seeks` arrays. `account` is the caller's own private data, including `age` and
`isAdultSelfDeclared`.

Language names are lower cased and trimmed. At least one entry in `speaks` must be
`native` or `fluent`, because that is what makes a person able to offer a language. The
same language may not appear in both `speaks` and `learns`.

`offers` and `seeks` are derived on the server and are never accepted from the client.
The discovery query depends on them.

### `getMyAccount`

No arguments. Returns `{ profile, account }` for the caller, or `{ profile: null,
account: null }` if they have not completed onboarding.

### `setDatingConsent`

```ts
{ enabled: boolean, genders?: string[], ageMin?: number, ageMax?: number }
```

Returns `{ dating, cancelledInvitations }`. Turning dating off cancels every pending
dating invitation the caller is part of, in either direction; platonic invitations are
untouched. Turning it on requires a self declared adult age.

### `discoverCandidates`

```ts
{ mode?: "platonic" | "dating", limit?: number /* 1..20, default 10 */, cursor?: string }
```

Returns:

```ts
{
  mode: "platonic" | "dating",
  candidates: {
    uid, displayName, bio, area,
    offers: string[], seeks: string[],
    availability: string[], interests: string[],
    fluencyAssurance: "self-declared",
    exchange: { theyOffer: string[], youOffer: string[] },
    sharedAvailability: string[]
  }[],
  nextCursor: string | null,
  scanned: number
}
```

Filtering happens entirely on the server: reciprocal languages, blocks in both directions
and, in dating mode, both people's private preferences. Candidates carry no private field.
`cursor` is the `uid` to page after. `nextCursor` is null when the scan is exhausted.

### `createInvitation`

```ts
{
  toUid: string,
  intent: "platonic" | "dating",
  requestKey: string,                  // client generated, up to 64 chars
  note?: string,                       // up to 400
  languages?: { fromOffers: string, toOffers: string },
  meeting: {
    venue: string,
    localDate: string,                 // "YYYY-MM-DD"
    localTime: string,                 // "HH:mm", 24 hour
    timeZone: string,                  // IANA name, for example "Australia/Sydney"
    recurrence: "once" | "weekly"
  }
}
```

Returns `{ invitation, created }`. `created` is false when the call was a retry.

`requestKey` makes the operation idempotent: the invitation id is derived from the sender,
recipient, intent and key, so a retry after a timeout returns the invitation that already
exists rather than creating a second one. **Generate one key per invitation the person
intends to send, and reuse it for every retry of that same send.**

Only one open invitation may exist per pair per intent, in either direction. A second one
fails with `already-exists` / `invitation/duplicate-active`. Platonic and dating are
tracked separately, so the same pair may have one of each.

`languages` is optional. If given, each side must be offering a language they are native
or fluent in and which the other side is practising; otherwise the server picks the first
valid pair itself.

The meeting must be in the future and within a year. `startAt` is returned as an ISO
instant derived from the wall time in the stated zone; the local fields remain the
authoritative human description.

### `respondToInvitation`

```ts
{ invitationId: string, action: "accept" | "decline" }
```

Returns `{ invitation, conversationId, changed }`.

Only the recipient may respond. Acceptance revalidates everything inside a transaction:
both profiles, both private profiles and both block documents are re-read, so consent
withdrawn or a block added after the invitation was sent stops the acceptance. Repeating
an accept or a decline is harmless and returns `changed: false`. Two simultaneous accepts
resolve to a single conversation.

On acceptance the server creates, if it does not already exist, one conversation for the
pair and intent, and an inbox entry for each participant.

### `cancelInvitation`

```ts
{ invitationId: string }
```

Returns `{ invitation, changed }`. Only the sender may cancel, and only while pending.
Cancelling releases the duplicate lock, so a new invitation can then be sent.

### `sendMessage`

```ts
{ conversationId: string, text: string /* 1..2000 */, clientMessageId: string /* up to 64 */ }
```

Returns `{ messageId, conversationId, created }`.

The message id is derived from the conversation, the caller and `clientMessageId`, so a
retry writes the same document instead of a duplicate and the unread counter is
incremented exactly once. **Generate one `clientMessageId` per message the person typed
and reuse it for every retry.** The message, the conversation summary and both inbox
entries are written in one transaction. A block in either direction refuses the send.

### `markConversationRead`

```ts
{ conversationId: string }
```

Returns `{ conversationId, unread: 0 }`. Clears only the caller's own unread count.

### `setBlock`

```ts
{ otherUid: string, blocked: boolean }
```

Returns `{ blocked, cancelledInvitations }`. Blocking is one sided but takes effect in
both directions: neither person can then discover, invite, message or read the other's
profile. It also cancels every pending invitation between the two. Unblocking restores
visibility but does not revive cancelled invitations.

### `reportUser`

```ts
{
  reportedUid: string,
  reason: "harassment"|"spam"|"inappropriate_content"|"impersonation"|"safety_concern"|"other",
  detail?: string,          // up to 1000
  conversationId?: string   // must be a conversation the reporter is in
}
```

Returns `{ reportId, status: "received" }`. Reports are not readable by any client,
including the reporter. There is no triage tooling yet.

### `requestAccountDeletion`

```ts
{ confirmation: "DELETE" }   // the literal string; anything else is refused
```

Returns `{ status, deleted, retained }`. `status` is `"completed"` or `"needs_retry"`.
`deleted` counts what was removed: invitations, conversations, inbox entries, blocks made
and blocks received.

Deletes the caller's profile, private profile, push token, blocks in both directions,
every invitation they are part of, every conversation they are part of **including all
its messages**, both participants' inbox entries for those conversations, and finally the
Firebase Auth user. Reports filed by or about them are **kept** and flagged; see below.

The operation is idempotent. Every step is a delete and the Auth user goes last, so a
call that fails part way can simply be repeated. A suspended account may still delete
itself.

Two things the client must handle:

- **Reauthenticate first.** The backend does not require a recent login. Call
  `reauthenticateWithCredential` before this, so a borrowed session cannot destroy an
  account.
- **The 1:1 conversation is deleted for both people.** The other participant loses the
  thread. Say so in the confirmation copy.

This callable is also what the public web deletion page calls, which is how the Google
requirement for deletion after uninstall is met. The page signs the person in and calls
it; there is no separate endpoint.

### `listReports` · moderators only

```ts
{ status?: "received"|"reviewing"|"actioned"|"dismissed", limit?: number /* 1..100 */ }
```

Returns `{ status, reports }`, newest first. Each report carries both parties' uid and
display name, whether either account has since been deleted, the reason, the detail, the
conversation id and the created time.

### `getReportContext` · moderators only

```ts
{ reportId: string, messageLimit?: number /* 1..200, default 50 */ }
```

Returns `{ report, conversation, messages }` with the thread in chronological order.
`conversation` is null and `messages` empty when the conversation no longer exists.

**Every call is written to the audit trail.** Reading a private conversation is recorded
as a `viewed-context` action with the moderator's uid and the number of messages read.

### `actOnReport` · moderators only

```ts
{ reportId: string, action: "claim"|"dismiss"|"warn"|"suspend"|"reinstate", note?: string }
```

Returns `{ reportId, action, reportStatus, subjectUid }`.

`suspend` marks the account, sets `discoverable: false` so it leaves discovery, and
revokes its refresh tokens. A suspended account is refused by every callable except
`requestAccountDeletion`. `reinstate` undoes all of it. Every action is audited.

### Moderator identity

The three moderation callables require the custom auth claim `moderator` on the verified
token. No callable can grant it; it is set out of band by `functions/scripts/set-moderator.js`,
which needs project credentials. Firestore rules still deny direct access to `reports`,
`moderationActions` and `accountStatus` for everyone, including moderators, so the claim
only confers power through the callables, where it is audited.

## Errors

Callable errors carry a Firebase error code and, for every rejection the backend makes
deliberately, a stable `details.reason`. Branch on `details.reason`, not on message text.
Plain input validation failures use `invalid-argument` with a human readable message and
no reason code.

| `details.reason` | Code | Meaning |
| --- | --- | --- |
| `account/not-adult` | `failed-precondition` | The self declared birth date is under 18. DuoDialect is an adults only service. |
| `profile/incomplete` | `failed-precondition` | The caller, or the other person, has no usable profile yet. |
| `profile/not-found` | `not-found` | The other person has no profile. |
| `target/self` | `invalid-argument` | The caller named themselves. |
| `target/unavailable` | `permission-denied` | A block exists in one direction or the other. The direction is deliberately not disclosed. |
| `language/not-reciprocal` | `failed-precondition` | The two people have no usable exchange. |
| `language/insufficient-fluency` | `failed-precondition` | They share a language pair, but a side offering it is not native or fluent. |
| `language/not-offered` | `failed-precondition` | The named languages are outside the reciprocal set. |
| `language/offered-and-sought` | `invalid-argument` | A profile listed the same language as both offered and practised. |
| `dating/not-adult` | `failed-precondition` | One side is not a self declared adult. |
| `dating/not-enabled` | `failed-precondition` | One side has dating switched off. |
| `dating/preferences-mismatch` | `failed-precondition` | Gender or age preferences do not match on both sides. |
| `dating/age-range` | `invalid-argument` | `ageMin` exceeds `ageMax`. |
| `invitation/duplicate-active` | `already-exists` | An open invitation already exists for this pair and intent. |
| `invitation/not-pending` | `failed-precondition` | The invitation was already accepted, declined or cancelled. |
| `invitation/not-recipient` | `permission-denied` | Only the recipient may accept or decline. |
| `invitation/not-sender` | `permission-denied` | Only the sender may cancel. |
| `invitation/not-found` | `not-found` | No such invitation. |
| `conversation/not-found` | `not-found` | No such conversation. |
| `conversation/not-member` | `permission-denied` | The caller is not a participant. |
| `account/suspended` | `permission-denied` | The account is suspended. Every callable refuses except `requestAccountDeletion`. |
| `deletion/not-confirmed` | `invalid-argument` | `confirmation` was not the literal string `"DELETE"`. |
| `moderation/not-an-operator` | `permission-denied` | The caller's token has no `moderator` claim. |
| `moderation/report-not-found` | `not-found` | No such report. |

`unauthenticated` is returned by every callable when there is no signed in user.
`internal` means an unexpected server fault; the message is deliberately generic.

## What this contract does not claim

- **Age is self declared.** `ageAssurance` is the literal string `"self-declared"`. There
  is no identity check, document check or third party age assurance anywhere in this
  backend. Do not present age as verified in the UI.
- **Fluency is self declared.** `fluencyAssurance` is `"self-declared"`. The backend
  enforces that a person claims native or fluent level before they may offer a language.
  It does not test whether that claim is true.
- **Recurrence is a stated intention, not a schedule.** `recurrence: "weekly"` is stored
  and returned. No future occurrences are materialised, none can be cancelled
  individually, and nothing reschedules them.
- **There are no reminders.** Nothing notifies either person that a meeting is approaching.
- **Notifications cover new messages only.** Invitations, acceptances, declines and
  cancellations send nothing.
- **Groups are not implemented.** Only two person invitations exist.
- **Deletion of a conversation is mutual.** Deleting your account removes the shared
  thread from the other participant too. That is a deliberate product choice, not a
  technical limit.
- **Safety reports survive account deletion.** Reports filed by or about a deleted
  account are retained and flagged, so deleting an account cannot erase a complaint about
  it. This is a retention exception and must appear in the privacy policy and the store
  data declarations.
- **Moderation is a queue and a stop button, not a workflow.** There is no appeals
  process, no notification to either party, no automated detection and no operator UI;
  the callables are the whole surface.
