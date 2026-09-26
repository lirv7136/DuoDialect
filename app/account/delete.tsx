import { useRef, useState } from "react";
import { Alert, Text } from "react-native";
import { router } from "expo-router";
import { api } from "../../src/lib/api";
import { auth } from "../../src/lib/firebase";
import { logOut, reauthenticate } from "../../src/lib/auth";
import { candidateCache } from "../../src/lib/candidate-cache";
import { clearBlockedNames } from "../../src/lib/blocked-names";
import { errorMessage } from "../../src/domain/errors";
import { forgetAccount } from "../../hooks/use-my-account";
import { Body, Button, Card, ErrorNotice, Field, Heading, Screen, styles } from "../../components/ui";
import { APP_NAME } from "../../constants/brand";

/**
 * Deletion is immediate and cannot be undone. The backend does not require a recent
 * login, so the password is checked here first; then `requestAccountDeletion` runs with
 * the literal confirmation. The call is idempotent, so "needs_retry" is safe to repeat.
 */
export default function DeleteAccount() {
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const inFlight = useRef(false);
  const confirmed = typed.trim() === "DELETE";

  async function onDelete() {
    if (inFlight.current) return;
    if (!confirmed) { setProblem("Type DELETE to confirm."); return; }
    if (!password) { setProblem("Enter your password."); return; }
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    const uid = auth.currentUser?.uid;
    try {
      await reauthenticate(password);
      const result = await api.requestAccountDeletion();
      if (result.status !== "completed") {
        setProblem("Most of your data was deleted, but not everything finished. Tap Delete my account again to complete it.");
        return;
      }
      candidateCache.clear();
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
      <Heading>Delete your account permanently?</Heading>
      <Card>
        <Text style={styles.label}>This removes, straight away and for good:</Text>
        <Body>• your profile and private details{"\n"}• every invitation you sent or received{"\n"}• your blocks{"\n"}• every conversation you’re part of, including all messages</Body>
        <Text style={styles.label}>Conversations are deleted for both people.</Text>
        <Body>The people you’ve chatted with will lose those conversations too.</Body>
        <Text style={styles.label}>Safety reports are kept.</Text>
        <Body>Reports filed by you or about you are retained for moderation after your account is gone.</Body>
      </Card>
      <Field label="Your password" hint="We ask again to make sure it’s really you." value={password} onChangeText={setPassword}
        secureTextEntry autoComplete="current-password" autoCapitalize="none" />
      <Field label="Type DELETE to confirm" value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} />
      <ErrorNotice message={problem} />
      <Button variant="danger" label="Delete my account" busy={busy} busyLabel="Deleting…" disabled={!confirmed || !password} onPress={onDelete} />
      <Button variant="ghost" label="Keep my account" onPress={() => router.back()} />
    </Screen>
  );
}
