/**
 * Read-only Firestore access. Every query here is one of the shapes firestore.rules
 * permits (docs/BACKEND-CONTRACT.md, "Queries the rules permit"). Nothing in this file
 * writes; all writes go through ./api.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { CheckIn, Invitation, PublicProfile } from "./api";

export type InboxItem = {
  conversationId: string;
  otherUid: string;
  unread: number;
  lastText: string;
  lastFromUid: string | null;
  lastAt: Date | null;
};

export type ConversationDoc = {
  id: string;
  participants: string[];
  languages?: { fromOffers: string; toOffers: string };
};

export type Message = { id: string; fromUid: string; text: string; createdAt: Date | null };

export type InvitationDoc = Invitation & { createdAt: Date | null };

type Listener<T> = (value: T) => void;
type ErrorListener = (error: Error) => void;

function toDate(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

/** My inbox, newest first. */
export function subscribeInbox(uid: string, next: Listener<InboxItem[]>, fail: ErrorListener): Unsubscribe {
  return onSnapshot(
    query(collection(db, "userConversations", uid, "items"), orderBy("lastAt", "desc")),
    snap => next(snap.docs.map(d => {
      const data = d.data();
      return {
        conversationId: d.id,
        otherUid: String(data.otherUid ?? ""),
        unread: Number(data.unread ?? 0),
        lastText: typeof data.lastText === "string" ? data.lastText : "",
        lastFromUid: typeof data.lastFromUid === "string" ? data.lastFromUid : null,
        lastAt: toDate(data.lastAt),
      };
    })),
    fail,
  );
}

/** Invitations involving me. The participants filter is required by the rules. */
export function subscribeInvitations(uid: string, next: Listener<InvitationDoc[]>, fail: ErrorListener): Unsubscribe {
  return onSnapshot(
    query(collection(db, "invitations"), where("participants", "array-contains", uid), orderBy("createdAt", "desc")),
    snap => next(snap.docs.map(d => {
      const data = d.data() as Invitation & { createdAt?: unknown };
      return { ...data, id: d.id, createdAt: toDate(data.createdAt) };
    })),
    fail,
  );
}

export type CheckInDoc = Omit<CheckIn, "dueAt" | "expiresAt"> & { dueAt: Date | null; expiresAt: Date | null };

function toCheckIn(id: string, data: Record<string, unknown>): CheckInDoc {
  return {
    ...(data as unknown as CheckIn),
    id,
    answer: (data.answer as CheckIn["answer"]) ?? null,
    dueAt: toDate(data.dueAt),
    expiresAt: toDate(data.expiresAt),
  };
}

/** My open check-ins. The uid filter is required by the rules. */
export function subscribeOpenCheckIns(uid: string, next: Listener<CheckInDoc[]>, fail: ErrorListener): Unsubscribe {
  return onSnapshot(
    query(collection(db, "checkIns"), where("uid", "==", uid), where("status", "==", "open"), orderBy("dueAt", "desc")),
    snap => next(snap.docs.map(d => toCheckIn(d.id, d.data()))),
    fail,
  );
}

/** One of my check-ins; null when it is gone or not mine (the rules refuse the read). */
export function subscribeCheckIn(checkInId: string, next: Listener<CheckInDoc | null>, fail: ErrorListener): Unsubscribe {
  return onSnapshot(
    doc(db, "checkIns", checkInId),
    snap => next(snap.exists() ? toCheckIn(snap.id, snap.data()) : null),
    error => ((error as { code?: string }).code === "permission-denied" ? next(null) : fail(error)),
  );
}

export function subscribeConversation(conversationId: string, next: Listener<ConversationDoc | null>, fail: ErrorListener): Unsubscribe {
  return onSnapshot(
    doc(db, "conversations", conversationId),
    snap => next(snap.exists() ? { ...(snap.data() as ConversationDoc), id: snap.id } : null),
    fail,
  );
}

export function subscribeMessages(conversationId: string, next: Listener<Message[]>, fail: ErrorListener): Unsubscribe {
  return onSnapshot(
    query(collection(db, "conversations", conversationId, "messages"), orderBy("createdAt")),
    snap => next(snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        fromUid: String(data.fromUid ?? ""),
        text: typeof data.text === "string" ? data.text : "",
        createdAt: toDate(data.createdAt),
      };
    })),
    fail,
  );
}

/**
 * One public profile. Returns null when it does not exist or is hidden by a block in
 * either direction (the rules refuse the read; the direction is not disclosed).
 */
export async function getPublicProfile(uid: string): Promise<PublicProfile | null> {
  try {
    const snap = await getDoc(doc(db, "profiles", uid));
    return snap.exists() ? (snap.data() as PublicProfile) : null;
  } catch (error) {
    if ((error as { code?: string })?.code === "permission-denied") return null;
    throw error;
  }
}

/** The uids I have blocked. Only the owner may list this collection. */
export async function listMyBlocks(uid: string): Promise<string[]> {
  const snap = await getDocs(collection(db, "blocks", uid, "users"));
  return snap.docs.map(d => d.id);
}
