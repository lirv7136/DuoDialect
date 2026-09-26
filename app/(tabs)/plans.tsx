import { useEffect, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { router } from "expo-router";
import { api } from "../../src/lib/api";
import { auth } from "../../src/lib/firebase";
import { getPublicProfile, subscribeInvitations, type InvitationDoc } from "../../src/lib/live";
import { askForNotificationsInContext } from "../../src/lib/notification-prompt";
import { dismissSafetyTips, safetyTipsDismissed } from "../../src/lib/safety-tips";
import { formatMeeting } from "../../src/domain/schedule";
import { capitalise } from "../../src/domain/profile-form";
import { errorMessage } from "../../src/domain/errors";
import { deviceTimeZone } from "../../src/lib/time-zone";
import { Body, Button, Card, EmptyState, ErrorNotice, Eyebrow, Heading, Loading, Pill, Screen, Title, styles } from "../../components/ui";
import { SafetyCard } from "../../components/safety-card";

type Busy = Record<string, "accept" | "decline" | "cancel" | undefined>;

export default function Plans() {
  const uid = auth.currentUser?.uid ?? "";
  const [items, setItems] = useState<InvitationDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Busy>({});
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const inFlight = useRef(new Set<string>());
  const requestedNames = useRef(new Set<string>());
  // Unknown until read, so the tips never flash for someone who already dismissed them.
  const [tipsDismissed, setTipsDismissed] = useState<boolean | null>(null);

  useEffect(() => { void safetyTipsDismissed().then(setTipsDismissed); }, []);

  useEffect(() => {
    if (!uid) return;
    return subscribeInvitations(uid, next => { setItems(next); setError(null); }, e => setError(errorMessage(e)));
  }, [uid]);

  // Names for the other person on each invitation. A hidden profile reads as a neutral label.
  useEffect(() => {
    for (const item of items ?? []) {
      const other = item.fromUid === uid ? item.toUid : item.fromUid;
      if (requestedNames.current.has(other)) continue;
      requestedNames.current.add(other);
      getPublicProfile(other)
        .then(profile => setNames(current => ({ ...current, [other]: profile?.displayName || "A member" })))
        .catch(() => setNames(current => ({ ...current, [other]: "A member" })));
    }
  }, [items, uid]);

  // One action per invitation at a time; the callables are also idempotent on repeat.
  async function run(item: InvitationDoc, action: "accept" | "decline" | "cancel") {
    if (inFlight.current.has(item.id)) return;
    inFlight.current.add(item.id);
    setBusy(current => ({ ...current, [item.id]: action }));
    setCardErrors(current => ({ ...current, [item.id]: "" }));
    try {
      if (action === "cancel") {
        await api.cancelInvitation(item.id);
      } else {
        const result = await api.respondToInvitation(item.id, action);
        if (action === "accept") {
          await askForNotificationsInContext({ kind: "invitation-accepted", name: names[item.fromUid] });
          if (result.conversationId) router.push({ pathname: "/chat/[chatId]", params: { chatId: result.conversationId } });
        }
      }
    } catch (e) {
      setCardErrors(current => ({ ...current, [item.id]: errorMessage(e) }));
    } finally {
      inFlight.current.delete(item.id);
      setBusy(current => ({ ...current, [item.id]: undefined }));
    }
  }

  function confirm(item: InvitationDoc, action: "decline" | "cancel") {
    const name = names[item.fromUid === uid ? item.toUid : item.fromUid] ?? "them";
    Alert.alert(
      action === "decline" ? "Decline this invitation?" : "Cancel this invitation?",
      action === "decline"
        ? `${name} will see that the invitation was declined.`
        : `This withdraws your invitation to ${name}. You can send a new one later.`,
      [
        { text: "Keep it", style: "cancel" },
        { text: action === "decline" ? "Decline" : "Cancel invitation", style: "destructive", onPress: () => void run(item, action) },
      ],
    );
  }

  if (!items && !error) return <Loading label="Loading your plans" />;

  const all = items ?? [];
  const received = all.filter(item => item.status === "pending" && item.toUid === uid);
  const sent = all.filter(item => item.status === "pending" && item.fromUid === uid);
  const confirmed = all.filter(item => item.status === "accepted");
  const closed = all.filter(item => item.status === "declined" || item.status === "cancelled").slice(0, 10);
  const myZone = deviceTimeZone();

  const card = (item: InvitationDoc) => {
    const mine = item.fromUid === uid;
    const other = mine ? item.toUid : item.fromUid;
    const name = names[other] ?? "…";
    const iShare = mine ? item.languages?.fromOffers : item.languages?.toOffers;
    const theyShare = mine ? item.languages?.toOffers : item.languages?.fromOffers;
    const state = busy[item.id];
    const status = item.status === "pending"
      ? (mine ? `Waiting for ${name}` : "Waiting for your answer")
      : item.status === "accepted" ? "Confirmed" : item.status === "declined" ? "Declined" : "Cancelled";
    return (
      <Card key={item.id}>
        <Pill label={status} tone={item.status === "accepted" ? "good" : item.status === "pending" ? "warn" : "neutral"} />
        <Heading>{mine ? `You invited ${name}` : `${name} invited you`}</Heading>
        <Text style={styles.body}>{formatMeeting(item.meeting)}</Text>
        <Text style={styles.body}>{item.meeting.venue}</Text>
        {item.meeting.timeZone !== myZone ? <Text style={styles.hint}>{`Times are in ${item.meeting.timeZone}.`}</Text> : null}
        {iShare && theyShare ? (
          <Text style={styles.hint}>{`You share ${capitalise(iShare)} · ${name} shares ${capitalise(theyShare)}`}</Text>
        ) : null}
        {item.note ? <Text style={styles.body}>{`“${item.note}”`}</Text> : null}
        <ErrorNotice message={cardErrors[item.id] || null} />
        <View style={styles.row}>
          {item.status === "pending" && !mine ? (
            <>
              <Button variant="primary" label="Accept" busy={state === "accept"} busyLabel="Accepting…" disabled={!!state}
                accessibilityLabel={`Accept invitation from ${name}`} onPress={() => void run(item, "accept")} />
              <Button label="Decline" busy={state === "decline"} disabled={!!state}
                accessibilityLabel={`Decline invitation from ${name}`} onPress={() => confirm(item, "decline")} />
            </>
          ) : null}
          {item.status === "pending" && mine ? (
            <Button label="Cancel invitation" busy={state === "cancel"} busyLabel="Cancelling…" disabled={!!state}
              accessibilityLabel={`Cancel invitation to ${name}`} onPress={() => confirm(item, "cancel")} />
          ) : null}
          {item.status === "accepted" && item.conversationId ? (
            <Button variant="primary" label="Open chat" accessibilityLabel={`Open chat with ${name}`}
              onPress={() => router.push({ pathname: "/chat/[chatId]", params: { chatId: item.conversationId as string } })} />
          ) : null}
        </View>
      </Card>
    );
  };

  return (
    <Screen>
      <Eyebrow>MAKE A LITTLE TIME FOR CONNECTION</Eyebrow>
      <Title>Good things on the calendar.</Title>
      <Body muted>Your invitations and weekly language exchanges, in one place. Weekly plans are a shared intention: there are no reminders, and each week isn’t booked separately.</Body>
      <ErrorNotice message={error} />

      {all.length === 0 && !error ? (
        <EmptyState title="Nothing planned yet." body="Find a language partner and suggest a public place and time to meet.">
          <Button variant="primary" label="Discover partners" onPress={() => router.push("/(tabs)/discover")} />
        </EmptyState>
      ) : null}

      {received.length ? <><Heading>{`Waiting for you (${received.length})`}</Heading>{received.map(card)}</> : null}
      {sent.length ? <><Heading>{`Sent (${sent.length})`}</Heading>{sent.map(card)}</> : null}
      {confirmed.length && tipsDismissed === false ? (
        <SafetyCard title="Your first meetup is confirmed. Meeting safely:" onDismiss={() => { setTipsDismissed(true); void dismissSafetyTips(); }} />
      ) : null}
      {confirmed.length ? <><Heading>Confirmed</Heading>{confirmed.map(card)}</> : null}
      {closed.length ? <><Heading>Closed</Heading>{closed.map(card)}</> : null}
    </Screen>
  );
}
