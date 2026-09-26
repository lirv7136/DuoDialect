import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import { APP_NAME } from "../../constants/brand";
import { signUp } from "../../src/lib/auth";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSignup() {
    try {
      setBusy(true);
      await signUp(email, password);
      router.replace("/");
    } catch (e: any) {
      Alert.alert("Signup failed", e?.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: "700" }}>{`Create your ${APP_NAME} account`}</Text>

      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        accessibilityLabel="Email"
        autoComplete="email"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, borderColor: "#ddd", padding: 12, borderRadius: 12, minHeight: 48, fontSize: 16 }}
      />
      <TextInput
        accessibilityLabel="Password, at least 6 characters"
        placeholder="Password (6+ chars)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{ borderWidth: 1, borderColor: "#ddd", padding: 12, borderRadius: 12, minHeight: 48, fontSize: 16 }}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={onSignup}
        style={{ backgroundColor: "#315d49", padding: 14, minHeight: 48, justifyContent: "center", borderRadius: 12, opacity: busy ? 0.6 : 1 }}
      >
        <Text style={{ color: "white", textAlign: "center", fontWeight: "600" }}>
          {busy ? "Creating..." : "Sign up"}
        </Text>
      </Pressable>

      <Pressable accessibilityRole="link" style={{ minHeight: 48, justifyContent: "center" }} onPress={() => router.back()}>
        <Text style={{ textAlign: "center", opacity: 0.7 }}>Back to login</Text>
      </Pressable>
    </View>
  );
}
