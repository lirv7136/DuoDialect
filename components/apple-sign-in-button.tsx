import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import { isAppleSignInAvailable, signInWithApple } from "../src/lib/auth";
import { authErrorMessage } from "../src/domain/errors";
import { TOUCH_TARGET, colors, radius, space, type } from "../constants/theme";

/**
 * Apple's own button under an "or" divider, on the deep water sign in screens. Rendered
 * only where the native sheet exists (iOS), so Android and web see the email form alone.
 * Success lands on the index route, which sends a new account to onboarding and an
 * existing one to the tabs exactly as the email flow does. A dismissed sheet is a no op.
 */
export function AppleSignInButton({ mode, onError }: { mode: "signIn" | "signUp"; onError: (message: string | null) => void }) {
  const [available, setAvailable] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    void isAppleSignInAvailable().then(result => { if (active) setAvailable(result); });
    return () => { active = false; };
  }, []);

  if (!available) return null;

  async function onPress() {
    if (inFlight.current) return;
    inFlight.current = true;
    onError(null);
    try {
      const result = await signInWithApple();
      if (result) router.replace("/");
    } catch (e) {
      onError(authErrorMessage(e));
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <View style={{ gap: space.md }}>
      <View accessibilityElementsHidden style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.onPrimaryPressed }} />
        <Text style={[type.caption, { color: colors.onPrimary }]}>or</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.onPrimaryPressed }} />
      </View>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={mode === "signUp"
          ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
          : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        // White on deep water, the way Apple asks for it on dark grounds; the thin outline
        // disappears into the navy, so the face reads as the cream primary button's sibling.
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
        cornerRadius={radius.button}
        style={{ width: "100%", height: TOUCH_TARGET }}
        onPress={() => void onPress()}
      />
    </View>
  );
}
