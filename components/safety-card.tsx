import { Text, View } from "react-native";
import { Button, Card, Heading, styles } from "./ui";
import { colors, space } from "../constants/theme";

export const SAFETY_POINTS = [
  "Meet somewhere public and busy, like a café or library.",
  "Tell a friend where you’ll be and who you’re meeting.",
  "You can leave any time, and it’s fine to say it isn’t working.",
  "Never share your home address or money details.",
] as const;

/** Short guidance for meeting a language partner. Reused in Plans, chat and Profile. */
export function SafetyCard({ onDismiss, title = "Meeting safely" }: { onDismiss?: () => void; title?: string }) {
  return (
    <Card style={{ backgroundColor: colors.pale }}>
      <Heading>{title}</Heading>
      <View style={{ gap: space.xs }} accessibilityRole="list">
        {SAFETY_POINTS.map(point => (
          <Text key={point} style={styles.body}>{`•  ${point}`}</Text>
        ))}
      </View>
      <Text style={styles.hint}>
        If someone makes you uncomfortable, report or block them from their profile, or from the ⋯ menu in your chat.
      </Text>
      {onDismiss ? <Button variant="ghost" label="Got it" accessibilityLabel="Dismiss meeting safely tips" onPress={onDismiss} /> : null}
    </Card>
  );
}
