/**
 * Idempotency keys for callables that take a caller supplied key
 * (`createInvitation.requestKey`, `sendMessage.clientMessageId`, both up to 64 chars).
 *
 * The contract: one key per thing the person intends to do, reused for every retry of
 * that same thing. A double tap or a retry after a timeout must reuse the key; a
 * genuinely different draft must get a new one.
 */

export const MAX_KEY_LENGTH = 64;

export type RandomSource = () => number;

/**
 * A 32 character key: a base36 timestamp plus random base36 characters. Uniqueness only
 * needs to hold per sender and target, and the key is not a secret, so a
 * non-cryptographic source is acceptable here.
 */
export function newIdempotencyKey(random: RandomSource = Math.random, now: number = Date.now()): string {
  let out = now.toString(36);
  while (out.length < 32) out += Math.floor(random() * 36).toString(36);
  return out.slice(0, 32);
}

export function isValidIdempotencyKey(key: unknown): key is string {
  return typeof key === "string" && key.length > 0 && key.length <= MAX_KEY_LENGTH && /^[a-z0-9_-]+$/i.test(key);
}

/**
 * Holds one key per draft. `keyFor(signature)` returns the same key while the draft is
 * unchanged, so a retry reuses it; editing the draft yields a new key. `settle()` is
 * called after a confirmed success so the next draft starts fresh.
 */
export function createDraftKeys(random: RandomSource = Math.random, clock: () => number = Date.now) {
  let current: { signature: string; key: string } | null = null;
  return {
    keyFor(signature: string): string {
      if (!current || current.signature !== signature) {
        current = { signature, key: newIdempotencyKey(random, clock()) };
      }
      return current.key;
    },
    settle(): void {
      current = null;
    },
  };
}

export type DraftKeys = ReturnType<typeof createDraftKeys>;
