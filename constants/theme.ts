import type { TextStyle } from "react-native";

/**
 * Talkeven design tokens (docs/design/DESIGN-SPEC.md): navy, coral and cream, taken from
 * the app icon. Contrast ratios are against `background` (#f5f5ef).
 *
 * Coral (`accent`) is for fills, illustration, badges and dots only. It is 2.35:1 on
 * cream, so it is never used for text there; coral-coloured text uses `accentInk`.
 */
export const colors = {
  /** Primary button fill, headings, active tab, body text (10.5:1). */
  primary: "#1f3a5f",
  /** Pressed state and the 3pt bottom lip under primary buttons. */
  primaryPressed: "#172b45",
  /** Text and icons on navy. */
  onPrimary: "#f5f5ef",
  /** Fills, illustration, badges, dots. Never text on cream. */
  accent: "#ff7a59",
  /** Coral text and links (4.98:1). */
  accentInk: "#b4462a",
  /** Coral-tinted chip and badge background. */
  accentSoft: "#fde6dd",
  /** Cards. */
  surface: "#fffefb",
  /** Screens. */
  background: "#f5f5ef",
  /** Selected chips and soft navy fills. */
  surfaceNavySoft: "#e3eaf3",
  /** Body text. */
  text: "#1f3a5f",
  /** Metadata (5.2:1). */
  muted: "#5b6878",
  /** Hairlines. */
  line: "#dedfd5",
  success: "#2a7a55",
  successSoft: "#e2f1e8",
  /** Report, block, delete. */
  danger: "#b3261e",
  dangerSoft: "#f9e3e1",
  /** The lip under a cream button on navy screens. */
  onPrimaryPressed: "#c9cdc4",
  /** Scrim behind sheets. */
  scrim: "rgba(23, 43, 69, 0.45)",
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
