# Talkeven copy cuts (28 Sep 2026)

Target: about 1,885 words → about 1,000 (−47%). Line numbers refer to the tree at commit 9bea880.

## Never cut (shorten only, keep meaning)
18+ and consent text on signup with its links · account deletion warnings (what is deleted, what is kept) · report and block confirmations · date-of-birth privacy note · "Fluency is self-declared" (once, on the person profile) · safety tips · any error message that tells the user how to recover.

## Where each repeated idea lives (remove it elsewhere)
- How the two-way swap works: only the Discover "Partners" ⓘ (auto-opens once on first visit).
- "Platonic": once, on Signup.
- "Fluency is self-declared": once, on the Person profile (as an ⓘ footnote).
- 18+: Signup consent line and the date-of-birth note.
- Weekly plans repeat: only the ⓘ on the "Weekly" choice in Suggest a meetup.
- Where to report or block: the SafetyCard footnote.

## Global
- Remove all 8 eyebrow taglines (Discover, Plans, Chats, Groups, Profile, both onboarding screens, Login, Signup).
- Buttons are verbs, 1–3 words. At most one short sentence under any heading.
- Drop "Please" from errors; keep every recovery step.

## Per screen
**Login:** cut tagline and "Log in to find a language partner."; "New to Talkeven? Create an account" → "Create account"; reset: "Check your email for a reset link." / "Enter your email first."
**Signup:** title "Join Talkeven"; body "Platonic language swaps for adults, in public places."; consent → "By joining, you confirm you're 18+ and agree to our [Community guidelines] and [Privacy policy]."; "Back to login" → "Log in".
**Onboarding · languages:** title "Your languages"; body "Share one you speak fluently. Practise one at any level."; cut "Only native or fluent…" and "Any level is welcome."; add step indicator 1 of 2.
**Onboarding · profile:** keep "Nearly there." + step 2 of 2; replace the visibility paragraph with eye (public) / lock (private) icons; area hint "We never use your location."; "Private details" → lock icon + "Private"; DOB note "Never shown. Only used to confirm you're 18+."; buttons "Start" / "Back"; keep the photo-still-checking recovery message.
**Discover:** title "Discover"; cut subtitle; "Your exchange… + Edit my languages" → exchange chips with pencil; "Language partners" → "Partners" + ⓘ ("They speak what you're learning, and are learning what you speak."); cut the "Only people with a two-way exchange" line, the "You can help each other" pill, per-card "Fluency is self-declared", and the closing "You bring a language…" card; "Can help you with / You can help with" → exchange chips; "Shared times: …" → clock + time chips (hide when none); card taps to profile, button "Invite"; "Invitation open · see Plans" → "Invited ✓"; "Show more partners" → "Show more"; "That's everyone who fits…" → "That's everyone for now."; empty: keep "No one in Sydney fits X yet.", other variant "No matches here.", body "We'll let you know when someone joins.", buttons "Notify me" / "Invite a friend" / "Edit profile", cut Refresh (pull to refresh exists); push errors: "Allow notifications in Settings, then try again." / "Needs the phone app." / "Couldn't turn on. Check your connection."
**Plans:** title "Plans"; cut intro paragraph; empty "Nothing planned yet." + calendar illustration, button "Find partners"; status as pills (Waiting / Your turn / Confirmed / Declined / Cancelled); "You invited Aiko / Aiko invited you" → "Aiko" + direction icon; time and venue with calendar/pin icons; keep "Times are in X." only when the zone differs; "You share English · Aiko shares Japanese" → exchange chips; sections "For you (n)" / "Sent (n)" / "Past"; safety card heading "Meeting safely"; alerts "Decline?" + "Aiko will see you declined." / "Cancel invite?" + "You can send a new one later.", buttons "Keep" / "Decline" / "Cancel invite".
**Chats:** cut tagline; empty "No chats yet." / "Chats open when an invite is accepted." / "See plans"; row hint "Say hello 👋".
**Groups (hidden):** delete the screen and its hidden tab entry until groups ship.
**Profile tab:** title "Profile"; "I can share / I'm practising / Usually free" → language chips with level + clock/time chips; cut "Fluency and age are self-declared…"; cut visible hints on rows (keep for screen readers); notifications as a toggle row "Notifications"; "Blocked members" → "Blocked".
**Person:** "Meet Aiko." → "Aiko"; cut "A platonic language exchange."; "They help you with / You help them with" → exchange chips; shared times and interests as icon + chips; "Fluency is self-declared." as an ⓘ footnote (its single home); "Suggest a meetup" → "Invite"; not reciprocal → "Not a two-way match right now."; Report/Block into a ⋯ header menu like Chat; block confirm (never cut): "You won't be able to find, invite or message each other. Open invitations are cancelled, even if you unblock later. Unblock anytime in Profile."; unavailable body "They may have left Talkeven."
**Suggest a meetup:** header "New invite"; heading "Invite Aiko"; cut platonic paragraph; exchange chips instead of "Your exchange / You'll share / Aiko will share"; "20 minutes in X, 20 minutes in Y" → 20′ | 20′ split bar; cut "Times you share: …" (suggested tiles show them), no-shared-times → "No shared times. Pick any."; cut YYYY-MM-DD / HH:mm hints except on web; cut "Time zone: Australia/Sydney" unless not Sydney; "One meetup / Weekly practice" → "Once" / "Weekly" + ⓘ "Same day and time each week."; place: pin icon + placeholder "A café or library"; prefilled note "Hi Aiko! Fancy a coffee and a language swap?"; "Send invitation" → "Send invite".
**Chat:** exchange chips only (drop "Your exchange:"); empty "Say hello and confirm where you'll meet."; block confirm matches Person's text (done: both use `confirmBlock` and `BLOCK_CONFIRM_BODY`); closed: "This chat is closed. They may have left or been blocked." / "Back"; keep "Messages can be up to 2000 characters."
**Report:** keep "Report Aiko."; "Aiko won't see this." with lock icon; "Details (optional)"; "Moderators can read this chat."; success (never cut): "Thanks. We review every report and keep it even if an account is deleted. Unsafe right now? Call 000." plus a "Block Aiko" button.
**Blocked:** "Unblocking won't restore cancelled invites."; empty "No one blocked."; cut the "Blocked on another device…" line.
**Delete account (shorten only):** "Delete your account?"; "Deleted now, for good:" + items with ✕ icons (Profile, photos, private details · Invitations · Blocks · All chats and messages); "Chats are deleted for both people."; "Safety reports, by or about you, are kept for moderation." (shield icon); cut "We ask again to make sure it's really you."; retry "Not quite finished. Tap Delete again."; buttons "Delete" / "Keep account".
**Edit profile:** area "We never use your location."; cut language hints; interests as a chip input instead of "Up to 5, separated by commas."; "Open invites that no longer match can't be accepted."; "Save".
**Meeting safely:** cut the intro; "Use the ⋯ menu or their profile. Blocking stops all contact. Reports are private."; keep 000; "Get help".

## Shared components
- SafetyCard tips (never cut): "Meet somewhere public and busy." / "Tell a friend where you'll be." / "Leave anytime. That's fine." / "Never share your address or money details.", each with an icon; footnote "Uncomfortable? Report or block via ⋯."
- Photo editor hint: "A clear photo helps partners find you." (rest behind ⓘ); "Main" badge on the first photo; "n/3" counter.
- Language editor: "Already added."; "Browse all" / "Fewer"; cut "Not listed?…" (the "Add 'X'" button covers it).
- Availability: "When are you free?" + "n/14" counter badge.
- Notification prompt: "Get a ping when Aiko replies?" / "Don't miss Aiko's messages."; buttons "Not now" / "Turn on".
- Photo errors: "We can't use that photo. Try a clear, everyday one of you." / "Couldn't check it. Try again." / "Too large. Pick another."
