import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { router } from "expo-router";
import { logOut } from "../../src/lib/auth";
import { useNotificationsEnabled } from "../../src/lib/notification-prompt";
import { candidateCache } from "../../src/lib/candidate-cache";
import { clearPhotoUrls } from "../../src/lib/photos";
import { capitalise } from "../../src/domain/profile-form";
import { displayLanguage } from "../../src/domain/languages";
import { forgetAccount, useMyAccount } from "../../hooks/use-my-account";
import { Body, Button, Card, ChipRow, Display, ErrorNotice, InfoChip, ListRow, Loading, Screen, ToggleRow } from "../../components/ui";
import { Avatar } from "../../components/avatar";
import { ExchangeStrip } from "../../components/exchange-strip";
import { AvailabilityDots } from "../../components/availability-picker";
import { MAX_FONT_SCALE, colors, elevation, fonts, radius, space } from "../../constants/theme";

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
        Alert.alert("Notifications are off", result === "denied"
          ? "Allow notifications in Settings, then try again."
          : "Needs the phone app.");
      }
    } catch {
      Alert.alert("Couldn’t turn on", "Check your connection.");
    } finally { setRegisteringPush(false); }
  }

  async function onLogout() {
    candidateCache.clear();
    clearPhotoUrls();
    forgetAccount();
    await logOut();
    router.replace("/(auth)/login");
  }

  if (loading) return <Loading label="Loading your profile" />;

  const levels = [...(profile?.speaks ?? []), ...(profile?.learns ?? [])];

  return (
    <Screen>
      <Display>Profile</Display>
      <ErrorNotice message={error} onRetry={() => void reload()} />

      {profile ? (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Avatar name={profile.displayName} photos={profile.photos} size={80} />
            <View style={{ flex: 1, gap: space.xs }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.display} style={{ fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: colors.primary }}>
                {profile.displayName}
              </Text>
              {profile.area ? <InfoChip icon="location-outline" label={profile.area} tone="plain" /> : null}
            </View>
          </View>
          <ExchangeStrip theyTeach={profile.offers ?? []} youTeach={profile.seeks ?? []} leftCaption="you share" rightCaption="practising"
            accessibilityLabel={`You share ${(profile.offers ?? []).map(displayLanguage).join(", ")}. You’re practising ${(profile.seeks ?? []).map(displayLanguage).join(", ")}.`} />
          {levels.length ? (
            <ChipRow>
              {levels.map(item => <InfoChip key={`${item.lang}-${item.level}`} label={`${displayLanguage(item.lang)} · ${capitalise(item.level)}`} tone="plain" />)}
            </ChipRow>
          ) : null}
          {profile.bio ? <Body>{profile.bio}</Body> : null}
          <AvailabilityDots value={profile.availability} />
          {profile.interests?.length ? (
            <ChipRow>{profile.interests.map(item => <InfoChip key={item} icon="sparkles-outline" label={item} />)}</ChipRow>
          ) : null}
          <Button variant="primary" icon="create-outline" label="Edit profile" hint="Photos, languages, levels, times and neighbourhood"
            onPress={() => router.push("/account/edit")} />
        </Card>
      ) : null}

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, overflow: "hidden", ...elevation.card }}>
        <ToggleRow
          icon="notifications-outline"
          label="Notifications"
          value={notifications.enabled || registeringPush}
          disabled={notifications.enabled || registeringPush}
          hint={notifications.enabled ? "On. Turn off in your phone’s Settings." : "Turns on message notifications"}
          onChange={next => { if (next) void onEnableNotifications(); }}
        />
        <Divider />
        <ListRow icon="shield-checkmark-outline" label="Meeting safely" hint="Tips for meeting a language partner" onPress={() => router.push("/account/safety")} />
        <Divider />
        <ListRow icon="ban-outline" label="Blocked" hint="People you’ve blocked" onPress={() => router.push("/account/blocked")} />
        <Divider />
        <ListRow icon="log-out-outline" label="Log out" onPress={() => void onLogout()} />
      </View>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}>
        <ListRow icon="trash-outline" label="Delete account" danger hint="Permanently deletes your account and conversations"
          onPress={() => router.push("/account/delete")} />
      </View>
    </Screen>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.line, marginLeft: space.lg + 22 + space.md }} />;
}
