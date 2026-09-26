import { Text, View } from "react-native";
import { DAY_PARTS, MAX_AVAILABILITY, WEEKDAYS } from "../src/domain/schedule";
import { Chip, ChipRow, styles } from "./ui";

/** Choose the day parts you can usually meet. Values match the backend availability strings. */
export function AvailabilityPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const toggle = (slot: string) => {
    if (value.includes(slot)) onChange(value.filter(item => item !== slot));
    else if (value.length < MAX_AVAILABILITY) onChange([...value, slot]);
  };
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={styles.label}>When can you usually meet?</Text>
      <Text style={styles.hint}>{`Choose up to ${MAX_AVAILABILITY}. Partners see the times you share. ${value.length} chosen.`}</Text>
      {[1, 2, 3, 4, 5, 6, 0].map(day => (
        <View key={day} style={{ gap: 4 }}>
          <Text style={styles.hint}>{WEEKDAYS[day]}</Text>
          <ChipRow>
            {DAY_PARTS.map(part => {
              const slot = `${WEEKDAYS[day]} ${part}`;
              return (
                <Chip
                  key={slot}
                  label={part[0].toUpperCase() + part.slice(1)}
                  accessibilityLabel={slot}
                  selected={value.includes(slot)}
                  onPress={() => toggle(slot)}
                />
              );
            })}
          </ChipRow>
        </View>
      ))}
    </View>
  );
}
