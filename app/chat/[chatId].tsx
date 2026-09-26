import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../src/lib/firebase";
import { blockUser, reportUser } from "../../src/lib/safety";

type Msg = { id: string; from: string; text: string; createdAt?: any };
type UserProfile = { uid: string; name?: string };

type ChatMeta = {
  typing?: Record<string, boolean>;
  readAt?: Record<string, any>;
  lastAt?: any;
  lastText?: string;
  lastFrom?: string;
  updatedAt?: any;
};

function toMs(ts: any) {
  if (!ts) return 0;
  if (ts?.toMillis) return ts.toMillis();
  if (ts?.toDate) return ts.toDate().getTime();
  const ms = new Date(ts).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function fmtTime(ts: any) {
  const ms = toMs(ts);
  if (!ms) return "";
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function ChatScreen() {
  const { chatId, otherUid } = useLocalSearchParams<{ chatId: string; otherUid?: string }>();
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [otherName, setOtherName] = useState<string>("");
  const [chatMeta, setChatMeta] = useState<ChatMeta>({});
  const [sending, setSending] = useState(false);

  const me = auth.currentUser?.uid;

  const typingTimer = useRef<any>(null);
  const myTyping = useRef<boolean>(false);
  const lastReadMsgId = useRef<string | null>(null);

  const chatRef = useMemo(() => (chatId ? doc(db, "chats", String(chatId)) : null), [chatId]);

  useEffect(() => {
    async function loadOther() {
      if (!otherUid) return;
      try {
        const snap = await getDoc(doc(db, "users", String(otherUid)));
        if (snap.exists()) {
          const p = snap.data() as UserProfile;
          setOtherName(p?.name?.trim() || "");
        }
      } catch (e) {
        console.log("loadOther failed:", e);
      }
    }
    loadOther();
  }, [otherUid]);

  // Listen to chat meta (typing + readAt + lastAt/lastText)
  useEffect(() => {
    if (!chatRef) return;
    const unsub = onSnapshot(
      chatRef,
      (snap) => {
        if (!snap.exists()) return;
        setChatMeta(snap.data() as ChatMeta);
      },
      (err) => console.log("chat meta listen failed:", err)
    );
    return () => unsub();
  }, [chatRef]);

  // Reset unread + mark read when opening chat (your side)
  useEffect(() => {
    async function resetUnread() {
      if (!me || !otherUid) return;
      try {
        await setDoc(
          doc(db, "matches", me, "with", String(otherUid)),
          { unread: 0, lastReadAt: serverTimestamp() },
          { merge: true }
        );
      } catch (e) {
        console.log("resetUnread failed (ignored):", e);
      }
    }
    resetUnread();
  }, [me, otherUid]);

  const markReadForChat = useCallback(async (lastMsgIdNow: string | null) => {
    if (!me || !chatRef || !lastMsgIdNow) return;
    if (lastReadMsgId.current === lastMsgIdNow) return;

    try {
      await updateDoc(chatRef, { [`readAt.${me}`]: serverTimestamp() });
      lastReadMsgId.current = lastMsgIdNow;
    } catch (e) {
      console.log("markRead failed (ignored):", e);
    }
  }, [me, chatRef]);

  async function setTyping(flag: boolean) {
    if (!me || !chatRef) return;

    // IMPORTANT: avoid writing on every keystroke
    if (myTyping.current === flag) return;
    myTyping.current = flag;

    try {
      await updateDoc(chatRef, { [`typing.${me}`]: flag });
    } catch (e) {
      // typing should never break chat
      console.log("typing update failed (ignored):", e);
    }
  }

  function onChangeText(v: string) {
    setText(v);

    const shouldType = v.trim().length > 0;

    if (typingTimer.current) clearTimeout(typingTimer.current);
    void setTyping(shouldType);

    typingTimer.current = setTimeout(() => {
      void setTyping(false);
    }, 1200);
  }

  // Clear typing when leaving screen
  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      void setTyping(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatRef, me]);

  // Listen to messages
  useEffect(() => {
    if (!chatId) return;

    const q = query(collection(db, "chats", String(chatId), "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Msg[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setMsgs(list);

        // If newest message is from the other person, mark chat read (for Seen receipts)
        const last = list[list.length - 1];
        if (last && me && last.from !== me) {
          void markReadForChat(last.id);
        }
      },
      (err) => {
        console.error(err);
        Alert.alert("Chat load failed", err.message);
      }
    );

    return () => unsub();
  }, [chatId, me, markReadForChat]);

  async function send() {
    if (!chatId || !me || !chatRef) return;
    if (sending) return;

    const clean = text.trim();
    if (!clean) return;

    setSending(true);
    setText("");

    try {
      // stop typing immediately (best effort)
      if (typingTimer.current) clearTimeout(typingTimer.current);
      void setTyping(false);

      // 1) write message
      await addDoc(collection(db, "chats", String(chatId), "messages"), {
        from: me,
        text: clean,
        createdAt: serverTimestamp(),
      });

      // 2) update chat meta (drives Matches list)
      await setDoc(
        chatRef,
        { updatedAt: serverTimestamp(), lastText: clean, lastFrom: me, lastAt: serverTimestamp() },
        { merge: true }
      );

      if (!otherUid) return;

      // 3) my match meta
      await setDoc(
        doc(db, "matches", me, "with", String(otherUid)),
        { lastText: clean, lastAt: serverTimestamp(), unread: 0, chatId: String(chatId), with: String(otherUid) },
        { merge: true }
      );

      // 4) their unread bump (best effort)
      try {
        await runTransaction(db, async (tx) => {
          const ref = doc(db, "matches", String(otherUid), "with", me);
          const snap = await tx.get(ref);
          const cur = snap.exists() ? Number((snap.data() as any)?.unread || 0) : 0;

          tx.set(
            ref,
            {
              with: me,
              chatId: String(chatId),
              lastText: clean,
              lastAt: serverTimestamp(),
              unread: cur + 1,
            },
            { merge: true }
          );
        });
      } catch (e) {
        console.log("unread bump failed (ignored):", e);
      }

      // The onMessageCreated Cloud Function delivers notifications after the write.
    } catch (e: any) {
      console.error(e);
      Alert.alert("Send failed", e?.message ?? String(e));
      setText(clean); // restore draft
    } finally {
      setSending(false);
    }
  }

  async function onBlock() {
    if (!me || !otherUid) return;
    Alert.alert("Block user?", "They will disappear from your matches.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          try {
            await blockUser(me, String(otherUid));
            router.replace("/(tabs)/matches");
          } catch (e: any) {
            Alert.alert("Block failed", e?.message ?? String(e));
          }
        },
      },
    ]);
  }

  async function onReport() {
    if (!me || !otherUid || !chatId) return;
    Alert.alert("Report user", "Pick a reason:", [
      { text: "Spam", onPress: () => doReport("spam") },
      { text: "Harassment", onPress: () => doReport("harassment") },
      { text: "Other", onPress: () => doReport("other") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function doReport(reason: string) {
    try {
      await reportUser(me!, String(otherUid), String(chatId), reason);
      Alert.alert("Reported", "Thanks — we recorded that report.");
    } catch (e: any) {
      Alert.alert("Report failed", e?.message ?? String(e));
    }
  }

  const title = useMemo(() => (otherName ? `Chat with ${otherName}` : "Chat"), [otherName]);

  const otherTyping = !!(otherUid && chatMeta?.typing?.[String(otherUid)]);
  const otherReadMs = otherUid ? toMs(chatMeta?.readAt?.[String(otherUid)]) : 0;

  const lastMineId = useMemo(() => {
    if (!me) return null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].from === me) return msgs[i].id;
    }
    return null;
  }, [msgs, me]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={80}>
      <View style={{ padding: 16, borderBottomWidth: 1, borderColor: "#eee", flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: "#ddd", borderRadius: 10 }}>
          <Text style={{ fontWeight: "900" }}>Back</Text>
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: "900" }}>{title}</Text>
          {otherTyping ? <Text style={{ opacity: 0.6, marginTop: 2 }}>Typing…</Text> : null}
        </View>

        <Pressable onPress={onReport} style={{ paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: "#ddd", borderRadius: 10 }}>
          <Text style={{ fontWeight: "900" }}>Report</Text>
        </Pressable>

        <Pressable onPress={onBlock} style={{ paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: "#ddd", borderRadius: 10 }}>
          <Text style={{ fontWeight: "900" }}>Block</Text>
        </Pressable>
      </View>

      <FlatList
        contentContainerStyle={{ padding: 16, gap: 10 }}
        data={msgs}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => {
          const mine = item.from === me;
          const time = fmtTime(item.createdAt);

          const mineMsgMs = toMs(item.createdAt);
          const seen =
            mine &&
            item.id === lastMineId &&
            otherReadMs > 0 &&
            mineMsgMs > 0 &&
            otherReadMs >= mineMsgMs;

          return (
            <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
              <View style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#eee", backgroundColor: mine ? "#111" : "#fff" }}>
                <Text style={{ color: mine ? "white" : "black" }}>{item.text}</Text>
              </View>

              <View style={{ flexDirection: "row", justifyContent: mine ? "flex-end" : "flex-start", gap: 8, marginTop: 4 }}>
                {time ? <Text style={{ fontSize: 12, opacity: 0.6 }}>{time}</Text> : null}
                {seen ? <Text style={{ fontSize: 12, opacity: 0.6 }}>Seen</Text> : null}
              </View>
            </View>
          );
        }}
      />

      <View style={{ padding: 12, borderTopWidth: 1, borderColor: "#eee", flexDirection: "row", gap: 10 }}>
        <TextInput
          value={text}
          onChangeText={onChangeText}
          placeholder="Message…"
          style={{ flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 12 }}
        />
        <Pressable
          onPress={send}
          disabled={sending || text.trim().length === 0}
          style={{
            backgroundColor: "#111",
            paddingHorizontal: 16,
            borderRadius: 12,
            justifyContent: "center",
            opacity: sending || text.trim().length === 0 ? 0.5 : 1,
          }}
        >
          <Text style={{ color: "white", fontWeight: "900" }}>{sending ? "Sending…" : "Send"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
