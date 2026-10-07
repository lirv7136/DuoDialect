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
3. [ ] EAS production build of 1.1.0 (build 15; app code identical to 4bddd0d), then `eas submit`.
4. [ ] Attach the build to 1.1.0 and Add for Review with the reviewer account and notes.

The EU storefronts (27) stay off for now (decided 2026-10-07). Opening them needs Digital
Services Act trader status, statements of reasons for moderation decisions, GDPR sections in
the privacy policy and likely an EU representative; revisit when an EU city is planned.

Never cancel a submission that is in review. If something is wrong, reply to App Review in
App Store Connect or wait for the outcome.

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
