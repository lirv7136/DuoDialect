/**
 * Moderation, as the operator screen shows it. The codes mirror docs/BACKEND-CONTRACT.md
 * (`listReports`, `actOnReport`) and functions/lib/moderation.js. Nothing here talks to
 * the server; the screen reads these to label a report and to decide which buttons to
 * offer, and the confirm sheet reads `actionConsequence` so nobody suspends by accident.
 */
import { dayLabel } from "./display";

/** "Thu 2 Oct, 14:05" in the operator's local time, or nothing when the server had no time. */
export function whenLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const clock = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${dayLabel(date, now)}, ${clock}`;
}

export type ReportStatus = "received" | "reviewing" | "actioned" | "dismissed";
export type ReportAction =
  | "claim" | "dismiss" | "warn" | "suspend" | "reinstate" | "remove-photos" | "approve-photo" | "reject-photo";
export type ReportReason =
  | "harassment" | "spam" | "inappropriate_content" | "impersonation" | "safety_concern" | "other" | "duplicate_photo";
/** "member" for a report a person filed; "photo-screening" for a photo held because it matched another account's. */
export type ReportSource = "member" | "photo-screening";

export const REPORT_STATUSES: readonly ReportStatus[] = ["received", "reviewing", "actioned", "dismissed"];

/** The segment labels. "Received" is the inbox; the rest are history. */
export function statusLabel(status: string): string {
  switch (status) {
    case "received": return "Received";
    case "reviewing": return "Reviewing";
    case "actioned": return "Actioned";
    case "dismissed": return "Dismissed";
    default: return status;
  }
}

/**
 * The reason, read by the operator rather than the reporter, so "I'm worried about
 * safety" becomes "Safety concern". An unknown code shows as itself rather than hiding.
 */
export function describeReason(reason: string): string {
  switch (reason) {
    case "harassment": return "Harassment";
    case "spam": return "Spam";
    case "inappropriate_content": return "Inappropriate content";
    case "impersonation": return "Impersonation";
    case "safety_concern": return "Safety concern";
    case "other": return "Other";
    case "duplicate_photo": return "Duplicate photo";
    default: return reason;
  }
}

/**
 * Which actions make sense from each status. A new report is claimed or dismissed; a
 * claimed one gets a decision; an actioned one can only be undone; a dismissed one is
 * closed. A photo held by screening is decided straight away: approve it, reject it, or
 * suspend the account. The server accepts any action in any state (photo actions only on
 * a held photo), so this is the screen's guard rail.
 */
export function nextActions(status: string, source: string = "member"): ReportAction[] {
  if (source === "photo-screening") {
    if (status === "received" || status === "reviewing") return ["approve-photo", "reject-photo", "suspend", "dismiss"];
    return status === "actioned" ? ["reinstate"] : [];
  }
  switch (status) {
    case "received": return ["claim", "dismiss"];
    case "reviewing": return ["warn", "suspend", "remove-photos", "dismiss"];
    case "actioned": return ["reinstate"];
    default: return [];
  }
}

export type ReportSummary = {
  source?: string;
  reporterName: string | null;
  reporterDeleted?: boolean;
  reportedName: string | null;
  reportedUserDeleted?: boolean;
  reason: string;
};

/** A name for the list, honest about why one might be missing. */
export function partyName(name: string | null | undefined, deleted: boolean | undefined): string {
  if (name) return name;
  return deleted ? "Deleted account" : "No profile";
}

/** Who filed it: a member, or the automatic photo check. */
export function reporterLabel(report: ReportSummary): string {
  return report.source === "photo-screening" ? "Automatic check" : partyName(report.reporterName, report.reporterDeleted);
}

/** One line for the queue: "Harassment: Aiko reported Ben", or "Duplicate photo: Automatic check flagged Ben". */
export function summariseReport(report: ReportSummary): string {
  const reported = partyName(report.reportedName, report.reportedUserDeleted);
  const verb = report.source === "photo-screening" ? "flagged" : "reported";
  return `${describeReason(report.reason)}: ${reporterLabel(report)} ${verb} ${reported}`;
}

export function actionLabel(action: ReportAction): string {
  switch (action) {
    case "claim": return "Claim";
    case "dismiss": return "Dismiss";
    case "warn": return "Warn";
    case "suspend": return "Suspend";
    case "reinstate": return "Reinstate";
    case "remove-photos": return "Remove photos";
    case "approve-photo": return "Approve photo";
    case "reject-photo": return "Reject photo";
  }
}

/** What the server will do, from the contract, read before the operator confirms. */
export function actionConsequence(action: ReportAction): string {
  switch (action) {
    case "claim":
      return "Marks the report as reviewing under your name. Nothing changes for either member.";
    case "dismiss":
      return "Closes the report with no action. Neither member is told.";
    case "warn":
      return "Records a warning in the audit trail. Nothing is sent to the member yet and nothing changes on their account.";
    case "suspend":
      return "Leaves discovery, every callable refused, refresh tokens revoked, so they are signed out. Reversible with reinstate.";
    case "reinstate":
      return "Lifts the suspension: back into discovery and every callable accepted again.";
    case "remove-photos":
      return "Deletes every photo in the member's folder and their screening records, and clears their profile photos. They can upload again; repeat problems are for suspend.";
    case "approve-photo":
      return "Makes the held photo visible and usable, and adds it to the member's profile if there is room. Nobody is told.";
    case "reject-photo":
      return "Deletes the held photo and its screening record. The member can upload a different one. Nobody is told.";
  }
}

/** Suspend and deleting photos change someone's account, so they get the danger style. */
export function isDestructive(action: ReportAction): boolean {
  return action === "suspend" || action === "remove-photos" || action === "reject-photo";
}

/** What a moderator may set by hand (setVerification). */
export type ManualVerification = "verified" | "review" | "failed";
export const MANUAL_VERIFICATIONS: readonly ManualVerification[] = ["verified", "review", "failed"];

export function verificationActionLabel(status: ManualVerification): string {
  switch (status) {
    case "verified": return "Mark verified";
    case "review": return "Needs review";
    case "failed": return "Mark not verified";
  }
}

/** What setting a verification by hand does, read before the moderator confirms. */
export function verificationConsequence(status: ManualVerification): string {
  switch (status) {
    case "verified":
      return "Shows the Verified badge on their profile and lets them make plans when verification is required. Only do this once you are sure they are who their photos show.";
    case "review":
      return "Takes the badge away while someone looks again. Recorded in the audit trail.";
    case "failed":
      return "Takes the badge away. They can be verified again later. Recorded in the audit trail.";
  }
}
