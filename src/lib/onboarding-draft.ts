/**
 * Carries the languages from the first onboarding step to the second.
 * `upsertProfile` needs the name and the languages in a single call, so nothing is
 * saved until the second step submits. The draft is held in memory and also written to
 * this install, keyed by the signed in account, so a backgrounded app does not lose it
 * and one person's draft never shows for another account on the same phone. Screens
 * `load()` once on entry; after that `get()` answers from memory. Cleared once the
 * profile saves, and at sign out. Best effort: a storage failure only costs a retype.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { UserLang } from "../domain/language-exchange";
import { draftFromProfile } from "../domain/profile-form";
import { auth } from "./firebase";

export type LanguageDraft = { speaks: UserLang[]; learns: UserLang[] };

const keyFor = (uid: string) => `onboardingDraft.v1.${uid}`;

let pending: LanguageDraft | null = null;
// The account the memory copy belongs to; null until something has been loaded or set.
let owner: string | null = null;

const currentUid = () => auth.currentUser?.uid ?? null;

const copy = (value: LanguageDraft): LanguageDraft => ({
  speaks: value.speaks.map(item => ({ ...item })),
  learns: value.learns.map(item => ({ ...item })),
});

/** Accepts whatever was stored and returns a draft, or null when there is nothing usable. */
function parse(raw: string | null): LanguageDraft | null {
  if (!raw) return null;
  try {
    const { speaks, learns } = draftFromProfile(JSON.parse(raw));
    return speaks.length || learns.length ? { speaks, learns } : null;
  } catch {
    return null;
  }
}

async function read(uid: string): Promise<LanguageDraft | null> {
  try { return parse(await AsyncStorage.getItem(keyFor(uid))); } catch { return null; }
}

async function write(uid: string, value: LanguageDraft | null): Promise<void> {
  try {
    if (value) await AsyncStorage.setItem(keyFor(uid), JSON.stringify(value));
    else await AsyncStorage.removeItem(keyFor(uid));
  } catch { /* best effort */ }
}

export const onboardingDraft = {
  /** The stored draft for the signed in account, read once; later calls answer from memory. */
  async load(): Promise<LanguageDraft | null> {
    const uid = currentUid();
    if (!uid) return null;
    if (owner === uid) return pending;
    const stored = await read(uid);
    // A `set` that landed while reading is newer than what was stored.
    if (owner === uid) return pending;
    pending = stored;
    owner = uid;
    return pending;
  },
  /** Memory only: null until `load` or `set` has run for this account. */
  get(): LanguageDraft | null {
    return owner !== null && owner === currentUid() ? pending : null;
  },
  /** Keeps the draft in memory and writes it through to this install. */
  set(value: LanguageDraft): Promise<void> {
    const uid = currentUid();
    pending = copy(value);
    owner = uid;
    return uid ? write(uid, pending) : Promise.resolve();
  },
  /** Forgets the draft for the signed in account, in memory and on this install. */
  clear(): Promise<void> {
    const uid = currentUid();
    pending = null;
    owner = uid;
    return uid ? write(uid, null) : Promise.resolve();
  },
};
