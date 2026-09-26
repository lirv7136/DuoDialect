import { useCallback, useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { api } from "../../src/lib/api";
import { auth } from "../../src/lib/firebase";
import { listMyBlocks } from "../../src/lib/live";
import { forgetBlockedName, readBlockedNames } from "../../src/lib/blocked-names";
import { errorMessage } from "../../src/domain/errors";
import { Body, Button, Card, EmptyState, ErrorNotice, Loading, Screen, styles } from "../../components/ui";

export default function BlockedMembers() {
  const uid = auth.currentUser?.uid ?? "";
  const [blocked, setBlocked] = useState<string[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!uid) return;
    setError(null);
    try {
      const [list, labels] = await Promise.all([listMyBlocks(uid), readBlockedNames(uid)]);
      setBlocked(list);
      setNames(labels);
    } catch (e) {
      setError(errorMessage(e));
      setBlocked(current => current ?? []);
    }
  }, [uid]);

  useEffect(() => { void load(); }, [load]);

  async function unblock(otherUid: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(otherUid);
    try {
      await api.setBlock(otherUid, false);
      await forgetBlockedName(uid, otherUid);
      setBlocked(current => (current ?? []).filter(item => item !== otherUid));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  if (!blocked) return <Loading label="Loading blocked members" />;

  return (
    <Screen edges={[]}>
      <Body muted>People you block can’t find, invite or message you, and you won’t see them. Unblocking doesn’t restore invitations that were cancelled.</Body>
      <ErrorNotice message={error} onRetry={() => void load()} />
      {blocked.length === 0 ? <EmptyState title="You haven’t blocked anyone." body="You can block someone from their profile or from a conversation." /> : null}
      {blocked.map(otherUid => {
        const name = names[otherUid] ?? "A blocked member";
        return (
          <Card key={otherUid}>
            <Text style={styles.label}>{name}</Text>
            {!names[otherUid] ? <Text style={styles.hint}>Blocked on another device, or before names were remembered.</Text> : null}
            <Button label="Unblock" accessibilityLabel={`Unblock ${name}`} busy={busy === otherUid} busyLabel="Unblocking…"
              disabled={busy !== null && busy !== otherUid} onPress={() => void unblock(otherUid)} />
          </Card>
        );
      })}
    </Screen>
  );
}
