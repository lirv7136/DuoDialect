import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { router } from "expo-router";
import { auth } from "../src/lib/firebase";
import { ensureUserProfile, getUserProfile } from "../src/lib/profile";

export default function Index() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          router.replace("/(auth)/login");
          return;
        }

        await ensureUserProfile(user.uid);
        const profile = await getUserProfile(user.uid);

        const hasSpeaks = !!profile?.speaks?.length;
        const hasLearns = !!profile?.learns?.length;
        const hasName = !!profile?.name?.trim();

        if (!hasSpeaks || !hasLearns) {
          router.replace("/(onboarding)/languages?next=profile");
        } else if (!hasName) {
          router.replace("/(onboarding)/profile");
        } else {
          router.replace("/(tabs)");
        }
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      {loading ? <ActivityIndicator /> : null}
    </View>
  );
}
