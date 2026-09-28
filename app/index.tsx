import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { router } from "expo-router";
import { auth } from "../src/lib/firebase";
import { api } from "../src/lib/api";
import { profileDestination } from "../src/domain/language-exchange";
import { errorMessage } from "../src/domain/errors";
import { forgetAccount, rememberAccount } from "../hooks/use-my-account";
import { finishGate, resetGate } from "../src/lib/notification-routing";
import { Button, Loading } from "../components/ui";
import { colors, type } from "../constants/theme";

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
          router.replace("/(auth)/login");
          return;
        }

        // The server owns the profile now; a missing profile means onboarding.
        const result = await api.getMyAccount();
        if (currentRequest !== request || auth.currentUser?.uid !== user.uid) return;
        rememberAccount(result);
        const destination = profileDestination(result.profile);
        router.replace(destination);
        // A notification tapped while the app was launching opens once the person is in.
        const tapped = finishGate();
        if (tapped && destination === "/(tabs)/discover") router.push(tapped);
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
