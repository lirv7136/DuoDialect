import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { api, type Candidate } from "../../src/lib/api";
import { auth } from "../../src/lib/firebase";
import { candidateCache } from "../../src/lib/candidate-cache";
import { subscribeInvitations } from "../../src/lib/live";
import { capitalise } from "../../src/domain/profile-form";
import { errorMessage } from "../../src/domain/errors";
import { useMyAccount } from "../../hooks/use-my-account";
import { Body, Button, Card, EmptyState, ErrorNotice, Eyebrow, Heading, Loading, Pill, Screen, Title, styles } from "../../components/ui";
import { colors } from "../../constants/theme";

const list = (values: string[]) => values.map(capitalise).join(", ");

export default function Discover() {
  const { profile } = useMyAccount();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingWith, setPendingWith] = useState<Set<string>>(new Set());

  const load = useCallback(async (more: boolean, after: string | null) => {
    setError(null);
    if (more) setLoadingMore(true); else setLoading(true);
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
    }
  }, []);

  useEffect(() => { void load(false, null); }, [load]);

  // Show which people already have an open invitation, in either direction.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return subscribeInvitations(uid, items => setPendingWith(new Set(items
      .filter(item => item.status === "pending")
      .map(item => (item.fromUid === uid ? item.toUid : item.fromUid)))), () => undefined);
  }, []);

  return (
    <Screen>
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
          title="A little more room to find your people."
          body={cursor
            ? "Nobody in this batch fits your exchange. Look further, or add more times you can meet."
            : "Nobody fits your exchange yet. Try adding another language you’re practising or more times you can meet. We won’t show a one-way exchange."}
        >
          {cursor ? <Button variant="primary" label="Look further" busy={loadingMore} onPress={() => void load(true, cursor)} /> : null}
          <Button label="Edit profile" onPress={() => router.push("/account/edit")} />
          <Button variant="ghost" label="Refresh" onPress={() => void load(false, null)} />
        </EmptyState>
      ) : null}

      {candidates.map(person => (
        <Card key={person.uid}>
          <Pill label="You can help each other" tone="good" />
          <Heading>{person.displayName}</Heading>
          {person.area ? <Text style={styles.hint}>{person.area}</Text> : null}
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
