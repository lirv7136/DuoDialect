import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, Share, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api, type Candidate } from "../../src/lib/api";
import { auth } from "../../src/lib/firebase";
import { candidateCache } from "../../src/lib/candidate-cache";
import { subscribeInvitations } from "../../src/lib/live";
import { useNotificationsEnabled } from "../../src/lib/notification-prompt";
import { emptyDiscoverTitle, inviteMessage } from "../../src/domain/invite-copy";
import { capitalise } from "../../src/domain/profile-form";
import { errorMessage } from "../../src/domain/errors";
import { useMyAccount } from "../../hooks/use-my-account";
import { Body, Button, Card, EmptyState, ErrorNotice, Eyebrow, Heading, Loading, Pill, Screen, Title, styles } from "../../components/ui";
import { Avatar } from "../../components/avatar";
import { colors, space } from "../../constants/theme";
import { APP_NAME, LAUNCH_CITY, SITE_URL } from "../../constants/brand";

const list = (values: string[]) => values.map(capitalise).join(", ");

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
      if (result === "denied") setPushProblem("Allow notifications for this app in your phone’s settings, then try again.");
      if (result === "unavailable") setPushProblem("Notifications need the installed app on a phone.");
    } catch {
      setPushProblem("We couldn’t turn on notifications. Check your connection and try again.");
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

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(false, null, true)} tintColor={colors.green} />}>
      <Eyebrow>LESS SCROLLING. MORE CONVERSATION.</Eyebrow>
      <Title>Your next conversation starts here.</Title>
      <Body muted>Meet someone who speaks your next language, and share yours in return.</Body>

      {profile ? (
        <Card style={{ backgroundColor: colors.pale }}>
          <Text style={styles.body}>
            {`Your exchange: you share ${list(profile.offers) || "—"} and practise ${list(profile.seeks) || "—"}.`}
          </Text>
          <Button variant="ghost" label="Edit my languages" onPress={() => router.push("/account/edit")} />
        </Card>
      ) : null}

      <Heading>Language partners</Heading>
      <Body muted>Only people with a two-way exchange: they speak what you’re practising, and are practising what you speak.</Body>

      {loading ? <Loading label="Finding language partners" /> : null}
      <ErrorNotice message={error} onRetry={() => void load(false, null)} />

      {!loading && !error && candidates.length === 0 ? (
        <EmptyState
          title={cursor ? "Nobody in this batch fits your exchange." : emptyDiscoverTitle(profile?.offers ?? [], profile?.seeks ?? [], LAUNCH_CITY)}
          body={cursor
            ? "Look further, or add more times you can meet."
            : "Check back soon, and turn on notifications so you don’t miss an invitation."}
        >
          {cursor ? <Button variant="primary" label="Look further" busy={loadingMore} onPress={() => void load(true, cursor)} /> : null}
          {notifications.enabled
            ? <Text style={[styles.hint, { textAlign: "center" }]}>✓ Notifications on</Text>
            : <Button variant={cursor ? "secondary" : "primary"} label="Turn on notifications" busy={enablingPush} busyLabel="Turning on…" onPress={() => void onEnableNotifications()} />}
          <ErrorNotice message={pushProblem} />
          <Button label="Invite a friend" hint="Share an invitation to join" onPress={onShare} />
          <Button variant="ghost" label="Edit my languages or times" onPress={() => router.push("/account/edit")} />
          <Button variant="ghost" label="Refresh" onPress={() => void load(false, null)} />
        </EmptyState>
      ) : null}

      {candidates.map(person => (
        <Card key={person.uid}>
          <Pill label="You can help each other" tone="good" />
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Avatar name={person.displayName} photos={person.photos} size={56} />
            <View style={{ flexShrink: 1, gap: 2 }}>
              <Heading>{person.displayName}</Heading>
              {person.area ? <Text style={styles.hint}>{person.area}</Text> : null}
            </View>
          </View>
          <View style={{ gap: 2 }}>
            <Text style={styles.body}>{`Can help you with: ${list(person.exchange.theyOffer)}`}</Text>
            <Text style={styles.body}>{`You can help with: ${list(person.exchange.youOffer)}`}</Text>
          </View>
          <Text style={styles.hint}>
            {person.sharedAvailability.length ? `Shared times: ${person.sharedAvailability.join(", ")}` : "No shared times listed yet"}
          </Text>
          {person.bio ? <Text style={styles.body} numberOfLines={3}>{person.bio}</Text> : null}
          <Text style={styles.hint}>Fluency is self-declared.</Text>
          <View style={styles.row}>
            <Button label="View profile" accessibilityLabel={`View ${person.displayName}’s profile`}
              onPress={() => router.push({ pathname: "/person/[uid]", params: { uid: person.uid } })} />
            {pendingWith.has(person.uid) ? (
              <Button variant="ghost" label="Invitation open · see Plans" onPress={() => router.push("/(tabs)/plans")} />
            ) : (
              <Button variant="primary" label="Suggest a meetup" accessibilityLabel={`Suggest a meetup with ${person.displayName}`}
                onPress={() => router.push({ pathname: "/plan/new", params: { toUid: person.uid } })} />
            )}
          </View>
        </Card>
      ))}

      {candidates.length > 0 && cursor ? (
        <Button label="Show more partners" busy={loadingMore} busyLabel="Looking…" onPress={() => void load(true, cursor)} />
      ) : null}
      {candidates.length > 0 && !cursor ? <Text style={styles.hint}>That’s everyone who fits your exchange right now.</Text> : null}

      <Card>
        <Text style={styles.label}>You bring a language. They bring another.</Text>
        <Text style={styles.hint}>Try 20 minutes in each language. A coffee and a few mistakes are a great place to start.</Text>
      </Card>
    </Screen>
  );
}
