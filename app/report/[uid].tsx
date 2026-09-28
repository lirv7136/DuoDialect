import { useRef, useState } from "react";
import { Text } from "react-native";
import { auth } from "../../src/lib/firebase";
import { candidateCache } from "../../src/lib/candidate-cache";
import { rememberBlockedName } from "../../src/lib/blocked-names";
import { EMERGENCY_LINE } from "../../src/domain/safety-copy";
import { confirmBlock } from "../../components/safety-menu";
import { router, useLocalSearchParams } from "expo-router";
import { api, REPORT_REASONS, type ReportReason } from "../../src/lib/api";
import { errorMessage } from "../../src/domain/errors";
import { Body, Button, Caption, Chip, ChipRow, ErrorNotice, Field, Screen, Title, styles } from "../../components/ui";

const MAX_DETAIL = 1000;

export default function ReportScreen() {
  const { uid, name, conversationId } = useLocalSearchParams<{ uid: string; name?: string; conversationId?: string }>();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
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

  // Offered straight after a report, with the same confirmation as everywhere else.
  function onBlock() {
    if (blocking) return;
    confirmBlock(who, async () => {
      setBlocking(true);
      setProblem(null);
      try {
        await api.setBlock(String(uid), true);
        const myUid = auth.currentUser?.uid;
        if (myUid) await rememberBlockedName(myUid, String(uid), name ? String(name) : "A member");
        candidateCache.remove(String(uid));
        router.replace(conversationId ? "/(tabs)/chats" : "/(tabs)/discover");
      } catch (e) {
        setProblem(errorMessage(e));
      } finally {
        setBlocking(false);
      }
    });
  }

  if (done) {
    return (
      <Screen edges={[]}>
        <Title>Report received.</Title>
        <Body>{`Thanks. We review every report and keep it even if an account is deleted. ${EMERGENCY_LINE}`}</Body>
        <ErrorNotice message={problem} />
        <Button variant="primary" label="Done" onPress={() => router.back()} />
        <Button variant="danger" icon="ban-outline" label={`Block ${who}`} busy={blocking} busyLabel="Blocking…" onPress={onBlock} />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <Title>{`Report ${who}.`}</Title>
      <Caption icon="lock-closed-outline">{`${name ? String(name) : "They"} won’t see this.`}</Caption>
      <Text accessibilityRole="header" style={styles.label}>What happened?</Text>
      <ChipRow>
        {REPORT_REASONS.map(option => (
          <Chip key={option.value} role="radio" label={option.label} selected={reason === option.value} onPress={() => setReason(option.value)} />
        ))}
      </ChipRow>
      <Field label="Details (optional)" value={detail} onChangeText={setDetail} maxLength={MAX_DETAIL} multiline />
      {conversationId ? <Caption icon="eye-outline">Moderators can read this chat.</Caption> : null}
      <ErrorNotice message={problem} />
      <Button variant="primary" label="Send report" busy={busy} busyLabel="Sending…" onPress={onSubmit} />
    </Screen>
  );
}
