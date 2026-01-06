import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { auth, db } from "../../src/lib/firebase";
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

export default function Swipe() {
  const [me, setMe] = useState<UserProfile | null>(null);
  const [candidates, setCandidates] = useState<UserProfile[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  const current = candidates[idx] ?? null;

  const mySpeaks = useMemo(() => langSet(me?.speaks), [me]);
  const myLearns = useMemo(() => langSet(me?.learns), [me]);

  async function load() {
    const user = auth.currentUser;
    if (!user) return;

    setLoading(true);
    try {
      // Load my profile
      const meSnap = await getDoc(doc(db, "users", user.uid));
      const myProfile = meSnap.data() as UserProfile | undefined;
      if (!myProfile) {
        throw new Error("Your profile doc is missing. Try logging out/in.");
      }
      setMe(myProfile);

      // Load who I've already swiped on
      const swipedSnap = await getDocs(collection(db, "swipes", user.uid, "outgoing"));
      const swiped = new Set(swipedSnap.docs.map(d => d.id));

      // Load a batch of users and filter locally (simple + reliable)
      const usersSnap = await getDocs(query(collection(db, "users"), limit(50)));
      const all = usersSnap.docs.map(d => d.data() as UserProfile);

      const filtered = all
        .filter(p => p?.uid && p.uid !== user.uid)
        .filter(p => (p.speaks?.length ?? 0) > 0 && (p.learns?.length ?? 0) > 0)
        .filter(p => !swiped.has(p.uid));

      // Reciprocal language match:
      // They speak what I learn AND they learn what I speak
      const mineSpeaks = langSet(myProfile.speaks);
      const mineLearns = langSet(myProfile.learns);

      const good = filtered.filter(p => {
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

  useEffect(() => {
    load();
  }, []);

  async function swipe(decision: "like" | "pass") {
    const user = auth.currentUser;
    if (!user || !current) return;

    try {
      // Record my decision
      await setDoc(doc(db, "swipes", user.uid, "outgoing", current.uid), {
        to: current.uid,
        decision,
        at: serverTimestamp(),
      });

      // If I liked them, check if they already liked me -> match!
      if (decision === "like") {
        const theirs = await getDoc(doc(db, "swipes", current.uid, "outgoing", user.uid));
        const theirsDecision = (theirs.data() as any)?.decision;

        if (theirs.exists() && theirsDecision === "like") {
          await setDoc(doc(db, "matches", user.uid, "with", current.uid), {
            with: current.uid,
            at: serverTimestamp(),
          });
          await setDoc(doc(db, "matches", current.uid, "with", user.uid), {
            with: user.uid,
            at: serverTimestamp(),
          });

          Alert.alert("💥 Match!", "You both liked each other.");
        }
      }

      // Next card
      setIdx((i) => i + 1);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Swipe failed", e?.message ?? String(e));
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!me) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Text>Profile not loaded.</Text>
      </View>
    );
  }

  if (!current) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "700" }}>No more candidates</Text>
        <Text style={{ opacity: 0.7, textAlign: "center" }}>
          Either you’ve swiped everyone in this batch, or there aren’t many reciprocal matches yet.
        </Text>
        <Pressable onPress={load} style={{ backgroundColor: "#111", padding: 14, borderRadius: 12 }}>
          <Text style={{ color: "white", fontWeight: "600" }}>Reload</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 14 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Swipe</Text>

      <View style={{ borderWidth: 1, borderColor: "#eee", borderRadius: 18, padding: 18, gap: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>
          {current.name ?? "Anonymous"} 
        </Text>
        <Text style={{ opacity: 0.7 }}>uid: {current.uid}</Text>

        <Text style={{ fontWeight: "700", marginTop: 8 }}>They speak</Text>
        <Text style={{ opacity: 0.85 }}>
          {(current.speaks || []).map(x => `${x.lang} (${x.level})`).join(", ")}
        </Text>

        <Text style={{ fontWeight: "700", marginTop: 8 }}>They’re learning</Text>
        <Text style={{ opacity: 0.85 }}>
          {(current.learns || []).map(x => `${x.lang} (${x.level})`).join(", ")}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pressable
          onPress={() => swipe("pass")}
          style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#ddd" }}
        >
          <Text style={{ textAlign: "center", fontWeight: "700" }}>Pass</Text>
        </Pressable>

        <Pressable
          onPress={() => swipe("like")}
          style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: "#111" }}
        >
          <Text style={{ textAlign: "center", fontWeight: "700", color: "white" }}>Like</Text>
        </Pressable>
      </View>

      <Text style={{ opacity: 0.6, textAlign: "center" }}>
        Showing {idx + 1} / {candidates.length}
      </Text>
    </View>
  );
}
