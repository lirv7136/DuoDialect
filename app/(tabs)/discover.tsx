import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, Share, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { api, type Candidate } from "../../src/lib/api";
import { auth } from "../../src/lib/firebase";
import { candidateCache } from "../../src/lib/candidate-cache";
import { subscribeInvitations } from "../../src/lib/live";
import { useNotificationsEnabled } from "../../src/lib/notification-prompt";
import { emptyDiscoverTitle, inviteMessage } from "../../src/domain/invite-copy";
import { languageCode } from "../../src/domain/display";
import { displayLanguage } from "../../src/domain/languages";
import { hasSeen, markSeen } from "../../src/lib/seen-once";
import { errorMessage } from "../../src/domain/errors";
import { useMyAccount } from "../../hooks/use-my-account";
import { Button, Caption, Display, ErrorNotice, Heading, Loading, Screen, styles } from "../../components/ui";
import { EmptyState } from "../../components/empty-state";
import { InfoButton } from "../../components/sheet";
import { PartnerCard } from "../../components/partner-card";
import { CARD_GAP, colors, fonts, radius, space } from "../../constants/theme";
import { APP_NAME, LAUNCH_CITY, SITE_URL } from "../../constants/brand";

const PARTNERS_INFO = "discover.partners.v1";
const codes = (values: string[]) => values.map(languageCode).join(" · ") || "?";

export default function Discover() {
  const { profile } = useMyAccount();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingWith, setPendingWith] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [pushProblem, setPushProblem] = useState<string | null>(null);
  const notifications = useNotificationsEnabled();
  const loadedOnce = useRef(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  // How the two-way swap works is explained once, here, the first time Discover opens.
  useEffect(() => {
    let live = true;
    void hasSeen(PARTNERS_INFO).then(seen => {
      if (!live || seen) return;
      setAboutOpen(true);
      void markSeen(PARTNERS_INFO);
    });
    return () => { live = false; };
  }, []);

  // `quiet` refreshes (pull to refresh, returning to the tab) keep the current list on screen.
  const load = useCallback(async (more: boolean, after: string | null, quiet = false) => {
    setError(null);
    if (more) setLoadingMore(true); else if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const result = await api.discoverCandidates({ cursor: more ? after : null });
      candidateCache.put(result.candidates);
      setCandidates(current => {
        if (!more) return result.candidates;
        const seen = new Set(current.map(item => item.uid));
        return [...current, ...result.candidates.filter(item => !seen.has(item.uid))];
      });
      setCursor(result.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  // Load on first focus, then refresh quietly each time the tab comes back into view.
  useFocusEffect(useCallback(() => {
    void load(false, null, loadedOnce.current);
    loadedOnce.current = true;
  }, [load]));

  async function onEnableNotifications() {
    if (enablingPush) return;
    setEnablingPush(true);
    setPushProblem(null);
    try {
      const result = await notifications.enable();
      if (result === "denied") setPushProblem("Allow notifications in Settings, then try again.");
      if (result === "unavailable") setPushProblem("Needs the phone app.");
    } catch {
      setPushProblem("Couldn’t turn on. Check your connection.");
    } finally {
      setEnablingPush(false);
    }
  }

  function onShare() {
    void Share.share({ message: inviteMessage(profile?.offers ?? [], profile?.seeks ?? [], APP_NAME, SITE_URL) }).catch(() => undefined);
  }

  // Show which people already have an open invitation, in either direction.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return subscribeInvitations(uid, items => setPendingWith(new Set(items
      .filter(item => item.status === "pending")
      .map(item => (item.fromUid === uid ? item.toUid : item.fromUid)))), () => undefined);
  }, []);

  const offers = profile?.offers ?? [], seeks = profile?.seeks ?? [];

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(false, null, true)} tintColor={colors.primary} />}>
      <View style={[styles.row, { justifyContent: "space-between", flexWrap: "nowrap" }]}>
        <Display>Discover</Display>
        {profile ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Your exchange: you share ${offers.map(displayLanguage).join(", ") || "nothing yet"}, you practise ${seeks.map(displayLanguage).join(", ") || "nothing yet"}`}
            accessibilityHint="Edit your languages"
            onPress={() => router.push("/account/edit")}
            hitSlop={4}
            style={({ pressed }) => [{
              minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.md, borderRadius: radius.chip,
              backgroundColor: colors.surfaceNavySoft, flexShrink: 1,
            }, pressed && { opacity: 0.7 }]}
          >
            <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.primary, flexShrink: 1 }}>
              {codes(offers)} <Text style={{ color: colors.accentInk }}>⇄</Text> {codes(seeks)}
            </Text>
            <Ionicons name="pencil" size={14} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.row, { gap: 0, marginBottom: -space.xs }]}>
        <Heading>Partners</Heading>
        <InfoButton label="About partners" title="Partners" open={aboutOpen} onOpenChange={setAboutOpen}
          body="They speak what you’re learning, and are learning what you speak." />
      </View>

      {loading ? <Loading label="Finding language partners" /> : null}
      <ErrorNotice message={error} onRetry={() => void load(false, null)} />

      {!loading && !error && candidates.length === 0 ? (
        <EmptyState
          art="search"
          title={cursor ? "No partners in this batch." : emptyDiscoverTitle(offers, seeks, LAUNCH_CITY)}
          body="We’ll let you know when someone joins."
        >
          {cursor ? <Button variant="primary" label="Show more" busy={loadingMore} busyLabel="Looking…" onPress={() => void load(true, cursor)} /> : null}
          {notifications.enabled
            ? <Caption icon="notifications" center>Notifications on</Caption>
            : <Button variant={cursor ? "secondary" : "primary"} icon="notifications-outline" label="Notify me"
                accessibilityLabel="Turn on notifications" busy={enablingPush} busyLabel="Turning on…" onPress={() => void onEnableNotifications()} />}
          <ErrorNotice message={pushProblem} />
          <Button icon="share-outline" label="Invite a friend" hint="Share an invitation to join" onPress={onShare} />
          <Button variant="ghost" label="Edit profile" accessibilityLabel="Edit my languages or times" onPress={() => router.push("/account/edit")} />
        </EmptyState>
      ) : null}

      <View style={{ gap: CARD_GAP }}>
        {candidates.map(person => (
          <PartnerCard
            key={person.uid}
            person={person}
            invited={pendingWith.has(person.uid)}
            onOpen={() => router.push({ pathname: "/person/[uid]", params: { uid: person.uid } })}
            onInvite={() => router.push({ pathname: "/plan/new", params: { toUid: person.uid } })}
            onInvited={() => router.push("/(tabs)/plans")}
          />
        ))}
      </View>

      {candidates.length > 0 && cursor ? (
        <Button label="Show more" accessibilityLabel="Show more partners" busy={loadingMore} busyLabel="Looking…" onPress={() => void load(true, cursor)} />
      ) : null}
      {candidates.length > 0 && !cursor ? <Caption center>That’s everyone for now.</Caption> : null}
    </Screen>
  );
}
