import { Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { APP_NAME, LAUNCH_CITY } from "../constants/brand";
import { MAX_FONT_SCALE, colors, fonts, space, type } from "../constants/theme";
import { Logo } from "./logo";

/** The navy sign-in header: the drifting two-bubble mark, the wordmark and one line. */
export function AuthHeader({ title }: { title?: string }) {
  return (
    <View style={{ alignItems: "center", gap: space.sm, paddingTop: space.xl, paddingBottom: space.md }}>
      <StatusBar style="light" />
      <Logo />
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.display}
        style={{ fontFamily: fonts.display, fontSize: 40, lineHeight: 46, color: colors.onPrimary, marginTop: space.sm }}>
        {title ?? APP_NAME}
      </Text>
      <Text style={[type.body, { color: colors.onPrimary, textAlign: "center" }]}>
        {title ? "Platonic language swaps for adults, in public places." : `Swap languages over coffee in ${LAUNCH_CITY}.`}
      </Text>
    </View>
  );
}
