import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../src/lib/firebase";
import { logOut } from "../../src/lib/auth";
import { registerForPush } from "../../src/lib/push";

type UserLang = { lang: string; level: string };
type UserProfile = { uid: string; name?: string; bio?: string; speaks?: UserLang[]; learns?: UserLang[] };

function fmt(arr?: UserLang[]) {
  if (!arr?.length) return "—";
  return arr.map(x => `${x.lang} (${x.level})`).join(", ");
}

export default function Profile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ Register push token once when Profile tab mounts
  useEffect(() => {
    registerForPush().catch(console.error);
  }, []);

  // Load profile (live)
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/(auth)/login");
      return;
    }

    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setProfile((snap.data() as UserProfile) ?? null);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        Alert.alert("Profile load failed", err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  async function onLogout() {
    await logOut();
    router.replace("/(auth)/login");
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: "900" }}>Profile</Text>

      <View style={{ padding: 14, borderWidth: 1, borderColor: "#eee", borderRadius: 14, gap: 8 }}>
        <Text style={{ fontWeight: "900" }}>Name</Text>
        <Text style={{ opacity: 0.9 }}>{profile?.name?.trim() ? profile?.name : "—"}</Text>

        <Text style={{ fontWeight: "900", marginTop: 6 }}>Bio</Text>
        <Text style={{ opacity: 0.9 }}>{profile?.bio?.trim() ? profile?.bio : "—"}</Text>

        <Text style={{ fontWeight: "900", marginTop: 10 }}>I speak</Text>
        <Text style={{ opacity: 0.9 }}>{fmt(profile?.speaks)}</Text>

        <Text style={{ fontWeight: "900", marginTop: 6 }}>I’m learning</Text>
        <Text style={{ opacity: 0.9 }}>{fmt(profile?.learns)}</Text>
      </View>

      <Pressable
        onPress={() => router.push("/(onboarding)/profile")}
        style={{ backgroundColor: "#111", padding: 14, borderRadius: 12 }}
      >
        <Text style={{ color: "white", textAlign: "center", fontWeight: "900" }}>
          Edit name & bio
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(onboarding)/languages")}
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#ddd" }}
      >
        <Text style={{ textAlign: "center", fontWeight: "900" }}>
          Edit languages
        </Text>
      </Pressable>

      <Pressable
        onPress={onLogout}
        style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#ddd" }}
      >
        <Text style={{ textAlign: "center", fontWeight: "900" }}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}
