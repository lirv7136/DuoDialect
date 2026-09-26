import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api, ApiError } from "../../src/lib/api";
import { candidateCache } from "../../src/lib/candidate-cache";
import { getPublicProfile } from "../../src/lib/live";
import { askForNotificationsInContext } from "../../src/lib/notification-prompt";
import { deviceTimeZone } from "../../src/lib/time-zone";
import { exchangeLanguages } from "../../src/domain/language-exchange";
import { capitalise } from "../../src/domain/profile-form";
import { createDraftKeys } from "../../src/domain/idempotency";
import { errorMessage } from "../../src/domain/errors";
import {
  MAX_NOTE,
  MAX_VENUE,
  formatLocalDate,
  sharedSlots,
  suggestMeetingTimes,
  validateMeetingDraft,
  type Recurrence,
} from "../../src/domain/schedule";
import { useMyAccount } from "../../hooks/use-my-account";
import { Body, Button, Card, Chip, ChipRow, ErrorNotice, Field, Heading, Loading, Screen, styles } from "../../components/ui";

type Target = { uid: string; name: string; area: string; theyOffer: string[]; youOffer: string[]; shared: string[] };

export default function NewPlan() {
  const { toUid } = useLocalSearchParams<{ toUid: string }>();
  const { profile: me, loading: meLoading } = useMyAccount();
  const [target, setTarget] = useState<Target | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fromOffers, setFromOffers] = useState("");
  const [toOffers, setToOffers] = useState("");
  const [localDate, setLocalDate] = useState("");
  const [localTime, setLocalTime] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("once");
  const [venue, setVenue] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  // One requestKey per intended invitation, reused for every retry of the same draft.
  const keys = useRef(createDraftKeys()).current;
  const timeZone = deviceTimeZone();

  useEffect(() => {
    if (!toUid || meLoading || target) return;
    const cached = candidateCache.get(String(toUid));
    const apply = (value: Target) => {
      setTarget(value);
      setFromOffers(value.youOffer[0] ?? "");
      setToOffers(value.theyOffer[0] ?? "");
      const first = suggestMeetingTimes(value.shared.length ? value.shared : (me?.availability ?? []))[0];
      if (first) { setLocalDate(first.localDate); setLocalTime(first.localTime); }
      if (value.area) setVenue(`A café in ${value.area}`.slice(0, MAX_VENUE));
      setNote(`Hi ${value.name}! Fancy a coffee and a language swap? We could try 20 minutes in each language.`);
    };
    if (cached) {
      apply({ uid: cached.uid, name: cached.displayName, area: cached.area, theyOffer: cached.exchange.theyOffer,
        youOffer: cached.exchange.youOffer, shared: cached.sharedAvailability });
      return;
    }
    getPublicProfile(String(toUid)).then(profile => {
      if (!profile || !me) { setLoadError("This person isn’t available."); return; }
      const exchange = exchangeLanguages(me, profile);
      apply({ uid: profile.uid, name: profile.displayName, area: profile.area, theyOffer: exchange.theyCanHelpWith,
        youOffer: exchange.iCanHelpWith, shared: sharedSlots(me.availability, profile.availability) });
    }).catch(e => setLoadError(errorMessage(e)));
  }, [toUid, me, meLoading, target]);

  async function onSend() {
    if (inFlight.current || !target) return;
    setDuplicate(false);
    const issue = !timeZone
      ? "We couldn’t detect your time zone, so we can’t send a time safely."
      : validateMeetingDraft({ venue, localDate, localTime, recurrence, note }, { sharedAvailability: target.shared });
    setProblem(issue);
    if (issue || !timeZone) return;
    const input = {
      toUid: target.uid,
      note: note.trim(),
      ...(fromOffers && toOffers ? { languages: { fromOffers, toOffers } } : {}),
      meeting: { venue: venue.trim(), localDate: localDate.trim(), localTime: localTime.trim(), timeZone, recurrence },
    };
    const requestKey = keys.keyFor(JSON.stringify(input));
    inFlight.current = true;
    setBusy(true);
    try {
      await api.createInvitation(input, requestKey);
      keys.settle();
      router.replace("/(tabs)/plans");
      void askForNotificationsInContext({ kind: "invitation-sent", name: target.name });
    } catch (e) {
      setProblem(errorMessage(e));
      setDuplicate(e instanceof ApiError && e.reason === "invitation/duplicate-active");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (loadError) return <Screen edges={[]}><ErrorNotice message={loadError} /><Button label="Back" onPress={() => router.back()} /></Screen>;
  if (!target) return <Loading label="Preparing your invitation" />;

  const suggestions = suggestMeetingTimes(target.shared.length ? target.shared : (me?.availability ?? []), new Date(), 4);

  return (
    <Screen edges={[]}>
      <Heading>{`Say hello to ${target.name}.`}</Heading>
      <Body muted>A platonic language meetup. Suggest a public place and a time; you can agree the details together in chat once they accept.</Body>

      <Card>
        <Text style={styles.label}>Your exchange</Text>
        {target.youOffer.length > 1 ? (
          <>
            <Text style={styles.hint}>You’ll share</Text>
            <ChipRow>{target.youOffer.map(lang => (
              <Chip key={lang} role="radio" label={capitalise(lang)} selected={fromOffers === lang} onPress={() => setFromOffers(lang)} />
            ))}</ChipRow>
          </>
        ) : null}
        {target.theyOffer.length > 1 ? (
          <>
            <Text style={styles.hint}>{`${target.name} will share`}</Text>
            <ChipRow>{target.theyOffer.map(lang => (
              <Chip key={lang} role="radio" label={capitalise(lang)} selected={toOffers === lang} onPress={() => setToOffers(lang)} />
            ))}</ChipRow>
          </>
        ) : null}
        <Text style={styles.body}>{`20 minutes in ${capitalise(toOffers) || "their language"}, 20 minutes in ${capitalise(fromOffers) || "yours"}.`}</Text>
      </Card>

      <Text accessibilityRole="header" style={styles.label}>When</Text>
      <Text style={styles.hint}>
        {target.shared.length ? `Times you share: ${target.shared.join(", ")}.` : "You don’t have shared times listed, so pick any time and mention it in your note."}
      </Text>
      {suggestions.length ? (
        <ChipRow>{suggestions.map(item => (
          <Chip key={`${item.localDate}-${item.localTime}`} role="radio"
            label={`${formatLocalDate(item.localDate)} · ${item.localTime}`}
            selected={localDate === item.localDate && localTime === item.localTime}
            onPress={() => { setLocalDate(item.localDate); setLocalTime(item.localTime); }} />
        ))}</ChipRow>
      ) : null}
      <View style={styles.row}>
        <View style={{ flexGrow: 1, flexBasis: 160 }}>
          <Field label="Date" hint="YYYY-MM-DD" value={localDate} onChangeText={setLocalDate} maxLength={10} keyboardType="numbers-and-punctuation" />
        </View>
        <View style={{ flexGrow: 1, flexBasis: 120 }}>
          <Field label="Time" hint="24-hour HH:mm" value={localTime} onChangeText={setLocalTime} maxLength={5} keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      <Text style={styles.hint}>{timeZone ? `Time zone: ${timeZone}` : "Time zone unavailable"}</Text>

      <Text style={styles.label}>How often</Text>
      <ChipRow>
        <Chip role="radio" label="One meetup" selected={recurrence === "once"} onPress={() => setRecurrence("once")} />
        <Chip role="radio" label="Weekly practice" selected={recurrence === "weekly"} onPress={() => setRecurrence("weekly")} />
      </ChipRow>
      {recurrence === "weekly" ? <Text style={styles.hint}>Same weekday and time from this date. It’s a shared intention: there are no reminders.</Text> : null}

      <Field label="Public place" hint="Somewhere public, like a café or library." value={venue} onChangeText={setVenue} maxLength={MAX_VENUE} />
      <Field label="Note" value={note} onChangeText={setNote} maxLength={MAX_NOTE} multiline />

      <ErrorNotice message={problem} />
      {duplicate ? <Button label="Open Plans" onPress={() => router.replace("/(tabs)/plans")} /> : null}
      <Button variant="primary" label="Send invitation" busy={busy} busyLabel="Sending…" onPress={onSend} />
    </Screen>
  );
}
