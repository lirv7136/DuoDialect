import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "../constants/theme";

export const unstable_settings = {
  initialRouteName: "index",
};

const detail = (title: string) => ({
  headerShown: true,
  title,
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.green,
  headerTitleStyle: { color: colors.ink },
});

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat/[chatId]" options={detail("Conversation")} />
        <Stack.Screen name="person/[uid]" options={detail("Profile")} />
        <Stack.Screen name="plan/new" options={detail("Suggest a meetup")} />
        <Stack.Screen name="report/[uid]" options={detail("Report a concern")} />
        <Stack.Screen name="account/edit" options={detail("Edit profile")} />
        <Stack.Screen name="account/blocked" options={detail("Blocked members")} />
        <Stack.Screen name="account/delete" options={detail("Delete account")} />
      </Stack>
    </>
  );
}
