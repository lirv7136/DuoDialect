/**
 * Carries the given name Apple shares on a first sign in to the onboarding profile step,
 * which reads it once to prefill the display name. Apple never sends the name again, so
 * nothing else can recover it. Memory only: an app relaunch between sign in and the
 * profile step just costs a retype. Keyed by account so one person's name never prefills
 * another account on the same phone. Cleared at sign out.
 */
import { auth } from "./firebase";

let pending: { uid: string; name: string } | null = null;

const currentUid = () => auth.currentUser?.uid ?? null;

export const pendingName = {
  /** Remembers the name for the signed in account; nothing is kept without one. */
  set(name: string): void {
    const uid = currentUid();
    const trimmed = name.trim();
    pending = uid && trimmed ? { uid, name: trimmed } : null;
  },
  /** The name for the signed in account, handed over once; the next call is null. */
  take(): string | null {
    const uid = currentUid();
    if (!pending || !uid || pending.uid !== uid) return null;
    const { name } = pending;
    pending = null;
    return name;
  },
  clear(): void {
    pending = null;
  },
};
