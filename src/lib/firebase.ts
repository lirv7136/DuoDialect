import { initializeApp, getApps } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import { connectAuthEmulator, getAuth, initializeAuth, type Auth, type Persistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { Platform } from "react-native";

/**
 * EXPO_PUBLIC_USE_EMULATORS=1 points Auth, Firestore and Functions at the local emulator
 * suite (ports from firebase.json). In that mode the app also uses a `demo-` project id,
 * so a misconfigured emulator run can never reach the real Firebase project.
 * The Android emulator reaches the host machine at 10.0.2.2; a physical device needs
 * EXPO_PUBLIC_EMULATOR_HOST set to the development machine's LAN address.
 */
export const usingEmulators = process.env.EXPO_PUBLIC_USE_EMULATORS === "1";

const EMULATOR_PORTS = { auth: 9099, firestore: 8080, functions: 5001 } as const;
const emulatorHost = process.env.EXPO_PUBLIC_EMULATOR_HOST || (Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1");
const emulatorProjectId = process.env.EXPO_PUBLIC_EMULATOR_PROJECT_ID || "demo-duodialect";

const firebaseConfig = usingEmulators
  ? {
    apiKey: "demo-api-key",
    authDomain: `${emulatorProjectId}.firebaseapp.com`,
    projectId: emulatorProjectId,
    appId: "1:1234567890:web:demo",
  }
  : {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };

const firstInit = getApps().length === 0;
const app = firstInit ? initializeApp(firebaseConfig) : getApps()[0];

// On a phone, getAuth keeps the session in memory only, so every app launch signs the
// person out. React Native persistence is exported only by the react-native build of
// firebase/auth, which the default TypeScript types do not describe.
const getReactNativePersistence = (FirebaseAuth as unknown as {
  getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
}).getReactNativePersistence;

function createAuth(): Auth {
  if (Platform.OS === "web" || !firstInit || !getReactNativePersistence) return getAuth(app);
  return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
}

export const auth = createAuth();
export const db = getFirestore(app);
/** The region every callable is deployed to. The emulator ignores it but keeps it in the URL. */
export const FUNCTIONS_REGION = "australia-southeast1";
export const functions = getFunctions(app, FUNCTIONS_REGION);

// Connecting twice throws, and fast refresh re-evaluates this module, so connect once.
if (usingEmulators && firstInit) {
  connectAuthEmulator(auth, `http://${emulatorHost}:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, EMULATOR_PORTS.firestore);
  connectFunctionsEmulator(functions, emulatorHost, EMULATOR_PORTS.functions);
}
