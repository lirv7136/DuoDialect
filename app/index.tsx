import { useEffect, useState } from "react";
import { View, ActivityIndicator, Text, Pressable } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { router } from "expo-router";
import { auth } from "../src/lib/firebase";
import { ensureUserProfile, getUserProfile } from "../src/lib/profile";
import { profileDestination } from "../src/domain/language-exchange";

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let request = 0;
    const unsub = onAuthStateChanged(auth, async (user) => {
      const currentRequest = ++request;
      setLoading(true);
      setError(false);
      try {
        if (!user) {
          router.replace("/(auth)/login");
          return;
        }

        await ensureUserProfile(user.uid);
        const profile = await getUserProfile(user.uid);

        if (currentRequest !== request || auth.currentUser?.uid !== user.uid) return;
        router.replace(profileDestination(profile));
      } catch {
        if (currentRequest === request) setError(true);
      } finally {
        if (currentRequest === request) setLoading(false);
      }
    });

    return () => { request++; unsub(); };
  }, [attempt]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 16 }}>
      {loading ? <ActivityIndicator accessibilityLabel="Opening your profile" /> : null}
      {error ? <>
        <Text accessibilityRole="alert">We couldn’t open your profile. Check your connection and try again.</Text>
        <Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={{ padding: 16, borderWidth: 1, borderRadius: 8 }}>
          <Text>Try again</Text>
        </Pressable>
      </> : null}
    </View>
  );
}
