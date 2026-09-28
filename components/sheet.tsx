/**
 * A bottom sheet for short explanations and menus, and the ⓘ button that opens one.
 * Fine print lives here, behind a tap, rather than inline.
 */
import { useState, type ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GUTTER, MAX_FONT_SCALE, colors, elevation, fonts, radius, space, type } from "../constants/theme";
import { Button, IconButton } from "./ui";

export function Sheet({ visible, onClose, title, children }: {
  visible: boolean; onClose: () => void; title?: string; children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  return (
    <Modal visible={visible} transparent animationType={reduce ? "fade" : "slide"} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim }} />
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet,
            paddingHorizontal: GUTTER, paddingTop: space.md, paddingBottom: insets.bottom + space.lg, gap: space.md,
            ...elevation.sheet,
          }}
        >
          <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
          {title ? (
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.display}
              style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.primary }}>{title}</Text>
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

/**
 * ⓘ next to a heading or choice. Controlled (`open`, `onOpenChange`) when the screen
 * decides to show it, such as Discover's once-only explainer; otherwise self-contained.
 */
export function InfoButton({ label, title, body, open, onOpenChange, size = 22 }: {
  /** For screen readers, e.g. "About partners". */
  label: string;
  title?: string;
  body: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  size?: number;
}) {
  const [own, setOwn] = useState(false);
  const visible = open ?? own;
  const set = (next: boolean) => { if (onOpenChange) onOpenChange(next); else setOwn(next); };
  return (
    <>
      <IconButton icon="information-circle-outline" label={label} onPress={() => set(true)} size={size} />
      <Sheet visible={visible} onClose={() => set(false)} title={title}>
        <Text style={type.body}>{body}</Text>
        <Button variant="primary" label="Got it" onPress={() => set(false)} />
      </Sheet>
    </>
  );
}
