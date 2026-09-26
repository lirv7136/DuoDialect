import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { auth } from "../../src/lib/firebase";
import { getPublicProfile, subscribeInbox, type InboxItem } from "../../src/lib/live";
import { errorMessage } from "../../src/domain/errors";
import { Body, Button, EmptyState, ErrorNotice, Eyebrow, Loading, Screen, Title, styles } from "../../components/ui";
import { colors, TOUCH_TARGET } from "../../constants/theme";

function relTime(date: Date | null) {
  if (!date) return "";
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

/** Conversations come from accepted invitations; the inbox is written by the server. */
export default function Chats() {
  const uid = auth.currentUser?.uid ?? "";
  const [rows, setRows] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    if (!uid) return;
    return subscribeInbox(uid, next => { setRows(next); setError(null); }, e => setError(errorMessage(e)));
  }, [uid]);

  useEffect(() => {
    for (const row of rows ?? []) {
      if (!row.otherUid || requested.current.has(row.otherUid)) continue;
      requested.current.add(row.otherUid);
      getPublicProfile(row.otherUid)
        .then(profile => setNames(current => ({ ...current, [row.otherUid]: profile?.displayName || "A member" })))
        .catch(() => setNames(current => ({ ...current, [row.otherUid]: "A member" })));
    }
  }, [rows]);

  if (!rows && !error) return <Loading label="Loading conversations" />;

  return (
    <Screen>
      <Eyebrow>KEEP THE CONVERSATION GOING</Eyebrow>
      <Title>Chats</Title>
      <ErrorNotice message={error} />
      {rows && rows.length === 0 ? (
        <EmptyState title="No conversations yet." body="A chat opens when someone accepts your invitation, or you accept theirs.">
          <Button variant="primary" label="See your plans" onPress={() => router.push("/(tabs)/plans")} />
        </EmptyState>
      ) : null}
      {(rows ?? []).map(row => {
        const name = names[row.otherUid] ?? "…";
        const preview = row.lastText || "Say hello and agree the details.";
        const label = `${name}. ${row.unread > 0 ? `${row.unread} unread. ` : ""}${preview}`;
        return (
          <Pressable
            key={row.conversationId}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint="Opens the conversation"
            onPress={() => router.push({ pathname: "/chat/[chatId]", params: { chatId: row.conversationId, otherUid: row.otherUid } })}
            style={({ pressed }) => [
              { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, gap: 4, minHeight: TOUCH_TARGET },
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <Text style={[styles.label, { flexShrink: 1 }]}>{name}</Text>
              <View style={styles.row}>
                {row.unread > 0 ? (
                  <View style={{ backgroundColor: colors.green, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: colors.onGreen, fontWeight: "700" }}>{row.unread}</Text>
                  </View>
                ) : null}
                <Text style={styles.hint}>{relTime(row.lastAt)}</Text>
              </View>
            </View>
            <Body muted>{preview}</Body>
          </Pressable>
        );
      })}
    </Screen>
  );
}
