/**
 * Availability as a week grid: seven days by morning, afternoon and evening. Each cell is a
 * 48pt checkbox that screen readers announce as, for example, "Monday evening". Values
 * match the backend availability strings. Also exports the read-only dot grid.
 */
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { DAY_PARTS, MAX_AVAILABILITY } from "../src/domain/schedule";
import { availabilityGrid, dayPartIcon } from "../src/domain/display";
import { haptic } from "../src/lib/feel";
import { MAX_FONT_SCALE, TOUCH_TARGET, colors, fonts, radius, space, type } from "../constants/theme";

function Header() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <View style={{ width: 44 }} />
      {DAY_PARTS.map(part => (
        <View key={part} style={{ flex: 1, alignItems: "center" }} accessible accessibilityLabel={part}>
          <Ionicons name={dayPartIcon(part)} size={18} color={colors.muted} />
        </View>
      ))}
    </View>
  );
}

export function AvailabilityPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const toggle = (slot: string) => {
    haptic.selection();
    if (value.includes(slot)) onChange(value.filter(item => item !== slot));
    else if (value.length < MAX_AVAILABILITY) onChange([...value, slot]);
  };
  const full = value.length >= MAX_AVAILABILITY;
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text accessibilityRole="header" style={type.label}>When are you free?</Text>
        <View accessible accessibilityLabel={`${value.length} of ${MAX_AVAILABILITY} chosen`}
          style={{ backgroundColor: full ? colors.accentSoft : colors.surfaceNavySoft, borderRadius: radius.chip, paddingHorizontal: 10, paddingVertical: 2 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact}
            style={{ fontFamily: fonts.bold, fontSize: 13, color: full ? colors.accentInk : colors.primary }}>{`${value.length}/${MAX_AVAILABILITY}`}</Text>
        </View>
      </View>
      <Header />
      {availabilityGrid(value).map(row => (
        <View key={row.day} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text style={[type.label, { width: 44 }]} maxFontSizeMultiplier={MAX_FONT_SCALE.compact}>{row.short}</Text>
          {DAY_PARTS.map((part, index) => {
            const slot = `${row.day} ${part}`;
            const on = row.parts[index];
            return (
              <Pressable
                key={slot}
                accessibilityRole="checkbox"
                accessibilityLabel={slot}
                accessibilityState={{ checked: on, disabled: !on && full }}
                onPress={() => toggle(slot)}
                style={({ pressed }) => [{
                  flex: 1, minHeight: TOUCH_TARGET, borderRadius: 14, alignItems: "center", justifyContent: "center",
                  borderWidth: 1, borderColor: on ? colors.primary : colors.line,
                  backgroundColor: on ? colors.primary : colors.surface,
                  opacity: !on && full ? 0.5 : pressed ? 0.8 : 1,
                }]}
              >
                {on ? <Ionicons name="checkmark" size={20} color={colors.onPrimary} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Read-only 7×3 dots for a profile: filled aqua where the person is usually free. */
export function AvailabilityDots({ value }: { value: readonly string[] | undefined }) {
  const grid = availabilityGrid(value);
  const summary = (value ?? []).join(", ") || "No times chosen";
  return (
    <View accessible accessibilityLabel={`Usually free: ${summary}`} style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <View style={{ width: 20 }} />
        {grid.map(row => (
          <Text key={row.day} style={[type.caption, { flex: 1, textAlign: "center", fontSize: 12 }]} maxFontSizeMultiplier={MAX_FONT_SCALE.compact}>
            {row.short.slice(0, 1)}
          </Text>
        ))}
      </View>
      {DAY_PARTS.map((part, index) => (
        <View key={part} style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <View style={{ width: 20, alignItems: "center" }}><Ionicons name={dayPartIcon(part)} size={14} color={colors.muted} /></View>
          {grid.map(row => (
            <View key={row.day} style={{ flex: 1, alignItems: "center" }}>
              <View style={{
                width: 16, height: 16, borderRadius: 8,
                backgroundColor: row.parts[index] ? colors.accent : colors.surface,
                borderWidth: row.parts[index] ? 0 : 1, borderColor: colors.line,
              }} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
