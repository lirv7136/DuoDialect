import { Text } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Body, Button, Card, Heading, Screen, styles } from "../../components/ui";
import { SafetyCard } from "../../components/safety-card";
import { APP_NAME } from "../../constants/brand";

const GUIDELINES_URL = "https://talkeven.com/child-safety/";
const SUPPORT_URL = "https://talkeven.com/support/";

export default function MeetingSafely() {
  return (
    <Screen edges={[]}>
      <Body muted>{`${APP_NAME} is a platonic language exchange for adults. A few habits keep every meetup relaxed.`}</Body>
      <SafetyCard title="Before and during a meetup" />
      <Card>
        <Heading>Report or block</Heading>
        <Text style={styles.body}>
          From someone’s profile, or the ⋯ menu in your chat, you can report them or block them. Blocking stops you
          finding, inviting or messaging each other. Reports aren’t shown to the person you report.
        </Text>
        <Text style={styles.body}>Our team reviews every report. If you feel unsafe right now, call 000.</Text>
      </Card>
      <Button label="Community guidelines" onPress={() => void WebBrowser.openBrowserAsync(GUIDELINES_URL)} />
      <Button variant="ghost" label="Contact support" onPress={() => void WebBrowser.openBrowserAsync(SUPPORT_URL)} />
    </Screen>
  );
}
