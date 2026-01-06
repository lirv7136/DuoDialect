import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";
import { auth, db } from "../../src/lib/firebase";
import { ensureChat, chatIdFor } from "../../src/lib/chat";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

type UserLang = { lang: string; level: string };
type UserProfile = {
  uid: string;
  name?: string;
  bio?: string;
  speaks: UserLang[];
  learns: UserLang[];
};

function norm(s: string) {
  return (s || "").trim().toLowerCase();
}
function langSet(arr?: UserLang[]) {
  return new Set((arr || []).map(x => norm(x.lang)).filter(Boolean));
}
function intersects(a: Set<string>, b: Set<string>) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}
function intersectList(a: Set<string>, b: Set<string>) {
  const out: string[] = [];
  for (const x of a) if (b.has(x)) out.push(x);
  out.sort();
  return out;
}

const { width: SCREEN_W } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_W * 0.25;

export default function Swipe() {
  const [me, setMe] = useState<UserProfile | null>(null);
  const [candidates, setCandidates] = useState<UserProfile[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const current = candidates[idx] ?? null;

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const rotate = pan.x.interpolate({
    inputRange: [-SCREEN_W, 0, SCREEN_W],
    outputRange: ["-12deg", "0deg", "12deg"],
  });

  const likeOpacity = pan.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const passOpacity = pan.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const cardStyle = {
    transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }],
  } as const;

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => {
        if (busy || !current) return false;
        return Math.abs(gesture.dx) > 6 && Math.abs(gesture.dy) < 60;
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_evt, gesture) => {
        if (busy || !current) {
          pan.setValue({ x: 0, y: 0 });
          return;
        }
        if (gesture.dx > SWIPE_THRESHOLD) forceSwipe("like", 1, gesture.dy);
        else if (gesture.dx < -SWIPE_THRESHOLD) forceSwipe("pass", -1, gesture.dy);
        else resetCard();
      },
      onPanResponderTerminate: () => resetCard(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, current]);

  function resetCard() {
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      friction: 6,
      tension: 80,
    }).start();
  }

  function forceSwipe(decision: "like" | "pass", dir: 1 | -1, dy: number) {
    Animated.timing(pan, {
      toValue: { x: dir * SCREEN_W * 1.2, y: dy * 0.2 },
      duration: 160,
      useNativeDriver: false,
    }).start(() => {
      pan.setValue({ x: 0, y: 0 });
      void swipe(decision);
    });
  }

  async function load() {
    const user = auth.currentUser;
    if (!user) return;

    setLoading(true);
    try {
      const meSnap = await getDoc(doc(db, "users", user.uid));
      const myProfile = meSnap.data() as UserProfile | undefined;
      if (!myProfile) throw new Error("Your profile doc is missing.");
      setMe(myProfile);

      const swipedSnap = await getDocs(collection(db, "swipes", user.uid, "outgoing"));
      const swiped = new Set(swipedSnap.docs.map(d => d.id));

      const blockedSnap = await getDocs(collection(db, "blocks", user.uid, "users"));
      const blocked = new Set(blockedSnap.docs.map(d => d.id));

      const usersSnap = await getDocs(query(collection(db, "users"), limit(50)));
      const all = usersSnap.docs.map(d => d.data() as UserProfile);

      const mineSpeaks = langSet(myProfile.speaks);
      const mineLearns = langSet(myProfile.learns);

      const good = all
        .filter(p => p?.uid && p.uid !== user.uid)
        .filter(p => (p.speaks?.length ?? 0) > 0 && (p.learns?.length ?? 0) > 0)
        .filter(p => !swiped.has(p.uid)).filter(p => !blocked.has(p.uid))
        .filter(p => {
          const theirSpeaks = langSet(p.speaks);
          const theirLearns = langSet(p.learns);
          return intersects(mineLearns, theirSpeaks) && intersects(mineSpeaks, theirLearns);
        });

      setCandidates(good);
      setIdx(0);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Swipe load failed", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function swipe(decision: "like" | "pass") {
    const user = auth.currentUser;
    if (!user || !current || busy) return;

    setBusy(true);
    try {
      await setDoc(doc(db, "swipes", user.uid, "outgoing", current.uid), {
        to: current.uid,
        decision,
        at: serverTimestamp(),
      });

      if (decision === "like") {
        const theirs = await getDoc(doc(db, "swipes", current.uid, "outgoing", user.uid));
        const theirsDecision = (theirs.data() as any)?.decision;

        if (theirs.exists() && theirsDecision === "like") {
          const cid = chatIdFor(user.uid, current.uid);
          await ensureChat(user.uid, current.uid);

          await setDoc(doc(db, "matches", user.uid, "with", current.uid), {
            with: current.uid,
            chatId: cid,
            at: serverTimestamp(),
            lastText: "",
            lastAt: serverTimestamp(),
            unread: 0,
          });

          await setDoc(doc(db, "matches", current.uid, "with", user.uid), {
            with: user.uid,
            chatId: cid,
            at: serverTimestamp(),
            lastText: "",
            lastAt: serverTimestamp(),
            unread: 0,
          });


          Alert.alert("💥 Match!", "Matches → tap to chat.");
        }
      }

      setIdx(i => i + 1);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Swipe failed", e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><ActivityIndicator /></View>;
  }

  if (!me) {
    return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><Text>Profile not loaded.</Text></View>;
  }

  if (!current) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "900" }}>No candidates</Text>
        <Text style={{ opacity: 0.7, textAlign: "center" }}>
          Try creating another test account with reciprocal languages.
        </Text>
        <Pressable onPress={load} style={{ backgroundColor: "#111", padding: 14, borderRadius: 12 }}>
          <Text style={{ color: "white", fontWeight: "900" }}>Reload</Text>
        </Pressable>
      </View>
    );
  }

  const mineSpeaks = langSet(me.speaks);
  const mineLearns = langSet(me.learns);
  const theirSpeaks = langSet(current.speaks);
  const theirLearns = langSet(current.learns);

  const learnMatch = intersectList(mineLearns, theirSpeaks);
  const speakMatch = intersectList(mineSpeaks, theirLearns);

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 22, fontWeight: "900" }}>Swipe</Text>
        <Pressable
          disabled={busy}
          onPress={load}
          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#ddd", opacity: busy ? 0.6 : 1 }}
        >
          <Text style={{ fontWeight: "900" }}>Reload</Text>
        </Pressable>
      </View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          { borderWidth: 1, borderColor: "#eee", borderRadius: 18, padding: 18, gap: 8, backgroundColor: "white" },
          cardStyle,
        ]}
      >
        <Animated.View style={{ position: "absolute", top: 14, left: 14, opacity: passOpacity }}>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>PASS</Text>
        </Animated.View>
        <Animated.View style={{ position: "absolute", top: 14, right: 14, opacity: likeOpacity }}>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>LIKE</Text>
        </Animated.View>

        <Text style={{ fontSize: 18, fontWeight: "900" }}>
          {current.name?.trim() ? current.name : "Anonymous"}
        </Text>
        {current.bio?.trim() ? <Text style={{ opacity: 0.75 }}>{current.bio}</Text> : null}

        <Text style={{ fontWeight: "900", marginTop: 8 }}>Why you match</Text>
        <Text style={{ opacity: 0.85 }}>
          You learn ↔ they speak: {learnMatch.length ? learnMatch.join(", ") : "—"}
        </Text>
        <Text style={{ opacity: 0.85 }}>
          You speak ↔ they learn: {speakMatch.length ? speakMatch.join(", ") : "—"}
        </Text>

        <Text style={{ fontWeight: "900", marginTop: 8 }}>They speak</Text>
        <Text>{(current.speaks || []).map(x => `${x.lang} (${x.level})`).join(", ")}</Text>

        <Text style={{ fontWeight: "900", marginTop: 8 }}>They’re learning</Text>
        <Text>{(current.learns || []).map(x => `${x.lang} (${x.level})`).join(", ")}</Text>
      </Animated.View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pressable
          disabled={busy}
          onPress={() => swipe("pass")}
          style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#ddd", opacity: busy ? 0.6 : 1 }}
        >
          <Text style={{ textAlign: "center", fontWeight: "900" }}>Pass</Text>
        </Pressable>
        <Pressable
          disabled={busy}
          onPress={() => swipe("like")}
          style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: "#111", opacity: busy ? 0.6 : 1 }}
        >
          <Text style={{ textAlign: "center", fontWeight: "900", color: "white" }}>Like</Text>
        </Pressable>
      </View>

      <Text style={{ opacity: 0.6, textAlign: "center" }}>
        Showing {idx + 1} / {candidates.length}
      </Text>
    </View>
  );
}
