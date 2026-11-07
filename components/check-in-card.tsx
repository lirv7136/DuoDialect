/**
 * A gentle prompt at the top of Plans for a meetup that has an open check-in. Tapping
 * it opens the check-in; ignoring it is fine, it quietly expires.
 */
import { Text, View } from "react-native";
import type { CheckInDoc } from "../src/lib/live";
import type { PersonSummary } from "../hooks/use-people";
import { formatLocalDate } from "../src/domain/schedule";
import { colors, space, type } from "../constants/theme";
import { Avatar } from "./avatar";
import { Button, Card } from "./ui";

export function CheckInCard({ item, person, onOpen }: { item: CheckInDoc; person?: PersonSummary; onOpen: () => void }) {
  const name = person?.name ?? "";
  return (
    <Card style={{ backgroundColor: colors.surfaceNavySoft }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Avatar name={name} photos={person?.photos} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.heading}>How did it go?</Text>
          <Text style={type.caption}>{`${name || "Your swap"} · ${formatLocalDate(item.occurrence.localDate)}`}</Text>
        </View>
      </View>
      <Button variant="primary" label="Check in" accessibilityLabel={`Check in about meeting ${name || "your partner"}`} onPress={onOpen} />
    </Card>
  );
}
