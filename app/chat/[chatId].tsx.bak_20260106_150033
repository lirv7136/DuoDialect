import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, KeyboardAvoidingView, Platform, Alert } from "react-native";
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
} from "firebase/firestore";
import { auth, db } from "../../src/lib/firebase";
import { blockUser, reportUser } from "../../src/lib/safety";

type Msg = { id: string; from: string; text: string; createdAt?: any };
type UserProfile = { uid: string; name?: string };

export default function ChatScreen() {
  const { chatId, otherUid } = useLocalSearchParams<{ chatId: string; otherUid?: string }>();
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [otherName, setOtherName] = useState<string>("");

  const me = auth.currentUser?.uid;

  useEffect(() => {
    async function loadOther() {
      if (!otherUid) return;
      const snap = await getDoc(doc(db, "users", String(otherUid)));
      if (snap.exists()) {
        const p = snap.data() as UserProfile;
        setOtherName(p?.name?.trim() || "");
      }
    }
    loadOther();
  }, [otherUid]);

  // Reset unread when opening chat
  useEffect(() => {
    async function resetUnread() {
      if (!me || !otherUid) return;
      await setDoc(
        doc(db, "matches", me, "with", String(otherUid)),
        { unread: 0, lastReadAt: serverTimestamp() },
        { merge: true }
      );
    }
    resetUnread();
  }, [me, otherUid]);

  useEffect(() => {
    if (!chatId) return;

    const q = query(collection(db, "chats", String(chatId), "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: Msg[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setMsgs(list);
    });

    return () => unsub();
  }, [chatId]);

  async function send() {
    if (!chatId || !me) return;
    const clean = text.trim();
    if (!clean) return;

    setText("");

    await addDoc(collection(db, "chats", String(chatId), "messages"), {
      from: me,
      text: clean,
      createdAt: serverTimestamp(),
    });

    // Update chat meta
    await setDoc(
      doc(db, "chats", String(chatId)),
      { updatedAt: serverTimestamp(), lastText: clean, lastFrom: me, lastAt: serverTimestamp() },
      { merge: true }
    );

    if (!otherUid) return;

    // My side: unread stays 0
    await setDoc(
      doc(db, "matches", me, "with", String(otherUid)),
      { lastText: clean, lastAt: serverTimestamp(), unread: 0, chatId: String(chatId), with: String(otherUid) },
      { merge: true }
    );

    // Their side: unread = existing + 1 (transaction so rules can verify)
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
  }

  async function onBlock() {
    if (!me || !otherUid) return;
    Alert.alert(
      "Block user?",
      "They will disappear from your matches and you won't see them again.",
      [
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
      ]
    );
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={80}>
      <View style={{ padding: 16, borderBottomWidth: 1, borderColor: "#eee", flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: "#ddd", borderRadius: 10 }}>
          <Text style={{ fontWeight: "900" }}>Back</Text>
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: "900" }}>{title}</Text>
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
          return (
            <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
              <View style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#eee", backgroundColor: mine ? "#111" : "#fff" }}>
                <Text style={{ color: mine ? "white" : "black" }}>{item.text}</Text>
              </View>
            </View>
          );
        }}
      />

      <View style={{ padding: 12, borderTopWidth: 1, borderColor: "#eee", flexDirection: "row", gap: 10 }}>
        <TextInput value={text} onChangeText={setText} placeholder="Message…" style={{ flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 12 }} />
        <Pressable onPress={send} style={{ backgroundColor: "#111", paddingHorizontal: 16, borderRadius: 12, justifyContent: "center" }}>
          <Text style={{ color: "white", fontWeight: "900" }}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
