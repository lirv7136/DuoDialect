import { useState } from "react";
import { View, type TextInputProps } from "react-native";
import { Field, IconButton } from "./ui";
import { colors } from "../constants/theme";

/** A password input with a show or hide eye that screen readers can operate. */
export function PasswordField({ label, hint, onDark, ...input }: TextInputProps & { label: string; hint?: string; onDark?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <Field
        label={label}
        hint={hint}
        onDark={onDark}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        {...input}
        style={{ paddingRight: 52 }}
      />
      <View style={{ position: "absolute", right: 0, bottom: 0 }}>
        <IconButton icon={visible ? "eye-off-outline" : "eye-outline"} label={visible ? "Hide password" : "Show password"}
          onPress={() => setVisible(current => !current)} color={colors.muted} size={22} />
      </View>
    </View>
  );
}
