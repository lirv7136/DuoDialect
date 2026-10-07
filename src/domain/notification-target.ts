/**
 * Where a tapped notification should open. The server sets `data.type`: "message" for
 * chat messages, "plan" for new or accepted invitations and reminders, "checkIn" the
 * morning after a meetup and "match" when someone who fits the exchange joins. Older
 * message notifications carried only a conversationId, so that alone still opens the chat.
 */
export type NotificationTarget =
  | { pathname: "/chat/[chatId]"; params: { chatId: string; otherUid?: string } }
  | { pathname: "/check-in/[checkInId]"; params: { checkInId: string } }
  | { pathname: "/person/[uid]"; params: { uid: string } }
  | "/(tabs)/plans"
  | "/(tabs)/discover";

const text = (value: unknown) => (typeof value === "string" && value ? value : null);

export function notificationTarget(data: unknown): NotificationTarget | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const conversationId = text(record.conversationId);
  const otherUid = text(record.otherUid);
  const type = text(record.type);

  const checkInId = text(record.checkInId);
  if (type === "checkIn") return checkInId ? { pathname: "/check-in/[checkInId]", params: { checkInId } } : "/(tabs)/plans";

  // A new partner: open their profile, or Discover if the notice did not say who.
  if (type === "match") return otherUid ? { pathname: "/person/[uid]", params: { uid: otherUid } } : "/(tabs)/discover";

  // An accepted plan comes with its conversation: open it so they can say hello.
  if (conversationId && (type === "message" || type === "plan" || type === null)) {
    return { pathname: "/chat/[chatId]", params: otherUid ? { chatId: conversationId, otherUid } : { chatId: conversationId } };
  }
  if (type === "plan") return "/(tabs)/plans";
  return null;
}
