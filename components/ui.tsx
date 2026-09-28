/**
 * Small shared building blocks. Every control has an accessibility role and label,
 * a touch target of at least 48dp, and no fixed text heights, so layouts grow with the
 * system font size instead of clipping.
 */
import type { ReactElement, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { colors, space, TOUCH_TARGET } from "../constants/theme";

export function Screen({ children, scroll = true, edges = ["top"], refreshControl }: {
  children: ReactNode; scroll?: boolean; edges?: Edge[]; refreshControl?: ReactElement<RefreshControlProps>;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll
        ? <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>{children}</ScrollView>
        : <View style={[styles.scrollContent, { flex: 1 }]}>{children}</View>}
    </SafeAreaView>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={styles.title}>{children}</Text>;
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={styles.heading}>{children}</Text>;
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && { color: colors.muted }]}>{children}</Text>;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  hint?: string;
  accessibilityLabel?: string;
  style?: ViewStyle;
};

export function Button({ label, onPress, variant = "secondary", disabled, busy, busyLabel, hint, accessibilityLabel, style }: ButtonProps) {
  const inactive = disabled || busy;
  const filled = variant === "primary" || variant === "danger";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && { backgroundColor: colors.primary, borderColor: colors.primary },
        variant === "danger" && { backgroundColor: colors.danger, borderColor: colors.danger },
        variant === "ghost" && { borderColor: "transparent", backgroundColor: "transparent" },
        inactive && { opacity: 0.55 },
        pressed && !inactive && { opacity: 0.8 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={filled ? colors.onPrimary : colors.primary} /> : null}
      <Text style={[styles.buttonText, filled && { color: colors.onPrimary }, variant === "ghost" && { color: colors.primary }]}>
        {busy && busyLabel ? busyLabel : label}
      </Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, role = "checkbox", accessibilityLabel }: {
  label: string; selected: boolean; onPress: () => void; role?: "checkbox" | "radio"; accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      hitSlop={4}
      style={[styles.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
    >
      <Text style={[styles.chipText, selected && { color: colors.onPrimary }]}>{selected ? `✓ ${label}` : label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

export function Field({ label, hint, ...input }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.muted}
        {...input}
        style={[styles.input, input.multiline && { minHeight: 96, textAlignVertical: "top" }, input.style]}
      />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "good" | "warn" }) {
  return (
    <View style={[styles.pill, tone === "good" && { backgroundColor: colors.surfaceNavySoft }, tone === "warn" && { backgroundColor: colors.accentSoft }]}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <Card style={{ alignItems: "stretch", gap: space.md }}>
      <Heading>{title}</Heading>
      <Body muted>{body}</Body>
      {children}
    </Card>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? <Button label="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} accessibilityLabel={label} />
      <Text style={styles.hint}>{label}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  eyebrow: { color: colors.accentInk, fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 28, fontWeight: "700" },
  heading: { color: colors.text, fontSize: 20, fontWeight: "700" },
  body: { color: colors.text, fontSize: 16, lineHeight: 22 },
  label: { color: colors.text, fontSize: 15, fontWeight: "700" },
  hint: { color: colors.muted, fontSize: 14 },
  input: {
    minHeight: TOUCH_TARGET, borderWidth: 1, borderColor: colors.line, borderRadius: 10,
    paddingHorizontal: space.md, paddingVertical: space.sm, fontSize: 16, color: colors.text, backgroundColor: colors.surface,
  },
  button: {
    minHeight: TOUCH_TARGET, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: 10,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm,
  },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: "700", textAlign: "center", flexShrink: 1 },
  chip: {
    minHeight: 44, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: 22,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, justifyContent: "center",
  },
  chipText: { color: colors.text, fontSize: 15 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: space.lg, gap: space.sm },
  pill: { alignSelf: "flex-start", backgroundColor: colors.line, borderRadius: 12, paddingHorizontal: space.sm, paddingVertical: 2 },
  pillText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  error: { backgroundColor: colors.dangerSoft, borderRadius: 10, padding: space.md, gap: space.sm },
  errorText: { color: colors.danger, fontSize: 15 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.sm, padding: space.xl },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
});
