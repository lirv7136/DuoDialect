import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { auth, db } from "./firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export async function registerForPush() {
  const user = auth.currentUser;
  if (!user) return null;

  // Push tokens require a physical device
  if (Platform.OS === "web" || !Device.isDevice) {
    return null;
  }

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error("Notifications are not configured for this build.");

  // Android needs a notification channel before requesting notification permission.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Messages",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (auth.currentUser?.uid !== user.uid) return null;

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

  return token;
}
