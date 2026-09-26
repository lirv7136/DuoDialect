import { useRef, useState } from "react";
import { Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api, REPORT_REASONS, type ReportReason } from "../../src/lib/api";
import { errorMessage } from "../../src/domain/errors";
import { Body, Button, Card, Chip, ChipRow, ErrorNotice, Field, Heading, Screen, styles } from "../../components/ui";

const MAX_DETAIL = 1000;

export default function ReportScreen() {
  const { uid, name, conversationId } = useLocalSearchParams<{ uid: string; name?: string; conversationId?: string }>();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const inFlight = useRef(false);
  const who = name ? String(name) : "this member";

  async function onSubmit() {
    if (inFlight.current || done) return;
    if (!reason) { setProblem("Choose what happened."); return; }
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await api.reportUser({
        reportedUid: String(uid),
        reason,
        ...(detail.trim() ? { detail: detail.trim() } : {}),
        ...(conversationId ? { conversationId: String(conversationId) } : {}),
      });
      setDone(true);
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Screen edges={[]}>
        <Heading>Report received.</Heading>
        <Body>Thank you. Your report is kept for review, including if either account is later deleted. You won’t receive an update in the app.</Body>
        <Body muted>{`If you don’t want to hear from ${who} again, you can also block them.`}</Body>
        <Button variant="primary" label="Done" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <Heading>{`Flag a concern about ${who}.`}</Heading>
      <Body muted>Reports go to our moderation queue and aren’t shown to the person you report.</Body>
      <Text accessibilityRole="header" style={styles.label}>What happened?</Text>
      <ChipRow>
        {REPORT_REASONS.map(option => (
          <Chip key={option.value} role="radio" label={option.label} selected={reason === option.value} onPress={() => setReason(option.value)} />
        ))}
      </ChipRow>
      <Field label="Anything else? (optional)" value={detail} onChangeText={setDetail} maxLength={MAX_DETAIL} multiline />
      {conversationId ? <Card><Text style={styles.hint}>This report will reference your conversation so a moderator can read it for context.</Text></Card> : null}
      <ErrorNotice message={problem} />
      <Button variant="primary" label="Send report" busy={busy} busyLabel="Sending…" onPress={onSubmit} />
    </Screen>
  );
}
