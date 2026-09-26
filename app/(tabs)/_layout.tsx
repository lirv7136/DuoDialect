import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { auth } from "../../src/lib/firebase";
import { subscribeInbox, subscribeInvitations } from "../../src/lib/live";
import { colors } from "../../constants/theme";

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName) => function TabIcon({ color, size }: { color: string; size: number }) {
  return <Ionicons name={name} color={color} size={size} />;
};

export default function TabsLayout() {
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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.paper },
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tabs.Screen name="discover" options={{ title: "Discover", tabBarIcon: icon("compass-outline") }} />
      {/* Groups need backend support first; hidden for v1 rather than shown as "coming soon". */}
      <Tabs.Screen name="groups" options={{ href: null }} />
      <Tabs.Screen
        name="plans"
        options={{
          title: "Plans",
          tabBarIcon: icon("calendar-outline"),
          tabBarBadge: invitesWaiting > 0 ? invitesWaiting : undefined,
          tabBarAccessibilityLabel: invitesWaiting > 0 ? `Plans, ${invitesWaiting} invitations waiting` : "Plans",
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "Chats",
          tabBarIcon: icon("chatbubbles-outline"),
          tabBarBadge: unreadTotal > 0 ? unreadTotal : undefined,
          tabBarAccessibilityLabel: unreadTotal > 0 ? `Chats, ${unreadTotal} unread` : "Chats",
        }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person-outline") }} />
    </Tabs>
  );
}
