import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { auth } from "../../src/lib/firebase";
import { getUserProfile, updateUserProfile, UserLang } from "../../src/lib/profile";

function parseLangs(raw: string): string[] {
  return raw.split(",").map(s => s.trim()).filter(Boolean).map(s => s.toLowerCase());
}

export default function LanguagesOnboarding() {
  const params = useLocalSearchParams<{ next?: string }>();
  const next = typeof params.next === "string" ? params.next : undefined;

  const [speaksRaw, setSpeaksRaw] = useState("");
  const [learnsRaw, setLearnsRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const user = auth.currentUser;
      if (!user) return;
      try {
        const p = await getUserProfile(user.uid);
        if (p?.speaks?.length && !speaksRaw) setSpeaksRaw(p.speaks.map(x => x.lang).join(", "));
        if (p?.learns?.length && !learnsRaw) setLearnsRaw(p.learns.map(x => x.lang).join(", "));
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSave() {
    const user = auth.currentUser;
    if (!user) return;

    const speaks = parseLangs(speaksRaw);
    const learns = parseLangs(learnsRaw);

    if (!speaks.length || !learns.length) {
      Alert.alert("Missing info", "Add at least one language you speak and one you want to learn.");
      return;
    }

    const speaksArr: UserLang[] = speaks.map(lang => ({ lang, level: "fluent" }));
    const learnsArr: UserLang[] = learns.map(lang => ({ lang, level: "beginner" }));

    try {
      setBusy(true);
      await updateUserProfile(user.uid, { speaks: speaksArr, learns: learnsArr });

      if (next === "profile") router.replace("/(onboarding)/profile");
      else router.back();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: "800" }}>Languages</Text>
      <Text style={{ opacity: 0.7 }}>Comma-separated for now.</Text>

      <Text style={{ fontWeight: "900" }}>I speak</Text>
      <TextInput
        placeholder="e.g., English, Mandarin"
        value={speaksRaw}
        onChangeText={setSpeaksRaw}
        style={{ borderWidth: 1, borderColor: "#ddd", padding: 12, borderRadius: 12 }}
      />

      <Text style={{ fontWeight: "900" }}>I’m learning</Text>
      <TextInput
        placeholder="e.g., Spanish, Japanese"
        value={learnsRaw}
        onChangeText={setLearnsRaw}
        style={{ borderWidth: 1, borderColor: "#ddd", padding: 12, borderRadius: 12 }}
      />

      <Pressable
        disabled={busy}
        onPress={onSave}
        style={{ backgroundColor: "#111", padding: 14, borderRadius: 12, opacity: busy ? 0.6 : 1 }}
      >
        <Text style={{ color: "white", textAlign: "center", fontWeight: "900" }}>
          {busy ? "Saving..." : "Save"}
        </Text>
      </Pressable>
    </View>
  );
}
