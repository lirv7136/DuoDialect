/**
 * Empty states: two overlapping speech bubbles (the logo's motif) holding one simple
 * object, a Fraunces headline, at most one caption line, and one action. The art floats
 * slowly unless the person has asked for reduced motion.
 */
import { useEffect, type ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, ClipPath, Defs, Line, Path, Rect } from "react-native-svg";
import { MAX_FONT_SCALE, colors, fonts, space, type } from "../constants/theme";

export type EmptyArt = "search" | "calendar" | "chat" | "none";

function Bubbles({ art, size }: { art: Exclude<EmptyArt, "none">; size: number }) {
  const cream = colors.onPrimary;
  const ink = colors.onAccent;
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Back bubble, deep water, tail bottom left. */}
      <Rect x={12} y={26} width={92} height={70} rx={32} fill={colors.primary} />
      <Path d="M30 86 L20 110 L52 94 Z" fill={colors.primary} />
      {/* Front bubble, pool aqua, tail bottom right. */}
      <Rect x={56} y={58} width={92} height={70} rx={32} fill={colors.accent} />
      <Path d="M128 118 L142 140 L110 126 Z" fill={colors.accent} />
      {/* The overlap, in pale aqua: the back bubble clipped to the front one. Objects on aqua are ink, never cream alone (2.79:1). */}
      <Defs>
        <ClipPath id="talkeven-front-bubble">
          <Rect x={56} y={58} width={92} height={70} rx={32} />
        </ClipPath>
      </Defs>
      <Rect x={12} y={26} width={92} height={70} rx={32} fill={colors.accentSoft} clipPath="url(#talkeven-front-bubble)" />
      {art === "search" ? (
        <>
          <Circle cx={100} cy={90} r={15} stroke={ink} strokeWidth={6} fill="none" />
          <Line x1={111} y1={101} x2={124} y2={114} stroke={ink} strokeWidth={7} strokeLinecap="round" />
        </>
      ) : null}
      {art === "calendar" ? (
        <>
          <Rect x={82} y={76} width={40} height={36} rx={7} fill={cream} />
          <Rect x={82} y={76} width={40} height={11} rx={5} fill={colors.primary} />
          <Line x1={92} y1={71} x2={92} y2={80} stroke={colors.primary} strokeWidth={4} strokeLinecap="round" />
          <Line x1={112} y1={71} x2={112} y2={80} stroke={colors.primary} strokeWidth={4} strokeLinecap="round" />
          <Circle cx={93} cy={97} r={3.5} fill={colors.accent} />
          <Circle cx={102} cy={97} r={3.5} fill={colors.primary} />
          <Circle cx={111} cy={97} r={3.5} fill={colors.primary} />
        </>
      ) : null}
      {art === "chat" ? (
        <>
          <Circle cx={86} cy={93} r={6} fill={ink} />
          <Circle cx={103} cy={93} r={6} fill={ink} />
          <Circle cx={120} cy={93} r={6} fill={ink} />
        </>
      ) : null}
    </Svg>
  );
}

/** The illustration alone, floating gently. */
export function BubbleArt({ art, size = 160 }: { art: Exclude<EmptyArt, "none">; size?: number }) {
  const reduce = useReducedMotion();
  const lift = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    lift.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(lift);
  }, [reduce, lift]);
  const floating = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * lift.value }] }));
  return <Animated.View style={floating}><Bubbles art={art} size={size} /></Animated.View>;
}

export function EmptyState({ title, body, art = "none", children }: { title: string; body?: string; art?: EmptyArt; children?: ReactNode }) {
  return (
    <View style={{ alignItems: "center", gap: space.md, paddingVertical: space.xl }}>
      {art !== "none" ? <BubbleArt art={art} /> : null}
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.display}
        style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.primary, textAlign: "center" }}>
        {title}
      </Text>
      {body ? <Text style={[type.caption, { fontSize: 15, lineHeight: 21, textAlign: "center" }]}>{body}</Text> : null}
      {children ? <View style={{ alignSelf: "stretch", gap: space.sm, marginTop: space.xs }}>{children}</View> : null}
    </View>
  );
}
