/**
 * A native date or time picker that reads and writes the stored string formats
 * (YYYY-MM-DD, HH:mm). The web build keeps a plain text field.
 */
import { useState } from "react";
import { Platform, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { dateFromLocalDate, dateFromLocalTime, formatLongDate, toLocalDateString, toLocalTimeString } from "../src/domain/date-bounds";
import { formatLocalDate } from "../src/domain/schedule";
import { Button, Field, styles } from "./ui";
import { space } from "../constants/theme";

type Props = {
  mode: "date" | "time";
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Where the picker opens when nothing is chosen yet. */
  initial: Date;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Long dates suit a birth date; short weekday dates suit a meetup. */
  dateStyle?: "long" | "short";
  placeholder?: string;
  autoComplete?: "birthdate-full";
};

export function DateTimeField({ mode, label, value, onChange, initial, minimumDate, maximumDate, dateStyle = "short", placeholder, autoComplete }: Props) {
  const [open, setOpen] = useState(false);

  if (Platform.OS === "web") {
    return (
      <Field
        label={label}
        hint={mode === "date" ? "YYYY-MM-DD" : "24-hour HH:mm"}
        value={value}
        onChangeText={onChange}
        maxLength={mode === "date" ? 10 : 5}
        keyboardType="numbers-and-punctuation"
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
    );
  }

  const parsed = mode === "date" ? dateFromLocalDate(value) : dateFromLocalTime(value);
  const current = parsed ?? initial;
  const serialise = (date: Date) => (mode === "date" ? toLocalDateString(date) : toLocalTimeString(date));
  const shown = !parsed ? null : mode === "time" ? value : dateStyle === "long" ? formatLongDate(value) : formatLocalDate(value);
  const empty = mode === "date" ? "Choose a date" : "Choose a time";

  function onPress() {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current, mode, is24Hour: true, minimumDate, maximumDate,
        onChange: (event: DateTimePickerEvent, date?: Date) => { if (event.type === "set" && date) onChange(serialise(date)); },
      });
      return;
    }
    // iOS shows the wheel inline. What's on the wheel is what's stored, even before it moves.
    if (!open && !parsed) onChange(serialise(initial));
    setOpen(current => !current);
  }

  return (
    <View style={{ gap: space.xs }}>
      <Text style={styles.label}>{label}</Text>
      <Button
        label={shown ?? empty}
        accessibilityLabel={`${label}: ${shown ?? "not chosen"}`}
        hint={Platform.OS === "ios" && open ? "Closes the picker" : `Opens a ${mode} picker`}
        onPress={onPress}
        style={{ justifyContent: "flex-start" }}
      />
      {Platform.OS === "ios" && open ? (
        <View>
          <DateTimePicker
            value={current}
            mode={mode}
            display="spinner"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            minuteInterval={mode === "time" ? 5 : undefined}
            onChange={(_event: DateTimePickerEvent, date?: Date) => { if (date) onChange(serialise(date)); }}
          />
          <Button variant="ghost" label="Done" onPress={() => setOpen(false)} style={{ alignSelf: "flex-end" }} />
        </View>
      ) : null}
    </View>
  );
}
