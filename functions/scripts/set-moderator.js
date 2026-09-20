#!/usr/bin/env node
"use strict";

/**
 * Grant or revoke the `moderator` custom auth claim.
 *
 * Operator identity is deliberately not grantable by any callable: the only way to
 * become a moderator is to run this with credentials for the project.
 *
 *   node scripts/set-moderator.js <email> [--revoke] [--project <id>]
 *
 * Against the emulator, set FIREBASE_AUTH_EMULATOR_HOST first. Against a real project,
 * set GOOGLE_APPLICATION_CREDENTIALS to a service account key. Do not commit that key.
 *
 * The person must sign out and back in, or call getIdToken(true), before the claim
 * appears in their token.
 */

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((arg) => !arg.startsWith("--"));
  const revoke = args.includes("--revoke");
  const projectIndex = args.indexOf("--project");
  const projectId = projectIndex >= 0 ? args[projectIndex + 1] : process.env.GCLOUD_PROJECT;

  if (!email) {
    console.error("Usage: node scripts/set-moderator.js <email> [--revoke] [--project <id>]");
    process.exit(1);
  }
  if (!projectId) {
    console.error("No project id. Pass --project or set GCLOUD_PROJECT.");
    process.exit(1);
  }

  initializeApp({ projectId });
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  const claims = { ...(user.customClaims || {}) };

  if (revoke) delete claims.moderator;
  else claims.moderator = true;

  await auth.setCustomUserClaims(user.uid, claims);
  // Force a fresh token so the change takes effect on the next request.
  await auth.revokeRefreshTokens(user.uid);

  console.log(`${revoke ? "Revoked" : "Granted"} moderator for ${email} (${user.uid}) on ${projectId}.`);
  console.log("They must sign in again, or call getIdToken(true), for the claim to apply.");
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
