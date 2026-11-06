import { useEffect, useState } from "react";
import { Platform, View, Text } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { router, type Href } from "expo-router";
import { auth } from "../src/lib/firebase";
import { api } from "../src/lib/api";
import { profileDestination } from "../src/domain/language-exchange";
import { errorMessage } from "../src/domain/errors";
import { forgetAccount, rememberAccount } from "../hooks/use-my-account";
import { finishGate, resetGate } from "../src/lib/notification-routing";
import { syncPushRegistration } from "../src/lib/notification-prompt";
import { Button, Loading } from "../components/ui";
import { colors, type } from "../constants/theme";

// In a browser, a reload or a link opens a page behind the gate, such as /plans or /signup.
// The gate still runs first, then returns the person there, as it does for a tapped
// notification. The sign in and onboarding pages are the gate itself, so they don't count.
const GATE_PATHS = new Set(["/", "/login", "/signup", "/languages", "/profile"]);
const webPath = Platform.OS === "web" && typeof window !== "undefined" ? window.location.pathname : null;
let openedAt: Href | null = webPath && !GATE_PATHS.has(webPath) ? (webPath + window.location.search) as Href : null;
let openedOnSignup = webPath === "/signup";

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let request = 0;
    const unsub = onAuthStateChanged(auth, async (user) => {
      const currentRequest = ++request;
      setLoading(true);
      setError(null);
      try {
        if (!user) {
          forgetAccount();
          resetGate();
          router.replace(openedOnSignup ? "/(auth)/signup" : "/(auth)/login");
          openedOnSignup = false;
          return;
        }

        // The server owns the profile now; a missing profile means onboarding.
        const result = await api.getMyAccount();
        if (currentRequest !== request || auth.currentUser?.uid !== user.uid) return;
        rememberAccount(result);
        // Push registration follows the account, never the phone: see notification-prompt.ts.
        void syncPushRegistration();
        const destination = profileDestination(result.profile);
        router.replace(destination);
        // A notification tapped while the app was launching opens once the person is in.
        const tapped = finishGate();
        const reopened = openedAt;
        openedAt = null;
        if (destination === "/(tabs)/discover") {
          if (tapped) router.push(tapped);
          else if (reopened) router.push(reopened);
        }
      } catch (e) {
        if (currentRequest === request) setError(errorMessage(e));
      } finally {
        if (currentRequest === request) setLoading(false);
      }
    });

    return () => { request++; unsub(); };
  }, [attempt]);

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16, backgroundColor: colors.background }}>
      {loading ? <Loading label="Opening your profile" /> : null}
      {error ? <>
        <Text accessibilityRole="alert" style={type.body}>{`We couldn’t open your profile. ${error}`}</Text>
        <Button label="Try again" onPress={() => setAttempt(value => value + 1)} />
      </> : null}
    </View>
  );
}
