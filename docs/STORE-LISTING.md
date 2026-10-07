# Talkeven: store listing and declarations

Drafted 26 September 2026 for v1.0 (language partners, plans and chat; no groups, no
dating); updated 7 October 2026 for 1.1.0. iOS 1.0.1 is live on the App Store. Every
answer below was rechecked for 1.1.0, including check-ins. Recheck it if the app starts
collecting anything new, and before each submission. Apple and Google decide approval;
this is a draft for review, not legal advice.

## Shared facts

| | |
|---|---|
| Name | Talkeven: Language Exchange (from 1.0.1; the home-screen name stays "Talkeven") |
| Bundle ID / package | `com.lachlanirving.duodialect` (both stores) |
| App Store Connect app | 6816316060 |
| Audience | Adults, 18+ (self-declared date of birth at sign up) |
| Price | Free, no in-app purchases, no ads |
| Primary category | Education (Apple) / Education (Google Play) |
| Secondary category | Social Networking (Apple) |
| Support URL | https://talkeven.com/support/ |
| Privacy policy URL | https://talkeven.com/privacy/ |
| Account deletion URL | https://talkeven.com/delete-account/ (works without the app, as Google requires) |
| Support email | hello@talkeven.com (forwards to Lachlan) |
| Child safety standards URL | https://talkeven.com/child-safety/ (Google Play, social apps) |
| Marketing URL | https://talkeven.com/ |

## App Store (Apple)

**Subtitle** (30 max): `Swap languages, meet in person` (30)

**Promotional text** (170 max):
> Find someone who speaks the language you're learning and wants to learn yours. Trade 20 minutes each way over coffee, and keep it going every week.

**Keywords** (100 max, comma separated, no spaces wasted):
`partner,practice,speaking,conversation,japanese,korean,spanish,chinese,mandarin,hindi,english,sydney` (from 1.1.0; 100 characters).

1.0.1 used `exchange,japanese,spanish,korean,english,tandem,conversation,practice,speaking,partner,sydney,local`. Changed because "exchange" already appears in the name (wasted characters) and "tandem" is a competitor's app name, which Apple's keyword guidance and Guideline 2.3.7 warn against. Also add an English (U.K.) localisation (below): the Australian store also searches U.K. English metadata, which gives a second 100 character keyword field.

**Description**:
> Talkeven pairs you with someone who speaks the language you're learning and is learning yours. You help each other, evenly.
>
> HOW IT WORKS
> • Tell us what you can share and what you're practising. You can only offer a language you speak natively or fluently.
> • See people for whom the exchange works both ways. Nobody sees a one-way match.
> • Suggest a meetup at a public place, once or weekly, at a time you both have free.
> • Once they accept, chat to agree the details, in any script.
>
> BUILT FOR REAL CONVERSATION
> • Language partners only. Talkeven is not a dating app.
> • Choose your own neighbourhood. We never ask for your location.
> • Your date of birth stays private, and is only used to confirm you're 18 or over.
>
> SAFETY AND CONTROL
> • Block anyone, anytime. Blocking hides you from each other and cancels open plans.
> • Report a concern from any profile or conversation. Reports go to a person for review.
> • Delete your account in the app, with no email or phone call needed.
>
> No ads. No tracking. Free.

**What's New** (1.0): `First release. Find a language partner, plan a meetup and chat.`

**What's New** (1.1.0): `New look: a fresh icon and calm ocean colours throughout. Check-ins: the morning after a meetup, Talkeven privately asks how it went. Your answer is only ever seen by you, and helps us suggest what's next. Plus a new Community guidelines page and small fixes.`

**What's New** (1.1.1): `You now hear when someone who fits your exchange joins, get a reminder the evening before each meetup, and can suggest the same time next week straight from a check-in. An empty Discover now shows who is almost a match.`

### English (U.K.) localisation

Add English (U.K.) as a second localisation in App Store Connect. The name, subtitle,
promotional text, description and What's New are the same as English (Australia) above;
only the keywords differ.

**Keywords** (100 max):
`french,german,italian,portuguese,vietnamese,cantonese,indonesian,thai,arabic,meetup,fluent,cafe` (95 characters)

The Australian storefront searches the U.K. English keywords as well as the Australian
ones, so this field extends the Australian keyword set rather than duplicating it. It
repeats no word from the primary keywords or the app name, because a repeated word adds
nothing to search.

**Age rating**: answer the questionnaire honestly. Relevant answers: unrestricted user
generated content = **Yes** (free text chat and profiles); messaging between users =
**Yes**; no violence, no mature themes in the app's own content. Because the service is
restricted to adults, choose the **18+** rating if the questionnaire offers it for
user-to-user communication with strangers, rather than a lower rating that would let
minors download it.

**App Review information**:
- Sign-in required: yes. Provide a reviewer account that has finished onboarding, and a
  second account it can match with, so review can try Discover, a plan and chat.
  Create both on the **production** backend just before submission (not staging).
- Notes (draft):
  > Talkeven is a platonic language exchange app for adults. The reviewer account speaks
  > English and is learning Japanese; "Aiko (review partner)" matches it. To try the core
  > flow: Discover → Suggest a meetup → (we accept from the partner account on request, or
  > use the second login) → Chat. Block and Report are on every profile and conversation.
  > Reports are reviewed by the developer through a moderation queue. Account deletion:
  > Profile → Delete account. Guideline 4.3(b): this is not a dating app; matching is by
  > reciprocal language ability, not attraction.

### App Privacy ("nutrition label")

Tracking: **No**. The app has no advertising or analytics SDKs and does not share data
with data brokers.

Data linked to the user, all for **App Functionality** only (none for analytics,
advertising, product personalisation or third-party purposes):

| Apple category | What | Where it comes from |
|---|---|---|
| Contact Info → Email Address | Sign-in email | Firebase Auth |
| Contact Info → Name | First name shown to partners | Profile |
| User Content → Emails or Text Messages | Chat messages | Conversations |
| User Content → Photos or Videos | Optional profile photos (up to 3), shown to signed-in members to help partners recognise each other; screened automatically | Storage `profilePhotos/`, profile |
| User Content → Other User Content | Bio, neighbourhood, interests, availability, meetup notes and venues, reports, post meetup check-in answers and confirmed meetups (from 1.1.0) | Profile, plans, reports, checkIns, confirmedMeetups |
| Identifiers → User ID | Account ID | Firebase Auth |
| Identifiers → Device ID | Expo push token, only if notifications are enabled | pushTokens |
| Other Data | Date of birth (private, age check only), languages and levels | privateProfiles, profiles |

Photos or Videos is **linked to the user**, used for **App Functionality** only, and not
used for tracking. Photos are sent to Google Cloud Vision for automated safety screening;
Google acts as our service provider, which Apple does not count as third-party use.

Not collected: location (neighbourhood is typed by the user and is not precise
location; photos are re-encoded on the device before upload, which does not carry over
embedded location), contacts, health, financial info, browsing history, search history,
purchases, diagnostics or crash data.

## Google Play

**Short description** (80 max):
`Find a language partner who wants to learn yours. Meet up, chat, help each other` (79)

**Full description**: reuse the App Store description above.

**Category**: Education. **Tags**: Language learning, Social.

**Target audience and content**: target age group **18 and over** only. The app is not
designed for children. Answer "No" to appealing to children.

**Content rating (IARC)**: category *Social or communication*. Users can interact and
exchange messages: **Yes**. Users can share location: **No** (neighbourhood is free
text, not device location). Digital purchases: **No**. Expect a Mature/18+ style rating
because of unmoderated user-to-user chat; that is consistent with an adults-only app.

**Dating classification**: *not a dating app and no incidental dating features in v1.*
Keep it that way in the listing, screenshots and review notes.

**App access**: provide the same reviewer credentials as Apple.

**Ads**: No. **Government app**: No. **Financial features**: None. **Health**: None.

### Data safety form

Data is encrypted in transit: **Yes** (HTTPS/TLS to Firebase). Users can request deletion:
**Yes**, in the app and at the deletion URL. Data shared with third parties: **No**
(Google Firebase and Expo push act as service providers processing on our behalf, which
Google's form does not count as sharing).

| Play data type | Collected | Purpose | Optional? |
|---|---|---|---|
| Personal info → Name | Yes | App functionality | Required |
| Personal info → Email address | Yes | App functionality, account management | Required |
| Personal info → User IDs | Yes | App functionality, account management | Required |
| Personal info → Other info (date of birth, languages) | Yes | App functionality (age check, matching) | Required |
| Photos and videos → Photos | Yes | App functionality (profile photos), safety screening | Optional |
| Messages → Other in-app messages | Yes | App functionality | Required to chat |
| App activity → Other user-generated content (bio, plans, reports, post meetup check-ins) | Yes | App functionality, safety | Partly optional |
| Device or other IDs (push token) | Yes | App functionality (notifications) | Optional |

Not collected: location, financial info, health, videos, audio, files, calendar,
contacts, web browsing, app diagnostics.

Retention: account data, including profile photos, is deleted when the account is deleted. Exception: safety reports
filed by or about the account are kept for moderation, and the privacy policy must say so.

## Screenshots

Apple needs 6.9" iPhone screenshots (1290 × 2796, or 1320 × 2868). Because v1 is iPhone
only, no iPad screenshots are required. Google needs at least 2 phone screenshots
(portrait 1080 × 1920 or larger) plus a 1024 × 500 feature graphic.

The 1.1.0 set is in `docs/screenshots/ios-6.9/`, in this order:
1. `1-discover.png`: Discover with a match
2. `2-suggest-meetup.png`: suggest a meetup (public place, weekly)
3. `3-plans-confirmed.png`: Plans → Confirmed
4. `4-chat.png`: chat in two scripts
5. `5-languages.png`: language setup
6. `6-check-in.png`: the private post meetup check-in

## Still needed from Lachlan

talkeven.com is connected and live (checked 2026-10-05). hello@ routing is verified in
Cloudflare: one enabled rule forwards to a verified Gmail destination, and the MX and SPF
records are correct. Still open:

- A test email to hello@talkeven.com arrived on 2026-10-07, so forwarding works end to end.
- 1.1.0 metadata entered in App Store Connect on 2026-10-07 (both localisations, screenshots,
  review notes); attach the 1.1.0 build, then Add for Review.

Reports are handled by Lachlan (the named operator and child safety contact on the site);
support replies within two business days, as the support page says.
