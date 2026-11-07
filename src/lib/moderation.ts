/**
 * The three moderator only callables, kept apart from `api.ts` because an ordinary
 * member never calls them. Shapes follow docs/BACKEND-CONTRACT.md and
 * functions/lib/moderation.js. Failures become the same ApiError as everywhere else,
 * so a member without the claim sees the standard permission copy rather than a crash.
 */
import { httpsCallable } from "firebase/functions";
import { ApiError } from "./api";
import { auth, functions } from "./firebase";
import { toCallableFailure } from "../domain/errors";
import type { ManualVerification, ReportAction, ReportReason, ReportSource, ReportStatus } from "../domain/moderation";

/** One row of the queue, as `listReports` returns it. */
export type Report = {
  id: string;
  /** Absent from a server before trust phase 1, which only had member reports. */
  source?: ReportSource;
  /** Null for a photo held by screening, which nobody filed. */
  reporterUid: string | null;
  reporterName: string | null;
  reporterDeleted: boolean;
  reportedUid: string;
  reportedName: string | null;
  reportedUserDeleted: boolean;
  reason: ReportReason;
  detail: string;
  conversationId: string | null;
  status: ReportStatus;
  createdAt: string | null;
};

export type ReportedPhoto = { id: string; path: string };

/** A photo on another account that a held photo matched, and how many bits apart they are. */
export type PhotoMatch = { uid: string; photoId: string; path: string; distance: number };

export type ReportMessage = { id: string; fromUid: string; text: string; createdAt: string | null };

/** The thread behind a report. Reading it is audited server side as `viewed-context`. */
export type ReportContext = {
  report: {
    id: string;
    source?: ReportSource;
    reporterUid: string | null;
    reporterName: string | null;
    reportedUid: string;
    reportedName: string | null;
    reason: ReportReason;
    detail: string;
    status: ReportStatus;
    /** Storage paths only; no download URL is minted. */
    reportedPhotos: ReportedPhoto[];
    /** For a photo held by screening: the held photo, and what it matched. */
    photo?: { photoId: string; path: string } | null;
    matches?: PhotoMatch[];
  };
  conversation: { id: string; participants: string[]; intent: string } | null;
  messages: ReportMessage[];
};

export type ActOnReportResult = {
  reportId: string;
  action: ReportAction;
  reportStatus: ReportStatus;
  subjectUid: string;
  /** Only for `remove-photos`. */
  photosRemoved?: number;
  /** Only for `approve-photo`: whether the photo was added to their profile. */
  photoAttached?: boolean;
};

export type SetVerificationResult = {
  uid: string;
  status: ManualVerification;
  previousStatus: string;
  verified: boolean;
  ageReview: boolean;
};

async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  try {
    const result = await httpsCallable<Req, Res>(functions, name)(data);
    return result.data;
  } catch (error) {
    throw new ApiError(toCallableFailure(error));
  }
}

// The context read omits the created time and the deleted account flags, which only the
// queue carries, so the last queue row for each report is kept for the detail screen.
const seen = new Map<string, Report>();

export function cachedReport(reportId: string): Report | null {
  return seen.get(reportId) ?? null;
}

export const moderation = {
  listReports: async (options: { status?: ReportStatus; limit?: number } = {}) => {
    const result = await call<typeof options, { status: ReportStatus; reports: Report[] }>("listReports", options);
    for (const report of result.reports) seen.set(report.id, report);
    return result;
  },

  getReportContext: (reportId: string, messageLimit = 100) =>
    call<{ reportId: string; messageLimit: number }, ReportContext>("getReportContext", { reportId, messageLimit }),

  actOnReport: (reportId: string, action: ReportAction, note?: string) =>
    call<{ reportId: string; action: ReportAction; note?: string }, ActOnReportResult>(
      "actOnReport", { reportId, action, ...(note ? { note } : {}) },
    ),

  /** Sets a member's verification by hand, named by uid or email. Audited server side. */
  setVerification: (input: { uid?: string; email?: string; status: ManualVerification; note?: string; reportId?: string }) =>
    call<typeof input, SetVerificationResult>("setVerification", input),
};

/**
 * Whether the signed in person carries the `moderator` claim. Reads the cached token by
 * default; `refresh` fetches a new one, for right after the claim was granted. False
 * when signed out or when the token cannot be read, so the entry point stays hidden.
 */
export async function isModerator(options: { refresh?: boolean } = {}): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const result = await user.getIdTokenResult(options.refresh === true);
    return result.claims.moderator === true;
  } catch {
    return false;
  }
}
