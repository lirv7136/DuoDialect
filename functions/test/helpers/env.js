"use strict";

/**
 * Emulator test harness.
 *
 * Every actor is a separate Firebase client app with its own signed in user, so three
 * members and an unauthenticated client can act at the same time against the same
 * emulators. Callables are invoked over the wire and direct Firestore access goes
 * through the real rules; nothing here reimplements backend logic.
 *
 * Requires the auth, firestore and functions emulators. Run via `npm test` in functions/,
 * which starts them with the demo project id and shuts them down afterwards.
 */

const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase/app");
const {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut,
} = require("firebase/auth");
const {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, query, where, orderBy, addDoc, serverTimestamp,
} = require("firebase/firestore");
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require("firebase/functions");
const { initializeApp: initAdminApp, deleteApp: deleteAdminApp } = require("firebase-admin/app");
const { getFirestore: getAdminFirestore } = require("firebase-admin/firestore");
const { getAuth: getAdminAuth } = require("firebase-admin/auth");

const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-duodialect";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const [FIRESTORE_HOSTNAME, FIRESTORE_PORT] = FIRESTORE_HOST.split(":");
const FUNCTIONS_PORT = Number(process.env.FUNCTIONS_EMULATOR_PORT || 5001);

if (!PROJECT_ID.startsWith("demo-")) {
  throw new Error(`Refusing to run tests against project "${PROJECT_ID}". Use a demo- project id.`);
}

const apps = [];
let adminApp = null;
let seq = 0;

function clientApp(label) {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: "emulator-key", appId: `1:1:web:${label}` }, `${label}-${++seq}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, FIRESTORE_HOSTNAME, Number(FIRESTORE_PORT));
  const functions = getFunctions(app, "australia-southeast1");
  connectFunctionsEmulator(functions, FIRESTORE_HOSTNAME, FUNCTIONS_PORT);
  apps.push(app);
  return { app, auth, db, functions };
}

function wrap(handle, uid) {
  return {
    uid,
    db: handle.db,
    auth: handle.auth,
    /** Fetches a fresh ID token, so a custom claim set server side takes effect. */
    refreshToken: async () => {
      if (!handle.auth.currentUser) return null;
      return handle.auth.currentUser.getIdToken(true);
    },
    call: async (name, data) => {
      const result = await httpsCallable(handle.functions, name)(data);
      return result.data;
    },
    read: (path) => getDoc(doc(handle.db, path)),
    readAll: (path, ...constraints) => getDocs(query(collection(handle.db, path), ...constraints)),
    write: (path, data) => setDoc(doc(handle.db, path), data),
    merge: (path, data) => setDoc(doc(handle.db, path), data, { merge: true }),
    patch: (path, data) => updateDoc(doc(handle.db, path), data),
    remove: (path) => deleteDoc(doc(handle.db, path)),
    append: (path, data) => addDoc(collection(handle.db, path), data),
    signOut: () => signOut(handle.auth),
  };
}

/** Creates a signed in actor with a fresh account in the auth emulator. */
async function makeActor(label) {
  const handle = clientApp(label);
  const email = `${label}-${Date.now()}-${seq}@example.test`;
  const credential = await createUserWithEmailAndPassword(handle.auth, email, "test-password-1234");
  return { ...wrap(handle, credential.user.uid), email };
}

/** A client with no signed in user at all. */
function anonymousActor(label = "anon") {
  const handle = clientApp(label);
  return wrap(handle, null);
}

function adminApplication() {
  if (!adminApp) adminApp = initAdminApp({ projectId: PROJECT_ID }, "test-admin");
  return adminApp;
}

function admin() {
  return getAdminFirestore(adminApplication());
}

function adminAuth() {
  return getAdminAuth(adminApplication());
}

async function clearEmulators() {
  const firestoreUrl = `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const authUrl = `http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`;
  const [firestoreResponse, authResponse] = await Promise.all([
    fetch(firestoreUrl, { method: "DELETE" }),
    fetch(authUrl, { method: "DELETE" }),
  ]);
  if (!firestoreResponse.ok) throw new Error(`Failed to clear Firestore: ${firestoreResponse.status}`);
  if (!authResponse.ok) throw new Error(`Failed to clear Auth: ${authResponse.status}`);
}

async function shutdown() {
  await Promise.all(apps.splice(0).map((app) => deleteApp(app).catch(() => {})));
  if (adminApp) {
    await deleteAdminApp(adminApp).catch(() => {});
    adminApp = null;
  }
}

/** Asserts the promise rejects, and that the error code ends with `expectedCode`. */
async function expectFailure(promise, expectedCode, message) {
  let caught = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, message || `Expected a failure with code "${expectedCode}", but the call succeeded.`);
  const code = String(caught.code || "");
  assert.ok(
    code === expectedCode || code.endsWith(`/${expectedCode}`),
    `${message || "Wrong failure code"}: expected "${expectedCode}", got "${code}" (${caught.message}).`,
  );
  return caught;
}

/** Asserts a direct Firestore access was refused by the rules. */
function expectDenied(promise, message) {
  return expectFailure(promise, "permission-denied", message);
}

/** A meeting a given number of days ahead, described in an explicit time zone. */
function futureMeeting({ days = 7, localTime = "18:30", timeZone = "Australia/Sydney", venue = "A cafe in Newtown", recurrence = "once" } = {}) {
  const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(target);
  return { venue, localDate, localTime, timeZone, recurrence };
}

function birthDateForAge(age) {
  const now = new Date();
  const year = now.getUTCFullYear() - age;
  return `${year}-01-01`;
}

/** Waits for a condition, polling. Used for the notification trigger, which is async. */
async function waitFor(check, { timeoutMs = 8000, intervalMs = 150, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

module.exports = {
  PROJECT_ID,
  makeActor,
  anonymousActor,
  admin,
  adminAuth,
  clearEmulators,
  shutdown,
  expectFailure,
  expectDenied,
  futureMeeting,
  birthDateForAge,
  waitFor,
  where,
  orderBy,
  serverTimestamp,
};
