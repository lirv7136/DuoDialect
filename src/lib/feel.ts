/**
 * Haptics for the few moments that deserve them: a press, a selection, a sent message, a
 * confirmed meetup. Every call is fire-and-forget and a no-op on web or on devices
 * without a haptic engine, so callers never await or guard them. Haptics stay on when
 * the person has asked for reduced motion; only animation is skipped then.
 */
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

const native = Platform.OS === "ios" || Platform.OS === "android";

function run(effect: () => Promise<void>) {
  if (!native) return;
  try { void effect().catch(() => undefined); } catch { /* unsupported device */ }
}

export const haptic = {
  /** Button presses, tab switches, sending a message. */
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Chips and toggles. */
  selection: () => run(() => Haptics.selectionAsync()),
  /** An invitation accepted or a meetup confirmed. */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
