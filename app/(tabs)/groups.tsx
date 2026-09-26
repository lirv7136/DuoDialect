import { router } from "expo-router";
import { Body, Button, EmptyState, Eyebrow, Screen, Title } from "../../components/ui";

/**
 * Small groups are part of the reviewed experience, but the backend has no group
 * sessions yet: no collection, capacity, waitlist or join/leave callables
 * (docs/BACKEND-HANDOFF.md, "Groups"). This screen says so plainly instead of showing
 * sample sessions that nobody could actually join. When the callables exist, list,
 * join and leave go here, with full and waitlist states taken from the server.
 */
export default function Groups() {
  return (
    <Screen>
      <Eyebrow>A FEW NEW FACES</Eyebrow>
      <Title>Good company, in small groups.</Title>
      <Body muted>Meetups built around one language pair, with practice time for both sides and small tables so everyone has a turn.</Body>
      <EmptyState
        title="Small groups aren’t open yet."
        body="We’re not taking group sign-ups yet, so there are no sessions to join and no seats are held for anyone. In the meantime, meet one language partner at a time."
      >
        <Button variant="primary" label="Find a language partner" onPress={() => router.push("/(tabs)")} />
      </EmptyState>
    </Screen>
  );
}
