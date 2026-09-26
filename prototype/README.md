# DuoDialect · local concept preview

A working, dependency free web preview of reciprocal language meetups. It lives beside the
existing Expo/Firebase app so the new product flow can be reviewed without accounts or writes
to the existing backend. It does not change the current mobile app routes.

## Run

```sh
cd ~/dev/lingoswipe/prototype
npm start
```

Open http://127.0.0.1:8788. The server binds to loopback and serves only five public assets.
No installation, API keys, Firebase connection, third party scripts or remote assets are needed.
All profiles, illustrations and group meetups are fictional. This is not a live matching service.

## Try it

1. Start with Alex, fluent in English and learning Japanese. Discover only shows people who
   speak Japanese fluently, want English and have an overlapping time.
2. Edit the profile to learn Spanish, French, Mandarin or Korean. Change neighbourhood/time
   filters, or use a language combination with no sample people to try the empty state.
3. Say hello to a partner. Suggest a public café, date/time and one meeting or weekly practice.
   The date/time must fit shared availability. Inspect and cancel the request in My plans.
4. Switch to Small groups and save a join request for a scheduled session. Invitations and
   messages are local drafts: nobody receives them, seats are not reserved and no response is simulated.
5. Open Language dates. Enable dating from preferences and choose gender and age preferences.
   Both sample profiles must be adults, opted in and within each other’s preferences.
6. Switch dating off. Active date requests are cancelled. Language partner mode remains platonic.
7. View a person's profile to block or report. Blocking also hides their groups and cancels
   incompatible active plans. Unblock from Your profile; old requests remain cancelled.
8. Reload to confirm the demo profile and plans persist. Reset only this preview’s saved data
   from Your profile. Reports are recorded locally and have no moderator recipient.

Changing languages, times or preferences cancels active plans that no longer qualify.
No location permission is requested; neighbourhoods are selected manually. Dates/times use the
device's local timezone. Weekly means the same weekday and clock time from the chosen date;
this preview stores that preference but does not send reminders or book future occurrences.

## Validation

```sh
npm test
npm run test:browser
```

Browser checks require Chrome (`CHROME_BIN` may override it) and permission to bind a loopback
port and launch a browser. They exercise the real UI, capture desktop/mobile screenshots into
a printed temporary directory and check for external requests and script errors.

The pure core tests check both sides of language/dating eligibility, proficiency, adult and
age boundaries, blocked users/groups, shared times, invalid dates, duplicate invitations and
stored state validation. Browser tests cover reload persistence, explicit dating consent,
weekly invitations, local messages, cancellation, reporting, blocking, bad storage and write
failure recovery, and 320/390 pixel layouts.

Local storage is bounded and schema checked before rendering. User strings render as escaped
text. Storage failure is visible and retains current changes in memory. Corrupt stored data is
not silently overwritten. A change in another tab stops further writes until reload. This is
one browser's preview data, not a secure account store; do not use it for real personal messages.

## Before a real pilot

This prototype establishes the experience, not production readiness. A live pilot needs:

- A decision on city, language pairs and community recruitment, followed by a small coordinated
  trial measuring whether both sides practise and return for a second meetup.
- Authenticated profiles, an age assurance approach and consent stored/enforced on the server.
  Self declaration in the preview is not verified age. Fluency is self declared too.
- A backend enforcing reciprocal matching, mutual dating visibility and preferences, blocks
  in both directions, chat membership and request acceptance. Client filtering is insufficient.
- Firestore rules and emulator tests before reusing the existing Firebase app. Do not rely on
  the old client being secure merely because it has sign in and block buttons.
- Timezone aware availability, request acceptance, capacity transactions, per occurrence
  cancellation, calendar/reminder delivery and recurring schedule changes.
- A staffed report/moderation path, consent and deletion controls, rate limits and abuse response.
- Accessibility and real iOS/Android testing, secure hosting and a data handling policy.

Keep this off public production hosting until those live service requirements are addressed.
No commits or deployments were made for this preview.

## Existing app baseline

Before this preview was added, `tsc --noEmit` in the parent Expo app reported two errors:
`app/chat/[chatId].tsx:259` (push call arguments) and `src/lib/push.ts:8` (notification handler
fields). Those existing files and uncommitted Firebase/app configuration are left intact.
