/**
 * Palette from the reviewed prototype (prototype/styles.css). Text colours meet WCAG AA
 * contrast on `background` and `paper`.
 */
export const colors = {
  background: "#f5f5ef",
  paper: "#fffefb",
  ink: "#243b33",
  muted: "#56645d",
  line: "#dedfd5",
  green: "#315d49",
  pale: "#eaf0df",
  orange: "#b5532d",
  danger: "#a1321f",
  onGreen: "#ffffff",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** Minimum touch target, per platform accessibility guidance. */
export const TOUCH_TARGET = 48;
