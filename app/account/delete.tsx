import { useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { api } from "../../src/lib/api";
import { auth } from "../../src/lib/firebase";
import { logOut, reauthenticate, reauthenticateWithApple, signInProvider } from "../../src/lib/auth";
import { candidateCache } from "../../src/lib/candidate-cache";
import { clearPhotoUrls } from "../../src/lib/photos";
import { clearBlockedNames } from "../../src/lib/blocked-names";
import { errorMessage } from "../../src/domain/errors";
import { forgetAccount } from "../../hooks/use-my-account";
import { Button, Caption, Card, ErrorNotice, Field, Notice, Screen, Title, styles } from "../../components/ui";
import { colors, space } from "../../constants/theme";
import { APP_NAME } from "../../constants/brand";

const DELETED = ["Profile, photos, private details", "Invitations and check-ins", "Blocks", "All chats and messages"];

/**
 * Deletion is immediate and cannot be undone. The backend does not require a recent
 * login, so the person proves they are present here first: a password for an email
 * account, or the Apple sheet for an Apple account, which has no password to type. Then
 * `requestAccountDeletion` runs with the literal confirmation. The call is idempotent, so
 * "needs_retry" is safe to repeat.
 */
export default function DeleteAccount() {
  const [provider] = useState(signInProvider);
  const apple = provider === "apple.com";
  const [password, setPassword] = useState("");
  const [appleConfirmed, setAppleConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const inFlight = useRef(false);
  const confirmed = typed.trim() === "DELETE";
  const present = apple ? appleConfirmed : !!password;

  async function onConfirmWithApple() {
    if (confirming || inFlight.current) return;
    setConfirming(true);
    setProblem(null);
    try {
      // A dismissed sheet leaves things as they were.
      if (await reauthenticateWithApple()) setAppleConfirmed(true);
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setConfirming(false);
    }
  }

  async function onDelete() {
    if (inFlight.current) return;
    if (!confirmed) { setProblem("Type DELETE to confirm."); return; }
    if (!present) { setProblem(apple ? "Confirm with Apple first." : "Enter your password."); return; }
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    const uid = auth.currentUser?.uid;
    try {
      // The Apple account was reauthenticated by the Confirm with Apple step just above.
      if (!apple) await reauthenticate(password);
      const result = await api.requestAccountDeletion();
      if (result.status !== "completed") {
        setProblem("Not quite finished. Tap Delete again.");
        return;
      }
      candidateCache.clear();
      clearPhotoUrls();
      forgetAccount();
      if (uid) await clearBlockedNames(uid);
      await logOut().catch(() => undefined);
      Alert.alert("Account deleted", `Your ${APP_NAME} account has been deleted.`);
      router.replace("/(auth)/login");
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen edges={[]}>
      <Title>Delete your account?</Title>
      <Card>
        <Text style={styles.label}>Deleted now, for good:</Text>
        <View accessibilityRole="list" style={{ gap: space.sm }}>
          {DELETED.map(item => (
            <View key={item} style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
              <Ionicons name="close-circle" size={20} color={colors.danger} />
              <Text style={[styles.body, { flexShrink: 1 }]}>{item}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.label}>Chats are deleted for both people.</Text>
        <Caption icon="shield-checkmark-outline">Safety reports, by or about you, are kept for moderation.</Caption>
      </Card>
      {apple ? (
        appleConfirmed
          ? <Notice message="Confirmed with Apple." />
          : <Button icon="logo-apple" label="Confirm with Apple" hint="Opens the Apple sign in sheet to confirm it is you"
            busy={confirming} busyLabel="Confirming…" onPress={() => void onConfirmWithApple()} />
      ) : (
        <Field label="Your password" value={password} onChangeText={setPassword}
          secureTextEntry autoComplete="current-password" autoCapitalize="none" />
      )}
      <Field label="Type DELETE to confirm" value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} />
      <ErrorNotice message={problem} />
      <Button variant="dangerFilled" label="Delete" accessibilityLabel="Delete my account" busy={busy} busyLabel="Deleting…" disabled={!confirmed || !present} onPress={onDelete} />
      <Button variant="ghost" label="Keep account" onPress={() => router.back()} />
    </Screen>
  );
}
