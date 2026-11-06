#!/usr/bin/env bash
# Build the app for the browser and deploy it to Cloudflare Pages (personal account).
# Project: talkeven-app, served at app.talkeven.com.
#
#   scripts/deploy-web.sh production   # duodialect, the live site
#   scripts/deploy-web.sh preview      # duodialect-staging, a preview URL only
#
# The Firebase config comes from the same EAS environment the phone builds use. Local .env
# files are switched off (a staging .env.local would otherwise win), and the bundle is
# checked before it is uploaded, so a staging build can never reach app.talkeven.com.
# No 404.html is exported, so Pages serves index.html for every path and the app's router
# takes over.
# First deploy only: npx wrangler pages project create talkeven-app --production-branch main
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.nvm/versions/node/v20.19.6/bin:$PATH"

ENVIRONMENT="${1:-}"
case "$ENVIRONMENT" in
  production) PROJECT=duodialect; BRANCH=main ;;
  preview) PROJECT=duodialect-staging; BRANCH=staging ;;
  *) echo "Usage: scripts/deploy-web.sh production|preview" >&2; exit 2 ;;
esac

OUT=dist/web
rm -rf "$OUT"
export EXPO_NO_DOTENV=1
# Metro's transform cache in the shared temp directory keeps the Firebase config inlined by
# an earlier build, even with --clear, so every build gets a cache of its own.
TMPDIR="$(mktemp -d)"
export TMPDIR
trap 'rm -rf "$TMPDIR"' EXIT
npx eas env:exec "$ENVIRONMENT" "npx expo export -p web --clear --output-dir $OUT" --non-interactive

if ! grep -q "\"$PROJECT.firebaseapp.com\"" "$OUT"/_expo/static/js/web/*.js; then
  echo "The bundle is not pointed at $PROJECT; nothing was deployed." >&2
  exit 1
fi

npx wrangler pages deploy "$OUT" --project-name talkeven-app --branch "$BRANCH" --commit-dirty=true
