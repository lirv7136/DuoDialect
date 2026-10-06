/**
 * Small shared building blocks. Every control has an accessibility role and label,
 * a touch target of at least 48pt, and no fixed text heights, so layouts grow with the
 * system font size instead of clipping. Press and selection animations skip when the
 * person has asked for reduced motion; haptics stay.
 */
import type { ComponentProps, ReactElement, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import {
  BUTTON_HEIGHT, BUTTON_LIP, GUTTER, MAX_FONT_SCALE, TOUCH_TARGET, colors, elevation, fonts, radius, space, type,
} from "../constants/theme";
import { haptic } from "../src/lib/feel";
import type { PlanStatus } from "../src/domain/display";

export type IconName = ComponentProps<typeof Ionicons>["name"];

const PRESS_SPRING = { damping: 18, stiffness: 420, mass: 0.6 };

export function Screen({ children, scroll = true, edges = ["top"], refreshControl, footer, navy = false }: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Pinned below the scrolling content, above the home indicator: a sticky primary action. */
  footer?: ReactNode;
  /** The full-bleed deep water of the sign-in screens. */
  navy?: boolean;
}) {
  const background = { backgroundColor: navy ? colors.primary : colors.background };
  const safeEdges: Edge[] = footer && !edges.includes("bottom") ? [...edges, "bottom"] : edges;
  return (
    <SafeAreaView style={[styles.screen, background]} edges={safeEdges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : <View style={[styles.scrollContent, { flex: 1 }]}>{children}</View>}
      {footer ? <View style={[styles.footer, background]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/** A tab screen's title: Fraunces 34. */
export function Display({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.display}
      style={[type.display, onDark && { color: colors.onPrimary }]}>{children}</Text>
  );
}

export function Title({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.display}
      style={[type.title, onDark && { color: colors.onPrimary }]}>{children}</Text>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.display} style={type.heading}>{children}</Text>;
}

export function Body({ children, muted = false, onDark = false, lines }: { children: ReactNode; muted?: boolean; onDark?: boolean; lines?: number }) {
  return (
    <Text numberOfLines={lines} style={[type.body, muted && { color: colors.muted }, onDark && { color: colors.onPrimary }]}>{children}</Text>
  );
}

export function Caption({ children, icon, center = false }: { children: ReactNode; icon?: IconName; center?: boolean }) {
  if (!icon) return <Text style={[type.caption, center && { textAlign: "center" }]}>{children}</Text>;
  return (
    <View style={[styles.row, { gap: space.xs, flexWrap: "nowrap" }, center && { justifyContent: "center" }]}>
      <Ionicons name={icon} size={15} color={colors.muted} />
      <Text style={[type.caption, { flexShrink: 1 }]}>{children}</Text>
    </View>
  );
}

/** Press feedback shared by buttons and tappable cards: scale to .97 and collapse the lip. */
export function usePressFeedback(enabled = true) {
  const progress = useSharedValue(0);
  const reduce = useReducedMotion();
  const scale = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.03 * progress.value }] }));
  const sink = useAnimatedStyle(() => ({ transform: [{ translateY: BUTTON_LIP * progress.value }] }));
  const to = (value: number) => { progress.value = reduce ? value : withSpring(value, PRESS_SPRING); };
  return {
    scale,
    sink,
    onPressIn: () => { if (enabled) to(1); },
    onPressOut: () => to(0),
  };
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerFilled";

function buttonPalette(variant: Variant, onDark: boolean) {
  if (onDark) {
    if (variant === "primary") return { face: colors.onPrimary, lip: colors.onPrimaryPressed, text: colors.primary, border: colors.onPrimary };
    return { face: "transparent", lip: "transparent", text: colors.onPrimary, border: variant === "secondary" ? colors.onPrimary : "transparent" };
  }
  switch (variant) {
    case "primary": return { face: colors.primary, lip: colors.primaryPressed, text: colors.onPrimary, border: colors.primary };
    case "secondary": return { face: colors.surface, lip: "transparent", text: colors.primary, border: colors.primary };
    case "dangerFilled": return { face: colors.danger, lip: colors.dangerPressed, text: "#ffffff", border: colors.danger };
    case "danger": return { face: "transparent", lip: "transparent", text: colors.danger, border: "transparent" };
    default: return { face: "transparent", lip: "transparent", text: colors.primary, border: "transparent" };
  }
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** An icon in the left slot. */
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  /** Screen reader hint only; never shown. */
  hint?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Content alignment: centred, or from the start for field-like buttons. */
  align?: "center" | "start";
  /** Cream-on-deep-water colours for the sign-in screens. */
  onDark?: boolean;
};

/**
 * Primary is deep water with a 3pt lip that collapses as the button sinks; secondary is a
 * deep water outline; ghost is text and icon; danger is red text, and dangerFilled is kept
 * for the final step of a destructive confirmation.
 */
export function Button({
  label, onPress, variant = "secondary", icon, disabled, busy, busyLabel, hint, accessibilityLabel, style, align = "center", onDark = false,
}: ButtonProps) {
  const inactive = !!(disabled || busy);
  const press = usePressFeedback(!inactive);
  const palette = buttonPalette(variant, onDark);
  const lipped = variant === "primary" || variant === "dangerFilled";
  const outlined = variant === "secondary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: inactive, busy: !!busy }}
      disabled={inactive}
      onPress={() => { haptic.light(); onPress(); }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={style}
    >
      <Animated.View style={[press.scale, inactive && { opacity: 0.5 }]}>
        <View style={{ paddingBottom: lipped ? BUTTON_LIP : 0 }}>
          {lipped ? <View style={[StyleSheet.absoluteFill, { top: BUTTON_LIP, borderRadius: radius.button, backgroundColor: palette.lip }]} /> : null}
          <Animated.View
            style={[
              styles.button,
              {
                minHeight: lipped ? BUTTON_HEIGHT - BUTTON_LIP : TOUCH_TARGET,
                backgroundColor: palette.face,
                borderColor: palette.border,
                borderWidth: outlined ? 1.5 : 0,
                justifyContent: align === "start" ? "flex-start" : "center",
              },
              lipped && press.sink,
            ]}
          >
            {busy ? <ActivityIndicator color={palette.text} /> : icon ? <Ionicons name={icon} size={20} color={palette.text} /> : null}
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.display} style={[styles.buttonText, { color: palette.text }]}>
              {busy && busyLabel ? busyLabel : label}
            </Text>
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** A 48pt icon-only button, such as ⋯ or ⓘ. The label is for screen readers. */
export function IconButton({ icon, label, onPress, hint, color = colors.primary, size = 24 }: {
  icon: IconName; label: string; onPress: () => void; hint?: string; color?: string; size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={() => { haptic.light(); onPress(); }}
      hitSlop={4}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

/**
 * A selectable chip: 40pt tall with a 4pt hit slop (48pt to touch). Selected chips turn
 * soft deep water with a deep water border and a check, and give a small spring and selection tick.
 */
export function Chip({ label, selected = false, onPress, role = "checkbox", accessibilityLabel, icon }: {
  label: string; selected?: boolean; onPress: () => void; role?: "checkbox" | "radio" | "button"; accessibilityLabel?: string; icon?: IconName;
}) {
  const scale = useSharedValue(1);
  const reduce = useReducedMotion();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  function handle() {
    haptic.selection();
    if (!reduce) scale.value = withSequence(withTiming(0.92, { duration: 70 }), withSpring(1, { damping: 9, stiffness: 320 }));
    onPress();
  }
  const leading = selected ? "checkmark" : icon;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={role === "button" ? undefined : { checked: selected }}
      onPress={handle}
      hitSlop={4}
    >
      <Animated.View style={[styles.chip, selected && styles.chipSelected, animated]}>
        {leading ? <Ionicons name={leading} size={16} color={colors.primary} /> : null}
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[styles.chipText, selected && { fontFamily: fonts.semibold }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/** A non-interactive fact: soft fill, no border, a 16pt icon. The "coral" tone predates Ocean Pool and now renders aqua. */
export function InfoChip({ label, icon, tone = "navy", accessibilityLabel }: {
  label: string; icon?: IconName; tone?: "navy" | "coral" | "plain"; accessibilityLabel?: string;
}) {
  const background = tone === "coral" ? colors.accentSoft : tone === "plain" ? colors.background : colors.surfaceNavySoft;
  const color = tone === "coral" ? colors.accentInk : colors.primary;
  return (
    <View accessible accessibilityLabel={accessibilityLabel ?? label} style={[styles.infoChip, { backgroundColor: background }]}>
      {icon ? <Ionicons name={icon} size={16} color={color} /> : null}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[styles.infoChipText, { color }]}>{label}</Text>
    </View>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

const STATUS: Record<PlanStatus, { label: string; icon: IconName; background: string; color: string }> = {
  "waiting": { label: "Waiting", icon: "time-outline", background: colors.accentSoft, color: colors.accentInk },
  "your-turn": { label: "Your turn", icon: "notifications-outline", background: colors.accentSoft, color: colors.accentInk },
  "confirmed": { label: "Confirmed", icon: "checkmark-circle", background: colors.successSoft, color: colors.success },
  "declined": { label: "Declined", icon: "close", background: colors.background, color: colors.muted },
  "cancelled": { label: "Cancelled", icon: "close", background: colors.background, color: colors.muted },
};

/** Plan state as colour and shape: a pill with an icon, never a sentence. */
export function StatusBadge({ status }: { status: PlanStatus }) {
  const item = STATUS[status];
  return (
    <View accessible accessibilityLabel={`Status: ${item.label}`}
      style={[styles.badge, { backgroundColor: item.background }, item.background === colors.background && { borderWidth: 1, borderColor: colors.line }]}>
      <Ionicons name={item.icon} size={14} color={item.color} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[styles.badgeText, { color: item.color }]}>{item.label}</Text>
    </View>
  );
}

/** An aqua count or dot. Ink text on aqua is 4.53:1. */
export function CountBadge({ count, label }: { count: number; label?: string }) {
  if (count <= 0) return null;
  return (
    <View accessible accessibilityLabel={label ?? `${count} new`} style={styles.count}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={styles.countText}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

export type SegmentOption<T extends string> = { value: T; label: string; badge?: number };

/** A segmented control, such as Upcoming · Invites · Past. */
export function Segmented<T extends string>({ options, value, onChange }: { options: SegmentOption<T>[]; value: T; onChange: (next: T) => void }) {
  return (
    <View accessibilityRole="tablist" style={styles.segmented}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.badge ? `${option.label}, ${option.badge} waiting` : option.label}
            onPress={() => { if (!active) { haptic.selection(); onChange(option.value); } }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} numberOfLines={1}
              style={[styles.segmentText, active && { color: colors.onPrimary }]}>{option.label}</Text>
            {option.badge ? <CountBadge count={option.badge} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, hint, icon, onDark = false, ...input }: TextInputProps & { label: string; hint?: string; icon?: IconName; onDark?: boolean }) {
  const labelColor = onDark ? colors.onPrimary : colors.text;
  return (
    <View style={{ gap: space.xs }}>
      <View style={[styles.row, { gap: space.xs }]}>
        {icon ? <Ionicons name={icon} size={16} color={labelColor} /> : null}
        <Text style={[type.label, { color: labelColor }]}>{label}</Text>
      </View>
      {hint ? <Text style={[type.caption, onDark && { color: colors.onPrimary }]}>{hint}</Text> : null}
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

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A row in a settings list: icon, label, and a chevron or a control on the right. */
export function ListRow({ icon, label, onPress, hint, danger = false, right }: {
  icon: IconName; label: string; onPress?: () => void; hint?: string; danger?: boolean; right?: ReactNode;
}) {
  const color = danger ? colors.danger : colors.primary;
  const content = (
    <>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[type.label, { flex: 1, color: danger ? colors.danger : colors.text }]}>{label}</Text>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.listRow}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}
      onPress={() => { haptic.light(); onPress(); }}
      style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.surfaceNavySoft }]}>
      {content}
    </Pressable>
  );
}

/** A settings row with a switch. */
export function ToggleRow({ icon, label, value, onChange, disabled, hint }: {
  icon: IconName; label: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean; hint?: string;
}) {
  return (
    <ListRow icon={icon} label={label} right={
      <Switch
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        disabled={disabled}
        onValueChange={next => { haptic.selection(); onChange(next); }}
        trackColor={{ true: colors.primary, false: colors.line }}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.line}
      />
    } />
  );
}

export function ErrorNotice({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
      <View style={[styles.row, { flexWrap: "nowrap", alignItems: "flex-start" }]}>
        <Ionicons name="alert-circle" size={20} color={colors.danger} />
        <Text style={styles.errorText}>{message}</Text>
      </View>
      {onRetry ? <Button label="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

/** A short confirmation, such as "Check your email for a reset link." */
export function Notice({ message, icon = "checkmark-circle" }: { message: string | null; icon?: IconName }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>
      <Ionicons name={icon} size={20} color={colors.success} />
      <Text style={[type.body, { flexShrink: 1 }]}>{message}</Text>
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} accessibilityLabel={label} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: GUTTER, paddingTop: space.lg, gap: space.md, paddingBottom: space.xxxl },
  footer: { paddingHorizontal: GUTTER, paddingTop: space.md, paddingBottom: space.md, gap: space.sm, borderTopWidth: 1, borderColor: colors.line },
  body: type.body,
  label: type.label,
  hint: type.caption,
  input: {
    minHeight: TOUCH_TARGET, borderWidth: 1, borderColor: colors.line, borderRadius: radius.input,
    paddingHorizontal: space.md, paddingVertical: space.sm, fontSize: 16, fontFamily: fonts.regular, color: colors.text, backgroundColor: colors.surface,
  },
  button: {
    paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.button,
    flexDirection: "row", alignItems: "center", gap: space.sm,
  },
  buttonText: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 20, textAlign: "center", flexShrink: 1 },
  iconButton: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
  chip: {
    minHeight: 40, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.chip,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: space.xs,
  },
  chipSelected: { backgroundColor: colors.surfaceNavySoft, borderColor: colors.primary },
  chipText: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, color: colors.text },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  infoChip: {
    minHeight: 32, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.chip,
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", maxWidth: "100%",
  },
  infoChipText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18, flexShrink: 1 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.chip, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  badgeText: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 16 },
  count: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  countText: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 14, color: colors.onAccent },
  segmented: { flexDirection: "row", backgroundColor: colors.surfaceNavySoft, borderRadius: radius.chip, padding: 4, gap: 4 },
  segment: {
    flex: 1, minHeight: 40, borderRadius: radius.chip, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingHorizontal: space.sm,
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.primary, flexShrink: 1 },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.card,
    padding: space.lg, gap: space.md, ...elevation.card,
  },
  listRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  error: { backgroundColor: colors.dangerSoft, borderRadius: radius.input, padding: space.md, gap: space.sm },
  errorText: { color: colors.danger, fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, flexShrink: 1 },
  notice: { backgroundColor: colors.successSoft, borderRadius: radius.input, padding: space.md, flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.sm, padding: space.xl, backgroundColor: colors.background },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
});
