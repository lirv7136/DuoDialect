import { Text } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { fonts } from "../../constants/theme";
import { Button, Card, Heading, Screen, styles } from "../../components/ui";
import { SafetyCard } from "../../components/safety-card";
import { EMERGENCY_LINE } from "../../src/domain/safety-copy";

const GUIDELINES_URL = "https://talkeven.com/guidelines/";
const SUPPORT_URL = "https://talkeven.com/support/";

export default function MeetingSafely() {
  return (
    <Screen edges={[]}>
      <SafetyCard title="Before and during" footnote={false} />
      <Card>
        <Heading>Report or block</Heading>
        <Text style={styles.body}>Use the ⋯ menu or their profile. Blocking stops all contact. Reports are private.</Text>
        <Text style={[styles.body, { fontFamily: fonts.bold }]}>{EMERGENCY_LINE}</Text>
      </Card>
      <Button icon="book-outline" label="Community guidelines" onPress={() => void WebBrowser.openBrowserAsync(GUIDELINES_URL)} />
      <Button variant="ghost" icon="help-buoy-outline" label="Get help" accessibilityLabel="Contact support" onPress={() => void WebBrowser.openBrowserAsync(SUPPORT_URL)} />
    </Screen>
  );
}
