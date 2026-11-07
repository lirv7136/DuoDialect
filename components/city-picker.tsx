/**
 * One scrolling row of city chips. A city decides who a person can see at all, so it
 * sits above the free text neighbourhood and is never left blank: the draft starts on
 * the launch city and a tap moves it.
 */
import { ScrollView, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CITIES, type CityId } from "../src/domain/cities";
import { Chip } from "./ui";
import { colors, space, type } from "../constants/theme";

export function CityPicker({ value, onChange }: { value: CityId; onChange: (next: CityId) => void }) {
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <Ionicons name="eye-outline" size={16} color={colors.text} />
        <Text accessibilityRole="header" style={type.label}>City</Text>
      </View>
      <Text style={type.caption}>You only see partners in your city.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        accessibilityRole="radiogroup" contentContainerStyle={{ gap: space.xs, paddingVertical: 2 }}>
        {CITIES.map(city => (
          <Chip key={city.id} role="radio" label={city.name} selected={city.id === value}
            onPress={() => { if (city.id !== value) onChange(city.id); }} />
        ))}
      </ScrollView>
    </View>
  );
}
