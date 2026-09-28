/**
 * A plan, Strava style: a date block on the left; the partner, the language pair and a
 * row of facts on the right; state as a badge; one action per state.
 */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { InvitationDoc } from "../src/lib/live";
import { dateBlock, nextOccurrence, planStatus } from "../src/domain/display";
import type { ProfilePhoto } from "../src/domain/photos";
import { MAX_FONT_SCALE, colors, fonts, radius, space, type } from "../constants/theme";
import { Avatar } from "./avatar";
import { ExchangeStrip } from "./exchange-strip";
import { Button, Card, ChipRow, ErrorNotice, InfoChip, StatusBadge } from "./ui";

const LONG_DAYS: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

export function DateBlock({ localDate, tone = "navy" }: { localDate: string; tone?: "navy" | "muted" }) {
  const block = dateBlock(localDate);
  if (!block) return null;
  const color = tone === "navy" ? colors.primary : colors.muted;
  return (
    <View
      accessible
      accessibilityLabel={`${LONG_DAYS[block.weekday] ?? block.weekday} ${block.day} ${block.month}`}
      style={{ width: 64, borderRadius: radius.button, backgroundColor: tone === "navy" ? colors.surfaceNavySoft : colors.background, alignItems: "center", paddingVertical: space.sm }}
    >
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[type.caption, { fontFamily: fonts.bold, color }]}>{block.weekday}</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color }}>{block.day}</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[type.caption, { color }]}>{block.month}</Text>
    </View>
  );
}

type Action = "accept" | "decline" | "cancel";

export function PlanCard({ item, uid, person, busy, error, myZone, onAccept, onDecline, onCancel, onOpenChat }: {
  item: InvitationDoc;
  uid: string;
  person?: { name: string; photos: ProfilePhoto[] };
  busy?: Action;
  error?: string;
  myZone: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onOpenChat: () => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const mine = item.fromUid === uid;
  const name = person?.name ?? "…";
  const status = planStatus(item, uid);
  const closed = status === "declined" || status === "cancelled";
  const iShare = mine ? item.languages?.fromOffers : item.languages?.toOffers;
  const theyShare = mine ? item.languages?.toOffers : item.languages?.fromOffers;
  const weekly = item.meeting.recurrence === "weekly";
  const shownDate = item.status === "accepted" ? nextOccurrence(item.meeting.localDate, item.meeting.recurrence) : item.meeting.localDate;

  return (
    <Card style={closed && { opacity: 0.85 }}>
      <View style={{ flexDirection: "row", gap: space.md }}>
        <DateBlock localDate={shownDate} tone={closed ? "muted" : "navy"} />
        <View style={{ flex: 1, gap: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Avatar name={name === "…" ? "" : name} photos={person?.photos} size={36} />
            <View accessible accessibilityLabel={mine ? `You invited ${name}` : `${name} invited you`}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text numberOfLines={1} style={[type.heading, { flexShrink: 1 }]}>{name}</Text>
              <Ionicons name={mine ? "arrow-forward" : "arrow-back"} size={16} color={colors.muted} />
            </View>
          </View>
          <StatusBadge status={status} />
        </View>
      </View>

      {iShare && theyShare ? <ExchangeStrip compact theyTeach={[theyShare]} youTeach={[iShare]} /> : null}

      <ChipRow>
        <InfoChip icon="time-outline" label={item.meeting.localTime} tone="plain" accessibilityLabel={`At ${item.meeting.localTime}`} />
        <InfoChip icon="location-outline" label={item.meeting.venue} tone="plain" accessibilityLabel={`At ${item.meeting.venue}`} />
        {weekly ? <InfoChip icon="repeat" label="Weekly" tone="plain" accessibilityLabel="Repeats weekly" /> : null}
      </ChipRow>
      {item.meeting.timeZone !== myZone ? <Text style={type.caption}>{`Times are in ${item.meeting.timeZone}.`}</Text> : null}

      {item.note ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Note: ${item.note}`}
          accessibilityHint={noteOpen ? "Collapses the note" : "Shows the whole note"}
          onPress={() => setNoteOpen(open => !open)}
          style={{ backgroundColor: colors.background, borderRadius: 16, borderBottomLeftRadius: 6, paddingHorizontal: space.md, paddingVertical: space.sm }}
        >
          <Text numberOfLines={noteOpen ? undefined : 1} style={[type.body, { fontSize: 15 }]}>{`“${item.note}”`}</Text>
        </Pressable>
      ) : null}

      <ErrorNotice message={error || null} />

      {status === "your-turn" ? (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button style={{ flex: 1 }} variant="primary" label="Accept" busy={busy === "accept"} busyLabel="Accepting…" disabled={!!busy}
            accessibilityLabel={`Accept invitation from ${name}`} onPress={onAccept} />
          <Button style={{ flex: 1 }} label="Decline" busy={busy === "decline"} disabled={!!busy}
            accessibilityLabel={`Decline invitation from ${name}`} onPress={onDecline} />
        </View>
      ) : null}
      {status === "waiting" ? (
        <Button variant="ghost" label="Cancel invite" busy={busy === "cancel"} busyLabel="Cancelling…" disabled={!!busy}
          accessibilityLabel={`Cancel invitation to ${name}`} onPress={onCancel} />
      ) : null}
      {status === "confirmed" && item.conversationId ? (
        <Button variant="primary" icon="chatbubbles-outline" label="Open chat" accessibilityLabel={`Open chat with ${name}`} onPress={onOpenChat} />
      ) : null}
    </Card>
  );
}
