import { useEffect, useState } from "react";
import { router } from "expo-router";
import type { UserLang } from "../../src/domain/language-exchange";
import { PRACTISING_LEVELS, draftFromProfile, validateLanguages } from "../../src/domain/profile-form";
import { onboardingDraft } from "../../src/lib/onboarding-draft";
import { useMyAccount } from "../../hooks/use-my-account";
import { LanguageEditor } from "../../components/language-editor";
import { Body, Button, ErrorNotice, Loading, Screen, Title } from "../../components/ui";
import { StepIndicator } from "../../components/step-indicator";

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
      <StepIndicator step={1} total={2} />
      <Title>Your languages</Title>
      <Body muted>Share one you speak fluently. Practise one at any level.</Body>
      <LanguageEditor
        title="I can share"
        value={speaks}
        onChange={setSpeaks}
        defaultLevel="fluent"
      />
      <LanguageEditor
        title="I’m practising"
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
