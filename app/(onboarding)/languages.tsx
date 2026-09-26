import { useEffect, useState } from "react";
import { router } from "expo-router";
import type { UserLang } from "../../src/domain/language-exchange";
import { PRACTISING_LEVELS, draftFromProfile, validateLanguages } from "../../src/domain/profile-form";
import { onboardingDraft } from "../../src/lib/onboarding-draft";
import { useMyAccount } from "../../hooks/use-my-account";
import { LanguageEditor } from "../../components/language-editor";
import { Body, Button, ErrorNotice, Eyebrow, Loading, Screen, Title } from "../../components/ui";

/**
 * Step one of onboarding. Nothing is saved here: `upsertProfile` needs the name and the
 * languages together, so they are held until step two submits.
 */
export default function LanguagesOnboarding() {
  const { profile, loading } = useMyAccount();
  const [speaks, setSpeaks] = useState<UserLang[]>([]);
  const [learns, setLearns] = useState<UserLang[]>([]);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (ready || loading) return;
    const saved = onboardingDraft.get() ?? (profile ? draftFromProfile(profile) : null);
    if (saved) { setSpeaks(saved.speaks); setLearns(saved.learns); }
    setReady(true);
  }, [ready, loading, profile]);

  function onContinue() {
    const issue = validateLanguages(speaks, learns);
    setProblem(issue);
    if (issue) return;
    onboardingDraft.set({ speaks, learns });
    router.push("/(onboarding)/profile");
  }

  if (!ready) return <Loading label="Loading your languages" />;

  return (
    <Screen>
      <Eyebrow>SOMETHING TO SHARE. SOMETHING TO LEARN.</Eyebrow>
      <Title>Your side of the conversation.</Title>
      <Body muted>Offer a language you speak fluently; you don’t need to be a native speaker. Partners are people who speak what you’re practising and are practising what you speak.</Body>
      <LanguageEditor
        title="I can share"
        hint="Only native or fluent languages can be offered to a partner. Proficiency is self-declared."
        value={speaks}
        onChange={setSpeaks}
        defaultLevel="fluent"
      />
      <LanguageEditor
        title="I’m practising"
        hint="Any level is welcome."
        value={learns}
        onChange={setLearns}
        levels={PRACTISING_LEVELS}
        defaultLevel="beginner"
      />
      <ErrorNotice message={problem} />
      <Button variant="primary" label="Continue" onPress={onContinue} />
    </Screen>
  );
}
