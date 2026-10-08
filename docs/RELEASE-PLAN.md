# Talkeven: release plan

Reviewed 7 October 2026. Talkeven (formerly DuoDialect) is a platonic language exchange app
for adults: reciprocal language partners, planned meetups in public places, and chat. Dating
is out of scope and must never be surfaced in the app, listing or review notes. Groups were
removed from the app in 1.0.1.

Gate by gate evidence lives in `docs/release-readiness.json` (`npm run release:status`).

## Shipped

- **iOS 1.0.1 (build 11) is live** on the App Store, released 2026-10-06 08:48 UTC:
  https://apps.apple.com/au/app/talkeven-language-exchange/id6816316060. Available in every
  storefront except the 27 EU regions.
  - 1.0 build 8 was submitted 26 Sep; App Review asked for information (Guideline 2.1).
    1.0.1 build 11 was resubmitted 28 Sep with a reply (`docs/APP-REVIEW-REPLY.md`) and a
    screen recording, and approved.
  - EAS build 13 is also 1.0.1 (commit 7088a70) and is TestFlight only. The next store
    build must be 1.1.0.
- **Backend is live.** Staging (`duodialect-staging`) deployed 30 Sep, with check-ins
  verified live there 2 to 4 Oct. Production (`duodialect`) functions, rules and indexes,
  including the two check-in indexes, deployed 4 to 5 Oct. Cloud Scheduler for the hourly
  `sweepCheckIns` was enabled automatically and the sweep runs clean. 16+ callables plus
  `answerCheckIn`; 115 emulator tests pass.
- **talkeven.com is live** (checked 2026-10-05): support, privacy, community guidelines,
  delete account and child safety pages. hello@talkeven.com routing is verified in
  Cloudflare (enabled rule to a verified Gmail destination, MX and SPF correct).

## 1.1.0 for iOS

1.1.0 is private post meetup check-ins plus the Ocean Pool rebrand (split disc icon,
colours `#16a39f` / `#0f2f3d` / `#f5f3ec`, new wordmark). Committed as 2aa01a2 and 4bddd0d
on `release-1.1.0` and pushed; `app.json` is at 1.1.0. Not yet built or submitted.

Checklist:

1. [x] Test email to hello@talkeven.com arrived in Gmail (2026-10-07).
2. [x] App Store Connect metadata for 1.1.0, from `docs/STORE-LISTING.md` (2026-10-07):
   - [x] keywords (new Australian set)
   - [x] English (U.K.) localisation with its own keywords
   - [x] What's New
   - [x] privacy label: no change needed, Other User Content already covers check-in answers
   - [x] 6 screenshots from `docs/screenshots/ios-6.9/` on the 6.9 inch slot
   - [x] App Review notes rewritten for 1.1.0
3. [x] EAS production builds 14 (4bddd0d) and 15 (same app code) uploaded (2026-10-07).
4. [x] Build 14 attached to 1.1.0 and submitted; Waiting for Review since 2026-10-07 20:00 AEDT.
   Gotchas: Add for Review only creates a draft, so open it on the App Review page and click
   Submit for Review; a new localisation needs its own Privacy Policy URL under App Privacy.

The EU storefronts (27) stay off for now (decided 2026-10-07). Opening them needs Digital
Services Act trader status, statements of reasons for moderation decisions, GDPR sections in
the privacy policy and likely an EU representative; revisit when an EU city is planned.

Never cancel a submission that is in review. If something is wrong, reply to App Review in
App Store Connect or wait for the outcome.

## 1.1.1 (in progress, branch `fix-1.1.1`)

The four fixes from `docs/GROWTH-NOTES-2026-10-07.md` that should ship before any marketing
push, because marketing into an empty Discover wastes the users it wins:

1. [x] Real "a match joined" push (`onProfileWritten`, `functions/lib/matches.js`).
2. [x] "Same time next week?" after a good check-in (prefills `/plan/new`).
3. [x] Meetup reminder the evening before (`sweepReminders`, `functions/lib/reminders.js`).
4. [x] Near miss fallback and "N people here are learning English" on an empty Discover.

Two onboarding fixes from the product review, client only:

5. [x] The language draft survives a backgrounded app: `src/lib/onboarding-draft.ts` writes
   through to AsyncStorage keyed by uid, cleared on profile save and at sign out.
6. [x] First save with no photo or no free times shows one inline nudge per field with a
   "Save anyway" path (`src/domain/onboarding-copy.ts`). Neither field is required.

Done on the branch: `app.json` 1.1.1, 127 emulator tests, 85 unit tests, typecheck and lint
clean. Backend deployed to `duodialect-staging` on 2026-10-07 (indexes, then functions and
rules). Staging smoke test 2026-10-08 (web build in automated Chrome): near misses, the
learning count line, the match push (logged with 3 recipients and no repeat on a bio edit),
"Same time next week?" prefill and the evening before reminder schedule all behaved as
designed. Noticed: a confirmed plan cannot be cancelled (fixed in 1.1.2), and the "You're
meeting" celebration rendered twice on Plans after a second accept. Still to do: production
deploy after 1.1.0 is approved, a device run, What's New, then build and submit.

## 1.1.2 (branch `feat-1.1.2`, local commits)

Shipped on the branch, in commit order, with unit test counts rising from 74 to 130:

- Onboarding draft survives a backgrounded app; one gentle nudge for a photo and free times.
- Share a confirmed plan with a friend (safety message), and a public place picker.
- "Met N times" trust chip from a server kept `meetupsConfirmed` count.
- Sign in with Apple (checklist below).
- App Store rating prompt after a good check-in (`src/lib/rating.ts`, gate in
  `src/domain/rating.ts`): system sheet only, at most three asks a year and sixty days
  apart, first asked once a meetup is confirmed by both people.
- A real city on every profile (allow list in `functions/lib/constants.js` and
  `src/domain/cities.ts`): discovery, near misses, the learning count and the "a match
  joined" push never cross a city. Onboarding and Edit profile get a city picker, defaulting
  to Sydney; old apps that never send a city are treated as Sydney by the server.
- In app moderation screen (Profile → Moderation, moderators only): the report queue by
  status, each report's thread and photo paths, and claim, warn, suspend, remove photos,
  dismiss and reinstate behind a confirm that spells out the consequence.
- Cancel a confirmed plan from either side (`cancelInvitation` with an optional fixed
  reason: can't make it, reschedule, other). A quiet "Cancel plan" on the card asks for
  the reason, then confirms that the partner will be told (a weekly plan goes as a whole
  series). The other person gets a push naming who cancelled and the reason phrase;
  reminders and future check-ins stop, open check-ins and the chat stay. Chats shows
  "Plan cancelled" until something new is planned. Also: the acceptance celebration is
  now keyed per invitation so it cannot show twice for one accept.

1.1.2 adds native packages (`expo-apple-authentication`, `expo-crypto`,
`expo-store-review`), so it needs a new native build, not an OTA update.

### Sign in with Apple

Apple comes before Google on purpose: App Review guideline 4.8 requires an equivalent
privacy preserving login (Sign in with Apple qualifies) as soon as a third party login such
as Google is offered, so shipping Apple first keeps a later Google button review safe. The
app code is on `agent-apple` (`src/lib/auth.ts`, `components/apple-sign-in-button.tsx`,
`app/account/delete.tsx`, `app.json`). It is a native change, so it needs a new build.

Outside the repo, in order:

1. [ ] Install the packages (the branch adds them to `package.json` only):
   `npx expo install expo-apple-authentication expo-crypto`.
2. [ ] Firebase console, both `duodialect-staging` and `duodialect`: Authentication →
   Sign-in method → Add new provider → Apple → Enable. Sign in itself needs nothing else
   on native iOS. Token revocation on account deletion (Apple guideline 5.1.1, which the
   delete screen attempts) does need the OAuth code flow fields on that provider: Apple
   Team ID, a Sign in with Apple key (Key ID and the .p8 private key from Certificates,
   Identifiers & Profiles → Keys) and a Services ID. Until they are set, revocation fails
   quietly and deletion still completes.
3. [ ] Apple Developer portal: the Sign in with Apple capability on the App ID
   `com.lachlanirving.duodialect`. EAS adds it on the next build because `app.json` sets
   `ios.usesAppleSignIn: true`; if the build log says otherwise, switch it on under
   Certificates, Identifiers & Profiles → Identifiers → the App ID → Capabilities.
4. [ ] New EAS build (`eas build --profile production --platform ios`), then on a device:
   sign up with Apple (sheet shows the name and email choices, lands on onboarding with the
   given name prefilled), sign out, sign in with Apple (lands on Discover), delete the
   account via Confirm with Apple.
5. [ ] App Store Connect: What's New mentions Sign in with Apple; App Review notes say the
   reviewer can use Sign in with Apple or the demo email account.

Notes: Apple shares the person's name on the first authorisation only, so the onboarding
profile step reads it once from `src/lib/pending-name.ts`. Hide my email gives a
`privaterelay.appleid.com` address; nothing in the app emails people directly, so that is
fine. There is no change password screen, and the reset link on the login screen is shown
before anyone is signed in, so no password surface needs hiding for Apple accounts.

### Backend deploy for 1.1.2

`docs/BACKEND-HANDOFF.md`):

- [ ] `node functions/scripts/backfill-city.js --project <id> --dry-run`, then without
  `--dry-run`, so every existing profile is `sydney`.
- [ ] `firebase deploy --only firestore:indexes` (two new `profiles` indexes with `city`),
  and wait for them to be enabled.
- [ ] `firebase deploy --only functions,firestore:rules`.

## Google Play

Unchanged, and blocked on Android device verification in Play Console. After that:

1. Create the app in Play Console.
2. Build a signed AAB targeting API 36 or later, and check the generated AAB.
3. Run it on a real Android device (the `live-exchange` and `physical-devices` gates).
4. Run the closed test: 12 testers opted in continuously for 14 days (required for personal
   accounts; this one was created 2026-09-20), then apply for production access.

## Roadmap after 1.1

In order:

1. **Exchange time balance per partner**: show how evenly the time has been shared with each
   partner.
2. **Verified profile badge**: needs a real backend design first. Age and fluency are self
   declared today, and the UI must never imply that any verification exists until it does.
3. Prompt cards.
4. Recurring "same time next week".
5. Curated cafes.
6. City waitlist.
7. Invite link.

Group meetups only come back once a city has about 30 weekly actives. No premium tier yet.

## Running the checks

```sh
npm run verify
npm run bundle:check
npm run release:status
```

`release:status` exits nonzero while any gate is pending. It reports recorded evidence; it
does not run tests, build or submit. A new native or backend change can invalidate earlier
evidence, so recheck the gates against the exact build being submitted.
