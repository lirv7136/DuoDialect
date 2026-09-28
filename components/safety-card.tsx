import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SAFETY_FOOTNOTE, SAFETY_TIPS } from "../src/domain/safety-copy";
import { Button, Card, Heading, styles } from "./ui";
import { colors, space } from "../constants/theme";

export const SAFETY_POINTS = SAFETY_TIPS.map(tip => tip.text);

/** Four short habits for meeting a language partner. Reused in Plans, chat and Meeting safely. */
export function SafetyCard({ onDismiss, title = "Meeting safely", footnote = true }: { onDismiss?: () => void; title?: string; footnote?: boolean }) {
  return (
    <Card style={{ backgroundColor: colors.surfaceNavySoft, borderColor: colors.surfaceNavySoft }}>
      <Heading>{title}</Heading>
      <View style={{ gap: space.sm }} accessibilityRole="list">
        {SAFETY_TIPS.map(tip => (
          <View key={tip.text} style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={tip.icon} size={18} color={colors.primary} />
            </View>
            <Text style={[styles.body, { flexShrink: 1 }]}>{tip.text}</Text>
          </View>
        ))}
      </View>
      {footnote ? <Text style={styles.hint}>{SAFETY_FOOTNOTE}</Text> : null}
      {onDismiss ? <Button variant="ghost" label="Got it" accessibilityLabel="Dismiss meeting safely tips" onPress={onDismiss} /> : null}
    </Card>
  );
}
