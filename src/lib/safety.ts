import { db } from "./firebase";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";

export async function blockUser(meUid: string, otherUid: string) {
  // record block
  await setDoc(doc(db, "blocks", meUid, "users", otherUid), {
    blockedUid: otherUid,
    at: serverTimestamp(),
  });

  // optionally hide match immediately
  await deleteDoc(doc(db, "matches", meUid, "with", otherUid));
}

export async function reportUser(meUid: string, otherUid: string, chatId: string, reason: string) {
  await addDoc(collection(db, "reports"), {
    reporterUid: meUid,
    reportedUid: otherUid,
    chatId,
    reason,
    at: serverTimestamp(),
  });
}
