import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { api } from "../../src/lib/api";
import { auth } from "../../src/lib/firebase";
import { candidateCache } from "../../src/lib/candidate-cache";
import { getPublicProfile } from "../../src/lib/live";
import { rememberBlockedName } from "../../src/lib/blocked-names";
import { exchangeLanguages } from "../../src/domain/language-exchange";
import { sharedSlots } from "../../src/domain/schedule";
import { errorMessage } from "../../src/domain/errors";
import { useMyAccount } from "../../hooks/use-my-account";
import { APP_NAME } from "../../constants/brand";
import { Body, Button, Caption, ChipRow, ErrorNotice, InfoChip, Loading, Screen, Title } from "../../components/ui";
import { EmptyState } from "../../components/empty-state";
import { PhotoStrip } from "../../components/avatar";
import { ExchangeStrip } from "../../components/exchange-strip";
import { SharedTimes } from "../../components/partner-card";
import { confirmBlock, useSafetyMenu } from "../../components/safety-menu";
import { sanitizePhotos, type ProfilePhoto } from "../../src/domain/photos";
import { space } from "../../constants/theme";

type PersonView = {
  uid: string; displayName: string; area: string; bio: string; interests: string[];
  theyOffer: string[]; youOffer: string[]; shared: string[]; photos: ProfilePhoto[];
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
        theyOffer: cached.exchange.theyOffer, youOffer: cached.exchange.youOffer, shared: cached.sharedAvailability,
        photos: sanitizePhotos(cached.photos) });
      return;
    }
    getPublicProfile(String(uid)).then(profile => {
      if (!profile) { setMissing(true); return; }
      const exchange = me ? exchangeLanguages(me, profile) : { iCanHelpWith: [], theyCanHelpWith: [] };
      setPerson({ uid: profile.uid, displayName: profile.displayName, area: profile.area, bio: profile.bio,
        interests: profile.interests ?? [], theyOffer: exchange.theyCanHelpWith, youOffer: exchange.iCanHelpWith,
        shared: sharedSlots(me?.availability, profile.availability), photos: sanitizePhotos(profile.photos) });
    }).catch(e => setError(errorMessage(e)));
  }, [uid, me, meLoading, person]);

  function onBlock() {
    if (!person || blocking) return;
    confirmBlock(person.displayName, async () => {
      setBlocking(true);
      try {
        await api.setBlock(person.uid, true);
        const myUid = auth.currentUser?.uid;
        if (myUid) await rememberBlockedName(myUid, person.uid, person.displayName);
        candidateCache.remove(person.uid);
        router.replace("/(tabs)/discover");
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBlocking(false);
      }
    });
  }

  function onReport() {
    if (!person) return;
    router.push({ pathname: "/report/[uid]", params: { uid: person.uid, name: person.displayName } });
  }

  // Report and Block live in the ⋯ header menu, as in chat.
  const menu = useSafetyMenu({ name: person?.displayName ?? "", onReport, onBlock });

  if (missing) {
    return (
      <Screen edges={[]}>
        <EmptyState title="This profile isn’t available." body={`They may have left ${APP_NAME}.`}>
          <Button label="Back" onPress={() => router.back()} />
        </EmptyState>
      </Screen>
    );
  }
  if (!person) return error ? <Screen edges={[]}><ErrorNotice message={error} /></Screen> : <Loading label="Loading profile" />;

  const reciprocal = person.theyOffer.length > 0 && person.youOffer.length > 0;

  return (
    <Screen edges={[]} footer={
      <>
        <ErrorNotice message={error} />
        {reciprocal ? (
          <Button variant="primary" label="Invite" accessibilityLabel={`Invite ${person.displayName} to meet`}
            onPress={() => router.push({ pathname: "/plan/new", params: { toUid: person.uid } })} />
        ) : <Caption center>Not a two-way exchange right now.</Caption>}
      </>
    }>
      <Stack.Screen options={{ title: "", headerRight: menu.button }} />
      {menu.menu}
      <PhotoStrip name={person.displayName} photos={person.photos} />
      <View style={{ gap: space.xs }}>
        <Title>{person.displayName}</Title>
        {person.area ? <InfoChip icon="location-outline" label={person.area} tone="plain" /> : null}
      </View>
      <ExchangeStrip theyTeach={person.theyOffer} youTeach={person.youOffer} />
      <SharedTimes slots={person.shared} max={6} />
      {person.bio ? <Body>{person.bio}</Body> : null}
      {person.interests.length ? (
        <ChipRow>{person.interests.map(item => <InfoChip key={item} icon="sparkles-outline" label={item} tone="plain" />)}</ChipRow>
      ) : null}
      <Caption icon="information-circle-outline">Fluency is self-declared.</Caption>
      {blocking ? <Caption>Blocking…</Caption> : null}
    </Screen>
  );
}
