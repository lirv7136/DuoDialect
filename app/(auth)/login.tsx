import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import { APP_NAME } from "../../constants/brand";
import { signIn } from "../../src/lib/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onLogin() {
    try {
      setBusy(true);
      await signIn(email, password);
      router.replace("/");
    } catch (e: any) {
      Alert.alert("Login failed", e?.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: "700" }}>{APP_NAME}</Text>
      <Text style={{ opacity: 0.7 }}>Log in to find a language partner.</Text>

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
        accessibilityLabel="Password"
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{ borderWidth: 1, borderColor: "#ddd", padding: 12, borderRadius: 12, minHeight: 48, fontSize: 16 }}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={onLogin}
        style={{ backgroundColor: "#315d49", padding: 14, minHeight: 48, justifyContent: "center", borderRadius: 12, opacity: busy ? 0.6 : 1 }}
      >
        <Text style={{ color: "white", textAlign: "center", fontWeight: "600" }}>
          {busy ? "Logging in..." : "Log in"}
        </Text>
      </Pressable>

      <Pressable accessibilityRole="link" style={{ minHeight: 48, justifyContent: "center" }} onPress={() => router.push("/(auth)/signup")}>
        <Text style={{ textAlign: "center", opacity: 0.7 }}>No account? Sign up</Text>
      </Pressable>
    </View>
  );
}
