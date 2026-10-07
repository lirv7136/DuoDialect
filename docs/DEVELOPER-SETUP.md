# Developer portal tooling

Prepared 20 September 2026 for DuoDialect's personal developer accounts. This is a record
of that day. Current status (7 Oct): the app is Talkeven, iOS 1.0.1 is live, and the backend
is deployed to staging and production; see `RELEASE-PLAN.md`.

## Available tools

- Microsoft Playwright CLI 0.1.21: installed globally from `@playwright/cli` and tested
  against the Apple developer website using the existing Chrome installation.
- Expo EAS CLI 16.28.0: already installed. A live `eas whoami` returned not logged in.
- Firebase CLI 15.1.0: already installed, with the personal account present in `firebase login:list`.

No suitable browser or developer console connector was found in the available plugin directory.
Playwright is used directly through the terminal, so it works in the current session without
registering another MCP server or restarting the assistant.

Official tool documentation: https://github.com/microsoft/playwright-cli

## Dedicated browser session

Session: `duodialect-developer`.

Working directory for commands and snapshots:
`~/.cache/duodialect-developer-browser`

Persistent Chrome profile:
`~/.local/share/duodialect-developer-browser`

Both directories were created with mode 700, outside the repository. Do not copy cookies,
browser storage or authentication exports into the project or print them into chat.

```sh
playwright-cli -s=duodialect-developer open https://developer.apple.com/account/ \
  --browser=chrome --headed \
  --profile=/home/lachlan-irving/.local/share/duodialect-developer-browser
playwright-cli -s=duodialect-developer tab-list
playwright-cli -s=duodialect-developer snapshot --depth=4
```

Use current tab listings and page snapshots before acting; the user can interact with the
same visible browser. Do not assume tab numbers or element references remain unchanged.
The user enters passwords, verification codes and identity checks directly in the browser.

## Observed portal state

- Apple: user reports enrollment complete; checkout reached the order-confirmation page.
  `https://developer.apple.com/account` displays **Pending**; activation is not yet verified.
- Google Play: **Developer account created** confirmed, with a registration-fee receipt sent.
  Dashboard still lists identity verification, Android device access verification, and
  contact phone verification as action required. Phone verification depends on prior
  identity approval. The identity dialog is open and reports a lost mobile connection;
  the user can reconnect or continue on the desktop. No identity documents were handled
  or submitted by the assistant.
- Expo: browser signed in; existing `lachie_irving/duodialect` project confirmed.
  Browser login and EAS CLI login are separate steps; CLI login is still outstanding.
- Firebase: existing `duodialect` project open on Spark; personal CLI account present.
  No staging project created or deployed in this task.

See `developer-setup-checklist.html` for the updated user-facing verification guide.
Check the live forms as the user advances; do not repeat enrollment or payment.

No membership purchase, agreement acceptance, store submission, cloud build or deployment
was performed by the assistant during tooling setup.

## Claude's backend handoff

Read `BACKEND-HANDOFF.md` and `BACKEND-CONTRACT.md` before integrating or deploying. Claude
reports 62 passing emulator tests, but this tooling task did not rerun them. The new rules
close the legacy collections used by the current native app. Native integration and staging
verification must precede deploying these changes for real users.
