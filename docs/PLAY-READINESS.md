# Google Play readiness: feat-1.1.2 (audited 2026-10-08, read only)

Note: another session staged a push registration rework in this worktree during the audit (`src/lib/push.ts`, `functions/lib/notifier.js`, 20 files). Android channel and permission order are unchanged, so the findings hold.

## 1. Blockers for the first Android build

- [ ] **google-services.json is staging.** The committed file (not gitignored, commit a8c441e) registers the package with `duodialect-staging`; the EAS FCM V1 key is `~/.config/talkeven/fcm-staging-service-account.json`. A production AAB would mint push tokens on the wrong project. Fix: Firebase console → project `duodialect` → Add app → Android `com.lachlanirving.duodialect` → replace `google-services.json` (public client config). Service accounts → Generate new private key → `eas credentials -p android` → production → Google Service Account → FCM V1 → upload. EAS keeps one FCM key per package, so staging preview APKs lose push; accept it, or give staging its own `applicationId` via `app.config.ts`.
- [ ] **EAS env vars.** No `.env` is in git (local `.env` is staging, `.env.local` production). `eas env:list --environment production` must show `EXPO_PUBLIC_FIREBASE_PROJECT_ID=duodialect`.
- [ ] **Version.** `app.json` says `1.1.1`; set `expo.version` to `1.1.2` (versionCode is remote, autoIncrement on production).
- [ ] Optional: `android.blockedPermissions` for `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (manifest carries them; only the system photo picker is used). CAMERA and RECORD_AUDIO are already removed.

Already fine: Apple sign in uses `requireOptionalNativeModule`, `showAppleButton` is false off iOS, nothing renders, delete falls back to password, plugin is iOS only. targetSdk/compileSdk 36 from RN 0.81. 16 KB aligned (SDK 54, RN 0.81.5, Reanimated 4.1.6, Worklets 0.5.1, Screens 4.16; confirm in the bundle explorer). Edge to edge always on; predictive back off. Notification icon 96 px white on transparent, `#16a39f`, channel `default` matches the server. Adaptive icon layers 1024 px in `assets/images/`; `play-icon-512.png` and `feature-graphic-1024x500.png` in `assets/brand/`.

## 2. Play Console requirements

- [ ] Privacy `https://talkeven.com/privacy/`; deletion `https://talkeven.com/delete-account/` (in app Profile → Delete account; web email path). Both from `site/build.py`.
- [ ] Data safety per `docs/STORE-LISTING.md`. SDKs touching data: `firebase` JS (Auth, Firestore, Functions, Storage; no analytics), `expo-notifications` (push token), `expo-image-picker` and `expo-image-manipulator` (photos), `expo-store-review`, AsyncStorage (local). Backend: `@google-cloud/vision`, `expo-server-sdk`, `firebase-admin`. No ads, analytics or crash SDKs. Encrypted in transit yes; deletion yes.
- [ ] Content rating: Social or communication; interaction yes; location no; purchases no; expect Mature 17+.
- [ ] Target audience 18+; appeals to children no; not dating; ads, government, financial, health, news no. Child safety URL `https://talkeven.com/child-safety/` plus contact.
- [ ] App access: restricted, demo account required. Use the production reviewer and "Aiko (review partner)" accounts (`~/.config/talkeven/review-accounts.env`) with `docs/APP-REVIEW-REPLY.md` steps. Email only.

## 3. EAS commands and Console order

```sh
cd ~/dev/lingoswipe/.claude/worktrees/feat-1.1.2 && npm run verify && eas whoami
eas build --platform android --profile preview       # internal APK, staging env
eas build --platform android --profile production    # Play AAB, production env
```
The preview APK's keystore already exists on EAS, so no "Generate a new Android Keystore?" prompt (if asked, Yes; it becomes the Play upload key). Production asks once for a starting versionCode: `1`. Upload the first AAB by hand; later add `submit.production.android: { serviceAccountKeyPath, track }` to `eas.json` and run `eas submit -p android --profile production --latest`.

1. Finish identity and device verification (Settings → Developer account).
2. Create app: "Talkeven: Language Exchange", app, free, en-AU.
3. Dashboard tasks: privacy, app access, ads, content rating, target audience, data safety, government, financial, health, child safety.
4. Store listing: descriptions, 512 icon, feature graphic, 2+ Android screenshots.
5. Testing → Closed testing → create track → Testers → Google Group (groups.google.com, 12+ members; simplest) → upload AAB, accept Play App Signing, roll out, share the opt in link.
6. 12 testers opted in for 14 continuous days (clock resets below 12), then Dashboard → Apply for production access.

## 4. Android device test script

1. Install preview APK: splash, fonts, dark status icons, nothing under the status bar, tab bar above the gesture bar (gesture and 3 button nav).
2. Email sign up: no Apple button or "or" divider; keyboard clears the password field; Terms open in a Custom Tab.
3. Date of birth: Material dialog, max 18 years ago, cancel keeps the value.
4. Add a photo: system picker, no permission prompt, square crop, upload.
5. Notification prompt: Android 13+ dialog; channel "Messages" in Settings; `pushTokens.platform` is `android`.
6. Push from a second account: white glyph on teal, not a grey square; tap from killed opens the chat.
7. Suggest a meetup: date and 24 hour time dialogs; pick 10:03 (no 5 minute step) and check what is stored.
8. Plans → Share and Discover → invite: share sheet; cancel returns cleanly.
9. Chat with keyboard open (edge to edge, adjustResize): composer visible, send haptic, list scrolls.
10. ⋯ menu: bottom Sheet, not ActionSheetIOS; block Alert has two buttons; back closes the Sheet; check its bottom edge on 3 button nav (Modal lacks `navigationBarTranslucent`).
11. Report a profile; moderation screen renders `monospace`.
12. Check in: rating prompt is silent on a sideloaded APK; retest on the Play build.
13. Delete account with password and DELETE; signed out, data gone.
14. Relaunch: still signed in; device dark mode leaves the app light; portrait only.
15. `adb shell am start -a android.intent.action.VIEW -d "duodialect://chat/<id>"` routes correctly.
