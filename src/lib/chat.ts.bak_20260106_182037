import { db } from "./firebase";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

export function chatIdFor(a: string, b: string) {
  return [a, b].sort().join("_");
}

export async function ensureChat(a: string, b: string) {
  const chatId = chatIdFor(a, b);
  const members = [a, b].sort();

  // Always write members (merge) so older chats get "healed"
  await setDoc(
    doc(db, "chats", chatId),
    {
      members,
      updatedAt: serverTimestamp(),
      // createdAt will get set on first write; harmless if overwritten during dev
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  return chatId;
}
