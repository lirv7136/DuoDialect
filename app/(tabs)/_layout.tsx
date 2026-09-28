import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "../../src/lib/firebase";
import { subscribeInbox, subscribeInvitations } from "../../src/lib/live";
import { haptic } from "../../src/lib/feel";
import { colors, fonts } from "../../constants/theme";

type IconName = keyof typeof Ionicons.glyphMap;

/** Outline when inactive, filled when active, with a 32×4 coral pill above the active icon. */
const icon = (active: IconName, inactive: IconName) => function TabIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
  return (
    <View style={{ alignItems: "center" }}>
      {focused ? <View style={{ position: "absolute", top: -9, width: 32, height: 4, borderRadius: 2, backgroundColor: colors.accent }} /> : null}
      <Ionicons name={focused ? active : inactive} color={color} size={size} />
    </View>
  );
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [invitesWaiting, setInvitesWaiting] = useState(0);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    // Badges are a convenience: a failed listener leaves them at zero rather than erroring.
    const stopInbox = subscribeInbox(uid, items => setUnreadTotal(items.reduce((sum, item) => sum + item.unread, 0)), () => setUnreadTotal(0));
    const stopInvites = subscribeInvitations(
      uid,
      items => setInvitesWaiting(items.filter(item => item.toUid === uid && item.status === "pending").length),
      () => setInvitesWaiting(0),
    );
    return () => { stopInbox(); stopInvites(); };
  }, []);

  const badgeStyle = { backgroundColor: colors.accent, color: colors.primary, fontFamily: fonts.bold, fontSize: 11 };

  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic.light() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        // Each tab item gets 56pt: the icon, its label and padding. The default bar left the
        // label about 9pt and clipped it.
        tabBarStyle: {
          backgroundColor: colors.surface, borderTopColor: colors.line,
          height: 64 + insets.bottom, paddingTop: 4, paddingBottom: insets.bottom + 4,
        },
        tabBarLabelStyle: { fontSize: 12, fontFamily: fonts.semibold },
        tabBarAllowFontScaling: false,
        tabBarBadgeStyle: badgeStyle,
      }}
    >
      <Tabs.Screen name="discover" options={{ title: "Discover", tabBarIcon: icon("compass", "compass-outline") }} />
      <Tabs.Screen
        name="plans"
        options={{
          title: "Plans",
          tabBarIcon: icon("calendar", "calendar-outline"),
          tabBarBadge: invitesWaiting > 0 ? invitesWaiting : undefined,
          tabBarAccessibilityLabel: invitesWaiting > 0 ? `Plans, ${invitesWaiting} invitations waiting` : "Plans",
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "Chats",
          tabBarIcon: icon("chatbubbles", "chatbubbles-outline"),
          tabBarBadge: unreadTotal > 0 ? unreadTotal : undefined,
          tabBarAccessibilityLabel: unreadTotal > 0 ? `Chats, ${unreadTotal} unread` : "Chats",
        }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person", "person-outline") }} />
    </Tabs>
  );
}
