/**
 * A language partner on Discover. Languages are the hero: the exchange strip is as big
 * as the name. The photo sits inside the card in a bubble, never full-bleed. The whole
 * card opens the profile; the one button invites.
 */
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import type { Candidate } from "../src/lib/api";
import { displayLanguage } from "../src/domain/languages";
import { shortSlot } from "../src/domain/display";
import { MAX_FONT_SCALE, colors, fonts, space, type } from "../constants/theme";
import { Avatar, CardPhoto } from "./avatar";
import { ExchangeStrip } from "./exchange-strip";
import { Button, Card, ChipRow, InfoChip, usePressFeedback } from "./ui";

const list = (values: string[]) => values.map(displayLanguage).join(", ");

/** Up to two shared times as icon chips, e.g. ☾ Mon eve, ☀ Sat am. */
export function SharedTimes({ slots, max = 2 }: { slots: string[]; max?: number }) {
  const shown = slots.map(shortSlot).filter((item): item is NonNullable<typeof item> => !!item);
  if (!shown.length) return null;
  const extra = shown.length - max;
  return (
    <ChipRow>
      {shown.slice(0, max).map(item => <InfoChip key={item.label} icon={item.icon} label={item.label} />)}
      {extra > 0 ? <InfoChip label={`+${extra}`} accessibilityLabel={`${extra} more shared times`} /> : null}
    </ChipRow>
  );
}

export function PartnerCard({ person, invited, onOpen, onInvite, onInvited }: {
  person: Candidate; invited: boolean; onOpen: () => void; onInvite: () => void; onInvited: () => void;
}) {
  const press = usePressFeedback();
  const hasPhoto = person.photos.length > 0;
  const spoken = [
    person.displayName,
    person.area,
    `Teaches you ${list(person.exchange.theyOffer)}. You teach ${list(person.exchange.youOffer)}.`,
    person.sharedAvailability.length ? `Shared times: ${person.sharedAvailability.join(", ")}.` : "",
    person.bio,
  ].filter(Boolean).join(". ");

  return (
    <Card style={{ padding: space.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint="Opens their profile"
        onPress={onOpen}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
      >
        <Animated.View style={[{ gap: space.md }, press.scale]}>
          {hasPhoto ? <CardPhoto name={person.displayName} photos={person.photos} /> : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.xs }}>
            {!hasPhoto ? <Avatar name={person.displayName} size={64} /> : null}
            <View style={{ flex: 1, gap: space.xs }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.display} numberOfLines={2}
                style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.primary }}>
                {person.displayName}
              </Text>
              {person.area ? <InfoChip icon="location-outline" label={person.area} tone="plain" /> : null}
            </View>
          </View>
          <ExchangeStrip theyTeach={person.exchange.theyOffer} youTeach={person.exchange.youOffer} />
          <SharedTimes slots={person.sharedAvailability} />
          {person.bio ? <Text style={[type.body, { paddingHorizontal: space.xs }]} numberOfLines={2}>{person.bio}</Text> : null}
        </Animated.View>
      </Pressable>
      {invited ? (
        <Button icon="checkmark" label="Invited" accessibilityLabel={`Invited ${person.displayName}. Open Plans`} onPress={onInvited} />
      ) : (
        <Button variant="primary" label="Invite" accessibilityLabel={`Invite ${person.displayName} to meet`} onPress={onInvite} />
      )}
    </Card>
  );
}
