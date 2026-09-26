/**
 * Asks for notification permission at the moments it obviously helps (after sending or
 * accepting an invitation), with a short explanation first, instead of on launch.
 *
 * Remembered on this install only: whether this account registered a token here, and
 * whether the person said "Not now". Neither is ever asked for again once set.
 */
import { useCallback, useState } from "react";
import { Alert, Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { auth } from "./firebase";
import { registerForPush } from "./push";

const DECLINED_KEY = "push.declined.v1";
const enabledKey = (uid: string) => `push.enabled.v1.${uid}`;

export type EnableResult = "on" | "denied" | "unavailable";

/** Push needs an installed app on a physical phone. */
export function canUsePush(): boolean {
  return Platform.OS !== "web" && Device.isDevice;
}

async function read(key: string): Promise<string | null> {
  try { return await AsyncStorage.getItem(key); } catch { return null; }
}

async function write(key: string, value: string) {
  try { await AsyncStorage.setItem(key, value); } catch { /* best effort */ }
}

export async function notificationsEnabled(): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  return !!uid && (await read(enabledKey(uid))) === "1";
}

/** Registers this device, prompting the system if needed, and remembers the result. */
export async function enableNotifications(): Promise<EnableResult> {
  const uid = auth.currentUser?.uid;
  const token = await registerForPush();
  if (token && uid) {
    await write(enabledKey(uid), "1");
    return "on";
  }
  if (!canUsePush()) return "unavailable";
  await write(DECLINED_KEY, "1");
  return "denied";
}

export type PromptContext = { kind: "invitation-sent" | "invitation-accepted"; name?: string };

function copyFor({ kind, name }: PromptContext) {
  const who = name || "your partner";
  return kind === "invitation-sent"
    ? { title: "Know when they answer?", body: `Turn on notifications and we’ll tell you when ${who} replies to your invitation or sends a message.` }
    : { title: "Don’t miss a message", body: `Turn on notifications so you see ${who}’s messages and any change of plan.` };
}

/** Explains, then asks. Skipped if already on, declined on this install, or unsupported. */
export async function askForNotificationsInContext(context: PromptContext): Promise<void> {
  if (!canUsePush() || !auth.currentUser) return;
  if (await notificationsEnabled()) return;
  if ((await read(DECLINED_KEY)) === "1") return;
  try {
    // Permission granted earlier (for example before this prompt existed): register quietly.
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") { await enableNotifications(); return; }
  } catch { /* fall through to asking */ }
  const { title, body } = copyFor(context);
  await new Promise<void>(resolve => {
    Alert.alert(title, body, [
      { text: "Not now", style: "cancel", onPress: () => { void write(DECLINED_KEY, "1").then(resolve); } },
      { text: "Turn on", onPress: () => { enableNotifications().catch(() => undefined).then(() => resolve()); } },
    ], { cancelable: true, onDismiss: () => { void write(DECLINED_KEY, "1").then(resolve); } });
  });
}

/** Whether this account has notifications on for this install, refreshed on focus. */
export function useNotificationsEnabled() {
  const [enabled, setEnabled] = useState(false);
  const refresh = useCallback(async () => { setEnabled(await notificationsEnabled()); }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const enable = useCallback(async () => {
    const result = await enableNotifications();
    if (result === "on") setEnabled(true);
    return result;
  }, []);
  return { enabled, enable, refresh };
}
