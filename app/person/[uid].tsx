import { useEffect, useState } from "react";
import { Alert, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "../../src/lib/api";
import { auth } from "../../src/lib/firebase";
import { candidateCache } from "../../src/lib/candidate-cache";
import { getPublicProfile } from "../../src/lib/live";
import { rememberBlockedName } from "../../src/lib/blocked-names";
import { exchangeLanguages } from "../../src/domain/language-exchange";
import { capitalise } from "../../src/domain/profile-form";
import { sharedSlots } from "../../src/domain/schedule";
import { errorMessage } from "../../src/domain/errors";
import { useMyAccount } from "../../hooks/use-my-account";
import { Body, Button, Card, ErrorNotice, Heading, Loading, Screen, Title, styles } from "../../components/ui";

type PersonView = {
  uid: string; displayName: string; area: string; bio: string; interests: string[];
  theyOffer: string[]; youOffer: string[]; shared: string[];
};

export default function PersonScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { profile: me, loading: meLoading } = useMyAccount();
  const [person, setPerson] = useState<PersonView | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);

  useEffect(() => {
    if (!uid || meLoading || person) return;
    const cached = candidateCache.get(String(uid));
    if (cached) {
      setPerson({ uid: cached.uid, displayName: cached.displayName, area: cached.area, bio: cached.bio, interests: cached.interests,
        theyOffer: cached.exchange.theyOffer, youOffer: cached.exchange.youOffer, shared: cached.sharedAvailability });
      return;
    }
    getPublicProfile(String(uid)).then(profile => {
      if (!profile) { setMissing(true); return; }
      const exchange = me ? exchangeLanguages(me, profile) : { iCanHelpWith: [], theyCanHelpWith: [] };
      setPerson({ uid: profile.uid, displayName: profile.displayName, area: profile.area, bio: profile.bio,
        interests: profile.interests ?? [], theyOffer: exchange.theyCanHelpWith, youOffer: exchange.iCanHelpWith,
        shared: sharedSlots(me?.availability, profile.availability) });
    }).catch(e => setError(errorMessage(e)));
  }, [uid, me, meLoading, person]);

  function onBlock() {
    if (!person) return;
    Alert.alert(
      `Block ${person.displayName}?`,
      "Neither of you will be able to find, invite, message or see the other. Open invitations between you are cancelled. You can unblock from Your profile, but cancelled invitations stay closed.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Block", style: "destructive", onPress: async () => {
            if (blocking) return;
            setBlocking(true);
            try {
              await api.setBlock(person.uid, true);
              const myUid = auth.currentUser?.uid;
              if (myUid) await rememberBlockedName(myUid, person.uid, person.displayName);
              candidateCache.remove(person.uid);
              router.replace("/(tabs)");
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBlocking(false);
            }
          },
        },
      ],
    );
  }

  if (missing) {
    return (
      <Screen edges={[]}>
        <Heading>This profile isn’t available.</Heading>
        <Body muted>They may have changed their profile or deleted their account.</Body>
        <Button label="Back" onPress={() => router.back()} />
      </Screen>
    );
  }
  if (!person) return error ? <Screen edges={[]}><ErrorNotice message={error} /></Screen> : <Loading label="Loading profile" />;

  const reciprocal = person.theyOffer.length > 0 && person.youOffer.length > 0;

  return (
    <Screen edges={[]}>
      <Title>{`Meet ${person.displayName}.`}</Title>
      {person.area ? <Text style={styles.hint}>{person.area}</Text> : null}
      <Body muted>A platonic language exchange.</Body>
      {person.bio ? <Body>{person.bio}</Body> : null}
      <Card>
        <Text style={styles.body}>{`They help you with: ${person.theyOffer.map(capitalise).join(", ") || "—"}`}</Text>
        <Text style={styles.body}>{`You help them with: ${person.youOffer.map(capitalise).join(", ") || "—"}`}</Text>
        <Text style={styles.hint}>{person.shared.length ? `Shared times: ${person.shared.join(", ")}.` : "No shared times listed."}</Text>
        {person.interests.length ? <Text style={styles.hint}>{`Interests: ${person.interests.join(", ")}`}</Text> : null}
        <Text style={styles.hint}>Fluency is self-declared and not tested.</Text>
      </Card>
      <ErrorNotice message={error} />
      {reciprocal ? (
        <Button variant="primary" label="Suggest a meetup" accessibilityLabel={`Suggest a meetup with ${person.displayName}`}
          onPress={() => router.push({ pathname: "/plan/new", params: { toUid: person.uid } })} />
      ) : <Body muted>Your languages don’t currently make a two-way exchange with this person.</Body>}
      <Button label="Report a concern" accessibilityLabel={`Report ${person.displayName}`}
        onPress={() => router.push({ pathname: "/report/[uid]", params: { uid: person.uid, name: person.displayName } })} />
      <Button variant="danger" label="Block" busy={blocking} accessibilityLabel={`Block ${person.displayName}`} onPress={onBlock} />
    </Screen>
  );
}
