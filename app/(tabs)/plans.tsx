import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { api } from "../../src/lib/api";
import { auth } from "../../src/lib/firebase";
import { subscribeInvitations, subscribeOpenCheckIns, type CheckInDoc, type InvitationDoc } from "../../src/lib/live";
import { openCheckIns } from "../../src/domain/check-in";
import { askForNotificationsInContext } from "../../src/lib/notification-prompt";
import { dismissSafetyTips, safetyTipsDismissed } from "../../src/lib/safety-tips";
import { formatLocalDate } from "../../src/domain/schedule";
import { initialSegment, planSegments } from "../../src/domain/display";
import { errorMessage } from "../../src/domain/errors";
import { deviceTimeZone } from "../../src/lib/time-zone";
import { Caption, Display, ErrorNotice, Heading, Loading, Screen, Segmented, Button } from "../../components/ui";
import { EmptyState } from "../../components/empty-state";
import { PlanCard } from "../../components/plan-card";
import { AcceptedSheet, BubbleConfetti, useFirstMeetupCelebration } from "../../components/celebrations";
import { confirmAction } from "../../components/safety-menu";
import { usePeople } from "../../hooks/use-people";
import { useMyAccount } from "../../hooks/use-my-account";
import { CARD_GAP } from "../../constants/theme";
import { SafetyCard } from "../../components/safety-card";
import { CheckInCard } from "../../components/check-in-card";

type Busy = Record<string, "accept" | "decline" | "cancel" | undefined>;
type Segment = "upcoming" | "invites" | "past";

export default function Plans() {
  const uid = auth.currentUser?.uid ?? "";
  const { profile: me } = useMyAccount();
  const [items, setItems] = useState<InvitationDoc[] | null>(null);
  // Open post meetup check-ins. A failure here only hides the prompts; Plans still works.
  const [checkIns, setCheckIns] = useState<CheckInDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>({});
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [segment, setSegment] = useState<Segment | null>(null);
  // The invitation that just became a plan, from either side, for the celebration sheet.
  const [accepted, setAccepted] = useState<InvitationDoc | null>(null);
  const [burst, setBurst] = useState(false);
  const inFlight = useRef(new Set<string>());
  const lastStatus = useRef<Map<string, string> | null>(null);
  // Name and photos for the other person on each invitation. A hidden profile reads as a neutral label.
  const people = usePeople([
    ...(items ?? []).map(item => (item.fromUid === uid ? item.toUid : item.fromUid)),
    ...checkIns.map(item => item.otherUid),
  ]);
  // Unknown until read, so the tips never flash for someone who already dismissed them.
  const [tipsDismissed, setTipsDismissed] = useState<boolean | null>(null);
  const { due: firstMeetupDue, markDone: celebrated } = useFirstMeetupCelebration(uid);

  useEffect(() => { void safetyTipsDismissed().then(setTipsDismissed); }, []);

  useEffect(() => {
    if (!uid) return;
    return subscribeInvitations(uid, next => {
      // An invitation I sent that turns accepted while I'm here gets the same celebration.
      const before = lastStatus.current;
      if (before) {
        const justAccepted = next.find(item => item.fromUid === uid && item.status === "accepted" && before.get(item.id) === "pending");
        if (justAccepted) setAccepted(justAccepted);
      }
      lastStatus.current = new Map(next.map(item => [item.id, item.status]));
      setItems(next);
      setError(null);
    }, e => setError(errorMessage(e)));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return subscribeOpenCheckIns(uid, setCheckIns, () => setCheckIns([]));
  }, [uid]);

  // The first confirmed meetup gets one burst of bubble confetti, once per person.
  const hasConfirmed = !!items?.some(item => item.status === "accepted");
  useEffect(() => {
    if (firstMeetupDue && hasConfirmed) {
      setBurst(true);
      celebrated();
    }
  }, [firstMeetupDue, hasConfirmed, celebrated]);

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
        if (action === "accept") setAccepted({ ...item, status: "accepted", conversationId: result.conversationId ?? item.conversationId });
      }
    } catch (e) {
      setCardErrors(current => ({ ...current, [item.id]: errorMessage(e) }));
    } finally {
      inFlight.current.delete(item.id);
      setBusy(current => ({ ...current, [item.id]: undefined }));
    }
  }

  function closeAccepted(openChat: boolean) {
    const item = accepted;
    setAccepted(null);
    if (!item) return;
    if (openChat && item.conversationId) router.push({ pathname: "/chat/[chatId]", params: { chatId: item.conversationId } });
    // Ask about notifications once the sheet has gone, as before, only for the person who accepted.
    if (item.toUid === uid) {
      setTimeout(() => { void askForNotificationsInContext({ kind: "invitation-accepted", name: people[item.fromUid]?.name }); }, 450);
    }
  }

  function confirm(item: InvitationDoc, action: "decline" | "cancel") {
    const name = people[item.fromUid === uid ? item.toUid : item.fromUid]?.name ?? "They";
    confirmAction(action === "decline"
      ? { title: "Decline?", body: `${name} will see you declined.`, confirm: "Decline", cancel: "Keep", onConfirm: () => void run(item, action) }
      : { title: "Cancel invite?", body: "You can send a new one later.", confirm: "Cancel invite", cancel: "Keep", onConfirm: () => void run(item, action) });
  }

  if (!items && !error) return <Loading label="Loading your plans" />;

  const all = items ?? [];
  const segments = planSegments(all, uid);
  const current = segment ?? initialSegment(segments);
  const myZone = deviceTimeZone();
  const otherOf = (item: InvitationDoc) => (item.fromUid === uid ? item.toUid : item.fromUid);

  const card = (item: InvitationDoc) => (
    <PlanCard
      key={item.id}
      item={item}
      uid={uid}
      person={people[otherOf(item)]}
      busy={busy[item.id]}
      error={cardErrors[item.id]}
      myZone={myZone}
      onAccept={() => void run(item, "accept")}
      onDecline={() => confirm(item, "decline")}
      onCancel={() => confirm(item, "cancel")}
      onOpenChat={() => router.push({ pathname: "/chat/[chatId]", params: { chatId: item.conversationId as string } })}
    />
  );

  const other = accepted ? people[otherOf(accepted)] : undefined;

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Display>Plans</Display>
        <ErrorNotice message={error} />

        {openCheckIns(checkIns).map(item => (
          <CheckInCard key={item.id} item={item} person={people[item.otherUid]}
            onOpen={() => router.push({ pathname: "/check-in/[checkInId]", params: { checkInId: item.id } })} />
        ))}

        {all.length === 0 && !error ? (
          <EmptyState art="calendar" title="Nothing planned yet.">
            <Button variant="primary" label="Find partners" onPress={() => router.push("/(tabs)/discover")} />
          </EmptyState>
        ) : (
          <>
            <Segmented<Segment>
              value={current}
              onChange={setSegment}
              options={[
                { value: "upcoming", label: "Upcoming" },
                { value: "invites", label: "Invites", badge: segments.received.length },
                { value: "past", label: "Past" },
              ]}
            />
            <View style={{ gap: CARD_GAP }}>
              {current === "upcoming" ? (
                <>
                  {segments.upcoming.length && tipsDismissed === false ? (
                    <SafetyCard onDismiss={() => { setTipsDismissed(true); void dismissSafetyTips(); }} />
                  ) : null}
                  {segments.upcoming.length ? segments.upcoming.map(card) : <Caption center>No confirmed plans yet.</Caption>}
                </>
              ) : null}
              {current === "invites" ? (
                <>
                  {segments.received.length ? <><Heading>{`For you (${segments.received.length})`}</Heading>{segments.received.map(card)}</> : null}
                  {segments.sent.length ? <><Heading>{`Sent (${segments.sent.length})`}</Heading>{segments.sent.map(card)}</> : null}
                  {!segments.received.length && !segments.sent.length ? <Caption center>No open invites.</Caption> : null}
                </>
              ) : null}
              {current === "past" ? (segments.past.length ? segments.past.map(card) : <Caption center>Nothing here yet.</Caption>) : null}
            </View>
          </>
        )}
      </Screen>

      {burst && !accepted ? <BubbleConfetti onDone={() => setBurst(false)} /> : null}
      <AcceptedSheet
        visible={!!accepted}
        me={{ name: me?.displayName ?? "", photos: me?.photos }}
        them={{ name: other?.name ?? "", photos: other?.photos }}
        when={accepted ? `${formatLocalDate(accepted.meeting.localDate)} · ${accepted.meeting.localTime}` : undefined}
        confetti={burst}
        onOpenChat={accepted?.conversationId ? () => closeAccepted(true) : undefined}
        onClose={() => { setBurst(false); closeAccepted(false); }}
      />
    </View>
  );
}
