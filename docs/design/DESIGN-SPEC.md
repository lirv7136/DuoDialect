# Talkeven design spec (28 Sep 2026)

From design research into Duolingo, Hinge, Headspace, Calm, Airbnb, Timeleft, Meetup, Strava,
Tandem/HelloTalk, Material 3 Expressive and Apple HIG. Goal: less text, more visual, matching
the navy-and-coral icon, and never reading as a dating app.

## Principles
1. One idea per screen, one filled button. Everything else secondary or ghost.
2. At most one sentence under a heading. No eyebrow taglines. Explanations become chips, icons or an ⓘ sheet.
3. Languages are the hero, not faces: the language pair gets as much visual weight as the photo.
4. State is colour and shape (badge + icon), never a sentence.
5. Safety and fine print live behind a tap (sheet, ⓘ), not inline.
6. Everything rounded; the speech-bubble shape is the motif (avatars, empty states, celebrations).
7. Celebrate real-world outcomes only (accepted/confirmed meetups), never time in app.

## Colour tokens: Ocean Pool (5 Oct 2026)
Sydney's ocean rock pools are free, public and shared by strangers at the same level. The
icon is a split disc (deep ink half, cream half, ink divider) on pool aqua; the UI uses deep
water for weight, aqua for energy and cream for warmth. Source: `constants/theme.ts`.
Elsewhere in this spec, "navy" now means `primary` (deep water) and "coral" means `accent`
(aqua); token names such as `surfaceNavySoft` and the `"coral"` chip tone are kept so code
stays stable.

| Role | Hex | Use |
| --- | --- | --- |
| primary | #0f3d47 | deep water: primary button fill, headings, active tab, sign-in screens |
| primaryPressed | #0a2c34 | pressed state, 3px button bottom lip |
| onPrimary | #f5f3ec | cream: text and icons on deep water |
| accent | #16a39f | pool aqua: fills, illustration, badges, dots, split bar ONLY. Never text on light grounds, never under cream text |
| onAccent | #0f2f3d | ink text and icons on an aqua fill (badges, counts, ⇄, the split bar's second half) |
| accentInk | #0a6b69 | aqua text and links |
| accentSoft | #d3eeea | aqua tinted chip/badge background (Waiting, Your turn) |
| celebrate | #e0a96d | warm sandstone, celebration confetti only; decorative, never text or state |
| surface | #ffffff | cards |
| background | #f3f5f0 | screens |
| surfaceNavySoft | #e1e9ec | selected chips, soft deep water fills, avatar placeholders |
| text | #0f2f3d | body text (deep ink) |
| muted | #56666b | metadata |
| line | #dce2dd | hairlines |
| success | #2d7337 on #e4f0e1 | Confirmed (leaf green, kept apart from the aqua) |
| danger | #b3261e on #f9e3e1 | report, block, delete; lip `dangerPressed` #8a1c16 |
| onPrimaryPressed | #d3cfc2 | lip under a cream button on deep water |
| scrim / scrimStrong | rgba(10,44,52,.45 / .6) | behind sheets / over an uploading photo |

**Where the old coral went.** Fills, badges, dots, the tab pill and the unread dot are aqua
with ink text. The ⇄ badge is aqua with an ink glyph. The 20′ | 20′ bar is deep water
(cream text) | cream divider | aqua (ink text), the split disc laid flat. Empty states are a
deep water bubble and an aqua bubble with a pale aqua overlap and ink objects. Confetti is
deep water, aqua, cream and sandstone: the one warm colour, kept for real world
celebrations so the cool palette never reads as clinical.

**Rules.** Cream sits on or beside the ink, never alone on aqua (2.79:1). Never add pink.
No crosses, plus signs or stark clinical layouts (teal reads as healthcare). Do not brighten
the aqua or pair it with yellow (beach, kids).

### Contrast (WCAG 2; text ≥ 4.5:1, large text and UI parts ≥ 3:1)
| Foreground | Background | Ratio | Use |
| --- | --- | --- | --- |
| text #0f2f3d | background #f3f5f0 | 12.80 | body |
| text | surface #ffffff | 14.05 | body on cards |
| text | surfaceNavySoft #e1e9ec | 11.42 | chip labels |
| primary #0f3d47 | background | 10.75 | headings, ghost buttons |
| primary | surface | 11.81 | secondary buttons |
| primary | surfaceNavySoft | 9.60 | info chips, selected chips |
| onPrimary #f5f3ec | primary | 10.63 | primary buttons, sign-in, my chat bubble |
| primary | onPrimary | 10.63 | cream button on sign-in, monograms |
| accentInk #0a6b69 | background / surface | 5.76 / 6.33 | aqua text, ⇄ glyph |
| accentInk | accentSoft #d3eeea | 5.18 | Waiting, Your turn badges |
| onAccent #0f2f3d | accent #16a39f | 4.53 | counts, tab badge, Main, split bar |
| muted #56666b | background / surface / surfaceNavySoft | 5.45 / 5.99 / 4.86 | metadata |
| success #2d7337 | successSoft #e4f0e1 | 4.93 | Confirmed |
| danger #b3261e | background / dangerSoft | 5.95 / 5.32 | destructive text, errors |
| #ffffff | danger | 6.54 | filled danger button |
| accent (non text) | surface / primary | 3.10 / 3.81 | dots, tab pill, logo tile on sign-in |
| accent (non text) | background | 2.82 | decorative only; put state dots on cards |
| onPrimary | accent | 2.79 | never: cream must sit beside the ink |

## Type
- Display: Fraunces (`@expo-google-fonts/fraunces`), soft serif. UI: Plus Jakarta Sans (`@expo-google-fonts/plus-jakarta-sans`).
- Load with `useFonts`; keep the splash up until loaded.
| Token | Font / size / line | Use |
| --- | --- | --- |
| display | Fraunces SemiBold 34/40 | tab screen titles |
| title | Fraunces SemiBold 26/32 | |
| heading | Jakarta Bold 19/24 | |
| body | Jakarta Regular 16/23 | |
| label | Jakarta SemiBold 15/20 | |
| caption | Jakarta Medium 13/18, muted | |
| numeric | Jakarta Bold, tabular-nums | times, dates |
Keep Dynamic Type; `maxFontSizeMultiplier` 1.6 on display.

## Spacing, radius, elevation
- Spacing 4, 8, 12, 16, 24, 32, 48. Screen gutter 20. Card gap 16.
- Radius: chip 999, button 16, card 24, sheet 28, avatar "bubble" 24 with one corner 6 (speech-bubble mask).
- Cards: 1px line + shadow navy, opacity .08, radius 16, offset {0,6}; Android elevation 3.
- Buttons: no blur; 3px solid bottom lip in primaryPressed that collapses on press; pressed scale .97 + light haptic.

## Components
- **Partner card (Discover):** photo in bubble mask (4:5, top ~60%, or a smaller avatar if no photo); name in Fraunces 24 + neighbourhood chip with pin icon; **exchange strip** as one row: `[Japanese] ⇄ [English]` — left pill "teaches you" (navy fill), right pill "you teach" (outline), coral ⇄ badge between; shared times as up to 2 icon chips (moon Mon eve, sun Sat am); bio max 2 lines; one full-width primary "Invite". The whole card taps to open the profile (no separate View profile button). Languages shown as 2-letter monogram discs (JA, EN) rather than country flags.
- **Plan card (Strava-like):** left date block (big day number in Fraunces, weekday caption); right: partner avatar + exchange strip; 3-up fact row with icons: time · venue · ↻ Weekly; status badge top right: Waiting (accentSoft + clock), Your turn (accentSoft + bell), Confirmed (success + check), Declined/Cancelled (muted + ✕). One action per state (Accept/Decline for incoming, Open chat when confirmed). Invite note as a small quoted bubble collapsed to 1 line.
- **Chat bubbles:** mine navy fill cream text, radius 20 with 6 corner bottom-right; theirs surface + 1px line, 6 corner bottom-left; group consecutive messages; time on last of a group; day divider as centred caption chip; Send is a 44pt navy circle with arrow icon, shown only with text.
- **Buttons:** primary navy/cream 52pt with lip; secondary surface + 1.5px navy border; ghost navy text + icon; danger as ghost text, filled only inside confirmation dialogs; icon slot left.
- **Chips:** 40pt tall (hitSlop to 48), radius 999; unselected surface + line; selected surfaceNavySoft + navy border + check icon, spring scale on toggle; info chips no border, soft fill, 16px icon.
- **Empty state:** 160pt illustration (react-native-svg: two overlapping rounded speech bubbles in navy/coral/cream with a simple object: magnifier for Discover, calendar for Plans, "…" for Chats), Fraunces 22 headline, ≤1 caption line, one button. Slow 3s float with Reanimated (skip if reduce motion).
- **Step indicator (onboarding):** segmented bar, filled navy, current segment animates with withSpring; back chevron + "1 of 2" caption.
- **Tab bar:** 4 tabs, outline icon inactive / filled active + short label; active navy icon + 32×4 coral pill above it; unread coral dot/count; light haptic on switch.

## Screen direction
- **Discover:** remove eyebrow, paragraph, the "Your exchange" green box, section explainer, closing tip card. Header "Discover" (Fraunces) + tappable exchange pill (`EN ⇄ JA ✎`) opening the language editor. One ⓘ next to "Partners" that auto-opens once on first visit: "They speak what you're learning, and are learning what you speak." Cards as above. Primary: Invite.
- **Plans:** remove eyebrow and intro paragraph. Segmented control Upcoming · Invites (badge) · Past, date-block cards. Empty: calendar illustration + "Nothing planned yet" + "Find partners".
- **Chats:** avatar bubbles, name, monogram pair, 1-line preview, time, unread coral dot; next plan's date as a chip on the row. Rows are the action.
- **Chat:** header = avatar + name + monogram pair; Report/Block in ⋯ menu (already); optional pinned mini plan card.
- **Profile:** photo bubble, name, exchange strip, availability as a 7×3 dot grid; settings as an icon list (Edit profile, Notifications toggle, Meeting safely, Blocked, Log out, Delete account in danger at the bottom). Primary: Edit profile.
- **Onboarding:** step bar; one Fraunces question per screen as the only heading; keep the existing two routes (languages, profile) but lead each with a question and cut text; level picker can stay as chips.
- **Suggest a meetup:** remove platonic paragraph, "Your exchange" card, typed date fields (pickers already exist), and repeat text. Partner avatar + exchange strip at top; suggested times as big date tiles (day number + time) + "Pick another" tile; Once/Weekly segmented toggle with ⓘ ("Same day and time each week"); place field with pin icon + quick chips (Café · Library · Park); pre-filled note collapsed. 20′ | 20′ split bar replaces "20 minutes in X, 20 minutes in Y". Primary sticky: "Send invite".
- **Login/Signup:** navy full-bleed screen with the two-bubble logo (bubbles drift in and overlap), Fraunces wordmark, one cream line "Swap languages over coffee in Sydney." Email/password stays (no Apple/Google sign-in in this pass). Legal text as a caption.

## Delight moments (build 1–4; 5 later)
1. Invite accepted: sheet with both avatars as bubbles sliding together and overlapping + success haptic; button "Open chat". (M)
2. First confirmed meetup: small burst of navy/coral/cream bubble confetti, once per user (custom Reanimated particles or react-native-confetti-cannon). (S)
3. Send in chat: light impact haptic; bubble springs in (`entering={FadeInDown.springify()}`). (S)
4. Chips and buttons: selection haptic + scale spring; button lip collapses on press. (S)
5. Later: weekly exchange streak of filled bubbles (count meetups, not app opens).
Respect reduce motion: skip motion, keep haptics.

## Do NOT
- No swipe stacks, hearts, flames, "match" wording, ❤/✕ buttons.
- No full-bleed edge-to-edge portrait photo decks; photos sit inside cards, language strip as large as the name.
- No age by the name, no distance, no "online now", no maps.
- No pink/red/purple romance palettes, face gradients, blur-to-reveal, "who liked you".
- No streak pressure or XP.
- Report, Block, Delete keep text labels.
- No eyebrows; never more than one filled button per screen.
