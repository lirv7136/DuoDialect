import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/lib/api";
import { auth } from "../../src/lib/firebase";
import { getPublicProfile, subscribeConversation, subscribeMessages, type ConversationDoc, type Message } from "../../src/lib/live";
import { rememberBlockedName } from "../../src/lib/blocked-names";
import { createDraftKeys } from "../../src/domain/idempotency";
import { groupMessages, type MessageRow } from "../../src/domain/display";
import { haptic } from "../../src/lib/feel";
import { errorMessage } from "../../src/domain/errors";
import { Body, Button, ErrorNotice, Loading, styles } from "../../components/ui";
import { EmptyState } from "../../components/empty-state";
import { Avatar } from "../../components/avatar";
import { MonogramPair } from "../../components/exchange-strip";
import { confirmBlock, useSafetyMenu } from "../../components/safety-menu";
import { sanitizePhotos, type ProfilePhoto } from "../../src/domain/photos";
import { SafetyCard } from "../../components/safety-card";
import { colors, fonts, radius, space, type } from "../../constants/theme";

const MAX_MESSAGE = 2000;

function clock(date: Date | null) {
  if (!date) return "Sending…";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function ChatScreen() {
  const params = useLocalSearchParams<{ chatId: string; otherUid?: string }>();
  const chatId = String(params.chatId);
  const me = auth.currentUser?.uid ?? "";
  const headerHeight = useHeaderHeight();

  const [conversation, setConversation] = useState<ConversationDoc | null | undefined>(undefined);
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherName, setOtherName] = useState("");
  const [otherPhotos, setOtherPhotos] = useState<ProfilePhoto[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const inFlight = useRef(false);
  const lastMarked = useRef<string | null>(null);
  const list = useRef<FlatList<MessageRow<Message>>>(null);
  // One clientMessageId per typed message, reused if that same message is retried.
  const keys = useRef(createDraftKeys()).current;
  // Messages that arrive after the chat opens spring in; the history is simply there.
  const openedAt = useRef(Date.now()).current;

  const otherUid = useMemo(() => {
    if (params.otherUid) return String(params.otherUid);
    return conversation?.participants.find(uid => uid !== me) ?? "";
  }, [params.otherUid, conversation, me]);

  useEffect(() => subscribeConversation(chatId, value => {
    setConversation(value);
    if (value === null) setGone(true);
  }, e => {
    // A conversation deleted with an account, or a block, both surface as a refused read.
    if ((e as { code?: string }).code === "permission-denied") setGone(true);
    else setError(errorMessage(e));
  }), [chatId]);

  useEffect(() => subscribeMessages(chatId, setMessages, e => {
    if ((e as { code?: string }).code !== "permission-denied") setError(errorMessage(e));
  }), [chatId]);

  useEffect(() => {
    if (!otherUid) return;
    getPublicProfile(otherUid).then(profile => {
      setOtherName(profile?.displayName || "A member");
      setOtherPhotos(sanitizePhotos(profile?.photos));
    }).catch(() => setOtherName("A member"));
  }, [otherUid]);

  // Clear my unread count when I open the chat and whenever a new message arrives.
  useEffect(() => {
    if (gone) return;
    const last = messages[messages.length - 1];
    const marker = last && last.fromUid !== me ? last.id : (lastMarked.current ?? "open");
    if (marker === lastMarked.current) return;
    lastMarked.current = marker;
    api.markConversationRead(chatId).catch(() => undefined);
  }, [messages, chatId, me, gone]);

  async function send() {
    const clean = text.trim();
    if (!clean || inFlight.current) return;
    if (clean.length > MAX_MESSAGE) { setError(`Messages can be up to ${MAX_MESSAGE} characters.`); return; }
    const clientMessageId = keys.keyFor(clean);
    haptic.light();
    inFlight.current = true;
    setSending(true);
    setError(null);
    setText("");
    try {
      await api.sendMessage(chatId, clean, clientMessageId);
      keys.settle();
    } catch (e) {
      // Restoring the same text keeps the same clientMessageId, so a retry cannot duplicate.
      setText(current => current || clean);
      setError(errorMessage(e));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  function onBlock() {
    if (!otherUid) return;
    // The same words as blocking from a profile, including that open invitations are cancelled.
    confirmBlock(otherName || "this member", async () => {
      try {
        await api.setBlock(otherUid, true);
        if (me) await rememberBlockedName(me, otherUid, otherName || "A member");
        router.replace("/(tabs)/chats");
      } catch (e) {
        setError(errorMessage(e));
      }
    });
  }

  const title = otherName || "Chat";

  function onReport() {
    if (!otherUid) return;
    router.push({ pathname: "/report/[uid]", params: { uid: otherUid, name: otherName, conversationId: chatId } });
  }

  // Report and Block live in the header menu: always reachable, never in the way.
  const menu = useSafetyMenu({ name: otherName, onReport, onBlock });
  const rows = useMemo(() => groupMessages(messages, me), [messages, me]);
  const languages = conversation?.languages;

  if (gone) {
    return (
      <SafeAreaView edges={["bottom"]} style={[styles.screen, { padding: space.lg }]}>
        <Stack.Screen options={{ title: "Chat" }} />
        <EmptyState art="chat" title="This chat is closed." body="They may have left or been blocked.">
          <Button label="Back" accessibilityLabel="Back to chats" onPress={() => router.replace("/(tabs)/chats")} />
        </EmptyState>
      </SafeAreaView>
    );
  }
  if (conversation === undefined) return <Loading label="Opening conversation" />;

  const canSend = !!text.trim() || sending;

  return (
    <SafeAreaView edges={["bottom"]} style={styles.screen}>
      <Stack.Screen options={{
        title,
        headerRight: menu.button,
        headerTitle: () => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 }}>
            <Avatar name={otherName} photos={otherPhotos} size={34} />
            <View style={{ flexShrink: 1 }}>
              <Text accessibilityRole="header" numberOfLines={1} style={[styles.label, { fontFamily: fonts.bold, fontSize: 17 }]}>{title}</Text>
              {languages ? <MonogramPair left={languages.fromOffers} right={languages.toOffers} /> : null}
            </View>
          </View>
        ),
      }} />
      {menu.menu}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={headerHeight}>
        <FlatList
          ref={list}
          data={rows}
          keyExtractor={row => row.message.id}
          contentContainerStyle={{ padding: space.lg, gap: 2 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={{ gap: space.md }}>
              <SafetyCard />
              <Body muted>Say hello and confirm where you’ll meet.</Body>
            </View>
          }
          renderItem={({ item: row }) => {
            const { message, mine, first, last, divider } = row;
            const fresh = !message.createdAt || message.createdAt.getTime() > openedAt;
            return (
              <View>
                {divider ? (
                  <View style={{ alignSelf: "center", backgroundColor: colors.surfaceNavySoft, borderRadius: radius.chip, paddingHorizontal: space.md, paddingVertical: 2, marginVertical: space.sm }}>
                    <Text style={[type.caption, { color: colors.primary }]}>{divider}</Text>
                  </View>
                ) : null}
                <Animated.View
                  entering={fresh ? FadeInDown.springify().damping(16) : undefined}
                  accessible
                  accessibilityLabel={`${mine ? "You" : title}, ${clock(message.createdAt)}: ${message.text}`}
                  style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%", marginTop: first ? space.sm : 0 }}
                >
                  <View style={{
                    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
                    borderBottomRightRadius: mine && last ? 6 : 20, borderBottomLeftRadius: !mine && last ? 6 : 20,
                    backgroundColor: mine ? colors.primary : colors.surface, borderWidth: mine ? 0 : 1, borderColor: colors.line,
                  }}>
                    <Text style={[type.body, { color: mine ? colors.onPrimary : colors.text }]}>{message.text}</Text>
                  </View>
                  {last ? (
                    <Text style={[type.caption, { alignSelf: mine ? "flex-end" : "flex-start", fontSize: 12, marginTop: 2 }]}>{clock(message.createdAt)}</Text>
                  ) : null}
                </Animated.View>
              </View>
            );
          }}
        />

        <View style={{ paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm, borderTopWidth: 1, borderColor: colors.line }}>
          <ErrorNotice message={error} />
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={otherName ? `Message ${otherName}` : "Message…"}
              placeholderTextColor={colors.muted}
              accessibilityLabel={`Message ${title}`}
              maxLength={MAX_MESSAGE}
              multiline
              style={[styles.input, { flex: 1, maxHeight: 140, borderRadius: 22 }]}
            />
            {canSend ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                accessibilityState={{ disabled: sending, busy: sending }}
                disabled={sending || !text.trim()}
                onPress={() => void send()}
                hitSlop={2}
                style={({ pressed }) => [{
                  // 44pt visible, 48pt to touch with the hit slop.
                width: 44, height: 44, borderRadius: 22, marginBottom: 2, backgroundColor: colors.primary,
                  alignItems: "center", justifyContent: "center", opacity: sending ? 0.6 : 1,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                }]}
              >
                <Ionicons name="arrow-up" size={22} color={colors.onPrimary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
