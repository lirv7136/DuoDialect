# DuoDialect backend contract

Status: implemented and tested against the local emulator suite on 19 September 2026.
Deployed to staging (`duodialect-staging`) on 30 Sep and to production (`duodialect`) on 4 to
5 Oct 2026; iOS 1.0.1 runs against it. Dating and groups are out of the product, so the
dating fields and errors below are unused by the app. This document is the integration surface for the native
client; `docs/BACKEND-HANDOFF.md` records what changed and what is still missing.

Trust phase 1 (November 2026, branch `feat-trust`, not deployed yet) adds verification,
face checked main photos, duplicate photo holds, early contact detail rules, email
confirmation and daily limits. See [Trust](#trust) for the flags; every one defaults off.

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
| `profiles/{uid}` | any signed in member, one document at a time, unless blocked | server only | public profile: display name, bio, `city`, area, languages, availability, interests, derived `offers` and `seeks`, `photos`, `meetupsConfirmed`, `verified` |
| `privateProfiles/{uid}` | the owner only | server only | birth date, gender, dating preferences, `discovery.verifiedOnly` |
| `verifications/{uid}` | nobody | server only | verification status, method, `verifiedAt`, `ageReview`, `attempts`, `photoId`, `photoChangedAt`; see [Trust](#trust) |
| `config/trust` | nobody | server only | the trust flags; absent means every flag is off |
| `rateLimits/{uid}` | nobody | server only | today's (UTC) counts of invitations, messages and reports |
| `blocks/{uid}/users/{otherUid}` | the owner only | server only | blocks the owner has made |
| `invitations/{invitationId}` | its two participants | server only | one two person invitation and its state |
| `invitationLocks/{lockId}` | nobody | server only | one open invitation per pair per intent |
| `conversations/{conversationId}` | its two participants | server only | membership, intent, agreed languages, last message |
| `conversations/{id}/messages/{messageId}` | the conversation's participants | server only | messages |
| `userConversations/{uid}/items/{conversationId}` | the owner only | server only | inbox summary and unread count |
| `pushTokens/{uid}` | the owner only | **the owner**, shape constrained | legacy single Expo push token; still written by every client, see "Push tokens" |
| `pushTokens/{uid}/devices/{deviceId}` | the owner only (get and list) | **the owner**, shape constrained | one Expo push token per device |
| `reports/{reportId}` | nobody | server only | reports awaiting moderation |
| `pushDeliveries/{id}` | nobody | server only | stubbed notification records, emulator only |
| `pushTickets/{ticketId}` | nobody | server only | one Expo push ticket awaiting its receipt |
| `accountStatus/{uid}` | nobody | server only | suspension state, checked on every authenticated call |
| `deletionRequests/{uid}` | nobody | server only | deletion audit trail, kept after the account is gone |
| `moderationActions/{id}` | nobody | server only | what a moderator looked at and did |
| `photoScreening/{uid}_{photoId}` | the owner only (`get`, including before it exists) | server only | the screening verdict for one uploaded photo, with its face check and fingerprint |
| `checkIns/{checkInId}` | the owner only | server only | one post meetup check-in, for one person, for one occurrence of a plan |
| `checkInMutes/{muteId}` | nobody | server only | one person asked to stop being checked in about one plan |
| `confirmedMeetups/{meetupId}` | nobody | server only | both people said this meetup happened |
| `matchNotices/{noticeId}` | nobody | server only | one "a match joined" notice per recipient and newcomer, so nobody is told twice |
| `stats/latest`, `stats/appStoreSync` | nobody | server only | the newest operator stats snapshot; when the App Store sync last ran and its last error |
| `statsDaily/{YYYY-MM-DD}` | nobody | server only | the last stats snapshot of each Sydney day, for the trend |
| `appStoreDaily/{YYYY-MM-DD}` | nobody | server only | App Store downloads, redownloads and updates for one report day (Pacific time) |

Storage holds one kind of object, `profilePhotos/{uid}/{photoId}.jpg`; see
[Profile photos](#profile-photos).

`users/`, `chats/`, `matches/` and `swipes/` are closed to all access. They were written
directly by the earlier client; see the handoff for the replacement for each.

### Public and private separation

The public profile contains no birth date, no age, no gender and no dating preferences.
Those live in `privateProfiles/{uid}`, which only the owner can read, and are never
returned to another member by any callable. A caller can learn that somebody is eligible
for a language date; they cannot learn that person's age, gender, preferences, or why
somebody else was excluded.

### Push tokens

Push tokens are the only documents a client still writes directly. Both documents take
exactly `{ token, platform, updatedAt }` with `platform` in `ios` or `android` and
`updatedAt` a timestamp; anything else is refused by the rules.

- `pushTokens/{uid}/devices/{deviceId}` is one document per device, so two phones on one
  account both hear. `deviceId` is derived by the client from the token itself (a hash, so
  it is stable for the token and never a hardware id); the server never trusts it for
  anything and only ever reads the `token` field.
- `pushTokens/{uid}` is the single document the 1.0.1 and 1.1.0 clients write. Every
  client, including the current one, keeps writing it, because the functions deployed
  before this change read nothing else. Once the functions here are deployed everywhere the
  client can stop writing it; until then it must not.

**Delivery** reads every device document plus the legacy document, drops anything that is
not a valid Expo token, deduplicates by token, and sends once per distinct token. The
device document wins over the legacy document when both hold the same token.

**Lifecycle on the phone.** The client registers only after the person turns notifications
on, and re-registers the signed in account on every launch if they did. It remembers what
it last registered (account, device id, token) on the install. On logout and before account
deletion it deletes that device document and, if it holds the same token, the legacy
document, then signs out; a dead connection never blocks signing out, the record is simply
kept and retried. If a different account then signs in on the same phone, the client calls
`releasePushToken` with the remembered record before registering, so a token is never
carried from one account to the next.

**Dead tokens.** Under the Expo transport every successful send stores its ticket at
`pushTickets/{ticketId}`. The hourly `sweepPushReceipts` fetches receipts for tickets older
than 15 minutes, deletes the device document (and the legacy document, when it holds the
same token) for every `DeviceNotRegistered`, and forgets answered tickets; a ticket older
than a day with no receipt is dropped unread. A ticket that already reports
`DeviceNotRegistered` at send time retires the token straight away. Under the stub
transport nothing is sent, so the sweep is a no op.

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

// My check-ins. The uid filter is required. Optionally also:
// where("status", "==", "open"), orderBy("dueAt", "desc")
query(collection(db, "checkIns"), where("uid", "==", uid))
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
  city: string,                        // a city id from the world list; sydney when an older app omits it
  cityList?: "world",                  // sent by clients that know the world list (see City below)
  area?: string,                       // up to 60, free text neighbourhood
  speaks: { lang: string, level: "native"|"fluent"|"intermediate"|"beginner" }[],
  learns: { lang: string, level: "native"|"fluent"|"intermediate"|"beginner" }[],
  availability?: string[],             // up to 14 entries, 32 chars each
  interests?: string[],                // up to 8 entries, 24 chars each
  birthDate: string,                   // "YYYY-MM-DD"; required on first save
  photoIds?: string[],                 // first save only: screened photo ids to attach, main first
  photoPolicy?: "required",            // first save only: this app asks for a photo, so require one
  gender?: "woman"|"man"|"nonbinary",  // optional; only dating uses it, and dating needs it
  dating?: {
    enabled: boolean,
    genders?: ("woman"|"man"|"nonbinary")[],  // required and non empty when enabled
    ageMin?: number, ageMax?: number          // 18..120, ageMin <= ageMax
  }
}
```

Returns `{ profile, account }`. `profile` is the public document plus the derived `offers`
and `seeks` arrays, the current `photos` and `verified`. Apart from the first save (below),
`upsertProfile` never writes `photos` and ignores any `photos` or `photoIds` in the
request: saving a profile cannot add, reorder or wipe photos. Only `setProfilePhotos`
changes them. The same goes for `meetupsConfirmed` and `verified`: the request may not set
them, a save never touches them, and the returned `profile` carries the stored values (a
new profile copies `verified` from `verifications/{uid}`, since a check can happen before
the profile exists). `account` is the caller's own private data, including `age` and
`isAdultSelfDeclared`.

**Photos on the first save (trust phase 1).** A profile does not exist until its first
save, and `setProfilePhotos` needs one, so the first save may carry `photoIds`: they are
checked exactly as `setProfilePhotos` checks them (own folder, approved, a main photo with
one clear face) and stored with the profile. A first save **must** carry at least one when
the request says `photoPolicy: "required"` (apps from trust phase 1 on) or when the server
flag `requireProfilePhoto` is on; otherwise `invalid-argument` / `profile/photo-required`
and nothing is written. The 1.1.2 and 1.2.0 apps send neither, so they still create a
profile with no photo while the flag is off. Both fields are ignored on later saves.

**No contact details (trust phase 1).** `displayName`, `bio` and `area` may not contain a
link, an email address or a phone number (`functions/lib/contact-details.js`):
`invalid-argument` / `profile/contact-details`, with `details.field` naming the field and a
message the older apps show as is. Only a value that changes is checked, so a bio saved
before the rule keeps working until its owner edits it, and a save from an older app that
only moves city is never refused for text it did not touch.

Language names are lower cased and trimmed. At least one entry in `speaks` must be
`native` or `fluent`, because that is what makes a person able to offer a language. The
same language may not appear in both `speaks` and `learns`.

`offers` and `seeks` are derived on the server and are never accepted from the client.
The discovery query depends on them.

**City.** `city` is the id of the city the person lives in, from the world list in
`functions/data/cities.json`: every city of 100,000 people or more and every national
capital, from GeoNames (CC BY 4.0), about 5,300 cities. `functions/lib/constants.js` loads
it (`CITIES`, `CITY_IDS`, `isCityId`) and the app imports the same file
(`src/domain/cities.ts`), so there is one list. `scripts/build-world-cities.cjs` builds it;
a rebuild only ever adds ids. A borough or district that GeoNames lists on its own
(Brooklyn, Paris 15e, Pudong) is folded into its city, so one city's members are not split.

Ids are stable and lower case. The eleven cities from 1.1.2 keep their bare ids (`sydney`,
`melbourne`, `brisbane`, `perth`, `adelaide`, `canberra`, `hobart`, `darwin`,
`gold-coast`, `auckland`, `wellington`), so stored profiles and the 1.1.2 app need nothing.
Every other city is `<ascii name>-<country>`, such as `london-gb` or `sao-paulo-br`, with the
first-level region code added only where a country has two of one name
(`springfield-us-il`). Ids are matched after trimming and lower casing. A city that is sent
must be on the list; anything else (including a name such as `"London"`) is
`invalid-argument` / `profile/city-invalid` and nothing is written. A profile may omit it:
the stored city is kept, and a profile that has none yet, new or saved before 1.1.2,
becomes `sydney`. That is what keeps the 1.0.1 and 1.1.0 apps, which never send a city,
signing people up and working. `area` stays a free text neighbourhood inside the city and
is never used for filtering.

The 1.1.2 app knows only the eleven original cities and shows any other stored city as
Sydney, so a save from it sends `"sydney"` for a member who lives in, say, `london-gb`.
Clients that know the world list send `cityList: "world"`. Without it, `"sydney"` over a
stored city that is not one of the eleven is taken as that fallback and the stored city is
kept; any other city sent from 1.1.2 is a real move. With it, `"sydney"` always means
Sydney.

### `getMyAccount`

No arguments. Returns `{ profile, account }` for the caller, or `{ profile: null,
account: null }` if they have not completed onboarding. `profile.photos` is always an
array, empty when there are none, and `profile.meetupsConfirmed` is always an integer,
0 until a meetup has been confirmed. `profile.city` is always a city id from the world
list: `sydney` for a profile saved before 1.1.2 that the backfill has not reached yet.
`profile.verified` is always a boolean.

Since trust phase 1, `account` also carries:

```ts
discovery: { verifiedOnly: boolean },        // setDiscoveryPreferences
trust: {
  verified: boolean,
  verification: {
    status: "none"|"pending"|"verified"|"failed"|"review",
    method: string | null,                   // "moderator" in phase 1, "selfie" from phase 2
    verifiedAt: string | null,               // ISO
    photoChangedAt: string | null,           // set while pending because the main photo changed
  },
  emailConfirmed: boolean,                   // a confirmed email, or Sign in with Apple
  requirements: { verificationToMeet: boolean, emailConfirmation: boolean },  // the flags
  restrictions: string[],                    // reason codes holding the caller back right now
}
```

`restrictions` holds `verification/required-to-meet` while `requireVerification` is on and
the caller is not verified, and `trust/email-unconfirmed` while `requireEmailVerification` is
on and their email is not confirmed. It is empty with every flag off.

### `setDiscoveryPreferences`

```ts
{ verifiedOnly: boolean }
```

Returns `{ discovery: { verifiedOnly } }`. Stored on the caller's private profile; with it on,
`discoverCandidates` (and its near misses) only returns verified members. Needs a profile
first (`failed-precondition` / `profile/incomplete`).

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
    uid, displayName, bio, city, area,          // city is always the caller's own (1.1.2)
    offers: string[], seeks: string[],
    availability: string[], interests: string[],
    photos: { id: string, path: string }[],   // up to 3, main first; [] when none
    fluencyAssurance: "self-declared",
    meetupsConfirmed: number,                 // meetups both people said happened; 0 when none (1.1.1)
    verified: boolean,                        // Talkeven verified this member (trust phase 1)
    exchange: { theyOffer: string[], youOffer: string[] },
    sharedAvailability: string[]
  }[],
  nextCursor: string | null,
  scanned: number,
  // Only on an empty first page in platonic mode (1.1.1):
  nearMisses?: {
    uid, displayName, area, offers: string[], seeks: string[],
    photos: { id: string, path: string }[],
    verified: boolean,
    reason: "language/not-reciprocal" | "language/insufficient-fluency"
  }[],
  learningYourLanguage?: number
}
```

Filtering happens entirely on the server: the caller's city, reciprocal languages, blocks
in both directions and, in dating mode, both people's private preferences. Candidates carry
no private field. `cursor` is the `uid` to page after. `nextCursor` is null when the scan
is exhausted.

Trust (phase 1): with "only show verified members" on, only verified members come back.
While `requireEmailVerification` is on, password accounts with an unconfirmed email are left
out (read from Firebase Auth, so confirming takes effect at once; Apple accounts count as
confirmed). Verification itself never hides anyone: unverified members stay discoverable,
and an unverified caller can browse.

**City is a hard boundary (1.1.2).** Discovery only ever scans profiles whose `city`
equals the caller's, so a Melbourne member never sees Sydney people. `nearMisses` and
`learningYourLanguage` are scoped the same way, and the "a match joined" push
(`onProfileWritten`) only goes to members in the newcomer's city. A caller whose profile
has no city yet is treated as `sydney`. To see another city, change `city` through
`upsertProfile`.

When the first page is empty and the scan is exhausted, the response also explains itself:
up to six `nearMisses`, people one step from a two way match with the reason, and
`learningYourLanguage`, how many discoverable members want a language the caller offers.
Both respect blocks in both directions and reveal nothing a candidate card would not.

### `setProfilePhotos`

```ts
{ photoIds: string[] }   // 0..3 ids, in display order; the first is the main photo
```

Returns `{ photos: { id, path }[], deleted: number }`.

Each id must be 8 to 64 letters, digits or dashes, listed once. For each one the server
checks that `profilePhotos/{caller}/{id}.jpg` exists **in the caller's own folder** and has
passed screening (the object carries `talkevenScreening: "approved"` and its
`photoScreening` verdict is `approved`). Ids are never paths: the path is built from the
verified uid, so another member's photo id simply is not found. The caller must already
have a profile. `photoIds: []` removes every photo.

The ordered list is stored on the public profile as `photos: [{ id, path }]`. Objects in
the caller's folder that are no longer referenced are deleted: at once if they were on the
profile before this call, and after an hour if they were uploaded but never used, so a
photo still being screened in the same editing session is not swept away. `deleted`
counts the objects removed by this call.

Refusals: more than three ids, a duplicate or a malformed id are `invalid-argument`; a
missing object is `not-found` / `photo/not-found`; a photo still being screened, rejected
or failed is `failed-precondition` / `photo/not-screened`; a photo held for a moderator is
`failed-precondition` / `photo/in-review`; no profile yet is `failed-precondition` /
`profile/incomplete`.

**The main photo needs one clear face (trust phase 1).** The first id's screening record
must not say otherwise: a photo screened with no face, more than one, or one too unclear to
count is `invalid-argument` / `photo/main-needs-face`, with `details.problem` one of
`no-face`, `many-faces`, `unclear-face` and a message that says which. Such a photo is fine
anywhere after the first. A photo screened before face checks existed has no face result
and may still lead, so nobody is locked out of the photos they have.

While `requireVerification` is on, a verified member whose main photo changes (a different
first id, or none) goes back to `pending`, loses `verified`, and gets `photoChangedAt`, until
the check runs again (phase 2) or a moderator verifies them again. Reordering the others
changes nothing.

## Profile photos

Up to three optional photos so language partners can recognise each other when they meet.

**Upload.** The app uploads directly with the Storage SDK to
`profilePhotos/{uid}/{photoId}.jpg` in the default bucket, then waits for screening, then
calls `setProfilePhotos`. The app crops to a square of at most 1080px and re-encodes as
JPEG at quality 0.8 before uploading.

**`storage.rules`** (default deny):

| Operation | Allowed when |
| --- | --- |
| create | signed in as `{uid}`; the object does not exist yet; name matches `[A-Za-z0-9-]{8,64}.jpg`; `contentType` is `image/jpeg` or `image/png`; at most 5 MB; the upload does not set `talkevenScreening` metadata |
| update (overwrite or metadata change) | never |
| delete | signed in as `{uid}` |
| get (including `getDownloadURL`) | signed in; the object carries `talkevenScreening: "approved"`; and the reader is the owner, or no block exists in either direction, checked with `firestore.exists()` on `blocks/{owner}/users/{reader}` and `blocks/{reader}/users/{owner}` |
| list | never |
| anything outside `profilePhotos/` | never |

A photo that is pending or failed screening cannot be read by anyone, its owner included;
the app shows its local copy while it waits.

**Screening.** The `onProfilePhotoUploaded` function (Storage `onObjectFinalized`,
`australia-southeast1`) runs on every new object:

- It sends the object to Google Cloud Vision with SafeSearch and face detection in one
  request. If `adult`, `violence` or `racy` is `LIKELY` or `VERY_LIKELY`, the object is
  deleted and the verdict is `rejected`. Faces never reject a photo; they are recorded as
  `face: { ok, count, confidence, problem }` (exactly one face at confidence 0.5 or more
  is `ok`), which decides whether it may be the main photo.
- It fingerprints the photo (a 64 bit dHash of the JPEG, `functions/lib/dhash.js`) and
  looks for an approved photo on **another** account within 6 bits. If there is one, the
  photo is **held**: metadata `talkevenScreening: "review"`, verdict `review`, and a report
  `reports/photo_{uid}_{photoId}` with `source: "photo-screening"`, `reason:
  "duplicate_photo"`, `reporterUid: null`, `photo` and `matches` goes into the moderation
  queue. Which account it matched is only on the report, never on the uploader's verdict.
  Plain pictures (almost no detail) and bytes that are not a readable JPEG are not
  matched. Held photos are not matched against, so a copy someone else uploaded never
  holds up the real owner.
- Otherwise it sets the custom metadata `talkevenScreening: "approved"` on the object
  (which is what the read rule checks) and the verdict is `approved`.
- If Vision fails, or reports an error for the image, the object is deleted and the verdict
  is `failed` (fail closed; the person can simply add it again).
- If the owner has requested account deletion, the upload is deleted without screening.
- The verdict is written to `photoScreening/{uid}_{photoId}` as `{ uid, photoId, path,
  status: "approved" | "rejected" | "failed" | "review", flagged, scores, face, dhash,
  dhashBands, transport, screenedAt }`.
  Photo ids never contain an underscore, so the id is unambiguous. The owner may `get` it,
  including before it exists, so the app can listen with `onSnapshot` and show
  "Checking photo…" until it arrives. Nobody else can read it.

`TALKEVEN_PHOTO_SCREENING` selects `stub` or `vision`. When unset it is `stub` whenever the
Functions emulator is running and `vision` otherwise. The stub approves everything and
calls nothing, so emulator runs never reach Cloud Vision. It reports one clear face unless
the upload's custom metadata `talkevenStubFaces` says `"N"` faces or `"N@C"` (N faces at
confidence C), which is how the tests simulate a photo with no face, a group or a blurry
one; the Vision transport ignores that metadata. The stub still fingerprints the real
bytes, so duplicate holds are tested for real.

A photo held for review stays in the owner's folder (the orphan sweep in `setProfilePhotos`
leaves it alone) until a moderator approves or rejects it with `actOnReport`.

**No tokenised URLs are stored.** The profile holds `{ id, path }` only. Clients call
`getDownloadURL` themselves, which the read rule gates, and keep the result in memory.

```ts
import { getStorage, ref, getDownloadURL } from "firebase/storage";
const url = await getDownloadURL(ref(getStorage(app), photo.path)); // refused if blocked or unscreened
```

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
    timeZone: string,                  // IANA name, for example "Australia/Sydney"; the app sends its city's zone
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

Trust (phase 1): while `requireVerification` is on, an unverified caller is refused with
`failed-precondition` / `verification/required-to-meet`; the recipient is not checked here
(they are asked when they accept). The `note` may not contain a link, an email address or a
phone number: `invalid-argument` / `invitation/contact-details`, which the older apps show
as the server's message. Each member may create 20 invitations a UTC day; the next is
`resource-exhausted` / `rate-limit/invitations` with `details.limit` and `details.resetsAt`.
A retry with the same `requestKey` is never refused or counted.

The meeting must be in the future and within a year. `startAt` is returned as an ISO
instant derived from the wall time in the stated zone; the local fields remain the
authoritative human description. The app states the zone of the sender's city (from the
world list), not the phone's, since both people are in that city; older apps send the
phone's zone. Reminders (18:00 the evening before) and check-ins (the morning after) are
computed in this stored `timeZone`, never in Sydney time.

### `respondToInvitation`

```ts
{ invitationId: string, action: "accept" | "decline" }
```

Returns `{ invitation, conversationId, changed }`.

Only the recipient may respond. Acceptance revalidates everything inside a transaction:
both profiles, both private profiles and both block documents are re-read, so consent
withdrawn or a block added after the invitation was sent stops the acceptance. Repeating
an accept or a decline is harmless and returns `changed: false`. Two simultaneous accepts
resolve to a single conversation. While `requireVerification` is on, an unverified caller
cannot accept (`failed-precondition` / `verification/required-to-meet`); declining is always
allowed, and plans already accepted carry on.

On acceptance the server creates, if it does not already exist, one conversation for the
pair and intent, and an inbox entry for each participant.

### `cancelInvitation`

```ts
{ invitationId: string, reason?: "cant-make-it" | "reschedule" | "other" }
```

Returns `{ invitation, changed }`. Repeating a cancel returns `changed: false`. Cancelling
releases the duplicate lock, so a new invitation can then be sent. Two cases:

- **Pending**: only the sender may cancel (`invitation/not-sender` otherwise). Quiet: the
  recipient is not told. `resolution` is `{ by, reason: "cancelled" }` and `reason` in the
  request is ignored.
- **Accepted**: either participant may cancel; anyone else gets
  `invitation/not-participant`. `reason` is optional and a fixed choice, never free text,
  because it goes into a push. In one transaction the status becomes `cancelled` with
  `resolution: { by, reason: "cancelled-after-accept", detail: <reason or null> }`,
  `nextCheckInAt`, `nextCheckInOccurrence`, `nextReminderAt` and `nextReminderOccurrence`
  are nulled and `checkInsStopped` is `"cancelled"`, so no further reminder or check-in
  is sent. A weekly plan is cancelled as a whole series. Check-ins already created stay
  and can still be answered. The conversation stays. The other participant is sent a
  `type: "plan"` push titled with the canceller's display name: "Cancelled your plan for
  Mon 28 Sep, 18:00." ("Cancelled your weekly plan from …" for a weekly plan), followed
  by "Can't make it." or "Wants to reschedule." when that reason was given. A block in
  either direction silences it.

A cancelled plan cannot be accepted again (`invitation/not-pending`); a declined one
cannot be cancelled.

### `sendMessage`

```ts
{ conversationId: string, text: string /* 1..2000 */, clientMessageId: string /* up to 64 */ }
```

Returns `{ messageId, conversationId, created, contactWarning }`.

The message id is derived from the conversation, the caller and `clientMessageId`, so a
retry writes the same document instead of a duplicate and the unread counter is
incremented exactly once. **Generate one `clientMessageId` per message the person typed
and reuse it for every retry.** The message, the conversation summary and both inbox
entries are written in one transaction. A block in either direction refuses the send.

`contactWarning` (trust phase 1) is true when the text contains a link, an email address or
a phone number and the two have no confirmed meetup yet. The message is sent either way;
the app tells the sender to be careful. Each member may send 300 messages a UTC day; the
next is `resource-exhausted` / `rate-limit/messages`. A retry is never refused or counted.

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
including the reporter. Each member may file 10 reports a UTC day; the next is
`resource-exhausted` / `rate-limit/reports`.

### `answerCheckIn`

```ts
{
  checkInId: string,
  happened: "yes" | "no",
  meetAgain?: "yes" | "no" | null
}
```

Returns `{ checkIn, changed }`, where `checkIn` is:

```ts
{
  id, invitationId, otherUid, conversationId,
  occurrence: { localDate, localTime, timeZone, recurrence },
  venue: string | null,   // the plan's place, for "same time next week?" (1.1.1)
  languages: { gave, received },   // from the owner's side
  status: "open" | "answered",
  answer: { happened, meetAgain } | null,
  dueAt, expiresAt                 // ISO strings
}
```

**How check-ins come about.** Accepting a plan schedules its first check-in for 10:00
local time (the plan's own time zone) on the day after the meeting. The `sweepCheckIns`
scheduled function runs hourly and creates one check-in for each person, then sends each
a push with `data: { type: "checkIn", checkInId, invitationId, otherUid }`. A weekly plan
is asked about again each week; missed weeks are skipped rather than sent as a backlog.
Nothing is created for a blocked pair, and the plan stops scheduling.

**Answering.** Only the owner can answer; anyone else gets `not-found` with reason
`checkin/not-found`. A check-in can be answered, and re-answered, for 7 days after it is
due; after that `failed-precondition` with reason `checkin/expired`. `changed` is false
when the answer repeats the stored one.

- **Answers are private.** The other person never sees them, and nothing tells them.
- `meetAgain: "no"` stops future check-ins about this plan **for the caller only**.
  `"yes"` lifts that. Omitted or null leaves it as it was.
- When **both** say `happened: "yes"`, and neither has blocked the other, the server
  records a confirmed meetup. If either later answers `"no"`, the record is removed.
  Confirmed meetups are not readable by clients yet; they are what the exchange balance
  will be built on.
- **A confirmed meetup is, by its nature, shared.** The public count moves the moment both
  people have said it happened, so a partner who answered yes can tell the other did too.
  Whether to meet again is never shared, and neither is a lone answer.
- **`meetupsConfirmed` tracks those records.** In the same transaction, both people's
  public `profiles/{uid}.meetupsConfirmed` goes up by one when a record is created and
  down by one when one is removed, never below zero. A repeated answer, or a change of
  `meetAgain` alone, moves nothing. The count is per meetup, not per distinct partner: a
  weekly plan confirmed three times with one person counts three.
- A weekly plan that nobody confirms for 3 occurrences in a row stops asking.
- To report the other person from a check-in, call `reportUser` with the check-in's
  `otherUid` and `conversationId`.

### `releasePushToken`

```ts
{ uid: string; deviceId: string; token: string }
```

Returns `{ released }`: how many documents were deleted, 0 to 2.

Removes a push registration a previous account left on this phone. Firestore rules let
nobody delete another account's documents, so the server does it, taking the token as the
proof of possession: only the phone that was issued the token knows it. Deletes
`pushTokens/{uid}/devices/{deviceId}` and `pushTokens/{uid}` only where the stored `token`
equals the one sent; any other token leaves them untouched and counts nothing. Any signed in
account may call it, and calling it again is harmless. The client calls it from
`releaseStaleRegistration` when the registration it remembers belongs to a different
account than the one signed in now.

### `requestAccountDeletion`

```ts
{ confirmation: "DELETE" }   // the literal string; anything else is refused
```

Returns `{ status, deleted, retained }`. `status` is `"completed"` or `"needs_retry"`.
`deleted` counts what was removed: invitations, conversations, inbox entries, blocks made,
blocks received, photos, photo screening records, check-ins (with mutes) and confirmed meetups.

Deletes the caller's profile, private profile, push tokens (the legacy document and every
device document beneath it), every profile photo in Storage
and its screening record, blocks in both directions,
every invitation they are part of, every conversation they are part of **including all
its messages**, both participants' inbox entries for those conversations, every check-in
by or about them with their check-in mutes, every confirmed meetup they are part of (the
other participant's `meetupsConfirmed` comes down with each one), and finally the
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
conversation id and the created time, and `source`: `"member"`, or `"photo-screening"` for a
photo held as a duplicate, whose `reporterUid` and `reporterName` are null and whose reason
is `duplicate_photo`.

### `getReportContext` · moderators only

```ts
{ reportId: string, messageLimit?: number /* 1..200, default 50 */ }
```

Returns `{ report, conversation, messages }` with the thread in chronological order.
`conversation` is null and `messages` empty when the conversation no longer exists.
`report.reportedPhotos` lists the reported member's current profile photos as
`{ id, path }`, so a moderator can open them in the Firebase console; no download URL is
minted. The audit entry records `photosListed`. A held photo's report also has `source`,
`photo: { photoId, path }` and `matches: { uid, photoId, path, distance }[]`.

**Every call is written to the audit trail.** Reading a private conversation is recorded
as a `viewed-context` action with the moderator's uid and the number of messages read.

### `actOnReport` · moderators only

```ts
{ reportId: string, action: "claim"|"dismiss"|"warn"|"suspend"|"reinstate"|"remove-photos"|"approve-photo"|"reject-photo", note?: string }
```

Returns `{ reportId, action, reportStatus, subjectUid }`, plus `photosRemoved` for
`remove-photos` and `photoAttached` for `approve-photo`.

`approve-photo` and `reject-photo` only work on a report screening filed about a held photo
(otherwise `failed-precondition` / `moderation/not-a-photo-report`). Approving makes the
photo readable and usable, and adds it to the end of the member's photos when there is room
and the main photo rule still holds (`photoAttached`), since adding it is what they were
doing. Rejecting deletes it and its screening record. Both are audited.

`remove-photos` deletes every object in the reported member's photo folder and their
screening records, and sets `photos: []` on their profile. It is audited like every other
action, with the count removed. The member can upload again; repeat problems are for
`suspend`.

`suspend` marks the account, sets `discoverable: false` so it leaves discovery, and
revokes its refresh tokens. A suspended account is refused by every callable except
`requestAccountDeletion`. `reinstate` undoes all of it. Every action is audited.

### `setVerification` · moderators only

```ts
{ uid?: string, email?: string, status: "verified"|"review"|"failed", note?: string, ageReview?: boolean, reportId?: string }
```

Returns `{ uid, status, previousStatus, verified, ageReview }`. Sets a member's verification
by hand, named by uid or by email; phase 1 has no automated check, so this is the only way
anyone becomes verified. Writes `verifications/{uid}` (method `moderator`, `reviewedBy`,
`photoId`: the main photo at the time) and `profiles/{uid}.verified` together; a member with
no profile yet gets it when the profile is created. `ageReview` sets or clears the flag that
asks someone to look at the birth date. Audited as `set-verification` with the status it
replaced. An unknown member is `not-found` / `verification/member-not-found`.

### `getStats` · moderators only

```ts
{ refresh?: boolean }
```

Returns `{ latest, history, appStore }`. Counts only: no names, emails or messages.

- `latest` is the newest snapshot: `accounts` (total, withProfile, withoutProfile, where
  withoutProfile is everyone who signed up but never finished onboarding), `members`
  (total, discoverable, new7, new30, active7, withMeetup, unmatched), `plans` (total, new7
  and by status), `meetups` (confirmed, confirmed30), `cities` and the top 30 language
  `pairs` per city, plus `generatedAt` (ms), `day` and `truncated`. The first call builds
  it if none exists. `refresh: true` rebuilds it unless it is under a minute old.
- `active7` counts members who saved their profile, sent or answered a plan, or sent or
  read a message in the last 7 days. `unmatched` counts discoverable members with nobody
  in their city who speaks what they learn and learns what they speak; it ignores blocks
  and age, so it is the generous count.
- `cities` rows are `{ id, name, members, active7, new30, unmatched }`, most members first;
  `name` carries the country, such as "Sydney, Australia".
- `pairs` rows are `{ city, a, b, aSide, bSide, meetups }` with `a < b`: aSide speaks `a`
  and learns `b`, bSide the reverse. Sorted by the scarce side.
- `history` is up to 30 days, newest first: `{ day, accounts, members, active7, plans, meetups }`.
- `appStore` is `{ lastSyncAt, lastError, days }`, days newest first with downloads,
  redownloads and updates. `lastSyncAt` is null until `syncAppStoreDownloads` has run.

`snapshotStats` saves a snapshot every day at 05:00 Sydney time. `syncAppStoreDownloads`
runs at 10:00 and reads the `APPSTORE_CONNECT` secret (`scripts/set-appstore-secret.sh`).
The Firebase CLI refuses to deploy any function while a secret the codebase references is
missing, so every project needs it: `scripts/set-appstore-secret.sh placeholder <project>`
stores `{}`, which the sync reports as "not connected yet" (lastError, with lastSyncAt null).

### Moderator identity

The moderation and stats callables require the custom auth claim `moderator` on the verified
token. No callable can grant it; it is set out of band by `functions/scripts/set-moderator.js`,
which needs project credentials. Firestore rules still deny direct access to `reports`,
`moderationActions` and `accountStatus` for everyone, including moderators, so the claim
only confers power through the callables, where it is audited.

## Trust

Phase 1 is everything that does not depend on the selfie provider. The flags live in
`config/trust`, which no client can read or write; set them with
`functions/scripts/set-trust-flags.js` (or by hand in the console). **Every flag defaults
off**, an absent document means all off, and only a literal `true` turns one on.

| Flag | Default | With it on |
| --- | --- | --- |
| `requireVerification` | off | Verification comes before the first meetup: an unverified member signs up, stays discoverable, browses and chats, but `createInvitation` and accepting with `respondToInvitation` are refused with `verification/required-to-meet`. No grace period; plans already accepted carry on. A verified member's new main photo sends them back to `pending`. |
| `requireEmailVerification` | off | Password accounts with an unconfirmed email are left out of discovery, near misses and match notices. Sign in with Apple counts as confirmed. |
| `requireProfilePhoto` | off | Every new profile needs a main photo with one clear face, from any app. Apps from phase 1 on already ask with `photoPolicy: "required"`. |

The 1.1.2 and 1.2.0 apps cannot verify anyone, have no email confirmation screen and do not
send photos with the first save, so leave the flags off until those builds are retired.
Rules that are always on are ones the older apps can meet and explain: the main photo face
check and the contact detail refusals come back as `invalid-argument` with a readable
message, which those apps show as is, and the daily limits as `resource-exhausted`.

**Verification model.** `profiles/{uid}.verified` is the public badge; `verifications/{uid}`
holds `{ status: none|pending|verified|failed|review, method, verifiedAt, ageReview,
attempts, lastResult, photoId, pendingReason, photoChangedAt, reviewedBy, note }` and is
server only. `functions/lib/verification.js` `setVerificationStatus` is the one writer.

**Where phase 2 plugs in.** `applyVerificationResult(db, uid, result)` in
`functions/lib/verification.js`. Call it with the provider's result for one selfie check
(`{ outcome: "pending"|"pass"|"fail"|"inconclusive", liveness?, faceMatch?, ageEstimate?,
provider?, providerRef?, method? }`) from a callable or the provider's webhook. It decides
the status (`trust-policy.js` `decideVerification`: under 18 by estimate is never verified
automatically and goes to `review` with `ageReview`; more than 8 years from the declared age
is verified with `ageReview` set), counts the attempt, keeps only the result fields (never a
selfie), and updates the badge. The app's selfie flow opens on
`verification/required-to-meet` and on `trust.verification.photoChangedAt`. Phase 2 should
also match the selfie against the main photo when a profile is created with one, since the
first save copies a verification made earlier.

**Daily limits** (`RATE_LIMITS` in `functions/lib/constants.js`): 20 invitations, 300
messages, 10 reports per member per UTC day, counted in `rateLimits/{uid}` inside the same
transaction as the write, so a retry never counts and a refused call writes nothing.

**Contact details** (`functions/lib/contact-details.js`): links (with a scheme, `www.`, or a
bare domain on a known ending such as `.com`, `.me`, `wa.me`, `bit.ly`), email addresses, and
phone numbers of 8 to 15 digits (dates, year ranges and decimals excluded). Refused in a
profile's name, bio and area and in an invitation note; in chat, `contactWarning` until the
pair has a confirmed meetup.

## Errors

Callable errors carry a Firebase error code and, for every rejection the backend makes
deliberately, a stable `details.reason`. Branch on `details.reason`, not on message text.
Plain input validation failures use `invalid-argument` with a human readable message and
no reason code.

| `details.reason` | Code | Meaning |
| --- | --- | --- |
| `account/not-adult` | `failed-precondition` | The self declared birth date is under 18. DuoDialect is an adults only service. |
| `profile/incomplete` | `failed-precondition` | The caller, or the other person, has no usable profile yet. |
| `profile/city-invalid` | `invalid-argument` | `city` was sent but is not an id on the world list (`functions/data/cities.json`). |
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
| `invitation/not-sender` | `permission-denied` | Only the sender may cancel a pending invitation. |
| `invitation/not-participant` | `permission-denied` | Only one of the two people in a plan may cancel it. |
| `invitation/not-found` | `not-found` | No such invitation. |
| `conversation/not-found` | `not-found` | No such conversation. |
| `conversation/not-member` | `permission-denied` | The caller is not a participant. |
| `account/suspended` | `permission-denied` | The account is suspended. Every callable refuses except `requestAccountDeletion`. |
| `deletion/not-confirmed` | `invalid-argument` | `confirmation` was not the literal string `"DELETE"`. |
| `moderation/not-an-operator` | `permission-denied` | The caller's token has no `moderator` claim. |
| `moderation/report-not-found` | `not-found` | No such report. |
| `photo/not-found` | `not-found` | No such photo in the caller's own folder. |
| `photo/not-screened` | `failed-precondition` | The photo has not passed screening: still pending, rejected or failed. |
| `photo/in-review` | `failed-precondition` | The photo matched one on another account and is held for a moderator. |
| `photo/main-needs-face` | `invalid-argument` | The main photo has no face, more than one, or one too unclear; `details.problem` says which. |
| `profile/photo-required` | `invalid-argument` | A new profile needs a main photo (`photoPolicy: "required"`, or `requireProfilePhoto`). |
| `profile/contact-details` | `invalid-argument` | A changed name, bio or area contains a link, email address or phone number; `details.field` names it. |
| `invitation/contact-details` | `invalid-argument` | The invitation note contains a link, email address or phone number. |
| `verification/required-to-meet` | `failed-precondition` | `requireVerification` is on and the caller is not verified, so they cannot create or accept a plan. |
| `verification/member-not-found` | `not-found` | `setVerification` named nobody. |
| `moderation/not-a-photo-report` | `failed-precondition` | `approve-photo` or `reject-photo` on a report that is not about a held photo. |
| `rate-limit/invitations` | `resource-exhausted` | Today's 20 invitations are used; `details.limit`, `details.resetsAt`. |
| `rate-limit/messages` | `resource-exhausted` | Today's 300 messages are used. |
| `rate-limit/reports` | `resource-exhausted` | Today's 10 reports are used. |

`unauthenticated` is returned by every callable when there is no signed in user.
`internal` means an unexpected server fault; the message is deliberately generic.

## What this contract does not claim

- **Age is self declared.** `ageAssurance` is the literal string `"self-declared"`. There
  is no identity check, document check or third party age assurance in phase 1. Do not
  present age as verified in the UI.
- **"Verified" in phase 1 is a moderator's judgement.** It means a moderator set it with
  `setVerification`, after whatever check they made (a video call, say). There is no
  liveness, face match or age estimate until phase 2.
- **The face check counts faces; it does not recognise anyone.** It does not check that
  the face is the account holder's; that is phase 2's face match. The duplicate check finds
  the same picture reused, not the same person in different pictures, and not a picture
  taken from elsewhere on the web.
- **Fluency is self declared.** `fluencyAssurance` is `"self-declared"`. The backend
  enforces that a person claims native or fluent level before they may offer a language.
  It does not test whether that claim is true.
- **Recurrence is a stated intention, not a schedule.** `recurrence: "weekly"` is stored
  and returned. No future occurrences are materialised, none can be cancelled
  individually, and nothing reschedules them. The only thing that follows the weekly
  cadence is the post meetup check-in.
- **There are no reminders.** Nothing notifies either person that a meeting is approaching.
- **Notifications cover messages, new invitations, acceptances, check-ins, the evening
  before reminder (`type: "plan"`, 18:00 local the day before each occurrence, sent by the
  hourly `sweepReminders`) and "a match joined" (`type: "match"`, `otherUid`, sent once per
  recipient when a reciprocal partner first becomes discoverable or changes languages),
  and a confirmed plan cancelled by either side (`type: "plan"`, to the other
  participant).** Declines and withdrawn pending invitations send nothing.
- **A confirmed meetup is two people's word, nothing more.** Nothing checks that anyone
  was at the venue. `meetupsConfirmed` is a count of that word, not a verification badge,
  and the UI must not present it as one.
- **Groups are not implemented.** Only two person invitations exist.
- **Deletion of a conversation is mutual.** Deleting your account removes the shared
  thread from the other participant too. That is a deliberate product choice, not a
  technical limit.
- **Safety reports survive account deletion.** Reports filed by or about a deleted
  account are retained and flagged, so deleting an account cannot erase a complaint about
  it. This is a retention exception and must appear in the privacy policy and the store
  data declarations.
- **Photo screening is automated, and a person sees a photo only when it is reported or
  held as a duplicate.** SafeSearch catches explicit, violent and racy images; it does not
  check that a photo shows the account holder, and it will sometimes be wrong in both
  directions. Reports and `remove-photos` are the backstop.
- **A download URL, once issued, outlives a later block.** The read rule is checked when
  `getDownloadURL` is called. A URL already held by a device keeps working until the photo
  is deleted or replaced. The app only keeps URLs in memory for the session.
- **Moderation is a queue and a stop button, not a workflow.** There is no appeals
  process, no notification to either party, and no automated detection beyond photo
  screening (including duplicate holds) and the contact detail rules. The operator
  screen in the app (Profile, Moderation) sits on the callables above.
