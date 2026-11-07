/**
 * Someone one step from matching, shown when Discover is empty. Quieter than a partner
 * card: no invite, no bio, just who they are, their languages, and the one reason it is
 * not a two way match. Honest about "almost" so an empty screen is not a dead end.
 */
import { Text, View } from "react-native";
import type { NearMiss } from "../src/lib/api";
import { displayLanguage } from "../src/domain/languages";
import { nearMissReason } from "../src/domain/invite-copy";
import { MAX_FONT_SCALE, colors, fonts, space, type } from "../constants/theme";
import { Avatar } from "./avatar";
import { Card, ChipRow, InfoChip } from "./ui";

const list = (values: string[]) => values.map(displayLanguage).join(", ");

export function NearMissCard({ person, me }: { person: NearMiss; me: { offers: string[]; seeks: string[] } }) {
  const why = nearMissReason(person.reason, me, person);
  const spoken = [person.displayName, person.area, `Speaks ${list(person.offers)}. Learning ${list(person.seeks)}.`, why]
    .filter(Boolean).join(". ");
  return (
    <Card style={{ padding: space.md, gap: space.sm, opacity: 0.92 }}>
      <View accessible accessibilityLabel={spoken} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Avatar name={person.displayName} photos={person.photos} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.display} numberOfLines={1}
            style={{ fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.primary }}>
            {person.displayName}
          </Text>
          {person.area ? <Text style={type.caption} numberOfLines={1}>{person.area}</Text> : null}
        </View>
      </View>
      <ChipRow>
        <InfoChip icon="chatbubble-outline" label={`Speaks ${list(person.offers)}`} tone="plain" />
        <InfoChip icon="school-outline" label={`Learning ${list(person.seeks)}`} tone="plain" />
      </ChipRow>
      <Text style={[type.caption, { color: colors.primary }]}>{why}</Text>
    </Card>
  );
}
