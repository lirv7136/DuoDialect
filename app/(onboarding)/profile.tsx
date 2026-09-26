import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import {
  LIMITS,
  buildUpsertPayload,
  draftFromProfile,
  emptyProfileDraft,
  validateProfileDraft,
  type ProfileDraft,
} from "../../src/domain/profile-form";
import { errorMessage } from "../../src/domain/errors";
import { api } from "../../src/lib/api";
import { onboardingDraft } from "../../src/lib/onboarding-draft";
import { rememberAccount, useMyAccount } from "../../hooks/use-my-account";
import { usePhotoEditor } from "../../hooks/use-photo-editor";
import { PhotoEditor } from "../../components/photo-editor";
import { AvailabilityPicker } from "../../components/availability-picker";
import { Body, Button, ErrorNotice, Eyebrow, Field, Loading, Screen, Title, styles } from "../../components/ui";
import { APP_NAME } from "../../constants/brand";

/** Step two of onboarding: everything is saved here in one `upsertProfile` call. */
export default function ProfileOnboarding() {
  const { profile, account, loading } = useMyAccount();
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfileDraft());
  const [birthDate, setBirthDate] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const inFlight = useRef(false);
  // A profile that already exists keeps its private fields; the server only needs them once.
  const firstSave = !profile || !account;
  // Photos are optional. Uploads and screening start as soon as one is picked, but they can
  // only be attached once the profile exists, so a first save attaches them afterwards.
  const photos = usePhotoEditor({ initial: loading ? null : profile?.photos ?? [], autoSave: !firstSave });

  useEffect(() => {
    if (ready || loading) return;
    const languages = onboardingDraft.get();
    const base = profile ? draftFromProfile(profile) : emptyProfileDraft();
    if (!languages && !profile) {
      router.replace("/(onboarding)/languages?next=profile");
      return;
    }
    setDraft(languages ? { ...base, ...languages } : base);
    setReady(true);
  }, [ready, loading, profile]);

  const patch = (value: Partial<ProfileDraft>) => setDraft(current => ({ ...current, ...value }));

  async function onSave() {
    if (inFlight.current) return;
    const options = { firstSave, private: { birthDate } };
    const issue = validateProfileDraft(draft, options)
      ?? (photos.pending ? "Your photo is still being checked. Wait a moment, or remove it and add photos later." : null);
    setProblem(issue);
    if (issue) return;
    inFlight.current = true;
    setBusy(true);
    try {
      // Replaying the same full profile is harmless, so a double tap needs no key.
      const saved = await api.upsertProfile(buildUpsertPayload(draft, options));
      const savedPhotos = await photos.save();
      rememberAccount(savedPhotos && saved.profile ? { ...saved, profile: { ...saved.profile, photos: savedPhotos } } : saved);
      onboardingDraft.clear();
      router.replace("/(tabs)/discover");
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!ready) return <Loading label="Loading your profile" />;

  return (
    <Screen>
      <Eyebrow>A LITTLE ABOUT YOU</Eyebrow>
      <Title>Nearly there.</Title>
      <Body muted>{`Partners see your name, any photos you add, neighbourhood, bio, languages and the times you share. ${APP_NAME} is for adults aged 18 and over.`}</Body>

      <PhotoEditor editor={photos} />

      <Field label="First name" value={draft.displayName} onChangeText={displayName => patch({ displayName })}
        maxLength={LIMITS.displayName} autoComplete="given-name" autoCapitalize="words" />
      <Field label="Neighbourhood (optional)" hint="Chosen by you. We never ask for your location."
        value={draft.area} onChangeText={area => patch({ area })} maxLength={LIMITS.area} placeholder="e.g. Surry Hills" />
      <Field label="Bio (optional)" value={draft.bio} onChangeText={bio => patch({ bio })} maxLength={LIMITS.bio} multiline
        placeholder="What would you like to talk about?" />
      <AvailabilityPicker value={draft.availability} onChange={availability => patch({ availability })} />

      {firstSave ? (
        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={styles.label}>Private details</Text>
          <Text style={styles.hint}>Never shown to other members. Your date of birth is self-declared and only used to confirm you’re 18 or over.</Text>
          <Field label="Date of birth" hint="YYYY-MM-DD" value={birthDate} onChangeText={setBirthDate}
            keyboardType="numbers-and-punctuation" maxLength={10} placeholder="1998-04-21" autoComplete="birthdate-full" />
        </View>
      ) : null}

      <ErrorNotice message={problem} />
      <Button variant="primary" label="Save and start" busy={busy} busyLabel="Saving…" onPress={onSave} />
      <Button variant="ghost" label="Back to languages" onPress={() => router.back()} />
    </Screen>
  );
}
