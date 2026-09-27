# Reply to App Review (Guideline 2.1, Information Needed), 27 Sep 2026

Paste into the Resolution Center reply, attach the screen recording, and copy the same text
into App Review Information → Notes. The demo account credentials are entered separately in
the Sign-In Information fields and are not repeated here.

---

Hello App Review team,

Thank you for reviewing Talkeven. Please find the information you requested below, and the
screen recording attached (recorded on an iPhone 14 running the latest iOS, using the
submitted build).

**1. Screen recording**
Attached. It starts at launch and shows: account creation, onboarding, Discover, suggesting
a meetup, the partner accepting, chat, reporting and blocking from the chat menu, log out and
log in, and account deletion (Profile → Delete account).

**2. Purpose and target audience**
Talkeven is a free language exchange app for adults (18+). It pairs two people who can each
teach the language the other is learning — for example, an English speaker learning Japanese
with a Japanese speaker learning English — so both benefit evenly. They suggest a meetup at a
public place (a café or library), once or weekly, and chat to agree the details.

It solves a common problem for language learners: finding a reliable, reciprocal practice
partner nearby. Existing exchange apps are feed- or swipe-based and often drift into dating;
Talkeven matches only on reciprocal language ability and is explicitly not a dating app. The
target audience is adults in Sydney, Australia at launch: international students, working
holiday makers and locals learning a language.

**3. How to access the main features**
- Sign in with the demo account in the Sign-In Information fields. It has finished
  onboarding: it speaks English and is learning Japanese.
- **Discover** shows "Aiko (review partner)", a second demo account that matches it
  (Japanese speaker learning English), with a photo.
- Tap **Suggest a meetup** → choose a time and a public place → **Send invitation**. It
  appears under **Plans**.
- To see acceptance and chat: sign in on another device as the partner account (credentials
  below) and accept the invitation in **Plans**, which opens a chat. We are also happy to
  accept it from the partner side on request.
- **Report / Block:** the "⋯" menu in any chat, and on any profile.
- **Account deletion:** Profile → Delete account (password confirmation, then type DELETE).
  Also documented at https://talkeven.com/delete-account/.
- **Profile photos:** Profile → Edit profile → add up to 3 photos. Each is screened
  automatically before others can see it.

Partner demo account: see the second login in these notes (entered by the developer).

**4. External services used**
- Google Firebase: Authentication (email and password sign-in), Cloud Firestore (database),
  Cloud Functions (server logic, hosted in Sydney), Cloud Storage (profile photos).
- Google Cloud Vision SafeSearch: automatic screening of uploaded profile photos for
  explicit or violent content.
- Expo push notification service, delivering through Apple Push Notification service.
- Cloudflare: hosts talkeven.com (support, privacy policy, account deletion page).
The app contains no advertising, analytics or tracking SDKs, no payments and no AI features.

**5. Regional differences**
The app functions the same in every region where it is available. Matching depends on other
members nearby, and our launch community is in Sydney, Australia. The app is not currently
offered in the European Union.

**6. Regulated industries or third-party material**
Not applicable. Talkeven does not operate in a regulated industry and contains no protected
third-party material. All content is created by members; there are no in-app purchases.

Thank you,
Lachlan Irving
hello@talkeven.com
