/**
 * What the server is holding back, and why, at the top of Discover and Profile.
 *
 * EmailCheckNotice is the "check your email" state for a password account whose address is
 * not confirmed yet: where the link went, a way to say "I've confirmed it", and a way to
 * send it again (once a minute). It shows whatever the server flags say, because an
 * unconfirmed email is worth fixing anyway; when the server is hiding the person from
 * Discover until they confirm, it says that too. Apple accounts never see it.
 *
 * TrustNotices lists the server's other restrictions in plain words (account.trust).
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { auth } from "../src/lib/firebase";
import { lastVerificationEmailAt, refreshEmailVerified, resendVerificationEmail, signInProvider } from "../src/lib/auth";
import { authErrorMessage } from "../src/domain/errors";
import {
  emailCheckCopy, needsEmailConfirmation, resendWaitSeconds, trustNotices, type TrustSummary,
} from "../src/domain/trust";
import { space } from "../constants/theme";
import { Body, Button, Card, ErrorNotice, Heading, Notice } from "./ui";

export function EmailCheckNotice({ trust, onConfirmed }: { trust?: TrustSummary | null; onConfirmed?: () => void }) {
  const user = auth.currentUser;
  const [visible, setVisible] = useState(() => !!user && needsEmailConfirmation({
    provider: signInProvider(), emailVerified: user.emailVerified,
  }));
  const [sentAt, setSentAt] = useState<number | null>(() => lastVerificationEmailAt());
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<"check" | "send" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const wait = resendWaitSeconds(sentAt, now);

  // Counts the resend wait down once a second, and only while there is one.
  useEffect(() => {
    if (!visible || wait <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [visible, wait]);

  if (!visible || !user) return null;
  const copy = emailCheckCopy(user.email);
  const hidden = !!trust?.restrictions?.includes("trust/email-unconfirmed");

  async function onCheck() {
    if (busy) return;
    setBusy("check");
    setMessage(null);
    setProblem(null);
    try {
      if (await refreshEmailVerified()) {
        setVisible(false);
        onConfirmed?.();
      } else {
        setMessage("Not confirmed yet. Check your inbox, and your spam folder.");
      }
    } catch (error) {
      setProblem(authErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function onResend() {
    if (busy || wait > 0) return;
    setBusy("send");
    setMessage(null);
    setProblem(null);
    try {
      await resendVerificationEmail();
      setSentAt(Date.now());
      setNow(Date.now());
      setMessage("Sent. It can take a minute to arrive.");
    } catch (error) {
      setProblem(authErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={{ gap: space.sm }}>
      <Heading>{copy.title}</Heading>
      <Body>{copy.body}</Body>
      {hidden ? <Body muted>Until you do, other members can’t find you on Discover.</Body> : null}
      <Notice message={message} icon="mail-outline" tone="info" />
      <ErrorNotice message={problem} />
      <View style={{ gap: space.xs }}>
        <Button variant="primary" label="I’ve confirmed it" accessibilityLabel="I’ve confirmed my email"
          busy={busy === "check"} busyLabel="Checking…" onPress={() => void onCheck()} />
        <Button variant="ghost" label={wait > 0 ? `Send again in ${wait}s` : "Send again"}
          accessibilityLabel={wait > 0 ? `Send the email again in ${wait} seconds` : "Send the email again"}
          disabled={wait > 0 || busy !== null} busy={busy === "send"} busyLabel="Sending…" onPress={() => void onResend()} />
      </View>
    </Card>
  );
}

/** The server's other restrictions, one plain line each; nothing when there are none. */
export function TrustNotices({ trust }: { trust?: TrustSummary | null }) {
  // Email has its own card, with buttons, so it is not repeated here.
  const lines = trustNotices(trust, { email: false });
  if (!lines.length) return null;
  return (
    <View style={{ gap: space.xs }}>
      {lines.map(line => <Notice key={line} message={line} icon="shield-checkmark-outline" tone="info" />)}
    </View>
  );
}
