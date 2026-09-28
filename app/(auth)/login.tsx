import { useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { APP_NAME, APP_TAGLINE } from "../../constants/brand";
import { requestPasswordReset, signIn } from "../../src/lib/auth";
import { authErrorMessage } from "../../src/domain/errors";
import { Body, Button, Card, ErrorNotice, Eyebrow, Field, Screen, Title } from "../../components/ui";
import { PasswordField } from "../../components/password-field";
import { colors } from "../../constants/theme";

const RESET_SENT = "If an account exists for that email, we’ve sent a reset link.";

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
    if (!email.trim()) { setError("Enter your email above, then tap “Forgot password?” again."); return; }
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={["top", "bottom"]}>
        <Eyebrow>{APP_TAGLINE.toLocaleUpperCase("en")}</Eyebrow>
        <Title>{APP_NAME}</Title>
        <Body muted>Log in to find a language partner.</Body>

        <Field
          label="Email"
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
          value={password}
          onChangeText={setPassword}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => void onLogin()}
        />

        <ErrorNotice message={error} />
        {notice ? (
          <Card style={{ backgroundColor: colors.surfaceNavySoft }}>
            <Body>{notice}</Body>
          </Card>
        ) : null}

        <Button variant="primary" label="Log in" busy={busy} busyLabel="Logging in…" onPress={() => void onLogin()} />
        <Button variant="ghost" label="Forgot password?" busy={resetting} busyLabel="Sending…"
          hint="Sends a reset link to the email above" onPress={() => void onForgot()} />
        <Button variant="ghost" label={`New to ${APP_NAME}? Create an account`} onPress={() => router.push("/(auth)/signup")} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
