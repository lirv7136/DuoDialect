/**
 * Onboarding progress: a segmented deep water bar, "1 of 2", and a back chevron. The current
 * segment fills with a spring (instantly under reduced motion).
 */
import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { colors, space, type } from "../constants/theme";
import { IconButton } from "./ui";

function Segment({ state }: { state: "done" | "current" | "todo" }) {
  const fill = useSharedValue(state === "done" ? 1 : 0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const target = state === "todo" ? 0 : 1;
    fill.value = reduce ? target : withSpring(target, { damping: 16, stiffness: 120 });
  }, [state, reduce, fill]);
  const width = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceNavySoft, overflow: "hidden" }}>
      <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: colors.primary }, width]} />
    </View>
  );
}

export function StepIndicator({ step, total, onBack }: { step: number; total: number; onBack?: () => void }) {
  return (
    <View
      accessible={!onBack}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}`}
      accessibilityValue={{ min: 1, max: total, now: step }}
      style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48 }}
    >
      {onBack ? <View style={{ marginLeft: -12 }}><IconButton icon="chevron-back" label="Back" onPress={onBack} /></View> : null}
      <View style={{ flex: 1, flexDirection: "row", gap: 6 }}>
        {Array.from({ length: total }, (_, index) => (
          <Segment key={index} state={index + 1 < step ? "done" : index + 1 === step ? "current" : "todo"} />
        ))}
      </View>
      <Text style={type.caption}>{`${step} of ${total}`}</Text>
    </View>
  );
}
