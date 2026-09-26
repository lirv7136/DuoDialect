import { useState } from "react";
import { Alert, Text } from "react-native";
import { router } from "expo-router";
import { logOut } from "../../src/lib/auth";
import { useNotificationsEnabled } from "../../src/lib/notification-prompt";
import { candidateCache } from "../../src/lib/candidate-cache";
import { formatLanguages } from "../../src/domain/profile-form";
import { forgetAccount, useMyAccount } from "../../hooks/use-my-account";
import { Body, Button, Card, ErrorNotice, Eyebrow, Heading, Loading, Screen, Title, styles } from "../../components/ui";
import { APP_NAME } from "../../constants/brand";

export default function Profile() {
  const { profile, loading, error, reload } = useMyAccount();
  const [registeringPush, setRegisteringPush] = useState(false);
  const notifications = useNotificationsEnabled();

  async function onEnableNotifications() {
    if (registeringPush) return;
    setRegisteringPush(true);
    try {
      const result = await notifications.enable();
      if (result !== "on") {
        Alert.alert("Notifications unavailable", result === "denied"
          ? "Allow notifications for this app in your phone’s settings, then try again."
          : "Use an installed app on a physical phone and allow notifications in its settings.");
      }
    } catch {
      Alert.alert("Couldn’t enable notifications", "Please check your connection and try again.");
    } finally { setRegisteringPush(false); }
  }

  async function onLogout() {
    candidateCache.clear();
    forgetAccount();
    await logOut();
    router.replace("/(auth)/login");
  }

  if (loading) return <Loading label="Loading your profile" />;

  return (
    <Screen>
      <Eyebrow>SOMETHING TO SHARE. SOMETHING TO LEARN.</Eyebrow>
      <Title>Your side of the conversation.</Title>
      <ErrorNotice message={error} onRetry={() => void reload()} />

      {profile ? (
        <Card>
          <Heading>{profile.displayName}</Heading>
          {profile.area ? <Text style={styles.hint}>{profile.area}</Text> : null}
          {profile.bio ? <Body>{profile.bio}</Body> : null}
          <Text style={styles.label}>I can share</Text>
          <Body>{formatLanguages(profile.speaks)}</Body>
          <Text style={styles.label}>I’m practising</Text>
          <Body>{formatLanguages(profile.learns)}</Body>
          <Text style={styles.label}>Usually free</Text>
          <Body>{profile.availability?.length ? profile.availability.join(", ") : "No times chosen"}</Body>
          {profile.interests?.length ? <><Text style={styles.label}>Interests</Text><Body>{profile.interests.join(", ")}</Body></> : null}
          <Text style={styles.hint}>Fluency and age are self-declared. {APP_NAME} doesn’t verify them.</Text>
        </Card>
      ) : null}

      <Button variant="primary" label="Edit profile" hint="Languages, levels, times and neighbourhood" onPress={() => router.push("/account/edit")} />
      {notifications.enabled ? (
        <Text accessibilityRole="text" style={[styles.hint, { textAlign: "center" }]}>✓ Notifications on</Text>
      ) : (
        <Button
          label={registeringPush ? "Enabling notifications…" : "Enable message notifications"}
          busy={registeringPush}
          onPress={onEnableNotifications}
        />
      )}
      <Button label="Meeting safely" hint="Tips for meeting a language partner" onPress={() => router.push("/account/safety")} />
      <Button label="Blocked members" onPress={() => router.push("/account/blocked")} />
      <Button label="Log out" onPress={onLogout} />
      <Button variant="danger" label="Delete account" hint="Permanently deletes your account and conversations" onPress={() => router.push("/account/delete")} />
    </Screen>
  );
}
