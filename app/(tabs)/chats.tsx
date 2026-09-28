import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { auth } from "../../src/lib/firebase";
import { subscribeInbox, subscribeInvitations, type InboxItem, type InvitationDoc } from "../../src/lib/live";
import { errorMessage } from "../../src/domain/errors";
import { dateBlock, isPastMeeting, nextOccurrence, relativeTime } from "../../src/domain/display";
import { Button, Display, ErrorNotice, InfoChip, Loading, Screen } from "../../components/ui";
import { EmptyState } from "../../components/empty-state";
import { Avatar } from "../../components/avatar";
import { MonogramPair } from "../../components/exchange-strip";
import { usePeople } from "../../hooks/use-people";
import { MAX_FONT_SCALE, colors, fonts, radius, space, type } from "../../constants/theme";

type Plan = { languages: { mine: string; theirs: string } | null; next: string | null };

/** For each partner: our language pair, and the date of our next confirmed meetup. */
function plansByPartner(items: InvitationDoc[], uid: string): Record<string, Plan> {
  const out: Record<string, Plan> = {};
  for (const item of items) {
    if (item.status !== "accepted") continue;
    const mine = item.fromUid === uid;
    const other = mine ? item.toUid : item.fromUid;
    const languages = item.languages ? { mine: mine ? item.languages.fromOffers : item.languages.toOffers, theirs: mine ? item.languages.toOffers : item.languages.fromOffers } : null;
    const next = isPastMeeting(item.meeting) ? null : nextOccurrence(item.meeting.localDate, item.meeting.recurrence);
    const known = out[other];
    if (!known) out[other] = { languages, next };
    else if (next && (!known.next || next < known.next)) out[other] = { languages: known.languages ?? languages, next };
  }
  return out;
}

/** Conversations come from accepted invitations; the inbox is written by the server. */
export default function Chats() {
  const uid = auth.currentUser?.uid ?? "";
  const [rows, setRows] = useState<InboxItem[] | null>(null);
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [error, setError] = useState<string | null>(null);
  const people = usePeople((rows ?? []).map(row => row.otherUid).filter(Boolean));

  useEffect(() => {
    if (!uid) return;
    return subscribeInbox(uid, next => { setRows(next); setError(null); }, e => setError(errorMessage(e)));
  }, [uid]);

  // The pair and next date are extras; if this listener fails, rows just go without them.
  useEffect(() => {
    if (!uid) return;
    return subscribeInvitations(uid, items => setPlans(plansByPartner(items, uid)), () => setPlans({}));
  }, [uid]);

  if (!rows && !error) return <Loading label="Loading conversations" />;

  return (
    <Screen>
      <Display>Chats</Display>
      <ErrorNotice message={error} />
      {rows && rows.length === 0 ? (
        <EmptyState art="chat" title="No chats yet." body="Chats open when an invite is accepted.">
          <Button variant="primary" label="See plans" onPress={() => router.push("/(tabs)/plans")} />
        </EmptyState>
      ) : null}
      {(rows ?? []).map(row => {
        const person = people[row.otherUid];
        const plan = plans[row.otherUid];
        const name = person?.name ?? "…";
        const preview = row.lastText || "Say hello 👋";
        const next = plan?.next ? dateBlock(plan.next) : null;
        const label = `${name}. ${row.unread > 0 ? `${row.unread} unread. ` : ""}${preview}${next ? `. Next meetup ${next.weekday} ${next.day} ${next.month}` : ""}`;
        const unread = row.unread > 0;
        return (
          <Pressable
            key={row.conversationId}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint="Opens the conversation"
            onPress={() => router.push({ pathname: "/chat/[chatId]", params: { chatId: row.conversationId, otherUid: row.otherUid } })}
            style={({ pressed }) => [{
              backgroundColor: pressed ? colors.surfaceNavySoft : colors.surface, borderRadius: radius.card, padding: space.md,
              borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", gap: space.md,
            }]}
          >
            <Avatar name={name === "…" ? "" : name} photos={person?.photos} size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Text numberOfLines={1} style={[type.label, { fontFamily: fonts.bold, fontSize: 16, flexShrink: 1 }]}>{name}</Text>
                {plan?.languages ? <MonogramPair left={plan.languages.theirs} right={plan.languages.mine} /> : null}
                <View style={{ flex: 1 }} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={type.caption}>{relativeTime(row.lastAt)}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Text numberOfLines={1} style={[type.body, { flex: 1, fontSize: 15, color: unread ? colors.text : colors.muted, fontFamily: unread ? fonts.semibold : fonts.regular }]}>
                  {preview}
                </Text>
                {unread ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} /> : null}
              </View>
              {next ? <View style={{ marginTop: 4 }}><InfoChip icon="calendar-outline" label={`${next.weekday} ${next.day} ${next.month}`} /></View> : null}
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}
