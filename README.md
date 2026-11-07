# Talkeven

Talkeven pairs adults who each speak the language the other is learning, so they can
meet in person and help each other evenly. It is a platonic language exchange app:
reciprocal matching only, a suggested meetup at a public place, chat once the plan is
accepted, and a private check-in the morning after.

- App Store (Australia): https://apps.apple.com/au/app/talkeven-language-exchange/id6816316060
- In a browser: https://app.talkeven.com (the same app, built for the web)
- Site, privacy policy and community guidelines: https://talkeven.com
- Support: hello@talkeven.com

## Layout

| Path | What |
|---|---|
| `app/` | Expo Router screens (auth, onboarding, tabs, plan, chat, check-in, account) |
| `components/`, `hooks/`, `constants/` | Shared UI, hooks, theme and brand |
| `src/domain/` | Pure logic with unit tests in `tests/` |
| `src/lib/` | Firebase, API wrappers, push, storage |
| `functions/` | Cloud Functions backend; every invariant lives here, with emulator tests in `functions/test/` |
| `firestore.rules`, `firestore.indexes.json` | Client access rules and indexes |
| `site/` | The static site, built by `site/build.py` and deployed with `site/deploy.sh` |
| `docs/` | Contract, handoff, release plan, store listing and growth notes |

## Running it

```bash
npm install
npx expo start            # dev server; press i for the iOS simulator
npm run verify            # typecheck, lint, unit tests, prototype tests
cd functions && npm install && npm test   # emulator tests against demo-duodialect
```

Firebase config comes from `.env` (gitignored). Production is the `duodialect` project and
staging is `duodialect-staging`; deploy indexes before functions and rules.

The browser version is the same app exported as a single page and served by Cloudflare
Pages (project `talkeven-app`). `scripts/deploy-web.sh preview` deploys a staging build to
a preview URL; `scripts/deploy-web.sh production` deploys to app.talkeven.com. On the web
there is no push (the Notifications switch is hidden), no Sign in with Apple and no rating
prompt; confirmations use the browser's own dialog, and a wide window keeps the app in a
phone width column.

## Where to start

`docs/RELEASE-PLAN.md` says what is shipped and what is next. `docs/BACKEND-CONTRACT.md`
is the integration surface between the app and the backend, and `docs/BACKEND-HANDOFF.md`
records what the backend does and does not do.
