/**
 * The city: type to search every city of 100,000 people or more, and every capital,
 * biggest first. A city decides who a person can see at all, so it sits above the free
 * text neighbourhood. With nothing typed, the chosen city shows with the biggest cities
 * in the device's time zone beside it as one-tap suggestions; a new profile starts on the
 * likeliest of those. Plain chips and a text field, the same on the web and on phones,
 * and never more than a handful of results at once.
 */
import { useMemo, useState } from "react";
import { Keyboard, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { cityById, cityLabel, citiesInTimeZone, searchCities, type City, type CityId } from "../src/domain/cities";
import { deviceTimeZone } from "../src/lib/time-zone";
import { Chip, ChipRow, Field } from "./ui";
import { colors, space, type } from "../constants/theme";

const RESULTS = 8;
const SUGGESTIONS = 3;

export function CityPicker({ value, onChange }: { value: CityId; onChange: (next: CityId) => void }) {
  const [query, setQuery] = useState("");
  const typed = query.trim();
  const selected = cityById(value);
  const results = useMemo(() => searchCities(typed, RESULTS), [typed]);
  const nearby = useMemo(() => citiesInTimeZone(deviceTimeZone(), SUGGESTIONS + 1), []);
  const shown = typed
    ? results
    : [...(selected ? [selected] : []), ...nearby.filter(city => city.id !== value)].slice(0, SUGGESTIONS + 1);

  function choose(city: City) {
    setQuery("");
    Keyboard.dismiss();
    if (city.id !== value) onChange(city.id);
  }

  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <Ionicons name="eye-outline" size={16} color={colors.text} />
        <Text accessibilityRole="header" style={type.label}>City</Text>
      </View>
      <Text style={type.caption}>You only see partners in your city.</Text>
      {shown.length ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={typed ? `Cities matching ${typed}` : "City"} style={{ paddingVertical: 2 }}>
          <ChipRow>
            {shown.map(city => (
              <Chip key={city.id} role="radio" label={cityLabel(city)} selected={city.id === value} onPress={() => choose(city)} />
            ))}
          </ChipRow>
        </View>
      ) : null}
      {typed && !results.length ? (
        <Text accessibilityLiveRegion="polite" style={type.caption}>{`No city matches “${typed}”. Try the nearest big city.`}</Text>
      ) : null}
      {!typed && !selected ? <Text style={type.caption}>Search for the city you’ll meet partners in.</Text> : null}
      <Field
        label={selected ? "Search all cities" : "Find your city"}
        icon="search-outline"
        value={query}
        onChangeText={setQuery}
        placeholder="City or country"
        maxLength={60}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="off"
        returnKeyType="search"
        onSubmitEditing={() => { if (results[0]) choose(results[0]); }}
        accessibilityHint="Type to search, then choose a city"
      />
      {typed ? <Text style={type.caption}>City list from GeoNames (CC BY 4.0).</Text> : null}
    </View>
  );
}
