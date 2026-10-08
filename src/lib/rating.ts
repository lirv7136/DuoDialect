/**
 * The App Store rating prompt: the system sheet only, never a "rate us" screen of our own.
 * The gate lives in `src/domain/rating.ts`; this file remembers, on this install, when we
 * asked, and talks to the store. Best effort throughout: nothing here may ever get in the
 * way of the check-in it follows.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import type { CheckInAnswer } from "../domain/check-in";
import { shouldAskForRating, summariseAsks, YEAR_MS } from "../domain/rating";

const ASKED_KEY = "rating.asked.v1";

/** When we asked, newest last. `null` when storage cannot be read: then we do not ask. */
async function readAsks(): Promise<Date[] | null> {
  try {
    const raw = await AsyncStorage.getItem(ASKED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(value => new Date(String(value))).filter(at => !Number.isNaN(at.getTime()));
  } catch { return null; }
}

async function writeAsks(asks: readonly Date[]): Promise<void> {
  try { await AsyncStorage.setItem(ASKED_KEY, JSON.stringify(asks.map(at => at.toISOString()))); } catch { /* best effort */ }
}

export type RatingInput = { meetupsConfirmed: number | null | undefined; answer: CheckInAnswer; now?: Date };

/**
 * Asks for a rating if this is the moment, and records that we asked. Resolves to whether
 * the sheet was requested; the OS may still decide not to show it. Never throws.
 */
export async function maybeAskForRating(input: RatingInput): Promise<boolean> {
  try {
    const now = input.now ?? new Date();
    const asks = await readAsks();
    if (!asks) return false;
    if (!shouldAskForRating({ ...input, ...summariseAsks(asks, now), now })) return false;
    if (!(await StoreReview.hasAction()) || !(await StoreReview.isAvailableAsync())) return false;
    // Recorded before asking, so a sheet the OS quietly swallows still counts towards the limit.
    const recent = asks.filter(at => now.getTime() - at.getTime() < YEAR_MS);
    await writeAsks([...recent, now]);
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  }
}
