import { Platform } from "react-native";
import { db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

/**
 * Best-effort push. Never throw. Never block.
 * Web builds skip (Expo push is primarily for native).
 */
export async function sendPushToUser(
  otherUid: string | undefined | null,
  title: string,
  body: string
) {
  if (!otherUid) return;
  if (Platform.OS === "web") return;

  try {
    const snap = await getDoc(doc(db, "users", otherUid));
    const token = (snap.data() as any)?.expoPushToken;
    if (!token) return;

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: "default",
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.log("Push send failed:", res.status, txt);
    }
  } catch (e) {
    console.log("Push send exception (ignored):", e);
  }
}
