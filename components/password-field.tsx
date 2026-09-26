import { useState } from "react";
import { View, type TextInputProps } from "react-native";
import { Button, Field } from "./ui";

/** A password input with a show or hide toggle that screen readers can operate. */
export function PasswordField({ label, hint, ...input }: TextInputProps & { label: string; hint?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <Field
        label={label}
        hint={hint}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        {...input}
      />
      <Button
        variant="ghost"
        label={visible ? "Hide password" : "Show password"}
        accessibilityLabel={visible ? "Hide password" : "Show password"}
        onPress={() => setVisible(current => !current)}
        style={{ alignSelf: "flex-end" }}
      />
    </View>
  );
}
