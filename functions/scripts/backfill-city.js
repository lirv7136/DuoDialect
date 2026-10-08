#!/usr/bin/env node
"use strict";

/**
 * Stamp `city: "sydney"` onto every profile that has no city.
 *
 * Profiles saved before 1.1.2 have no city, and the 1.1.2 discovery query filters on it,
 * so this must run before the 1.1.2 functions are deployed or every existing member
 * vanishes from Discover. Sydney is the only city Talkeven had before 1.1.2, so there is
 * nothing to decide per profile.
 *
 *   node scripts/backfill-city.js --project <id> [--dry-run]
 *
 * Uses application default credentials (`gcloud auth application-default login`), or
 * GOOGLE_APPLICATION_CREDENTIALS pointing at a service account key. Do not commit a key.
 * Against the emulator, set FIRESTORE_EMULATOR_HOST first.
 *
 * Idempotent: a profile that already has a city is left alone, so it is safe to run
 * again. Writes go in batches of 500, the Firestore limit. `--dry-run` only counts.
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { DEFAULT_CITY } = require("../lib/constants");

const BATCH_SIZE = 500;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const projectIndex = args.indexOf("--project");
  const projectId = projectIndex >= 0 ? args[projectIndex + 1] : process.env.GCLOUD_PROJECT;

  if (!projectId) {
    console.error("Usage: node scripts/backfill-city.js --project <id> [--dry-run]");
    process.exit(1);
  }

  initializeApp({ projectId });
  const db = getFirestore();

  let scanned = 0;
  let missing = 0;
  let written = 0;
  let batch = db.batch();
  let pending = 0;

  const flush = async () => {
    if (pending === 0) return;
    if (!dryRun) await batch.commit();
    written += pending;
    batch = db.batch();
    pending = 0;
  };

  // Streamed, so a large collection is never held in memory at once.
  const stream = db.collection("profiles").stream();
  for await (const doc of stream) {
    scanned += 1;
    const city = doc.get("city");
    if (typeof city === "string" && city) continue;
    missing += 1;
    if (!dryRun) {
      // No updatedAt: nothing the person did, and it would fire onProfileWritten once per profile.
      batch.set(doc.ref, { city: DEFAULT_CITY }, { merge: true });
    }
    pending += 1;
    if (pending >= BATCH_SIZE) await flush();
  }
  await flush();

  const verb = dryRun ? "would set" : "set";
  console.log(`${projectId}: scanned ${scanned} profiles, ${missing} without a city, ${verb} city "${DEFAULT_CITY}" on ${dryRun ? missing : written}.`);
  if (dryRun) console.log("Dry run: nothing was written.");
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
