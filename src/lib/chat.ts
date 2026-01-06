import { db } from "./firebase";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";

export function chatIdFor(a: string, b: string) {
  return [a, b].sort().join("_");
}

export async function ensureChat(a: string, b: string) {
  const chatId = chatIdFor(a, b);
  const members = [a, b].sort();
  const ref = doc(db, "chats", chatId);

  // Transaction so we only set createdAt on first creation.
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);

    if (!snap.exists()) {
      tx.set(
        ref,
        {
          members,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      return;
    }

    // Heal members + bump updatedAt, but do NOT touch createdAt.
    tx.set(
      ref,
      {
        members,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  return chatId;
}
