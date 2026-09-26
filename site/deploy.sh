#!/usr/bin/env bash
# Build and deploy the public pages to Cloudflare Pages (personal account). Project: talkeven
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.nvm/versions/node/v20.19.6/bin:$PATH"
python3 build.py
npx wrangler pages deploy dist --project-name talkeven --branch main --commit-dirty=true
