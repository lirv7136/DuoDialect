/** Remembers, on this install, that the meeting safely tips were dismissed. */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "safetyTips.dismissed.v1";

export async function safetyTipsDismissed(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(KEY)) === "1"; } catch { return false; }
}

export async function dismissSafetyTips(): Promise<void> {
  try { await AsyncStorage.setItem(KEY, "1"); } catch { /* best effort */ }
}
