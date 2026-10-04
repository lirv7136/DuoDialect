/**
 * Typed wrappers for every Cloud Function callable the v1 client uses.
 * Shapes follow docs/BACKEND-CONTRACT.md.
 *
 * v1 is language exchange only. Discovery always asks for `platonic` candidates and
 * invitations are always `platonic`; `setDatingConsent` and the moderator callables
 * are deliberately not wrapped.
 *
 * Every failure is rethrown as an ApiError carrying the backend `code`, the stable
 * `details.reason` and a sentence to show the person.
 */
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { describeFailure, isRetryable, toCallableFailure, type CallableFailure } from "../domain/errors";
import type { LanguageLevel, UserLang } from "../domain/language-exchange";
import type { UpsertProfilePayload } from "../domain/profile-form";
import type { Recurrence } from "../domain/schedule";
import type { ProfilePhoto } from "../domain/photos";
import type { CheckInAnswer } from "../domain/check-in";

export class ApiError extends Error {
  readonly code: string;
  readonly reason: string | null;
  readonly retryable: boolean;
  constructor(failure: CallableFailure) {
    super(describeFailure(failure));
    this.name = "ApiError";
    this.code = failure.code;
    this.reason = failure.reason;
    this.retryable = isRetryable(failure);
  }
}

export type PublicProfile = {
  uid: string;
  displayName: string;
  bio: string;
  area: string;
  speaks: { lang: string; level: LanguageLevel }[];
  learns: { lang: string; level: LanguageLevel }[];
  offers: string[];
  seeks: string[];
  availability: string[];
  interests: string[];
  /** Managed only by setProfilePhotos. Older profiles may not have it. */
  photos?: ProfilePhoto[];
  discoverable?: boolean;
  fluencyAssurance?: "self-declared";
};

/** The caller's private record. Dating fields exist on the server but v1 never reads them. */
export type MyAccount = {
  birthDate: string;
  age: number | null;
  ageAssurance: "self-declared";
  isAdultSelfDeclared: boolean;
};

export type AccountResult = { profile: PublicProfile | null; account: MyAccount | null };

export type Candidate = {
  uid: string;
  displayName: string;
  bio: string;
  area: string;
  offers: string[];
  seeks: string[];
  availability: string[];
  interests: string[];
  /** In order; the first is the main photo. Paths only, resolved through Storage. */
  photos: ProfilePhoto[];
  fluencyAssurance: "self-declared";
  exchange: { theyOffer: string[]; youOffer: string[] };
  sharedAvailability: string[];
};

export type DiscoverResult = { candidates: Candidate[]; nextCursor: string | null; scanned: number };

export type InvitationStatus = "pending" | "accepted" | "declined" | "cancelled";

export type Meeting = {
  venue: string;
  localDate: string;
  localTime: string;
  timeZone: string;
  recurrence: Recurrence;
};

export type Invitation = {
  id: string;
  fromUid: string;
  toUid: string;
  participants: string[];
  intent: string;
  status: InvitationStatus;
  languages: { fromOffers: string; toOffers: string };
  meeting: Meeting & { startAt?: string | null };
  note: string;
  conversationId: string | null;
  resolution: { by: string; reason: string } | null;
};

export type CreateInvitationInput = {
  toUid: string;
  note?: string;
  languages?: { fromOffers: string; toOffers: string };
  meeting: Meeting;
};

/** One post meetup check-in, as answerCheckIn returns it. Only its owner ever sees it. */
export type CheckIn = {
  id: string;
  invitationId: string;
  otherUid: string;
  conversationId: string | null;
  occurrence: { localDate: string; localTime: string; timeZone: string; recurrence: Recurrence };
  /** From the owner's side: what they offered, and what they practised. */
  languages: { gave: string; received: string };
  status: "open" | "answered";
  answer: CheckInAnswer | null;
  dueAt: string | null;
  expiresAt: string | null;
};

export const REPORT_REASONS = [
  { value: "harassment", label: "Harassment" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate_content", label: "Inappropriate content" },
  { value: "impersonation", label: "Pretending to be someone else" },
  { value: "safety_concern", label: "I’m worried about safety" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = typeof REPORT_REASONS[number]["value"];

async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  try {
    const result = await httpsCallable<Req, Res>(functions, name)(data);
    return result.data;
  } catch (error) {
    throw new ApiError(toCallableFailure(error));
  }
}

export const api = {
  getMyAccount: () => call<Record<string, never>, AccountResult>("getMyAccount", {}),

  upsertProfile: (payload: UpsertProfilePayload) =>
    call<UpsertProfilePayload, AccountResult>("upsertProfile", payload),

  /** Up to three screened photo ids, main first. Unreferenced photos are deleted by the server. */
  setProfilePhotos: (photoIds: string[]) =>
    call<{ photoIds: string[] }, { photos: ProfilePhoto[]; deleted: number }>("setProfilePhotos", { photoIds }),

  discoverCandidates: (options: { cursor?: string | null; limit?: number } = {}) =>
    call<{ mode: "platonic"; limit: number; cursor?: string }, DiscoverResult>("discoverCandidates", {
      mode: "platonic",
      limit: options.limit ?? 20,
      ...(options.cursor ? { cursor: options.cursor } : {}),
    }),

  /** `requestKey` must be reused for every retry of the same send; see domain/idempotency. */
  createInvitation: (input: CreateInvitationInput, requestKey: string) =>
    call<CreateInvitationInput & { intent: "platonic"; requestKey: string }, { invitation: Invitation; created: boolean }>(
      "createInvitation",
      { ...input, intent: "platonic", requestKey },
    ),

  respondToInvitation: (invitationId: string, action: "accept" | "decline") =>
    call<{ invitationId: string; action: "accept" | "decline" }, { invitation: Invitation; conversationId: string | null; changed: boolean }>(
      "respondToInvitation", { invitationId, action },
    ),

  cancelInvitation: (invitationId: string) =>
    call<{ invitationId: string }, { invitation: Invitation; changed: boolean }>("cancelInvitation", { invitationId }),

  /** `clientMessageId` must be reused for every retry of the same message. */
  sendMessage: (conversationId: string, text: string, clientMessageId: string) =>
    call<{ conversationId: string; text: string; clientMessageId: string }, { messageId: string; conversationId: string; created: boolean }>(
      "sendMessage", { conversationId, text, clientMessageId },
    ),

  markConversationRead: (conversationId: string) =>
    call<{ conversationId: string }, { conversationId: string; unread: 0 }>("markConversationRead", { conversationId }),

  setBlock: (otherUid: string, blocked: boolean) =>
    call<{ otherUid: string; blocked: boolean }, { blocked: boolean; cancelledInvitations: number }>("setBlock", { otherUid, blocked }),

  reportUser: (input: { reportedUid: string; reason: ReportReason; detail?: string; conversationId?: string }) =>
    call<typeof input, { reportId: string; status: "received" }>("reportUser", input),

  /** Can be repeated to change the answer until the check-in expires. */
  answerCheckIn: (checkInId: string, answer: CheckInAnswer) =>
    call<{ checkInId: string } & CheckInAnswer, { checkIn: CheckIn; changed: boolean }>("answerCheckIn", { checkInId, ...answer }),

  requestAccountDeletion: () =>
    call<{ confirmation: "DELETE" }, { status: "completed" | "needs_retry"; deleted: Record<string, number>; retained: unknown }>(
      "requestAccountDeletion", { confirmation: "DELETE" },
    ),
};

export type { UserLang, ProfilePhoto };
