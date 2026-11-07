import type { TextStyle } from "react-native";

/**
 * Talkeven design tokens (docs/design/DESIGN-SPEC.md): the "Ocean Pool" palette. Sydney's
 * ocean rock pools are free, public and shared by strangers at the same level; the app
 * icon is a split disc (deep ink half, cream half, ink divider) on pool aqua.
 * Contrast ratios are WCAG 2, against `background` (#f3f5f0) unless stated.
 *
 * Aqua (`accent`) is for fills, badges, dots and the split bar only. It is 2.82:1 on the
 * background and 2.79:1 against cream, so it is never text on light grounds and never
 * carries cream text; text on aqua is `onAccent` ink (4.53:1) and aqua coloured text is
 * `accentInk`. Cream sits on or beside the ink, never alone on aqua. No pink, ever.
 * Token names predate the palette (`surfaceNavySoft`, the "coral" chip tone) and are kept
 * so call sites stay stable.
 */
export const colors = {
  /** Deep water. Primary button fill, headings, active tab, the sign-in screens (10.75:1). */
  primary: "#0f3d47",
  /** Pressed state and the 3pt bottom lip under primary buttons. */
  primaryPressed: "#0a2c34",
  /** Cream. Text and icons on deep water (10.63:1). */
  onPrimary: "#f5f3ec",
  /** Pool aqua. Fills, illustration, badges, dots, the split bar. Never text on light grounds. */
  accent: "#16a39f",
  /** Text and icons on an aqua fill: the icon's deep ink (4.53:1). */
  onAccent: "#0f2f3d",
  /** Aqua text and links (5.76:1; 6.33:1 on surface; 5.18:1 on accentSoft). */
  accentInk: "#0a6b69",
  /** Aqua tinted chip and badge background. */
  accentSoft: "#d3eeea",
  /**
   * Warm sandstone, for celebrations only (confetti): the rock shelf around the pool. It
   * keeps the cool palette from feeling clinical. Decorative; never text or UI state.
   */
  celebrate: "#e0a96d",
  /** Cards. */
  surface: "#ffffff",
  /** Screens. */
  background: "#f3f5f0",
  /** Selected chips and soft deep water fills (primary on it 9.60:1). */
  surfaceNavySoft: "#e1e9ec",
  /** Body text: deep ink (12.80:1; 14.05:1 on surface). */
  text: "#0f2f3d",
  /** Metadata (5.45:1; 5.99:1 on surface; 4.86:1 on surfaceNavySoft). */
  muted: "#56666b",
  /** Hairlines. */
  line: "#dce2dd",
  /** Leaf green, kept well apart from the aqua (4.93:1 on successSoft). */
  success: "#2d7337",
  successSoft: "#e4f0e1",
  /** Report, block, delete (5.95:1; 5.32:1 on dangerSoft). */
  danger: "#b3261e",
  dangerSoft: "#f9e3e1",
  /** The lip under a filled danger button. */
  dangerPressed: "#8a1c16",
  /** The lip under a cream button on deep water screens. */
  onPrimaryPressed: "#d3cfc2",
  /** Scrim behind sheets. */
  scrim: "rgba(10, 44, 52, 0.45)",
  /** Darker veil over a photo while it uploads (cream text sits on it). */
  scrimStrong: "rgba(10, 44, 52, 0.6)",
} as const;

/** Font family names, as registered with useFonts in app/_layout.tsx. */
export const fonts = {
  display: "Fraunces_600SemiBold",
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
} as const;

/**
 * Type scale. Custom fonts carry their weight in the family name (fontWeight would be
 * ignored on Android), so no token sets fontWeight.
 */
export const type = {
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: colors.primary },
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: colors.primary },
  heading: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 24, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: colors.text },
  label: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.muted },
  numeric: { fontFamily: fonts.bold, fontVariant: ["tabular-nums"], color: colors.text },
} satisfies Record<string, TextStyle>;

/** Dynamic Type caps: text still grows, but big headings never push content off screen. */
export const MAX_FONT_SCALE = { display: 1.6, body: 2, compact: 1.4 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Screen side padding and the gap between cards. */
export const GUTTER = 20;
export const CARD_GAP = 16;

export const radius = {
  chip: 999,
  button: 16,
  input: 14,
  card: 24,
  sheet: 28,
  /** The speech-bubble avatar: 24 everywhere except one 6pt corner. */
  bubble: 24,
  bubbleTail: 6,
} as const;

export const elevation = {
  card: {
    shadowColor: colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sheet: {
    shadowColor: colors.primary,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
} as const;

/** Minimum touch target, per platform accessibility guidance. */
export const TOUCH_TARGET = 48;

/** Primary buttons are 52pt, with a 3pt lip that collapses on press. */
export const BUTTON_HEIGHT = 52;
export const BUTTON_LIP = 3;
