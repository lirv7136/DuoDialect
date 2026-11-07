#!/usr/bin/env node
"use strict";

/**
 * Turn the trust flags in config/trust on or off. No client can read or write that
 * document; this script, with credentials for the project, is how the owner changes it.
 *
 *   node scripts/set-trust-flags.js --project <id> [--show]
 *     [--require-verification on|off]
 *     [--require-email-verification on|off]
 *     [--require-profile-photo on|off]
 *
 * Every flag defaults off, and the 1.1.2 and 1.2.0 apps cannot meet the ones that need a
 * new app (verification has no client until phase 2), so leave them off until those
 * builds are retired. See docs/BACKEND-CONTRACT.md, "Trust". A flag takes effect on the
 * next call; there is no grace period and nothing to backfill.
 *
 * Against the emulator, set FIRESTORE_EMULATOR_HOST first. Against a real project, use
 * application default credentials (gcloud auth application-default login) or set
 * GOOGLE_APPLICATION_CREDENTIALS. Do not commit a key.
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const FLAGS = {
  "--require-verification": "requireVerification",
  "--require-email-verification": "requireEmailVerification",
  "--require-profile-photo": "requireProfilePhoto",
};

function usage(message) {
  if (message) console.error(message);
  console.error("Usage: node scripts/set-trust-flags.js --project <id> [--show] [--require-verification on|off] " +
    "[--require-email-verification on|off] [--require-profile-photo on|off]");
  process.exit(1);
}

function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const projectId = valueAfter(args, "--project") || process.env.GCLOUD_PROJECT;
  if (!projectId) usage("No project id. Pass --project or set GCLOUD_PROJECT.");

  const update = {};
  for (const [flag, field] of Object.entries(FLAGS)) {
    const value = valueAfter(args, flag);
    if (value === undefined) continue;
    if (value !== "on" && value !== "off") usage(`${flag} takes on or off.`);
    update[field] = value === "on";
  }

  initializeApp({ projectId });
  const ref = getFirestore().collection("config").doc("trust");

  if (Object.keys(update).length > 0) {
    update.updatedAt = FieldValue.serverTimestamp();
    await ref.set(update, { merge: true });
    console.log(`Updated config/trust on ${projectId}.`);
  } else if (!args.includes("--show")) {
    usage("Nothing to change. Pass a flag, or --show.");
  }

  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};
  const shown = {};
  for (const [key, value] of Object.entries(data)) {
    shown[key] = value && typeof value.toDate === "function" ? value.toDate().toISOString() : value;
  }
  console.log(JSON.stringify(shown, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
