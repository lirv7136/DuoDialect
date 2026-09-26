/**
 * Discovery results, kept in memory so the profile and invitation screens can show the
 * server computed exchange and shared times without another call. Screens fall back to
 * reading the public profile when an entry is missing (for example after a restart).
 */
import type { Candidate } from "./api";

const candidates = new Map<string, Candidate>();

export const candidateCache = {
  put(list: Candidate[]) {
    for (const item of list) candidates.set(item.uid, item);
  },
  get(uid: string) {
    return candidates.get(uid) ?? null;
  },
  remove(uid: string) {
    candidates.delete(uid);
  },
  clear() {
    candidates.clear();
  },
};
