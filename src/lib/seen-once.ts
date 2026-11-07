/** Remembers, on this install, that a one-time explainer has been shown. Best effort. */
import AsyncStorage from "@react-native-async-storage/async-storage";

export async function hasSeen(key: string): Promise<boolean> {
  try { return (await AsyncStorage.getItem(`seen.${key}`)) === "1"; } catch { return true; }
}

export async function markSeen(key: string): Promise<void> {
  try { await AsyncStorage.setItem(`seen.${key}`, "1"); } catch { /* best effort */ }
}
