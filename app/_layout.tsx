import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces/600SemiBold";
import { PlusJakartaSans_400Regular } from "@expo-google-fonts/plus-jakarta-sans/400Regular";
import { PlusJakartaSans_500Medium } from "@expo-google-fonts/plus-jakarta-sans/500Medium";
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans/600SemiBold";
import { PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans/700Bold";
import { colors, fonts } from "../constants/theme";
import { useNotificationRouting } from "../src/lib/notification-routing";

export const unstable_settings = {
  initialRouteName: "index",
};

// Keep the splash up until the fonts are ready, so text never re-flows on launch.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const detail = (title: string) => ({
  headerShown: true,
  title,
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
  headerTintColor: colors.primary,
  headerTitleStyle: { color: colors.text, fontFamily: fonts.bold, fontSize: 17 },
  headerBackButtonDisplayMode: "minimal" as const,
});

export default function RootLayout() {
  useNotificationRouting();
  // Subpath imports register only the five weights in use, not every Fraunces file.
  const [loaded, failed] = useFonts({
    [fonts.display]: Fraunces_600SemiBold,
    [fonts.regular]: PlusJakartaSans_400Regular,
    [fonts.medium]: PlusJakartaSans_500Medium,
    [fonts.semibold]: PlusJakartaSans_600SemiBold,
    [fonts.bold]: PlusJakartaSans_700Bold,
  });
  const ready = loaded || !!failed;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  // A font that fails to load falls back to the system font rather than blocking the app.
  if (!ready) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat/[chatId]" options={detail("Chat")} />
        <Stack.Screen name="person/[uid]" options={detail("")} />
        <Stack.Screen name="plan/new" options={detail("New invite")} />
        <Stack.Screen name="report/[uid]" options={detail("Report")} />
        <Stack.Screen name="check-in/[checkInId]" options={detail("Check in")} />
        <Stack.Screen name="account/edit" options={detail("Edit profile")} />
        <Stack.Screen name="account/blocked" options={detail("Blocked")} />
        <Stack.Screen name="account/delete" options={detail("Delete account")} />
        <Stack.Screen name="account/safety" options={detail("Meeting safely")} />
      </Stack>
    </>
  );
}
