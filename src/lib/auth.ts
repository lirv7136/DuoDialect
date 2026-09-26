import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "./firebase";
import { resetGate } from "./notification-routing";

export async function signUp(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

/**
 * Sends a reset link. Callers show the same confirmation whether or not an account
 * exists, so this never reveals which emails are registered.
 */
export async function requestPasswordReset(email: string) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (error) {
    // An unknown email is not an error the person should see.
    if ((error as { code?: string }).code === "auth/user-not-found") return;
    throw error;
  }
}

export async function logOut() {
  resetGate();
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
