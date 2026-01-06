import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { auth, db } from "./firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export async function registerForPush() {
  const user = auth.currentUser;
  if (!user) return null;

  // Push tokens require a physical device
  if (!Device.isDevice) {
    console.log("Push: must run on a physical device.");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push: permission not granted.");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  // ✅ Private token storage
  await setDoc(
    doc(db, "pushTokens", user.uid),
    {
      token,
      platform: Platform.OS,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  console.log("Expo push token saved:", token);
  return token;
}
