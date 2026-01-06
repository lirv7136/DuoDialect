import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export type LanguageLevel = "native" | "fluent" | "intermediate" | "beginner";
export type UserLang = { lang: string; level: LanguageLevel };

export type UserProfile = {
  uid: string;
  name?: string;
  bio?: string;
  speaks: UserLang[];
  learns: UserLang[];
  createdAt?: any;
  updatedAt?: any;
};

export async function ensureUserProfile(uid: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid,
      speaks: [],
      learns: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function getUserProfile(uid: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function updateUserProfile(uid: string, patch: Partial<UserProfile>) {
  const ref = doc(db, "users", uid);
  await setDoc(
    ref,
    { ...patch, uid, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
