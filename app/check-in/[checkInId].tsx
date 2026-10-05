import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "../../src/lib/api";
import { subscribeCheckIn, type CheckInDoc } from "../../src/lib/live";
import { canAnswer, thanksFor, type CheckInAnswer } from "../../src/domain/check-in";
import { formatLocalDate } from "../../src/domain/schedule";
import { errorMessage } from "../../src/domain/errors";
import { usePeople } from "../../hooks/use-people";
import { Avatar } from "../../components/avatar";
import { ExchangeStrip } from "../../components/exchange-strip";
import { Body, Button, Caption, ErrorNotice, Loading, Screen, Title } from "../../components/ui";
import { space } from "../../constants/theme";

type Step = "happened" | "again" | "done";

/**
 * The morning after a plan: did it happen, and would you meet again? One question at a
 * time, private to this person, never a rating. A quiet report link sits underneath.
 */
export default function CheckInScreen() {
  const { checkInId } = useLocalSearchParams<{ checkInId: string }>();
  const [item, setItem] = useState<CheckInDoc | null | undefined>(undefined);
  const [step, setStep] = useState<Step>("happened");
  const [answer, setAnswer] = useState<CheckInAnswer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const inFlight = useRef(false);
  const people = usePeople(item ? [item.otherUid] : []);
  const name = item ? people[item.otherUid]?.name ?? "" : "";

  useEffect(() => {
    if (!checkInId) return;
    return subscribeCheckIn(String(checkInId), setItem, e => setProblem(errorMessage(e)));
  }, [checkInId]);

  async function send(next: CheckInAnswer, key: string, then: Step) {
    if (!item || inFlight.current) return;
    inFlight.current = true;
    setBusy(key);
    setProblem(null);
    try {
      await api.answerCheckIn(item.id, next);
      setAnswer(next);
      setStep(then);
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  function report() {
    if (!item) return;
    router.push({
      pathname: "/report/[uid]",
      params: { uid: item.otherUid, name, ...(item.conversationId ? { conversationId: item.conversationId } : {}) },
    });
  }

  if (item === undefined && !problem) return <Loading label="Loading your check-in" />;

  if (!item) {
    return (
      <Screen edges={[]}>
        <Title>This check-in has gone.</Title>
        <Body muted>It may have closed, or the plan was removed.</Body>
        <ErrorNotice message={problem} />
        <Button variant="primary" label="Back to Plans" onPress={() => router.replace("/(tabs)/plans")} />
      </Screen>
    );
  }

  const who = name || "your partner";
  const day = formatLocalDate(item.occurrence.localDate);
  const open = canAnswer(item);

  if (step === "done" && answer) {
    return (
      <Screen edges={[]}>
        <Title>Thanks.</Title>
        <Body>{thanksFor(answer, who)}</Body>
        <Button variant="primary" label="Done" onPress={() => router.back()} />
        {item.conversationId && answer.happened === "yes" && answer.meetAgain === "yes" ? (
          <Button icon="chatbubbles-outline" label={`Message ${who}`}
            onPress={() => router.replace({ pathname: "/chat/[chatId]", params: { chatId: item.conversationId as string, otherUid: item.otherUid } })} />
        ) : null}
        <Button variant="ghost" icon="flag-outline" label="Something went wrong? Report" onPress={report} />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <View style={{ alignItems: "center", gap: space.sm }}>
        <Avatar name={name} photos={people[item.otherUid]?.photos} size={72} />
        <Caption center icon="lock-closed-outline">{`Only you see this. ${name || "They"} won’t see your answer.`}</Caption>
      </View>

      {step === "happened" ? (
        <>
          <Title>{`Did you meet ${who} on ${day}?`}</Title>
          <ExchangeStrip compact theyTeach={[item.languages.received]} youTeach={[item.languages.gave]} />
          {!open ? <Caption icon="time-outline">This check-in has closed.</Caption> : null}
          <ErrorNotice message={problem} />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button style={{ flex: 1 }} variant="primary" label="Yes, we met" disabled={!open || !!busy}
              onPress={() => { setAnswer({ happened: "yes", meetAgain: null }); setStep("again"); }} />
            <Button style={{ flex: 1 }} label="No" disabled={!open || !!busy} busy={busy === "no"} busyLabel="Saving…"
              onPress={() => void send({ happened: "no", meetAgain: null }, "no", "done")} />
          </View>
        </>
      ) : null}

      {step === "again" ? (
        <>
          <Title>{`Meet ${who} again?`}</Title>
          <Body muted>Your answer stays with you. It just helps us know what to suggest.</Body>
          <ErrorNotice message={problem} />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button style={{ flex: 1 }} variant="primary" label="Yes" disabled={!!busy} busy={busy === "again-yes"} busyLabel="Saving…"
              onPress={() => void send({ happened: "yes", meetAgain: "yes" }, "again-yes", "done")} />
            <Button style={{ flex: 1 }} label="Not really" disabled={!!busy} busy={busy === "again-no"} busyLabel="Saving…"
              onPress={() => void send({ happened: "yes", meetAgain: "no" }, "again-no", "done")} />
          </View>
          <Button variant="ghost" label="Skip" disabled={!!busy} busy={busy === "again-skip"}
            onPress={() => void send({ happened: "yes", meetAgain: null }, "again-skip", "done")} />
        </>
      ) : null}

      <Button variant="ghost" icon="flag-outline" label="Something went wrong? Report" onPress={report} />
    </Screen>
  );
}
