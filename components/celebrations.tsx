/**
 * Celebrations for real-world outcomes only: an invitation accepted, and a person's first
 * confirmed meetup. Motion is skipped under reduced motion; the success haptic stays.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming, type SharedValue,
} from "react-native-reanimated";
import { haptic } from "../src/lib/feel";
import type { ProfilePhoto } from "../src/domain/photos";
import { colors, fonts, space, type } from "../constants/theme";
import { Avatar } from "./avatar";
import { Sheet } from "./sheet";
import { Button } from "./ui";

type Person = { name: string; photos?: ProfilePhoto[] | null };

const AVATAR = 88;

/** Two avatar bubbles that slide in from either side and overlap, like the logo. */
function MeetingBubbles({ me, them, visible }: { me: Person; them: Person; visible: boolean }) {
  const reduce = useReducedMotion();
  const together = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!visible) { together.value = reduce ? 1 : 0; return; }
    together.value = reduce ? 1 : withDelay(150, withSpring(1, { damping: 12, stiffness: 110 }));
  }, [visible, reduce, together]);
  const left = useAnimatedStyle(() => ({ transform: [{ translateX: -56 * (1 - together.value) }, { rotate: `${-6 * together.value}deg` }] }));
  const right = useAnimatedStyle(() => ({ transform: [{ translateX: 56 * (1 - together.value) }, { rotate: `${6 * together.value}deg` }] }));
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
      style={{ flexDirection: "row", justifyContent: "center", paddingVertical: space.md }}>
      <Animated.View style={[left, { marginRight: -18, zIndex: 1 }]}><Avatar name={me.name} photos={me.photos} size={AVATAR} /></Animated.View>
      <Animated.View style={[right, { borderRadius: 27, borderBottomLeftRadius: 9, borderWidth: 3, borderColor: colors.accent }]}>
        <Avatar name={them.name} photos={them.photos} size={AVATAR} />
      </Animated.View>
    </View>
  );
}

/** Shown when an invitation becomes a plan, from either side. One action: Open chat. */
export function AcceptedSheet({ visible, me, them, when, onOpenChat, onClose, confetti = false }: {
  visible: boolean;
  me: Person;
  them: Person;
  /** "Thu 2 Oct · 18:00" */
  when?: string;
  onOpenChat?: () => void;
  onClose: () => void;
  /** Also play the first-meetup confetti inside the sheet. */
  confetti?: boolean;
}) {
  useEffect(() => { if (visible) haptic.success(); }, [visible]);
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View>
        <MeetingBubbles me={me} them={them} visible={visible} />
        {visible && confetti ? <BubbleConfetti /> : null}
      </View>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite"
        style={{ fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: colors.primary, textAlign: "center" }}>
        {`You’re meeting ${them.name || "your partner"}`}
      </Text>
      {when ? <Text style={[type.caption, { textAlign: "center", fontSize: 15 }]}>{when}</Text> : null}
      {onOpenChat ? <Button variant="primary" icon="chatbubbles-outline" label="Open chat" onPress={onOpenChat} /> : null}
      <Button variant="ghost" label={onOpenChat ? "Later" : "Done"} onPress={onClose} />
    </Sheet>
  );
}

// Deterministic "random" values, so rendering stays pure.
const seeded = (index: number, salt: number) => {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const PALETTE = [colors.primary, colors.accent, colors.onPrimary, colors.accent, colors.primary];

function Particle({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const shape = useMemo(() => ({
    dx: (seeded(index, 1) - 0.5) * 320,
    up: -(220 + seeded(index, 2) * 200),
    size: 10 + Math.round(seeded(index, 3) * 12),
    spin: (seeded(index, 4) - 0.5) * 540,
    color: PALETTE[index % PALETTE.length],
  }), [index]);
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3,
      transform: [
        { translateX: shape.dx * p },
        { translateY: shape.up * p + 560 * p * p },
        { rotate: `${shape.spin * p}deg` },
        { scale: 0.5 + Math.min(1, p * 4) * 0.5 },
      ],
    };
  });
  return (
    <Animated.View
      style={[{
        position: "absolute", width: shape.size, height: shape.size, backgroundColor: shape.color,
        borderRadius: shape.size / 2, borderBottomLeftRadius: 2,
        borderWidth: shape.color === colors.onPrimary ? 1 : 0, borderColor: colors.line,
      }, style]}
    />
  );
}

/**
 * A single burst of navy, coral and cream speech bubbles from the centre of its parent.
 * Built from Reanimated views rather than a confetti package; renders nothing under
 * reduced motion.
 */
export function BubbleConfetti({ count = 22, onDone }: { count?: number; onDone?: () => void }) {
  const reduce = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reduce) { onDone?.(); return; }
    progress.value = withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }, finished => {
      if (finished && onDone) runOnJS(onDone)();
    });
  }, [reduce, progress, onDone]);
  if (reduce) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
      {Array.from({ length: count }, (_, index) => <Particle key={index} index={index} progress={progress} />)}
    </View>
  );
}

const firstMeetupKey = (uid: string) => `celebrated.firstMeetup.v1.${uid}`;

/**
 * Whether this person's first confirmed meetup still needs its confetti. Remembered per
 * account on this install, so it plays once. `null` until read.
 */
export function useFirstMeetupCelebration(uid: string) {
  const [due, setDue] = useState<boolean | null>(null);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    AsyncStorage.getItem(firstMeetupKey(uid))
      .then(value => { if (live) setDue(value !== "1"); })
      .catch(() => { if (live) setDue(false); });
    return () => { live = false; };
  }, [uid]);
  const markDone = useCallback(() => {
    setDue(false);
    if (uid) void AsyncStorage.setItem(firstMeetupKey(uid), "1").catch(() => undefined);
  }, [uid]);
  return { due, markDone };
}
