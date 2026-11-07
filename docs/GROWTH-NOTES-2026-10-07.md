# Talkeven: honest assessment, improvements and go to market (7 October 2026)

Written the evening 1.1.0 was submitted for review (build 14, Ocean Pool rebrand plus
private post meetup check-ins). 1.0.1 has been live on the AU App Store since 6 October.
Two research passes fed this: a read only product audit of the 1.1.0 code and screenshots,
and a web research pass on the Sydney market and cold start playbooks. Sources for the
market section are listed inline. Treat numbers as approximate.

## 1. Where the app stands

### What is genuinely good

- **Reciprocity is enforced on the server**, not implied. `functions/lib/eligibility.js`
  (`reciprocalExchange`) only shows people where the exchange works both ways, and you can
  only offer a language you speak at native or fluent level. Every card in Discover is
  actionable. Tandem and HelloTalk never promise that.
- **The invite is a time and a public place, not a "hi".** `app/plan/new.tsx` shows the
  exchange strip, the 20′ | 20′ split and date tiles. This kills the dead chat problem that
  sinks Bumble BFF and most exchange apps.
- **The private check-in** (`app/check-in/[checkInId].tsx`) is new in the category:
  did it happen, would you meet again, report if something went wrong, and the partner never
  sees the answer. With weekly recurrence and the quiet week auto mute
  (`functions/lib/checkins.js`, `MAX_QUIET_OCCURRENCES = 3`) it is a real retention loop.
- **Safety is real, not decorative:** block in both directions cancels plans, report from
  profile, chat and check-in, Cloud Vision screening on photos, no location, private date of
  birth, 18+ only.
- The backend is solid for a solo project: 16+ callables own every invariant, 115 emulator
  tests, default deny rules, staging and production separated.

### What would make a new user bounce

1. **Empty Discover.** Day one in Sydney the user sees a handful of people or nobody. The
   empty state (`src/domain/invite-copy.ts`) says "We'll let you know when someone joins",
   but no such push exists in `functions/lib/notifications.js`. That is a false promise and
   the single biggest churn risk.
2. **Discovery has no city at all.** `functions/lib/discovery.js` queries `discoverable`
   plus `offers array-contains-any seeks`, in uid order, scanning 60 and returning 20
   (`functions/lib/constants.js`). No ranking by shared availability, recency or activity.
   Fine at 50 users, wrong at 500, and it means a Melbourne signup will see Sydney people.
3. **Email and password only.** No Sign in with Apple or Google (`app/(auth)/login.tsx`).
   For a free app aimed at students this costs signups.
4. **"Fluency is self declared"** on the profile (`app/person/[uid].tsx`) undercuts the
   trust story the listing sells.
5. Onboarding is three screens and five required fields before any value. Date of birth
   could be deferred to the first invite. The language draft lives in memory only
   (`src/lib/onboarding-draft.ts`), so backgrounding the app during signup loses it.
   Availability is optional, but without it `suggestMeetingTimes` has nothing to offer.

### My overall view

The product thesis is right and the execution of the core loop is better than the
incumbents at the one thing they fail at: turning a match into a real meetup. The brand
work (Ocean Pool, split disc, "talk | even") is distinctive without looking like a dating
app. The risk is not the product, it is the market: this is a two sided local marketplace
with a hard pairing constraint (A speaks what B learns AND B speaks what A learns), so
liquidity per language pair per city is the whole game. Until there are roughly 30 weekly
actives in Sydney across two or three pairs, no feature work matters as much as seeding.

## 2. Improvements, ranked

Impact over effort, with the file each touches. The first four are the ones to do before
any marketing push, because marketing into an empty Discover wastes the users you win.

1. **Real "a match joined" push.** Trigger from the profile upsert in
   `functions/lib/profiles.js`, send via `notifications.js`. Makes the empty state honest
   and brings people back when liquidity arrives.
2. **"Same time next week?" after "Yes, we met".** `app/check-in/[checkInId].tsx` already
   has the data; one button converts a good meetup into a recurring plan.
3. **Meetup reminder push the day before**, from the existing sweep in
   `functions/lib/checkins.js`. Flaky partners are the number one complaint about every
   competitor; a reminder with the venue is the cheapest fix.
4. **Near miss fallback in Discover.** `languageFailureReason` already exists in
   `functions/lib/discovery.js`. Show one way matches greyed out with the reason, plus a
   count like "14 people here learn English". Zero results becomes "almost".
5. **Sign in with Apple and Google.** `app/(auth)/login.tsx`, `src/lib/auth.ts`.
6. **Share plan with a friend** (share sheet with venue and time) on
   `components/plan-card.tsx`. The cheapest safety feature a cautious user would ask for.
7. **Persist the onboarding draft** to AsyncStorage in `src/lib/onboarding-draft.ts`.
8. **Nudge photo and availability on first save** in `app/(onboarding)/profile.tsx`.
   A monogram with no times is an unmatchable profile.
9. **Curated venue picker** replacing free text in `app/plan/new.tsx` (`PLACES`). Removes
   the "where" negotiation and enforces public places, which today are suggested but not
   validated (`validateMeetingDraft` accepts any venue text).
10. **"Met N partners" chip** on cards from `confirmedMeetups` in
    `components/partner-card.tsx`. The first cheap trust signal; a real verified badge can
    come later.

Structural items for 1.2 or later: a `city` field on profiles (today `LAUNCH_CITY` is
hard coded in `constants/brand.ts` and `area` is free text); ISO language codes instead of
lower cased names (`src/domain/languages.ts`); flip `discoverable` off for dormant accounts;
ranking in discovery once there is anything to rank. Gender is never collected
(`src/domain/profile-form.ts`), which is a deliberate choice, but it means a woman cannot
opt to meet women first. Worth a careful decision rather than a default.

Roadmap order, revised from the 29 September list: (1) same time next week, (2) city
waitlist plus match push, (3) invite link, (4) curated cafes, (5) exchange time balance,
(6) prompt cards, (7) verified badge. Time balance moved down: it is a nice score, but it
does not create a second meetup the way (1) to (4) do.

## 3. The Sydney market

### What exists today

In person language exchange in Sydney is bar nights, not partners:

- Sydney Language Exchange: 8,500 members, Tuesdays 6pm at the Shark Hotel, $3, 20 to 60
  attend ([meetup](https://www.meetup.com/sydneys-language-exchange/)).
- Japanese English Language Exchange Sydney: 1,060 members, Thursdays 7pm at Incafe
  Haymarket, tables by level ([meetup](https://www.meetup.com/nihongo-eigo-exchange-sydney/)).
- Sydney Chinese and English Exchange: 3,950 members, fortnightly Thursdays, Sanctuary
  Hotel ([meetup](https://www.meetup.com/sydney-chinese-english-language-exchange-meetup-group/)).
- Speak Easy International, Aloha Sydney (Darling Harbour rooftop), CSJ Japanese meetup
  (World Square), plus an Eventbrite Friday night. Mundo Lingo is in Melbourne and Perth,
  not Sydney ([cities](https://mundolingo.org/cities)).
- Unis: USYD WASABI runs conversation workshops with native speakers
  ([USU](https://usu.edu.au/clubs/wasabi)); UTS has a Japanese speaking tandem program;
  AJS NSW's "Shaberanaito" night invites all five uni Japanese clubs.
- ELICOS colleges are all CBD: Navitas English (8,000+ students a year, Hyde Park), ILSC,
  Kaplan, EC, ELC. The sector fell 35% in 2025, so colleges want free student perks.

The apps: Tandem scores 2.7/5 on Trustpilot ("basically Tinder with extra steps",
harassment, "nobody is willing to learn a language", paywalled visibility)
([Trustpilot](https://ca.trustpilot.com/review/tandem.net)). HelloTalk reviews repeat the
same thing: men treating it as dating and pushing women off the app. Neither listing
mentions meeting in person.

**The gap:** every option is a global chat app or a loud group night in a CBD pub. Nobody
offers a reciprocal one to one partner, in daylight, at a café near home, every week.
That is Talkeven's lane, and the listing already says it ("Swap languages, meet in
person").

### Who the early adopters are, and the supply problem

- International students: about 688,000 nationally (China 23%, India 16%, Nepal 9%,
  Vietnam 5%); Japan and Korea are each around 1%, so roughly 7,000 each nationally
  ([DoE](https://www.education.gov.au/international-education-data-and-research/resources/international-student-monthly-summary)).
- Working holiday makers at June 2025: UK 50,000, France 24,100, Ireland 18,700, Italy
  14,200, Taiwan 13,300, Japan 12,800, Korea 12,700, Germany 7,100; Argentina 4,700,
  Chile 4,000, Spain 3,400
  ([Home Affairs](https://www.homeaffairs.gov.au/research-and-stats/files/working-holiday-report-june-25.PDF)).
- NSW residents by language (2021 census): Korean 62,000 (Parramatta, Ryde), Japanese
  18,000 (Willoughby, City of Sydney, Northern Beaches, 59% female), Mandarin 271,000,
  Spanish 72,000.
- Australian adults learning Japanese outside school: only about 4,400 nationally in adult
  non school settings, 10,400 in higher education
  ([Japan Foundation](https://www.jpf.go.jp/e/project/japanese/survey/result/information/dl/oceania_en.pdf)).

**The key finding:** the limiting side is always native English speakers who are actively
learning and will turn up. Japanese and Korean speakers wanting English outnumber Anglo
adults learning those languages by a wide margin; Mandarin is worse. Spanish is the most
balanced pair. French and German arrivals are plentiful but few Sydneysiders learn them.
Strict reciprocity means the first 50 users have to be English natives learning Japanese,
Spanish or Korean; the other side fills itself.

### Cold start lessons from comparable apps

- Timeleft's founder dropped cards at Lisbon restaurants and sat incognito at the first 60
  dinners; it only needs six people per table.
- 222 started with friends dragged to backyard pasta dinners, then venue deals.
- Pie failed at one to one matching and pivoted to hosted group events with paid hosts.
  One to one is the hard mode. Groups are the fallback if pairs do not take.
- Bumble seeded sororities first (the scarce side), then fraternities, with campus
  ambassadors.

Pattern: the founder hosts, the scarce side is recruited first, one suburb, matching by
hand.

## 4. Marketing: the first 30 days, zero budget

Do these in order. The first one is the whole plan; the rest feed it.

1. **Host a weekly "Talkeven table".** Saturday 10am, one café near Central or Haymarket
   (close to Incafe and the ELICOS colleges). Match pairs by hand from the signups, sit
   with them, and ask them to install the app and send the next week's invite from it.
   Every user gets a real meetup in week one, which no competitor can say. Cap it at 90
   days so it does not become the product. This is also where the TikTok content comes
   from.
2. **Recruit the scarce side first:** WASABI, the UNSW and UTS Japanese societies, the USYD
   Spanish and Korean clubs. The pitch is "your members get a native partner", not
   "download my app". Expect 20 to 40 signups.
3. **Attend Sydney Language Exchange (Tuesday) and the Japanese Thursday as a participant.**
   Hand a card to pairs that click. Do not pitch the room, and be open with the
   organisers so you are not seen as poaching. Expect 5 to 10 strong users.
4. **AJS NSW Shaberanaito and the next JAC event:** ask to be mentioned, not to present.
5. **ELICOS noticeboards:** Navitas Hyde Park, ILSC, Kaplan, EC, ELC. A4 poster with a QR
   code: "English speaking partner. Free. In person." Ask student services first.
6. **Reddit, carefully.** r/languagelearning bans self promotion outright; r/sydney removes
   drive by promotion. Post only as a person asking "where do you practise Japanese in
   Sydney?" and answer honestly. Small yield, high ban risk if pushed.
7. **One video format, repeated:** "20 minutes each way", a short vlog of a real table with
   consent, plus "which language are you learning?" street asks at Central. Korean
   language content from Sydney has reached 900k views (Chambo on TikTok), so the audience
   exists. Slow yield, low risk.
8. **Founding members:** the first 100 get a permanent founder mark on their profile and a
   say on features. Cheap, modest lift, and it gives the "Met N partners" chip a sibling.
9. **mylanguageexchange.com Sydney listings:** message recent Sydney profiles personally.
10. **Product Hunt: no.** Nobody there is in Sydney.

### ASO notes

- AU App Store autocomplete: "language ex" completes to "language exchange" first, and
  "talkeven: language exchange" already appears third in the suggestions. "conversation
  partner" surfaces AI girlfriend apps and couples games. Stay in the "language exchange"
  neighbourhood; do not chase "conversation partner".
- The 1.1.0 keyword sets are right. Do not add "tandem" even though the research pass
  suggested it: it is a competitor's name and Guideline 2.3.7 applies.
- Prompt for a rating after the first confirmed meetup. Five ratings are needed before a
  score shows on the store page.

## 5. Three 30 day goals that tell us whether this has legs

1. **60 completed first meetups** (both check-ins answered), not downloads.
2. **40% of first pairs meet a second time within 14 days.**
3. **25 signups from native English speakers learning Japanese, Spanish or Korean, each
   with a reciprocal match within 7 days.**

If the scarce side cannot be found in 30 days, relax reciprocity before spending more on
marketing: for example let an English native also offer a language they speak well but
not fluently, or allow a one way match where one side explicitly agrees to help for free.
That is a product decision, not a marketing one, and it should be made on the numbers.

## 6. What I would do this week

1. Ship the four pre marketing fixes (match push, same time next week, reminder, near miss
   fallback) as 1.1.1 while 1.1.0 is in review.
2. Pick the café and the Saturday. Book nothing; just turn up with the first six people.
3. Message WASABI and the USYD Spanish club this week, because the semester clock is
   running and exams start in November.
4. Put the three goals above in `docs/release-readiness.json` as a "traction" gate so they
   get checked every time the docs are.
