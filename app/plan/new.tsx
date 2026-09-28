import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { api, ApiError } from "../../src/lib/api";
import { candidateCache } from "../../src/lib/candidate-cache";
import { getPublicProfile } from "../../src/lib/live";
import { askForNotificationsInContext } from "../../src/lib/notification-prompt";
import { deviceTimeZone } from "../../src/lib/time-zone";
import { exchangeLanguages } from "../../src/domain/language-exchange";
import { displayLanguage } from "../../src/domain/languages";
import { dateBlock } from "../../src/domain/display";
import { sanitizePhotos, type ProfilePhoto } from "../../src/domain/photos";
import { haptic } from "../../src/lib/feel";
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
import { meetingDateBounds } from "../../src/domain/date-bounds";
import { useMyAccount } from "../../hooks/use-my-account";
import { DateTimeField } from "../../components/date-time-field";
import { Button, Caption, Chip, ChipRow, ErrorNotice, Field, Loading, Screen, Segmented, Title, styles } from "../../components/ui";
import { Avatar } from "../../components/avatar";
import { ExchangeStrip } from "../../components/exchange-strip";
import { InfoButton } from "../../components/sheet";
import { MAX_FONT_SCALE, colors, fonts, radius, space, type } from "../../constants/theme";

type Target = { uid: string; name: string; area: string; theyOffer: string[]; youOffer: string[]; shared: string[]; photos: ProfilePhoto[] };

const PLACES = [
  { label: "Café", icon: "cafe-outline", noun: "café" },
  { label: "Library", icon: "library-outline", noun: "library" },
  { label: "Park", icon: "leaf-outline", noun: "park" },
] as const;

const placeFor = (noun: string, area: string) => (area ? `A ${noun} in ${area}` : `A ${noun}`).slice(0, MAX_VENUE);

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
  const [picking, setPicking] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
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
      if (value.area) setVenue(placeFor("café", value.area));
      setNote(`Hi ${value.name}! Fancy a coffee and a language swap?`);
    };
    if (cached) {
      apply({ uid: cached.uid, name: cached.displayName, area: cached.area, theyOffer: cached.exchange.theyOffer,
        youOffer: cached.exchange.youOffer, shared: cached.sharedAvailability, photos: sanitizePhotos(cached.photos) });
      return;
    }
    getPublicProfile(String(toUid)).then(profile => {
      if (!profile || !me) { setLoadError("This person isn’t available."); return; }
      const exchange = exchangeLanguages(me, profile);
      apply({ uid: profile.uid, name: profile.displayName, area: profile.area, theyOffer: exchange.theyCanHelpWith,
        youOffer: exchange.iCanHelpWith, shared: sharedSlots(me.availability, profile.availability), photos: sanitizePhotos(profile.photos) });
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
  const { minimumDate, maximumDate } = meetingDateBounds();
  const tomorrowSix = new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate() + 1, 18, 0);
  const onSuggested = suggestions.some(item => item.localDate === localDate && item.localTime === localTime);
  const showPickers = picking || !suggestions.length || (!!localDate && !onSuggested);
  const theirs = displayLanguage(toOffers) || "Theirs", yours = displayLanguage(fromOffers) || "Yours";

  return (
    <Screen edges={[]} footer={
      <>
        <ErrorNotice message={problem} />
        {duplicate ? <Button label="Open Plans" onPress={() => router.replace("/(tabs)/plans")} /> : null}
        <Button variant="primary" icon="paper-plane-outline" label="Send invite" busy={busy} busyLabel="Sending…" onPress={onSend} />
      </>
    }>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Avatar name={target.name} photos={target.photos} size={56} />
        <View style={{ flex: 1 }}><Title>{`Invite ${target.name}`}</Title></View>
      </View>

      <ExchangeStrip theyTeach={[toOffers]} youTeach={[fromOffers]} />
      {target.theyOffer.length > 1 ? (
        <ChipRow>{target.theyOffer.map(lang => (
          <Chip key={lang} role="radio" label={displayLanguage(lang)} accessibilityLabel={`${target.name} shares ${displayLanguage(lang)}`}
            selected={toOffers === lang} onPress={() => setToOffers(lang)} />
        ))}</ChipRow>
      ) : null}
      {target.youOffer.length > 1 ? (
        <ChipRow>{target.youOffer.map(lang => (
          <Chip key={lang} role="radio" label={displayLanguage(lang)} accessibilityLabel={`You share ${displayLanguage(lang)}`}
            selected={fromOffers === lang} onPress={() => setFromOffers(lang)} />
        ))}</ChipRow>
      ) : null}
      <SplitBar first={theirs} second={yours} />

      <Text accessibilityRole="header" style={styles.label}>When</Text>
      {suggestions.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: 2 }}>
          {suggestions.map(item => (
            <DateTile key={`${item.localDate}-${item.localTime}`} localDate={item.localDate} localTime={item.localTime}
              selected={!picking && localDate === item.localDate && localTime === item.localTime}
              onPress={() => { setPicking(false); setLocalDate(item.localDate); setLocalTime(item.localTime); }} />
          ))}
          <DateTile pickAnother selected={showPickers} onPress={() => setPicking(true)} />
        </ScrollView>
      ) : <Caption icon="calendar-outline">No shared times. Pick any.</Caption>}
      {showPickers ? (
        <View style={styles.row}>
          <View style={{ flexGrow: 1, flexBasis: 160 }}>
            <DateTimeField mode="date" label="Date" value={localDate} onChange={setLocalDate}
              initial={tomorrowSix} minimumDate={minimumDate} maximumDate={maximumDate} />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 120 }}>
            <DateTimeField mode="time" label="Time" value={localTime} onChange={setLocalTime} initial={tomorrowSix} />
          </View>
        </View>
      ) : null}
      {!timeZone ? <Caption icon="globe-outline">Time zone unavailable</Caption>
        : timeZone !== HOME_ZONE ? <Caption icon="globe-outline">{`Times in ${timeZone}`}</Caption> : null}

      <View style={[styles.row, { gap: space.sm, flexWrap: "nowrap" }]}>
        <View style={{ flex: 1 }}>
          <Segmented<Recurrence>
            value={recurrence}
            onChange={setRecurrence}
            options={[{ value: "once", label: "Once" }, { value: "weekly", label: "Weekly" }]}
          />
        </View>
        <InfoButton label="About weekly plans" title="Weekly" body="Same day and time each week." />
      </View>

      <Field label="Place" icon="location-outline" placeholder="A café or library" value={venue} onChangeText={setVenue} maxLength={MAX_VENUE} />
      <ChipRow>
        {PLACES.map(place => {
          const value = placeFor(place.noun, target.area);
          return (
            <Chip key={place.label} role="radio" icon={place.icon} label={place.label} accessibilityLabel={value}
              selected={venue === value} onPress={() => setVenue(value)} />
          );
        })}
      </ChipRow>

      {noteOpen ? (
        <Field label="Note" value={note} onChangeText={setNote} maxLength={MAX_NOTE} multiline autoFocus />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Note: ${note || "empty"}`}
          accessibilityHint="Edit the note"
          onPress={() => setNoteOpen(true)}
          style={({ pressed }) => [{
            minHeight: 48, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md,
            backgroundColor: colors.surface, borderRadius: radius.input, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: colors.line,
          }, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.muted} />
          <Text numberOfLines={1} style={[styles.body, { flex: 1 }]}>{note || "Add a note"}</Text>
          <Ionicons name="pencil" size={16} color={colors.primary} />
        </Pressable>
      )}
    </Screen>
  );
}

const HOME_ZONE = "Australia/Sydney";

/** 20′ | 20′: the swap, as a bar. Their language first, as the invitation note used to say. */
function SplitBar({ first, second }: { first: string; second: string }) {
  return (
    <View accessible accessibilityLabel={`20 minutes in ${first}, then 20 minutes in ${second}`}
      style={{ flexDirection: "row", borderRadius: radius.chip, overflow: "hidden", minHeight: 40 }}>
      <View style={{ flex: 1, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: space.sm }}>
        <Text style={[styles.label, { color: colors.onPrimary, fontFamily: fonts.bold }]}>20′</Text>
        <Text numberOfLines={1} style={[styles.hint, { color: colors.onPrimary, flexShrink: 1 }]}>{first}</Text>
      </View>
      <View style={{ width: 3, backgroundColor: colors.accent }} />
      <View style={{ flex: 1, backgroundColor: colors.accentSoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: space.sm }}>
        <Text style={[styles.label, { color: colors.accentInk, fontFamily: fonts.bold }]}>20′</Text>
        <Text numberOfLines={1} style={[styles.hint, { color: colors.accentInk, flexShrink: 1 }]}>{second}</Text>
      </View>
    </View>
  );
}

/** A suggested time as a big tile (weekday, day number, time), or the "Pick another" tile. */
function DateTile({ localDate, localTime, selected, onPress, pickAnother = false }: {
  localDate?: string; localTime?: string; selected: boolean; onPress: () => void; pickAnother?: boolean;
}) {
  const block = localDate ? dateBlock(localDate) : null;
  const ink = selected ? colors.onPrimary : colors.primary;
  const spoken = pickAnother ? "Pick another date and time" : `${formatLocalDate(localDate ?? "")} at ${localTime}`;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={spoken}
      accessibilityState={{ checked: selected }}
      onPress={() => { haptic.selection(); onPress(); }}
      style={({ pressed }) => [{
        width: 84, minHeight: 104, borderRadius: radius.card, alignItems: "center", justifyContent: "center", gap: 2, padding: space.sm,
        backgroundColor: selected ? colors.primary : colors.surface, borderWidth: 1.5, borderColor: selected ? colors.primary : colors.line,
        borderStyle: pickAnother && !selected ? "dashed" : "solid",
      }, pressed && { opacity: 0.85 }]}
    >
      {pickAnother ? (
        <>
          <Ionicons name="add" size={26} color={ink} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[styles.hint, { color: ink, textAlign: "center", fontFamily: fonts.semibold }]}>Pick another</Text>
        </>
      ) : (
        <>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[styles.hint, { color: ink, fontFamily: fonts.bold }]}>{block?.weekday}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: ink }}>{block?.day}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[type.numeric, { fontSize: 14, color: ink }]}>{localTime}</Text>
        </>
      )}
    </Pressable>
  );
}
