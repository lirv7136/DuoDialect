/**
 * The language pair, which is the hero of every card: two monogram discs (JA, EN) joined
 * by an aqua ⇄. Monograms stand in for flags, because a language isn't a country.
 */
import { Text, View } from "react-native";
import { displayLanguage } from "../src/domain/languages";
import { languageCode } from "../src/domain/display";
import { MAX_FONT_SCALE, colors, fonts, radius, space, type } from "../constants/theme";

const names = (list: readonly string[]) => list.map(displayLanguage).filter(Boolean);

/** A round language monogram. Filled cream (on the deep water pill) for what you receive, outlined for what you give. */
export function Monogram({ language, filled = true, size = 28 }: { language: string; filled?: boolean; size?: number }) {
  const code = languageCode(language);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center",
        backgroundColor: filled ? colors.onPrimary : colors.surfaceNavySoft,
      }}
    >
      <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: code.length > 2 ? size * 0.3 : size * 0.38, color: colors.primary }}>
        {code}
      </Text>
    </View>
  );
}

/** The aqua ⇄ badge between the two sides, with an ink glyph (4.53:1). */
export function SwapBadge({ size = 24 }: { size?: number }) {
  return (
    <View importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", zIndex: 1 }}>
      <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: size * 0.6, lineHeight: size * 0.8, color: colors.onAccent }}>⇄</Text>
    </View>
  );
}

/** "JA ⇄ EN" in small text: for chat rows and headers. */
export function MonogramPair({ left, right, onDark = false }: { left: string; right: string; onDark?: boolean }) {
  const color = onDark ? colors.onPrimary : colors.muted;
  return (
    <View accessible accessibilityLabel={`${displayLanguage(left)} and ${displayLanguage(right)}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[type.caption, { fontFamily: fonts.bold, color }]}>{languageCode(left)}</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[type.caption, { fontFamily: fonts.bold, color: onDark ? colors.accent : colors.accentInk }]}>⇄</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[type.caption, { fontFamily: fonts.bold, color }]}>{languageCode(right)}</Text>
    </View>
  );
}

function Side({ languages, caption, filled, compact }: { languages: string[]; caption?: string; filled: boolean; compact: boolean }) {
  const label = languages.join(", ") || "—";
  return (
    <View
      style={{
        flex: 1, alignItems: "center", gap: space.sm,
        minHeight: compact ? 40 : 56, paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.chip,
        backgroundColor: filled ? colors.primary : colors.surface,
        borderWidth: 1.5, borderColor: colors.primary,
        // The outline side mirrors the filled one, so both discs sit at the outer edges.
        flexDirection: filled ? "row" : "row-reverse",
      }}
    >
      <Monogram language={languages[0] ?? ""} filled={filled} size={compact ? 26 : 32} />
      <View style={{ flexShrink: 1, alignItems: filled ? "flex-start" : "flex-end" }}>
        <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.compact}
          style={{ fontFamily: fonts.bold, fontSize: compact ? 14 : 16, lineHeight: compact ? 18 : 20, color: filled ? colors.onPrimary : colors.primary }}>
          {label}
        </Text>
        {caption && !compact ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.compact}
            style={{ fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: filled ? colors.onPrimary : colors.muted }}>
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * `[Japanese] ⇄ [English]`: the left pill (deep water) is what the partner teaches you, the
 * right (outline) is what you teach. Captions default to "teaches you" and "you teach";
 * your own profile passes "you share" and "practising".
 */
export function ExchangeStrip({
  theyTeach, youTeach, leftCaption = "teaches you", rightCaption = "you teach", compact = false, accessibilityLabel,
}: {
  theyTeach: readonly string[];
  youTeach: readonly string[];
  leftCaption?: string;
  rightCaption?: string;
  compact?: boolean;
  accessibilityLabel?: string;
}) {
  const left = names(theyTeach), right = names(youTeach);
  const spoken = accessibilityLabel ?? `${left.join(", ") || "No language"} ${leftCaption}, ${right.join(", ") || "no language"} ${rightCaption}`;
  return (
    <View accessible accessibilityLabel={spoken} style={{ flexDirection: "row", alignItems: "center" }}>
      <Side languages={left} caption={leftCaption} filled compact={compact} />
      {/* Drawn last so neither pill covers it. */}
      <View style={{ marginHorizontal: -10, zIndex: 2, elevation: 2, borderRadius: 20, borderWidth: 3, borderColor: colors.surface }}>
        <SwapBadge size={compact ? 24 : 30} />
      </View>
      <Side languages={right} caption={rightCaption} filled={false} compact={compact} />
    </View>
  );
}
