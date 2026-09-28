import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { APP_NAME } from "../../constants/brand";
import { signUp } from "../../src/lib/auth";
import { authErrorMessage } from "../../src/domain/errors";
import { Button, ErrorNotice, Field, Screen } from "../../components/ui";
import { AuthHeader } from "../../components/auth-header";
import { PasswordField } from "../../components/password-field";
import { colors, fonts, type } from "../../constants/theme";

const GUIDELINES_URL = "https://talkeven.com/child-safety/";
const PRIVACY_URL = "https://talkeven.com/privacy/";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSignup() {
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) { setError("Enter your email and a password."); return; }
    setBusy(true);
    try {
      await signUp(email, password);
      router.replace("/");
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const open = (url: string) => { void WebBrowser.openBrowserAsync(url); };
  const link = { color: colors.onPrimary, fontFamily: fonts.bold, textDecorationLine: "underline" as const };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.primary }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={["top", "bottom"]} navy>
        <AuthHeader title={`Join ${APP_NAME}`} />

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
          hint="At least 6 characters."
          value={password}
          onChangeText={setPassword}
          textContentType="newPassword"
          autoComplete="new-password"
          passwordRules="minlength: 6;"
          returnKeyType="go"
          onSubmitEditing={() => void onSignup()}
        />

        <ErrorNotice message={error} />
        <Button variant="primary" onDark label="Create account" busy={busy} busyLabel="Creating…" onPress={() => void onSignup()} />
        <Text style={[type.caption, { color: colors.onPrimary }]}>
          {"By joining, you confirm you’re 18+ and agree to our "}
          <Text accessibilityRole="link" style={link} onPress={() => open(GUIDELINES_URL)}>Community guidelines</Text>
          {" and "}
          <Text accessibilityRole="link" style={link} onPress={() => open(PRIVACY_URL)}>Privacy policy</Text>
          {"."}
        </Text>
        <Button variant="ghost" onDark label="Log in" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(auth)/login"))} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
