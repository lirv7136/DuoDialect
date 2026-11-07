/**
 * The moderator only `getStats` callable, kept apart from `api.ts` because an ordinary
 * member never calls it, and called exactly like the moderation callables: a member
 * without the `moderator` claim gets permission-denied as the standard ApiError. The
 * shapes live in src/domain/stats.ts, where the screen's helpers read them.
 */
import { httpsCallable } from "firebase/functions";
import { ApiError } from "./api";
import { functions } from "./firebase";
import { toCallableFailure } from "../domain/errors";
import { normaliseStats, type StatsResponse } from "../domain/stats";

export type {
  AppStoreDay, AppStoreStats, StatsCity, StatsDay, StatsPair, StatsResponse, StatsSnapshot,
} from "../domain/stats";

async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  try {
    const result = await httpsCallable<Req, Res>(functions, name)(data);
    return result.data;
  } catch (error) {
    throw new ApiError(toCallableFailure(error));
  }
}

export const stats = {
  /**
   * The cached snapshot, history and App Store downloads. `refresh` recomputes the
   * snapshot now instead, which scans every profile, so it is for the Refresh button only.
   */
  getStats: async (options: { refresh?: boolean } = {}): Promise<StatsResponse> => {
    const result = await call<{ refresh?: boolean }, Partial<StatsResponse> | null>(
      "getStats", options.refresh ? { refresh: true } : {},
    );
    return normaliseStats(result);
  },
};
