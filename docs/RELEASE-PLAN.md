# DuoDialect: release plan and evidence

Reviewed 19 September 2026. Target: a tested native iOS and Android app, followed by store
submission. The browser prototype is the product reference; it is not a store release candidate.
No release, cloud build, deployment, commit, tester invitation or account purchase has been made.

## Release sequence

| Stage | Deliverable | Exit evidence |
| --- | --- | --- |
| 1. Native foundation | Reproducible checks and mobile build configuration | Typecheck, lint, unit tests and both platform bundles pass |
| 2. Working product | Native discovery, language partners, groups, optional dates, recurring invitations and chat connected to staging | Two independent accounts complete every flow with server enforcement |
| 3. Private alpha | Signed installs on real iPhone and Android hardware | Device matrix completed; no unresolved critical or high severity defects |
| 4. Store beta | TestFlight and Google Play closed testing | Real participant feedback, crash review, fixes and regression evidence |
| 5. Submission | Final signed candidate, listings, declarations, support and review credentials | All release gates reviewed against the exact build; then submit |

We should retain the reciprocal exchange and clear intent separation in the native product.
The first store version must work with real people and persist across devices. Sample profiles
must not be presented as real members. Store approval is decided by Apple and Google.

## Completed foundation work

- Corrected the existing notification handler type error for Expo SDK 54 and removed the
  obsolete client push call; the existing Cloud Function remains responsible for delivery.
- Android notification channels are created before permission requests; token registration
  names the EAS project and does not print tokens. Web, simulators, denied permission and
  session changes during registration are covered by adapter tests.
- Notification permission is requested from an explicit profile action, rather than simply
  mounting the profile screen.
- Login and signup now go through profile completion. A profile loading failure has a retry
  screen; late responses from a previous auth session cannot redirect the current session.
- Native reciprocal matching now requires native or fluent skill on both offered sides. The
  displayed exchange uses the same logic; invalid historical language values are ignored.
- Fixed the existing subscription cleanup and effect dependency lint warnings.
- Added `npm run verify`, `npm run bundle:check`, `npm run release:status` and EAS build profiles.

Local validation passed:

- Full TypeScript check and ESLint with zero warnings.
- Eight native domain/adapter tests: reciprocal matching, proficiency boundaries, invalid
  historical profiles, onboarding destination, notification behavior and registration failure paths.
- Seven prototype core tests retained, covering consent, preferences, groups, scheduling and storage.
- iOS and Android Hermes bundle export. Dummy Firebase configuration is injected and `.env`
  loading is disabled. Bundles are not installed binaries and are not evidence of device compatibility.

The prototype's earlier Chrome tests cover its desktop/mobile UI, local invitations/messages,
consent, blocks, quota errors and corrupt storage. They are not native app end to end tests.

## Findings that block a live release

| Finding | Evidence in current tree | Required work |
| --- | --- | --- |
| Native UI differs from approved preview | `app/(tabs)/index.tsx` remains the early Swipe interface | Port the three modes, preferences, planner and design to React Native |
| Database authorization not established | No checked-in Firestore rules; no emulator suite | Inspect intended schemas; add rules, enforce server invariants and test access denial |
| Discovery scans the first 50 profiles | `query(collection(db, "users"), limit(50))` | Server query/pagination that finds eligible people without exposing private dating data |
| Matching/chat metadata are client writable | `ensureChat` can heal members; clients write both users' match metadata | Immutable membership and server authority for match creation/acceptance |
| Partial message writes can cause duplicate retries | Message, chat metadata and unread updates are separate | Idempotent message IDs, atomic updates and tested retry behavior |
| Block protection is incomplete | Client filters its own blocks; push function checks both directions | Reject blocked discovery, messages and new invitations on the server |
| Age and dating consent are prototype only | Native profile has name/bio/languages | Adult onboarding, protected age data, bilateral dating consent and revocation |
| No account deletion flow | `src/lib/auth.ts` only signs up/in/out | Authenticated deletion job, associated data cleanup, progress/retry and web request route |
| Report submission has no demonstrated operator workflow | Native `reportUser` writes documents | Content controls, triage, responsible operator, response process and audit trail |
| Push lifecycle is unfinished | One token per user; no logout revocation or receipt cleanup | Installation based tokens, logout/account switch behavior, receipt cleanup and navigation tests |
| Staging environment not established | Existing Firebase configuration; no declared staging boundary | Personal staging project and test accounts before real user testing |
| Real device/build evidence absent | This machine has no discovered adb/emulator binary; no signed candidate tested | Signed installs and the device matrix below |

Deployed Firebase rules were not inspected. Missing local rules do not establish that the remote
database is publicly writable; they mean its protection is not yet demonstrated or reproducible.
The existing mobile app and its backend should not be opened to public testers in this state.

## Thorough testing: acceptance matrix

Record build number, device/OS, account roles, date, expected result, actual result and evidence
for each run. A failed test produces a reproducible defect. Fixes need a regression test where
practical, and retesting on the affected platform. Automated coverage complements real use.

| Area | Required scenarios |
| --- | --- |
| Account lifecycle | Signup, email validation/verification, duplicate account, password reset, login, logout, reinstall, session expiry, interrupted onboarding, deletion and retry |
| Adult access | Age boundaries, invalid birth dates, repeated attempts, deep links, tampered requests, protected age changes and restrictions in both stores |
| Reciprocal discovery | Both directions, fluency levels, multiple languages, no matches, pagination, blocked users in either direction and profile changes |
| Dating consent | Default off, opt in/out, mutual age/gender preferences, revocation during open chat and stale/offline requests; no disclosure to ineligible users |
| Invitations | Create/accept/decline/cancel, duplicate taps, incompatible edits, timezone/daylight saving, recurring updates, past dates and simultaneous acceptance |
| Groups | Capacity race, wait/full state, host cancellation, participant departure, blocked members, both language sides and access by nonmembers |
| Chat | Two real accounts, ordering, exactly once retry, connection loss, reconnect, long/Unicode text, empty text, rate limits, membership changes and notification deep links |
| Authorization | Unauthenticated access, reading another account's private data, forged sender, replacing chat members, direct writes around consent, blocked/deleted account reuse |
| Privacy and moderation | Reports reach triage, abusive content handling, block enforcement, deletion of owned/shared content as required, retention exceptions and exports/declarations matching actual data |
| Notifications | iOS/Android foreground/background/killed app, denied/revoked permission, reinstall, logout, account switch, invalid tokens and no private content on the wrong account |
| Resilience | Offline launch, midrequest disconnect, retry, slow network, backend rejection, quota/rate limits, process death, upgrade and auth token expiry |
| Accessibility/layout | VoiceOver, TalkBack, large text, contrast, focus order, touch targets, keyboard, smallest supported phones, safe areas and iPad if tablet support stays enabled |
| Performance | Cold start, long chat history, many matches, memory pressure, scrolling and sustained real sessions on a slower Android phone |
| Release artifact | Fresh install and upgrade of the actual signed IPA/AAB; production config/permissions, symbol uploads and SDK/privacy declarations |

Suggested alpha coverage: a current iPhone, a smaller supported iPhone, a current Android device
and a slower Android device. Use simulators for breadth; real hardware is required for push,
keyboards, background behavior and usability. Record unsupported devices explicitly.

Do not infer success from crash free dashboards alone. Log who tested which core flows and
resolve all critical/high severity issues before widening access. Repeated real language
meetups validate the product as well as the software.

## Current store requirements to design for

- Apple requires a complete app, backend/reviewer access and appropriate user content controls,
  including reporting, blocking and a response process. Its guideline 4.3(b) specifically asks
  new dating apps to provide a meaningfully different or improved experience. Our reciprocal
  practice, recurring meetings and explicit intent should be demonstrated clearly in the actual
  app and review notes. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Apps creating accounts need an in-app deletion path. Apple expects associated user content
  to be handled too, subject to disclosed applicable retention requirements.
  [Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- Google requires account deletion both inside the app and through a functional web resource,
  including after uninstall. [Google deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- Google's social/dating child safety standards apply even to adults only apps: published
  standards, in-app reports, appropriate action and a designated contact are relevant.
  [Google child safety standards](https://support.google.com/googleplay/android-developer/answer/14747720)
- Google distinguishes core dating apps from apps with incidental dating, but both need
  appropriate protection against minors accessing dating. The latter is not an automatic
  exemption; do not assume the prototype's checkbox is sufficient.
  [Google incidental dating requirements](https://support.google.com/googleplay/android-developer/answer/16838200?hl=en)
- For personal Play accounts created after 13 November 2023, Google currently requires at
  least 12 testers continuously opted into a closed test for 14 days before applying for
  production access. Actual tester engagement is reviewed; this is a minimum, not our entire
  quality standard. Account applicability is not yet known.
  [Google personal account testing](https://support.google.com/googleplay/android-developer/answer/14151465)
- Since 28 April 2026, iOS/iPadOS submissions need the iOS/iPadOS 26 SDK or later.
  [Apple SDK requirements](https://developer.apple.com/news/?id=ueeok6yw)
- Since 31 August 2026, new standard Android apps and updates need to target Android 16/API 36
  or later. Verify the generated AAB rather than relying on a dependency version.
  [Google target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)

Recheck these official pages before submission. Review requirements change, and this audit is
not a claim of approval or a substitute for completing store declarations accurately.

## Build and account setup

The existing personal identifiers are preserved: `com.lachlanirving.duodialect` for both stores,
Expo owner `lachie_irving`, and the existing EAS project ID. Account ownership/status still needs
confirmation. Do not create competing package IDs without checking the existing store records.

`eas.json` prepares internal `preview`, iOS `simulator`, and store `production` build profiles.
The iOS image uses the documented `sdk-54` alias for the installed SDK. Review this when upgrading.
[Expo build infrastructure](https://docs.expo.dev/build-reference/infrastructure/)

Before executing a cloud build, configure a personal staging backend and the EAS preview
environment, confirm signing access, and complete backend access tests. The configuration alone
does not make the current app safe for beta distribution. Do not auto-submit a build.

Still needed from Lachlan: Apple/Google developer account status, available test phones, and
eventually the operating/support contact, public policy host and real test participants.
No passwords, service account keys or signing files should be pasted into chat or committed.

## Running the checks

```sh
npm run verify
npm run bundle:check
npm run release:status
```

`release:status` intentionally exits nonzero while recorded release gates are pending. It is an
evidence report, not a test runner or store submission command. Update statuses only when the
corresponding evidence exists. A new native/backend change can invalidate previous evidence.

Next implementation milestone: port the three modes into native screens alongside a staging
backend with tested authorization, then complete the two-account exchange flow before private alpha.
