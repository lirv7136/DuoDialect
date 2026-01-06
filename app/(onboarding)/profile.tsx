import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { auth } from "../../src/lib/firebase";
import { getUserProfile, updateUserProfile } from "../../src/lib/profile";

export default function ProfileOnboarding() {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const user = auth.currentUser;
      if (!user) return;
      try {
        const p = await getUserProfile(user.uid);
        if (p?.name && !name) setName(p.name);
        if (p?.bio && !bio) setBio(p.bio);
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

    const cleanName = name.trim();
    const cleanBio = bio.trim();

    if (!cleanName) {
      Alert.alert("Name needed", "Add a name so people aren’t matching with ‘Anonymous’.");
      return;
    }

    try {
      setBusy(true);
      await updateUserProfile(user.uid, { name: cleanName, bio: cleanBio });
      router.replace("/(tabs)");
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
      <Text style={{ fontSize: 28, fontWeight: "800" }}>Your profile</Text>
      <Text style={{ opacity: 0.7 }}>
        This is what matches will see. Keep it short, friendly, and specific.
      </Text>

      <Text style={{ fontWeight: "900" }}>Name</Text>
      <TextInput
        placeholder="e.g., Lachlan"
        value={name}
        onChangeText={setName}
        style={{ borderWidth: 1, borderColor: "#ddd", padding: 12, borderRadius: 12 }}
      />

      <Text style={{ fontWeight: "900" }}>Bio</Text>
      <TextInput
        placeholder="e.g., I’ll trade Aussie slang for Spanish grammar 😄"
        value={bio}
        onChangeText={setBio}
        multiline
        style={{ borderWidth: 1, borderColor: "#ddd", padding: 12, borderRadius: 12, minHeight: 90 }}
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
