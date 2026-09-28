import { useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { requestPasswordReset, signIn } from "../../src/lib/auth";
import { authErrorMessage } from "../../src/domain/errors";
import { Button, ErrorNotice, Field, Notice, Screen } from "../../components/ui";
import { AuthHeader } from "../../components/auth-header";
import { PasswordField } from "../../components/password-field";
import { colors } from "../../constants/theme";

const RESET_SENT = "Check your email for a reset link.";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onLogin() {
    if (busy) return;
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) { setError("Enter your email and password."); return; }
    setBusy(true);
    try {
      await signIn(email, password);
      router.replace("/");
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onForgot() {
    if (resetting) return;
    setError(null);
    setNotice(null);
    if (!email.trim()) { setError("Enter your email first."); return; }
    setResetting(true);
    try {
      await requestPasswordReset(email);
      setNotice(RESET_SENT);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setResetting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.primary }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={["top", "bottom"]} navy>
        <AuthHeader />

        <Field
          label="Email"
          onDark
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
        />
        <PasswordField
          label="Password"
          onDark
          value={password}
          onChangeText={setPassword}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => void onLogin()}
        />

        <ErrorNotice message={error} />
        <Notice message={notice} icon="mail-outline" />

        <Button variant="primary" onDark label="Log in" busy={busy} busyLabel="Logging in…" onPress={() => void onLogin()} />
        <Button variant="ghost" onDark label="Forgot password?" busy={resetting} busyLabel="Sending…"
          hint="Sends a reset link to the email above" onPress={() => void onForgot()} />
        <Button variant="secondary" onDark label="Create account" onPress={() => router.push("/(auth)/signup")} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
