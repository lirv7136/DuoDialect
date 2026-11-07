/**
 * The platform free parts of Sign in with Apple: the nonce shape, which provider an
 * account signs in with, whether to offer the Apple button, and the one name Apple gives
 * us. `src/lib/auth.ts` wires these to expo-apple-authentication and Firebase.
 */

export type SignInProvider = "password" | "apple.com";

/** Bytes of entropy behind each nonce; Firebase and Apple only need it to be unguessable. */
export const NONCE_BYTES = 32;

/**
 * Random bytes to the raw nonce string. The raw nonce goes to Firebase and its SHA256 goes
 * to Apple, so Firebase can prove the identity token was minted for this sign in.
 */
export function nonceFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

/** The error expo-apple-authentication throws when the person dismisses the Apple sheet. */
export const APPLE_CANCELLED = "ERR_REQUEST_CANCELED";

export function isAppleCancelled(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === APPLE_CANCELLED;
}

/**
 * Which proof of presence an account needs. Apple wins when it is linked at all, because an
 * Apple account has no password to type even if a password provider somehow remains.
 */
export function signInProviderFrom(providerData: readonly { providerId: string }[] | null | undefined): SignInProvider {
  return providerData?.some(item => item.providerId === "apple.com") ? "apple.com" : "password";
}

/** Apple sign in is native to iOS; Android and web keep the email form only. */
export function showAppleButton({ platform, available }: { platform: string; available: boolean }): boolean {
  return platform === "ios" && available;
}

/**
 * Apple sends the name once, on the first sign in, and only when the person did not edit
 * it away. The given name alone is what a language partner would call them.
 */
export function givenNameFrom(fullName: { givenName?: string | null } | null | undefined): string | null {
  const name = fullName?.givenName?.trim();
  return name ? name : null;
}
