#!/usr/bin/env bash
# Stores the App Store Connect API key that the syncAppStoreDownloads function reads, as the
# Firebase secret APPSTORE_CONNECT, then deploys that function.
#
#   scripts/set-appstore-secret.sh <vendor-number> [project]    # project defaults to duodialect
#   scripts/set-appstore-secret.sh placeholder [project]        # not connected yet
#
# Every project needs the secret before any function can deploy (the Firebase CLI checks the
# secrets of the whole codebase), so a project that is not connected holds the placeholder
# "{}", which the function reports as "not connected yet" on the stats screen.
#
# The vendor number is at the top left of App Store Connect, Payments and Financial Reports.
# The key comes from ~/.config/talkeven/asc.env (the release key), unless ASC_KEY_ID,
# ASC_ISSUER_ID and ASC_KEY_PATH are set, so a separate key with only the Sales role can be
# used instead. Nothing is printed: the JSON goes straight from node to the Firebase CLI.
#
# The function runs daily at 10:00 Sydney time. To fill the last 30 days straight away, force
# a run of firebase-schedule-syncAppStoreDownloads-australia-southeast1 in Cloud Scheduler.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.nvm/versions/node/v20.19.6/bin:$PATH"

VENDOR="${1:-}"
PROJECT="${2:-duodialect}"

if [ "$VENDOR" = "placeholder" ]; then
  printf '{}' | firebase functions:secrets:set APPSTORE_CONNECT --project "$PROJECT" --data-file - --force
  exit 0
fi
if ! [[ "$VENDOR" =~ ^[0-9]+$ ]]; then
  echo "Usage: scripts/set-appstore-secret.sh <vendor-number>|placeholder [project]" >&2
  exit 2
fi

set -a
# shellcheck disable=SC1091
. "$HOME/.config/talkeven/asc.env"
set +a
export ASC_SECRET_KEY_ID="${ASC_KEY_ID:-${EXPO_ASC_KEY_ID:-}}"
export ASC_SECRET_ISSUER_ID="${ASC_ISSUER_ID:-${EXPO_ASC_ISSUER_ID:-}}"
export ASC_SECRET_KEY_PATH="${ASC_KEY_PATH:-${EXPO_ASC_API_KEY_PATH:-}}"
export ASC_SECRET_VENDOR="$VENDOR"
if [ -z "$ASC_SECRET_KEY_ID" ] || [ -z "$ASC_SECRET_ISSUER_ID" ] || [ ! -f "$ASC_SECRET_KEY_PATH" ]; then
  echo "No App Store Connect key id, issuer id or key file found." >&2
  exit 1
fi

node -e '
  const fs = require("fs");
  process.stdout.write(JSON.stringify({
    keyId: process.env.ASC_SECRET_KEY_ID,
    issuerId: process.env.ASC_SECRET_ISSUER_ID,
    privateKey: fs.readFileSync(process.env.ASC_SECRET_KEY_PATH, "utf8"),
    vendorNumber: process.env.ASC_SECRET_VENDOR,
  }));
' | firebase functions:secrets:set APPSTORE_CONNECT --project "$PROJECT" --data-file - --force

firebase deploy --only functions:syncAppStoreDownloads --project "$PROJECT"
