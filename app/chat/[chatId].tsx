import { useEffect, useMemo, useRef, useState } from "react";
import { ActionSheetIOS, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/lib/api";
import { auth } from "../../src/lib/firebase";
import { getPublicProfile, subscribeConversation, subscribeMessages, type ConversationDoc, type Message } from "../../src/lib/live";
import { rememberBlockedName } from "../../src/lib/blocked-names";
import { createDraftKeys } from "../../src/domain/idempotency";
import { capitalise } from "../../src/domain/profile-form";
import { errorMessage } from "../../src/domain/errors";
import { Body, Button, ErrorNotice, Loading, styles } from "../../components/ui";
import { Avatar } from "../../components/avatar";
import { sanitizePhotos, type ProfilePhoto } from "../../src/domain/photos";
import { SafetyCard } from "../../components/safety-card";
import { colors, space, TOUCH_TARGET } from "../../constants/theme";

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
  const list = useRef<FlatList<Message>>(null);
  // One clientMessageId per typed message, reused if that same message is retried.
  const keys = useRef(createDraftKeys()).current;

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
    Alert.alert(`Block ${otherName || "this member"}?`, "Neither of you will be able to message, invite or find the other. You can unblock from Your profile.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block", style: "destructive", onPress: async () => {
          try {
            await api.setBlock(otherUid, true);
            if (me) await rememberBlockedName(me, otherUid, otherName || "A member");
            router.replace("/(tabs)/chats");
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);
  }

  const title = otherName || "Conversation";

  function onReport() {
    if (!otherUid) return;
    router.push({ pathname: "/report/[uid]", params: { uid: otherUid, name: otherName, conversationId: chatId } });
  }

  // Report and Block live in the header menu: always reachable, never in the way.
  function onMenu() {
    const report = `Report ${title}`, block = `Block ${title}`;
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [report, block, "Cancel"], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
        index => { if (index === 0) onReport(); if (index === 1) onBlock(); },
      );
      return;
    }
    Alert.alert(title, undefined, [
      { text: report, onPress: onReport },
      { text: block, style: "destructive", onPress: onBlock },
      { text: "Cancel", style: "cancel" },
    ], { cancelable: true });
  }

  const headerRight = () => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`More options for ${title}`}
      accessibilityHint={`Report or block ${title}`}
      onPress={onMenu}
      hitSlop={8}
      style={{ minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ color: colors.green, fontSize: 24, fontWeight: "700" }}>⋯</Text>
    </Pressable>
  );
  const exchange = conversation?.languages
    ? `Your exchange: ${capitalise(conversation.languages.fromOffers)} ⇄ ${capitalise(conversation.languages.toOffers)}`
    : null;

  if (gone) {
    return (
      <SafeAreaView edges={["bottom"]} style={[styles.screen, { padding: space.lg, gap: space.md }]}>
        <Stack.Screen options={{ title: "Conversation" }} />
        <Body>This conversation is no longer available. The other person may have deleted their account, or one of you blocked the other.</Body>
        <Button label="Back to chats" onPress={() => router.replace("/(tabs)/chats")} />
      </SafeAreaView>
    );
  }
  if (conversation === undefined) return <Loading label="Opening conversation" />;

  return (
    <SafeAreaView edges={["bottom"]} style={styles.screen}>
      <Stack.Screen options={{
        title,
        headerRight,
        headerTitle: () => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 }}>
            <Avatar name={otherName} photos={otherPhotos} size={32} />
            <Text accessibilityRole="header" numberOfLines={1} style={[styles.label, { fontSize: 17, flexShrink: 1 }]}>{title}</Text>
          </View>
        ),
      }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={headerHeight}>
        {exchange ? (
          <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: 1, borderColor: colors.line }}>
            <Text style={styles.hint}>{exchange}</Text>
          </View>
        ) : null}

        <FlatList
          ref={list}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={{ gap: space.md }}>
              <SafetyCard />
              <Body muted>No messages yet. Say hello and confirm where you’ll meet.</Body>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.fromUid === me;
            return (
              <View
                accessible
                accessibilityLabel={`${mine ? "You" : title}, ${clock(item.createdAt)}: ${item.text}`}
                style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%" }}
              >
                <View style={{ padding: space.md, borderRadius: 14, backgroundColor: mine ? colors.green : colors.paper, borderWidth: 1, borderColor: mine ? colors.green : colors.line }}>
                  <Text style={{ color: mine ? colors.onGreen : colors.ink, fontSize: 16 }}>{item.text}</Text>
                </View>
                <Text style={[styles.hint, { alignSelf: mine ? "flex-end" : "flex-start", fontSize: 12 }]}>{clock(item.createdAt)}</Text>
              </View>
            );
          }}
        />

        <View style={{ paddingHorizontal: space.md, paddingTop: space.sm, gap: space.sm }}>
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
              style={[styles.input, { flex: 1, maxHeight: 140 }]}
            />
            <Button variant="primary" label="Send" busy={sending} disabled={!text.trim()} onPress={send} style={{ minWidth: TOUCH_TARGET * 1.6 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
