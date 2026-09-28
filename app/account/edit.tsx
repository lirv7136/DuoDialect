import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import {
  LIMITS,
  PRACTISING_LEVELS,
  buildUpsertPayload,
  draftFromProfile,
  addInterest,
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
import { View } from "react-native";
import { Button, Caption, Chip, ChipRow, ErrorNotice, Field, IconButton, Loading, Screen } from "../../components/ui";

/**
 * Edits the whole public profile through `upsertProfile`, which replaces it in full.
 * Photos are separate: each change is saved straight away through `setProfilePhotos`,
 * and `upsertProfile` never touches them.
 */
export default function EditProfile() {
  const { profile, account, loading } = useMyAccount();
  const photos = usePhotoEditor({ initial: loading ? null : profile?.photos ?? [], autoSave: true });
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [interestText, setInterestText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (draft || loading) return;
    if (!profile || !account) { router.replace("/(onboarding)/languages?next=profile"); return; }
    const initial = draftFromProfile(profile);
    setDraft(initial);
  }, [draft, loading, profile, account]);

  if (!draft) return <Loading label="Loading your profile" />;

  const patch = (value: Partial<ProfileDraft>) => setDraft(current => (current ? { ...current, ...value } : current));

  function onInterestText(value: string) {
    // A comma, as people used to type, adds what came before it.
    if (!value.includes(",")) { setInterestText(value); return; }
    const parts = value.split(",");
    const rest = parts.pop() ?? "";
    patch({ interests: parts.reduce((list, part) => addInterest(list, part), draft?.interests ?? []) });
    setInterestText(rest.trimStart());
  }

  function commitInterest() {
    if (!interestText.trim()) return;
    patch({ interests: addInterest(draft?.interests ?? [], interestText) });
    setInterestText("");
  }

  async function onSave() {
    if (inFlight.current || !draft) return;
    // Text still in the interest box counts, so nothing typed is lost on Save.
    const next = { ...draft, interests: addInterest(draft.interests, interestText) };
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

  const interestsFull = draft.interests.length >= LIMITS.interests;

  return (
    <Screen edges={[]} footer={
      <>
        <ErrorNotice message={problem} />
        <Button variant="primary" label="Save" accessibilityLabel="Save changes" busy={busy} busyLabel="Saving…" onPress={onSave} />
      </>
    }>
      <PhotoEditor editor={photos} />
      <Field label="First name" value={draft.displayName} onChangeText={displayName => patch({ displayName })}
        maxLength={LIMITS.displayName} autoCapitalize="words" />
      <Field label="Neighbourhood (optional)" icon="location-outline" hint="We never use your location."
        value={draft.area} onChangeText={area => patch({ area })} maxLength={LIMITS.area} />
      <Field label="Bio (optional)" value={draft.bio} onChangeText={bio => patch({ bio })} maxLength={LIMITS.bio} multiline />
      <LanguageEditor title="I can share"
        value={draft.speaks} onChange={speaks => patch({ speaks })} defaultLevel="fluent" />
      <LanguageEditor title="I’m practising"
        value={draft.learns} onChange={learns => patch({ learns })} levels={PRACTISING_LEVELS} defaultLevel="beginner" />
      <AvailabilityPicker value={draft.availability} onChange={availability => patch({ availability })} />
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
        <View style={{ flex: 1 }}>
          <Field label={`Interests (optional) · ${draft.interests.length}/${LIMITS.interests}`} value={interestText}
            onChangeText={onInterestText} onSubmitEditing={commitInterest} returnKeyType="done" blurOnSubmit={false}
            maxLength={LIMITS.interest} editable={!interestsFull} placeholder={interestsFull ? "That’s the most" : "Coffee, films, hiking"} />
        </View>
        {interestText.trim() ? <IconButton icon="add-circle" label={`Add ${interestText.trim()}`} onPress={commitInterest} size={30} /> : null}
      </View>
      {draft.interests.length ? (
        <ChipRow>
          {draft.interests.map(item => (
            <Chip key={item} role="button" icon="close" label={item} accessibilityLabel={`Remove ${item}`}
              onPress={() => patch({ interests: draft.interests.filter(value => value !== item) })} />
          ))}
        </ChipRow>
      ) : null}
      <Caption icon="information-circle-outline">Open invites that no longer fit can’t be accepted.</Caption>
    </Screen>
  );
}
