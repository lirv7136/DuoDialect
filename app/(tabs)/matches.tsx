import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ActivityIndicator, ScrollView, Pressable } from "react-native";
import { router } from "expo-router";
import { auth, db } from "../../src/lib/firebase";
import { ensureChat, chatIdFor } from "../../src/lib/chat";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

type UserLang = { lang: string; level: string };
type UserProfile = { uid: string; name?: string; bio?: string; speaks?: UserLang[]; learns?: UserLang[] };

type MatchDoc = {
  with?: string;
  chatId?: string;
  at?: any;
  lastText?: string;
  lastAt?: any;
  lastReadAt?: any;
  unread?: number;
};

type BaseRow = {
  otherUid: string;
  chatId: string;
  lastText: string;
  lastAt?: any;
  lastReadAt?: any;
  unread: number;
  profile?: UserProfile;
};

type ChatMeta = {
  lastText?: string;
  lastAt?: any;
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

function relTime(ts: any) {
  const ms = toMs(ts);
  if (!ms) return "";
  const diff = Date.now() - ms;

  if (diff < 15_000) return "now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 8) return `${w}w`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
}

export default function Matches() {
  const [loading, setLoading] = useState(true);
  const [baseRows, setBaseRows] = useState<BaseRow[]>([]);
  const [chatMeta, setChatMeta] = useState<Record<string, ChatMeta>>({});

  const chatUnsubs = useRef<Record<string, () => void>>({});

  // Listen to matches/{me}/with/*
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const unsub = onSnapshot(collection(db, "matches", user.uid, "with"), async (snap) => {
      try {
        const meUid = user.uid;

        // Backfill missing fields for older match docs
        const patchPromises: Promise<any>[] = [];

        const base: BaseRow[] = snap.docs.map((d) => {
          const data = d.data() as MatchDoc;

          const otherUid = data.with || d.id;
          const computedChatId = data.chatId || chatIdFor(meUid, otherUid);

          const lastAt = data.lastAt || data.at || null;
          const lastText = (data.lastText || "").trim();
          const unread = Number(data.unread || 0);

          const patch: any = {};
          if (!data.with) patch.with = otherUid;
          if (!data.chatId) patch.chatId = computedChatId;
          if (!data.lastAt) patch.lastAt = data.at || serverTimestamp();
          if (data.lastText === undefined) patch.lastText = "";
          if (data.unread === undefined) patch.unread = 0;

          if (Object.keys(patch).length > 0) {
            patchPromises.push(setDoc(doc(db, "matches", meUid, "with", otherUid), patch, { merge: true }));
          }

          return {
            otherUid,
            chatId: computedChatId,
            lastText: lastText || "Tap to chat",
            lastAt,
            lastReadAt: data.lastReadAt || null,
            unread,
          };
        });

        if (patchPromises.length) {
          await Promise.allSettled(patchPromises);
        }

        // pull profiles
        const profSnaps = await Promise.all(base.map((r) => getDoc(doc(db, "users", r.otherUid))));
        const merged = base.map((r, i) => ({
          ...r,
          profile: profSnaps[i].exists() ? (profSnaps[i].data() as UserProfile) : undefined,
        }));

        setBaseRows(merged);
        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // For every match row, also listen to chats/{chatId} so lastText/lastAt update instantly
  useEffect(() => {
    const active = new Set(baseRows.map((r) => r.chatId));
    const subscriptions = chatUnsubs.current;

    // remove listeners we no longer need
    for (const chatId of Object.keys(subscriptions)) {
      if (!active.has(chatId)) {
        subscriptions[chatId]?.();
        delete subscriptions[chatId];
      }
    }

    // add listeners for new chatIds
    for (const chatId of active) {
      if (subscriptions[chatId]) continue;

      const unsub = onSnapshot(
        doc(db, "chats", chatId),
        (snap) => {
          if (!snap.exists()) return;
          const meta = snap.data() as ChatMeta;
          setChatMeta((prev) => ({ ...prev, [chatId]: meta }));
        },
        (err) => console.log("chat meta listen failed:", err)
      );

      subscriptions[chatId] = unsub;
    }

    // cleanup all on unmount
    return () => {
      for (const k of Object.keys(subscriptions)) {
        subscriptions[k]?.();
        delete subscriptions[k];
      }
    };
  }, [baseRows]);

  const rows = useMemo(() => {
    const merged = baseRows.map((r) => {
      const meta = chatMeta[r.chatId];

      const effectiveLastText = (meta?.lastText || r.lastText || "Tap to chat").trim() || "Tap to chat";
      const effectiveLastAt = meta?.lastAt || r.lastAt || null;

      // Unread indicator based on timestamps (works even if unread count isn't updated)
      const chatAt = toMs(effectiveLastAt);
      const readAt = toMs(r.lastReadAt);
      const isUnread = chatAt > 0 && chatAt > readAt;

      const storedUnread = Number(r.unread || 0);
      const displayUnread = storedUnread > 0 ? storedUnread : (isUnread ? 1 : 0);
      const badgeText = storedUnread > 0 ? String(storedUnread) : "•";

      return {
        ...r,
        lastText: effectiveLastText,
        lastAt: effectiveLastAt,
        _displayUnread: displayUnread,
        _badgeText: badgeText,
      };
    });

    merged.sort((a, b) => toMs(b.lastAt) - toMs(a.lastAt));
    return merged;
  }, [baseRows, chatMeta]);

  async function openChat(chatId: string, otherUid: string) {
    const me = auth.currentUser?.uid;
    if (!me) return;

    const realChatId = await ensureChat(me, otherUid);

    // reset unread + mark as read
    await setDoc(
      doc(db, "matches", me, "with", otherUid),
      { unread: 0, lastReadAt: serverTimestamp() },
      { merge: true }
    );

    router.push(`/chat/${realChatId}?otherUid=${otherUid}`);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "900" }}>Matches</Text>

      {rows.length === 0 ? (
        <Text style={{ opacity: 0.7 }}>No matches yet. Go create grammatical tension in Swipe.</Text>
      ) : (
        rows.map((r: any) => {
          const name = r.profile?.name?.trim() ? r.profile!.name! : "Anonymous";
          const when = relTime(r.lastAt);

          return (
            <Pressable
              key={r.otherUid}
              onPress={() => openChat(r.chatId, r.otherUid)}
              style={{ borderWidth: 1, borderColor: "#eee", borderRadius: 16, padding: 14, gap: 6 }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={{ fontWeight: "900", fontSize: 16 }}>{name}</Text>

                  {r._displayUnread > 0 ? (
                    <View style={{ backgroundColor: "#111", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ color: "white", fontWeight: "900", fontSize: 12 }}>{r._badgeText}</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={{ opacity: 0.6, fontSize: 12 }}>{when}</Text>
              </View>

              <Text style={{ opacity: 0.9 }}>{r.lastText}</Text>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}
