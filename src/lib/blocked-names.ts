/**
 * Remembers, on this device only, the display name of someone at the moment they were
 * blocked. After a block the rules hide that person's profile from the blocker, and
 * block documents hold only a uid, so without this the block list could show nothing
 * but "A blocked member". Nothing here is sent anywhere.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const keyFor = (myUid: string) => `blockedNames.v1.${myUid}`;

export async function readBlockedNames(myUid: string): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(myUid));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

export async function rememberBlockedName(myUid: string, otherUid: string, name: string): Promise<void> {
  try {
    const names = await readBlockedNames(myUid);
    names[otherUid] = name.slice(0, 40);
    await AsyncStorage.setItem(keyFor(myUid), JSON.stringify(names));
  } catch {
    // A missing label only affects how the block list reads.
  }
}

export async function forgetBlockedName(myUid: string, otherUid: string): Promise<void> {
  try {
    const names = await readBlockedNames(myUid);
    delete names[otherUid];
    await AsyncStorage.setItem(keyFor(myUid), JSON.stringify(names));
  } catch {
    // Ignore; see above.
  }
}

export async function clearBlockedNames(myUid: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(myUid));
  } catch {
    // Ignore; see above.
  }
}
