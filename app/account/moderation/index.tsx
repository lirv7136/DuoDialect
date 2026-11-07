/**
 * The report queue, for the operator only. Members without the `moderator` claim never
 * see the entry point, and if one arrives here anyway the server refuses with
 * permission-denied, which shows as the standard copy. Below the queue, a moderator can
 * set any member's verification by email, which is how phase 1 verifies people.
 */
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { moderation, type Report } from "../../../src/lib/moderation";
import { errorMessage } from "../../../src/domain/errors";
import {
  MANUAL_VERIFICATIONS, REPORT_STATUSES, statusLabel, summariseReport, verificationActionLabel, verificationConsequence, whenLabel,
  type ManualVerification, type ReportStatus,
} from "../../../src/domain/moderation";
import { confirmAction } from "../../../components/safety-menu";
import { haptic } from "../../../src/lib/feel";
import { colors, space, type } from "../../../constants/theme";
import {
  Body, Button, Caption, Card, ChipRow, ErrorNotice, Field, Heading, InfoChip, Loading, Notice, Screen, Segmented, styles,
} from "../../../components/ui";
import { EmptyState } from "../../../components/empty-state";

const EMPTY: Record<ReportStatus, string> = {
  received: "No new reports.",
  reviewing: "Nothing claimed.",
  actioned: "Nothing actioned yet.",
  dismissed: "Nothing dismissed yet.",
};

export default function ModerationQueue() {
  const [status, setStatus] = useState<ReportStatus>("received");
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (next: ReportStatus, pulled = false) => {
    if (pulled) setRefreshing(true);
    setError(null);
    try {
      const result = await moderation.listReports({ status: next, limit: 50 });
      setReports(result.reports);
    } catch (e) {
      setError(errorMessage(e));
      setReports(current => current ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Reloaded on focus so an action taken on the detail screen moves the row straight away.
  useFocusEffect(useCallback(() => { void load(status); }, [load, status]));

  function changeStatus(next: ReportStatus) {
    setStatus(next);
    setReports(null);
  }

  return (
    <Screen edges={[]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(status, true)} tintColor={colors.primary} />}>
      <Segmented<ReportStatus>
        value={status}
        onChange={changeStatus}
        options={REPORT_STATUSES.map(value => ({ value, label: statusLabel(value) }))}
      />
      <ErrorNotice message={error} onRetry={() => void load(status)} />
      {reports === null ? <Loading label="Loading reports" /> : null}
      {reports?.length === 0 && !error ? <EmptyState title={EMPTY[status]} /> : null}
      {reports?.map(report => <ReportRow key={report.id} report={report} />)}
      <VerifyMember />
    </Screen>
  );
}

/** Verification by hand, for a member named by email: phase 1 has no automated check. */
function VerifyMember() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<ManualVerification | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function confirm(status: ManualVerification) {
    const address = email.trim();
    if (!address) { setProblem("Enter the member’s email."); return; }
    confirmAction({
      title: `${verificationActionLabel(status)}?`,
      body: `${address}. ${verificationConsequence(status)}`,
      confirm: verificationActionLabel(status),
      destructive: status !== "verified",
      onConfirm: () => void run(status, address),
    });
  }

  async function run(status: ManualVerification, address: string) {
    if (busy) return;
    setBusy(status);
    setResult(null);
    setProblem(null);
    try {
      const outcome = await moderation.setVerification({ email: address, status, note: note.trim() || undefined });
      setResult(`${verificationActionLabel(status)} done for ${address}. Was ${outcome.previousStatus}; the badge is now ${outcome.verified ? "on" : "off"}.`);
      setNote("");
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={{ gap: space.sm }}>
      <Heading>Verify a member</Heading>
      <Caption>Only once you’re sure they’re who their photos show, for example after a video call.</Caption>
      <Field label="Member’s email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
        keyboardType="email-address" />
      <Field label="Note" hint="Goes into the audit trail. Optional." value={note} onChangeText={setNote} maxLength={1000} />
      <Notice message={result} />
      <ErrorNotice message={problem} />
      {MANUAL_VERIFICATIONS.map(status => (
        <Button key={status} label={verificationActionLabel(status)} variant={status === "verified" ? "secondary" : "ghost"}
          busy={busy === status} busyLabel="Working…" disabled={busy !== null && busy !== status} onPress={() => confirm(status)} />
      ))}
    </Card>
  );
}

function ReportRow({ report }: { report: Report }) {
  const summary = summariseReport(report);
  const when = whenLabel(report.createdAt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${summary}. ${when}`}
      accessibilityHint="Opens the report"
      onPress={() => { haptic.light(); router.push({ pathname: "/account/moderation/[reportId]", params: { reportId: report.id } }); }}
      style={({ pressed }) => [styles.card, { gap: space.xs }, pressed && { backgroundColor: colors.surfaceNavySoft }]}
    >
      <Text style={type.label}>{summary}</Text>
      {when ? <Caption icon="time-outline">{when}</Caption> : null}
      {report.detail ? <Body muted lines={2}>{report.detail}</Body> : null}
      {report.reporterDeleted || report.reportedUserDeleted || !report.conversationId ? (
        <ChipRow>
          {report.source === "photo-screening" ? <InfoChip icon="images-outline" label="Held photo" tone="coral" /> : null}
          {report.reporterDeleted ? <InfoChip icon="person-remove-outline" label="Reporter deleted" tone="plain" /> : null}
          {report.reportedUserDeleted ? <InfoChip icon="person-remove-outline" label="Reported account deleted" tone="plain" /> : null}
          {!report.conversationId && report.source !== "photo-screening"
            ? <InfoChip icon="chatbubble-ellipses-outline" label="No conversation" tone="plain" /> : null}
        </ChipRow>
      ) : null}
      <View style={{ position: "absolute", right: space.md, top: space.md }}>
        <Text style={[type.caption, { fontSize: 12 }]}>{report.id.slice(0, 6)}</Text>
      </View>
    </Pressable>
  );
}
