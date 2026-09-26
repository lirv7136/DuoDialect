import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "./firebase";

export async function signUp(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function logOut() {
  return signOut(auth);
}

/**
 * The deletion callable does not require a recent login, so the client proves the
 * person is present before calling it (docs/BACKEND-CONTRACT.md, requestAccountDeletion).
 */
export async function reauthenticate(password: string) {
  const user = auth.currentUser;
  if (!user?.email) throw Object.assign(new Error("Please log in again."), { code: "auth/requires-recent-login" });
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
}
