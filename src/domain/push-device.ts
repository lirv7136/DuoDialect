/**
 * Push registration bookkeeping, kept pure so it can be unit tested.
 *
 * A token document lives at pushTokens/{uid}/devices/{deviceId}. The device id is a hash
 * of the Expo push token: the token is already one per install, so this needs no hardware
 * id and no stored random id that a cleared app storage would lose. A fresh token after a
 * reinstall simply becomes a fresh document, and the receipt sweep retires the old one.
 */

/** What this install last registered, remembered locally so it can be undone later. */
export type PushRegistration = { uid: string; deviceId: string; token: string };

/** Two 32 bit FNV-1a passes with different seeds: 16 hex characters, no BigInt needed. */
function fnv1a(input: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** The device document id for a token. Stable for the token, and never the token itself. */
export function deviceIdFromToken(token: string): string {
  return `d_${fnv1a(token, 0x811c9dc5)}${fnv1a(token, 0x9747b28c)}`;
}

/** Reads a stored registration; anything malformed counts as none. */
export function parseRegistration(raw: string | null | undefined): PushRegistration | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PushRegistration> | null;
    if (!value || typeof value !== "object") return null;
    const { uid, deviceId, token } = value;
    if (typeof uid !== "string" || !uid || typeof deviceId !== "string" || !deviceId || typeof token !== "string" || !token) return null;
    return { uid, deviceId, token };
  } catch {
    return null;
  }
}

/**
 * The registration that belongs to a different account than the one signed in now. That
 * is the one that must be revoked before anything else, or the previous person's
 * notifications keep arriving on this phone.
 */
export function staleRegistration(previous: PushRegistration | null, currentUid: string | null | undefined): PushRegistration | null {
  if (!previous) return null;
  if (currentUid && previous.uid === currentUid) return null;
  return previous;
}
