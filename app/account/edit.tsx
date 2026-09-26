import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import {
  LIMITS,
  PRACTISING_LEVELS,
  buildUpsertPayload,
  draftFromProfile,
  parseInterests,
  validateProfileDraft,
  type ProfileDraft,
} from "../../src/domain/profile-form";
import { errorMessage } from "../../src/domain/errors";
import { api } from "../../src/lib/api";
import { rememberAccount, useMyAccount } from "../../hooks/use-my-account";
import { usePhotoEditor } from "../../hooks/use-photo-editor";
import { PhotoEditor } from "../../components/photo-editor";
import { LanguageEditor } from "../../components/language-editor";
import { AvailabilityPicker } from "../../components/availability-picker";
import { Body, Button, ErrorNotice, Field, Loading, Screen } from "../../components/ui";

/**
 * Edits the whole public profile through `upsertProfile`, which replaces it in full.
 * Photos are separate: each change is saved straight away through `setProfilePhotos`,
 * and `upsertProfile` never touches them.
 */
export default function EditProfile() {
  const { profile, account, loading } = useMyAccount();
  const photos = usePhotoEditor({ initial: loading ? null : profile?.photos ?? [], autoSave: true });
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [interestsRaw, setInterestsRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (draft || loading) return;
    if (!profile || !account) { router.replace("/(onboarding)/languages?next=profile"); return; }
    const initial = draftFromProfile(profile);
    setDraft(initial);
    setInterestsRaw(initial.interests.join(", "));
  }, [draft, loading, profile, account]);

  if (!draft) return <Loading label="Loading your profile" />;

  const patch = (value: Partial<ProfileDraft>) => setDraft(current => (current ? { ...current, ...value } : current));

  async function onSave() {
    if (inFlight.current || !draft) return;
    const next = { ...draft, interests: parseInterests(interestsRaw) };
    const issue = validateProfileDraft(next, { firstSave: false });
    setProblem(issue);
    if (issue) return;
    inFlight.current = true;
    setBusy(true);
    try {
      rememberAccount(await api.upsertProfile(buildUpsertPayload(next, { firstSave: false })));
      router.back();
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen edges={[]}>
      <PhotoEditor editor={photos} />
      <Field label="First name" value={draft.displayName} onChangeText={displayName => patch({ displayName })}
        maxLength={LIMITS.displayName} autoCapitalize="words" />
      <Field label="Neighbourhood (optional)" hint="Chosen by you. We never ask for your location."
        value={draft.area} onChangeText={area => patch({ area })} maxLength={LIMITS.area} />
      <Field label="Bio (optional)" value={draft.bio} onChangeText={bio => patch({ bio })} maxLength={LIMITS.bio} multiline />
      <LanguageEditor title="I can share" hint="Only native or fluent languages can be offered. Proficiency is self-declared."
        value={draft.speaks} onChange={speaks => patch({ speaks })} defaultLevel="fluent" />
      <LanguageEditor title="I’m practising" hint="Any level is welcome."
        value={draft.learns} onChange={learns => patch({ learns })} levels={PRACTISING_LEVELS} defaultLevel="beginner" />
      <AvailabilityPicker value={draft.availability} onChange={availability => patch({ availability })} />
      <Field label="Interests (optional)" hint={`Up to ${LIMITS.interests}, separated by commas.`} value={interestsRaw}
        onChangeText={setInterestsRaw} placeholder="Coffee, films, hiking" />
      <Body muted>Changing your languages doesn’t withdraw open invitations. One that no longer fits your exchange can’t be accepted.</Body>
      <ErrorNotice message={problem} />
      <Button variant="primary" label="Save changes" busy={busy} busyLabel="Saving…" onPress={onSave} />
    </Screen>
  );
}
