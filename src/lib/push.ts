import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db } from "./firebase";
import { api } from "./api";
import { deleteDoc, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { deviceIdFromToken, parseRegistration, staleRegistration, type PushRegistration } from "../domain/push-device";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/**
 * What this install last registered: which account, which device document, which token.
 * Kept so logout can delete exactly that, and so a later sign in by someone else can
 * revoke it if logout never got the chance (the phone was offline, the app was killed).
 */
const REGISTRATION_KEY = "push.registration.v1";

/** Logout must not hang on a Firestore write queued behind a dead connection. */
const RELEASE_TIMEOUT_MS = 4000;

const TIMED_OUT = Symbol("timed out");

/** Resolves to TIMED_OUT instead of hanging or throwing; the caller treats both as "not done". */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(TIMED_OUT); },
    );
  });
}

async function readRegistration(): Promise<PushRegistration | null> {
  try { return parseRegistration(await AsyncStorage.getItem(REGISTRATION_KEY)); } catch { return null; }
}

async function storeRegistration(value: PushRegistration | null) {
  try {
    if (value) await AsyncStorage.setItem(REGISTRATION_KEY, JSON.stringify(value));
    else await AsyncStorage.removeItem(REGISTRATION_KEY);
  } catch { /* best effort */ }
}

const deviceRef = (uid: string, deviceId: string) => doc(db, "pushTokens", uid, "devices", deviceId);
const legacyRef = (uid: string) => doc(db, "pushTokens", uid);

/**
 * Deletes this device's token documents for the account signed in now. The legacy single
 * document only goes when it holds this device's token, so another phone on the same
 * account keeps working with the currently deployed functions.
 */
async function deleteOwnRegistration({ uid, deviceId, token }: PushRegistration) {
  const legacy = await getDoc(legacyRef(uid));
  await Promise.all([
    deleteDoc(deviceRef(uid, deviceId)),
    legacy.exists() && legacy.get("token") === token ? deleteDoc(legacyRef(uid)) : Promise.resolve(),
  ]);
}

/**
 * Stops notifications for the signed in account reaching this phone. Called on logout and
 * before account deletion. Best effort: a network failure never blocks signing out, but
 * the stored record is kept so the revocation is retried on the next sign in.
 */
export async function releasePushRegistration(): Promise<void> {
  const registration = await readRegistration();
  const uid = auth.currentUser?.uid;
  if (!registration || !uid) return;
  const attempt: Promise<unknown> = registration.uid === uid
    ? deleteOwnRegistration(registration)
    // Left by a different account: only the server may remove it, given the token as proof.
    : api.releasePushToken(registration);
  if ((await withTimeout(attempt, RELEASE_TIMEOUT_MS)) !== TIMED_OUT) await storeRegistration(null);
}

/**
 * A different account registered this phone and its logout never released the token.
 * Firestore rules let nobody delete another account's documents, so the server does it,
 * taking the token itself as proof the caller holds the device. Quiet on failure; the
 * record stays and the next launch tries again.
 */
export async function releaseStaleRegistration(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const stale = staleRegistration(await readRegistration(), uid);
  if (!stale) return;
  try {
    await api.releasePushToken(stale);
    await storeRegistration(null);
  } catch { /* best effort */ }
}

export async function registerForPush() {
  const user = auth.currentUser;
  if (!user) return null;

  // Push tokens require a physical device
  if (Platform.OS === "web" || !Device.isDevice) {
    return null;
  }

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error("Notifications are not configured for this build.");

  // Android needs a notification channel before requesting notification permission.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Messages",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (auth.currentUser?.uid !== user.uid) return null;

  // Never carry a token across accounts: whoever registered this phone before is revoked first.
  await releaseStaleRegistration();

  const deviceId = deviceIdFromToken(token);
  const record = {
    token,
    platform: Platform.OS,
    updatedAt: serverTimestamp(),
  };
  // One document per device, plus the single legacy document the deployed functions still
  // read. The legacy write can be dropped once every function reads the devices collection.
  await Promise.all([
    setDoc(deviceRef(user.uid, deviceId), record, { merge: true }),
    setDoc(legacyRef(user.uid), record, { merge: true }),
  ]);
  await storeRegistration({ uid: user.uid, deviceId, token });

  return token;
}
