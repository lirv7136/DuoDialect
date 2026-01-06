import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { auth, db } from "../../src/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";

export default function TabsLayout() {
  const [unreadTotal, setUnreadTotal] = useState(0);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const unsub = onSnapshot(collection(db, "matches", user.uid, "with"), (snap) => {
      let sum = 0;
      snap.forEach((d) => {
        const data = d.data() as any;
        sum += Number(data.unread || 0);
      });
      setUnreadTotal(sum);
    });

    return () => unsub();
  }, []);

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Swipe" }} />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Matches",
          tabBarBadge: unreadTotal > 0 ? unreadTotal : undefined,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
