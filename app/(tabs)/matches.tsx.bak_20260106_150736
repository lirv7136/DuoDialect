import { useEffect, useState } from "react";
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
  unread?: number;
};

type Row = {
  otherUid: string;
  chatId: string;
  lastText: string;
  lastAt?: any;
  unread: number;
  profile?: UserProfile;
};

function relTime(ts: any) {
  if (!ts) return "";
  const ms =
    ts?.toMillis ? ts.toMillis()
    : ts?.toDate ? ts.toDate().getTime()
    : new Date(ts).getTime();

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
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    // IMPORTANT: no orderBy() here, so docs missing lastAt still appear.
    const unsub = onSnapshot(collection(db, "matches", user.uid, "with"), async (snap) => {
      try {
        const meUid = user.uid;

        // Backfill missing fields for older match docs (one-time per doc)
        const patchPromises: Promise<any>[] = [];

        const base: Row[] = snap.docs.map((d) => {
          const data = d.data() as MatchDoc;

          const otherUid = data.with || d.id;
          const computedChatId = data.chatId || chatIdFor(meUid, otherUid);

          const lastAt = data.lastAt || data.at || null;
          const lastText = (data.lastText || "").trim();
          const unread = Number(data.unread || 0);

          // Prepare patch if needed
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
            unread,
          };
        });

        // run patches in background (still awaited so state stays consistent)
        if (patchPromises.length) {
          await Promise.allSettled(patchPromises);
        }

        // pull profiles (MVP-friendly; later we’ll denormalize)
        const profSnaps = await Promise.all(base.map(r => getDoc(doc(db, "users", r.otherUid))));
        const merged = base.map((r, i) => ({
          ...r,
          profile: profSnaps[i].exists() ? (profSnaps[i].data() as UserProfile) : undefined,
        }));

        // sort client-side by lastAt (fallback 0)
        merged.sort((a, b) => {
          const atA = a.lastAt?.toMillis?.() ?? 0;
          const atB = b.lastAt?.toMillis?.() ?? 0;
          return atB - atA;
        });

        setRows(merged);
        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  async function openChat(chatId: string, otherUid: string) {
    const me = auth.currentUser?.uid;
    if (!me) return;

    await ensureChat(me, otherUid);

    // reset unread immediately
    await setDoc(
      doc(db, "matches", me, "with", otherUid),
      { unread: 0, lastReadAt: serverTimestamp() },
      { merge: true }
    );

    router.push(`/chat/${chatId}?otherUid=${otherUid}`);
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
        rows.map((r) => {
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
                  {r.unread > 0 ? (
                    <View style={{ backgroundColor: "#111", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ color: "white", fontWeight: "900", fontSize: 12 }}>{r.unread}</Text>
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
