/**
 * The two-bubble mark from the app icon. On the sign-in screens the bubbles drift in
 * from either side and settle into their overlap; under reduced motion they are simply
 * there. Coordinates are the icon's own (1024 canvas), cropped by the viewBox.
 */
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { ClipPath, Defs, Ellipse, G, Polygon } from "react-native-svg";
import { colors } from "../constants/theme";

const VIEW_BOX = "170 255 690 545";
const RATIO = 545 / 690;

function Layer({ part, width }: { part: "cream" | "coral" | "overlap"; width: number }) {
  return (
    <Svg width={width} height={width * RATIO} viewBox={VIEW_BOX}>
      {part === "cream" ? (
        <G fill={colors.onPrimary}>
          <Ellipse cx={404} cy={470} rx={230} ry={208} />
          <Polygon points="255,622 230,710 328,666" />
        </G>
      ) : null}
      {part === "coral" ? (
        <G fill={colors.accent}>
          <Ellipse cx={620} cy={553} rx={230} ry={208} />
          <Polygon points="770,705 795,795 697,750" />
        </G>
      ) : null}
      {part === "overlap" ? (
        <>
          <Defs>
            <ClipPath id="talkeven-logo-coral"><Ellipse cx={620} cy={553} rx={230} ry={208} /></ClipPath>
          </Defs>
          <Ellipse cx={404} cy={470} rx={230} ry={208} fill="#ffd3c3" clipPath="url(#talkeven-logo-coral)" />
        </>
      ) : null}
    </Svg>
  );
}

export function Logo({ width = 132 }: { width?: number }) {
  const reduce = useReducedMotion();
  const drift = useSharedValue(reduce ? 1 : 0);
  const overlap = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) { drift.value = 1; overlap.value = 1; return; }
    drift.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
    overlap.value = withDelay(650, withTiming(1, { duration: 350 }));
  }, [reduce, drift, overlap]);
  const cream = useAnimatedStyle(() => ({ opacity: drift.value, transform: [{ translateX: -28 * (1 - drift.value) }] }));
  const coral = useAnimatedStyle(() => ({ opacity: drift.value, transform: [{ translateX: 28 * (1 - drift.value) }] }));
  const tint = useAnimatedStyle(() => ({ opacity: overlap.value }));
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width, height: width * RATIO }}>
      <Animated.View style={[StyleSheet.absoluteFill, cream]}><Layer part="cream" width={width} /></Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, coral]}><Layer part="coral" width={width} /></Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, tint]}><Layer part="overlap" width={width} /></Animated.View>
    </View>
  );
}
