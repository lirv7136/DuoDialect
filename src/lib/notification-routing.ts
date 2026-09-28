import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { notificationTarget, type NotificationTarget } from "../domain/notification-target";

/**
 * A notification tapped before sign-in has been restored. Launching the app from a
 * notification runs the auth gate first, and its redirect would otherwise replace the
 * destination; the gate opens this once it has routed the person into the app.
 */
let pending: NotificationTarget | null = null;
let gateDone = false;

/** Called by the auth gate after routing into the app; returns a target to open, if any. */
export function finishGate(): NotificationTarget | null {
  gateDone = true;
  const target = pending;
  pending = null;
  return target;
}

/** Called when the person signs out, so a later tap waits for the gate again. */
export function resetGate() {
  gateDone = false;
  pending = null;
}

// The hook throws on web (there is no native module to ask), so web gets a stand-in. The
// platform never changes at runtime, so the hook order is stable.
const useLastResponse: () => Notifications.NotificationResponse | null | undefined =
  Platform.OS === "web" ? () => undefined : Notifications.useLastNotificationResponse;

/** Opens the screen a tapped notification points to. Mount once, in the root layout. */
export function useNotificationRouting() {
  const response = useLastResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web" || !response) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;

    const target = notificationTarget(response.notification.request.content.data);
    if (!target) return;
    if (gateDone) router.push(target);
    else pending = target;
  }, [response]);
}
