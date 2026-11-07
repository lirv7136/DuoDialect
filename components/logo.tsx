/**
 * The split disc from the app icon: a deep ink half and a cream half on pool aqua, with an
 * ink divider between them (two people, one even conversation). On the sign-in screens the
 * halves drift in from either side and the divider settles between them.
 *
 * The motion uses entering animations, so the logo's resting state is the finished mark:
 * if an animation never runs (reduced motion, a throttled web view), the logo is simply
 * there rather than stuck invisible. Drawn as the aqua tile so the ink half never sits
 * directly on the deep water screen. Coordinates are the icon's own (1024 canvas).
 */
import { Platform, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, FadeInLeft, FadeInRight, ReduceMotion } from "react-native-reanimated";
import Svg, { G, Path, Rect } from "react-native-svg";
import { colors } from "../constants/theme";

const VIEW_BOX = "0 0 1024 1024";
/** The left half disc: a 316 radius circle centred on the canvas, cut 110 left of centre. */
const HALF = "M402 215.8 A316 316 0 0 0 402 808.2 Z";

const DRIFT = { duration: 900, easing: Easing.out(Easing.cubic) };

/**
 * On web, Reanimated hides an entering view until its animation starts, and in some browsers
 * (headless and throttled ones) it never starts, leaving an empty tile. The app ships on
 * phones; the web build is for testing, so it shows the finished mark without motion.
 */
const ANIMATE = Platform.OS !== "web";

function Layer({ part, size }: { part: "ink" | "cream" | "divider"; size: number }) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      {part === "ink" ? <Path d={HALF} fill={colors.onAccent} /> : null}
      {part === "cream" ? <G transform="matrix(-1 0 0 1 1024 0)"><Path d={HALF} fill={colors.onPrimary} /></G> : null}
      {part === "divider" ? <Rect x={474} y={322} width={76} height={380} rx={38} fill={colors.onAccent} /> : null}
    </Svg>
  );
}

export function Logo({ width = 104 }: { width?: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ width, height: width, borderRadius: width * 0.225, overflow: "hidden", backgroundColor: colors.accent }}>
      <Animated.View style={StyleSheet.absoluteFill}
        entering={ANIMATE ? FadeInLeft.duration(DRIFT.duration).easing(DRIFT.easing).reduceMotion(ReduceMotion.System) : undefined}>
        <Layer part="ink" size={width} />
      </Animated.View>
      <Animated.View style={StyleSheet.absoluteFill}
        entering={ANIMATE ? FadeInRight.duration(DRIFT.duration).easing(DRIFT.easing).reduceMotion(ReduceMotion.System) : undefined}>
        <Layer part="cream" size={width} />
      </Animated.View>
      <Animated.View style={StyleSheet.absoluteFill}
        entering={ANIMATE ? FadeIn.delay(650).duration(350).reduceMotion(ReduceMotion.System) : undefined}>
        <Layer part="divider" size={width} />
      </Animated.View>
    </View>
  );
}
