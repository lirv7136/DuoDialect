import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAdditionalUserInfo,
  OAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  type OAuthCredential,
  type User,
  revokeAccessToken,
} from "firebase/auth";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import {
  NONCE_BYTES, givenNameFrom, isAppleCancelled, nonceFromBytes, showAppleButton, signInProviderFrom, type SignInProvider,
} from "../domain/apple-sign-in";
import { auth } from "./firebase";
import { resetGate } from "./notification-routing";
import { onboardingDraft } from "./onboarding-draft";
import { pendingName } from "./pending-name";

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
  // An unfinished onboarding draft belongs to this account, so it leaves with it.
  await onboardingDraft.clear();
  pendingName.clear();
  return signOut(auth);
}

/** Whether the Apple button should show: iOS 13 or later with the native sheet present. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  const available = await AppleAuthentication.isAvailableAsync().catch(() => false);
  return showAppleButton({ platform: Platform.OS, available });
}

/**
 * Runs the Apple sheet and turns its identity token into a Firebase credential. Apple is
 * handed the SHA256 of a fresh nonce and signs it into the token; Firebase gets the raw
 * nonce and checks the two match, so a token captured elsewhere cannot be replayed here.
 * Returns null when the person dismisses the sheet, which is not an error.
 */
async function appleCredential(): Promise<{ credential: OAuthCredential; fullName: AppleAuthentication.AppleAuthenticationFullName | null; authorizationCode: string | null } | null> {
  const rawNonce = nonceFromBytes(Crypto.getRandomBytes(NONCE_BYTES));
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let response: AppleAuthentication.AppleAuthenticationCredential;
  try {
    response = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if (isAppleCancelled(error)) return null;
    throw error;
  }
  if (!response.identityToken) throw Object.assign(new Error("Apple returned no identity token."), { code: "auth/missing-identity-token" });
  const credential = new OAuthProvider("apple.com").credential({ idToken: response.identityToken, rawNonce });
  return { credential, fullName: response.fullName, authorizationCode: response.authorizationCode ?? null };
}

export type AppleSignInResult = { user: User; isNewUser: boolean; fullName: string | null };

/**
 * Sign in with Apple. Apple only shares the name on the very first sign in, so a new
 * account's given name is parked in `pendingName` for the onboarding profile step to
 * prefill. Resolves null when the person cancels the sheet.
 */
export async function signInWithApple(): Promise<AppleSignInResult | null> {
  const apple = await appleCredential();
  if (!apple) return null;
  const result = await signInWithCredential(auth, apple.credential);
  const isNewUser = getAdditionalUserInfo(result)?.isNewUser ?? false;
  const fullName = givenNameFrom(apple.fullName);
  if (isNewUser && fullName) pendingName.set(fullName);
  return { user: result.user, isNewUser, fullName };
}

/** How the signed in account proves it is present: a password, or the Apple sheet. */
export function signInProvider(): SignInProvider {
  return signInProviderFrom(auth.currentUser?.providerData);
}

/**
 * The deletion callable does not require a recent login, so the client proves the
 * person is present before calling it (docs/BACKEND-CONTRACT.md, requestAccountDeletion).
 */
export async function reauthenticate(password: string) {
  const user = auth.currentUser;
  if (!user?.email) throw Object.assign(new Error("Log in again."), { code: "auth/requires-recent-login" });
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
}

/**
 * The Apple account's equivalent of typing the password: the sheet runs again and Firebase
 * checks the token belongs to this same user. Resolves false when the person cancels.
 */
export async function reauthenticateWithApple(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("Log in again."), { code: "auth/requires-recent-login" });
  const apple = await appleCredential();
  if (!apple) return false;
  await reauthenticateWithCredential(user, apple.credential);
  // Apple requires the Sign in with Apple grant to be revoked when the account is deleted
  // (guideline 5.1.1), which is the only reason this reauthentication exists. It needs the
  // Apple key on the Firebase provider; until that is configured it fails quietly and the
  // deletion still goes ahead.
  if (apple.authorizationCode) {
    try { await revokeAccessToken(auth, apple.authorizationCode); } catch { /* best effort */ }
  }
  return true;
}
