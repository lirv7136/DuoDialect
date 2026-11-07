/**
 * One report: both parties, the thread, the reported member's photo paths, and the
 * actions that make sense from its status. Opening this screen reads a private
 * conversation, which the server records as `viewed-context`. Every action goes
 * through a confirm sheet that spells out the consequence from the contract.
 *
 * A photo held by screening (the same picture on another account) shows the held photo and
 * what it matched instead of a reporter, and offers approve or reject. Any report also
 * lets the moderator set the reported member's verification by hand.
 */
import { useCallback, useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { cachedReport, moderation, type ReportContext, type ReportMessage } from "../../../src/lib/moderation";
import { errorMessage } from "../../../src/domain/errors";
import {
  MANUAL_VERIFICATIONS, actionConsequence, actionLabel, describeReason, isDestructive, nextActions, partyName, reporterLabel,
  statusLabel, verificationActionLabel, verificationConsequence, whenLabel, type ManualVerification, type ReportAction,
} from "../../../src/domain/moderation";
import { colors, radius, space, type } from "../../../constants/theme";
import { Body, Button, Caption, Card, ErrorNotice, Field, Heading, InfoChip, Loading, Notice, Screen } from "../../../components/ui";
import { confirmAction } from "../../../components/safety-menu";

export default function ReportDetail() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const [context, setContext] = useState<ReportContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<ReportAction | ManualVerification | null>(null);
  const [result, setResult] = useState<string | null>(null);
  // The queue row, for the fields the context read leaves out. Absent on a cold deep link.
  const row = reportId ? cachedReport(reportId) : null;

  const load = useCallback(async () => {
    if (!reportId) return;
    setError(null);
    try {
      setContext(await moderation.getReportContext(reportId));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [reportId]);

  useEffect(() => { void load(); }, [load]);

  function confirm(action: ReportAction) {
    const label = actionLabel(action);
    confirmAction({
      title: `${label}?`,
      body: actionConsequence(action),
      confirm: label,
      destructive: isDestructive(action),
      onConfirm: () => void act(action),
    });
  }

  async function act(action: ReportAction) {
    if (!reportId || busy) return;
    setBusy(action);
    setError(null);
    setResult(null);
    try {
      const outcome = await moderation.actOnReport(reportId, action, note.trim() || undefined);
      const removed = outcome.photosRemoved === undefined ? "" : ` ${outcome.photosRemoved} photo${outcome.photosRemoved === 1 ? "" : "s"} removed.`;
      const attached = outcome.photoAttached === undefined ? ""
        : outcome.photoAttached ? " Added to their profile." : " Not added to their profile (no room, or it can’t lead).";
      setResult(`${actionLabel(outcome.action)} done. The report is now ${statusLabel(outcome.reportStatus).toLowerCase()}.${removed}${attached}`);
      setNote("");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function confirmVerification(status: ManualVerification) {
    const label = verificationActionLabel(status);
    confirmAction({
      title: `${label}?`,
      body: verificationConsequence(status),
      confirm: label,
      destructive: status !== "verified",
      onConfirm: () => void verify(status),
    });
  }

  async function verify(status: ManualVerification) {
    const subject = context?.report.reportedUid;
    if (!reportId || !subject || busy) return;
    setBusy(status);
    setError(null);
    setResult(null);
    try {
      const outcome = await moderation.setVerification({ uid: subject, status, note: note.trim() || undefined, reportId });
      setResult(`${verificationActionLabel(status)} done. Was ${outcome.previousStatus}; the badge is now ${outcome.verified ? "on" : "off"}.`);
      setNote("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (!context && !error) return <Loading label="Loading report" />;

  const report = context?.report ?? null;
  const fromScreening = report?.source === "photo-screening";
  const actions = report ? nextActions(report.status, report.source) : [];
  const names: Record<string, string> = {};
  if (report?.reporterUid) names[report.reporterUid] = partyName(report.reporterName, row?.reporterDeleted);
  if (report) names[report.reportedUid] = partyName(report.reportedName, row?.reportedUserDeleted);

  return (
    <Screen edges={[]}>
      <ErrorNotice message={error} onRetry={() => void load()} />
      {report ? (
        <>
          <Card style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
              <Heading>{describeReason(report.reason)}</Heading>
              <InfoChip label={statusLabel(report.status)} />
            </View>
            {row?.createdAt ? <Caption icon="time-outline">{whenLabel(row.createdAt)}</Caption> : null}
            <Party role="Reporter" name={reporterLabel({ ...report, reporterDeleted: row?.reporterDeleted })} uid={report.reporterUid}
              deleted={row?.reporterDeleted} />
            <Party role="Reported" name={partyName(report.reportedName, row?.reportedUserDeleted)} uid={report.reportedUid} deleted={row?.reportedUserDeleted} />
            {report.detail ? <Body>{report.detail}</Body> : <Caption>No detail given.</Caption>}
          </Card>

          <Heading>Conversation</Heading>
          {context?.conversation ? (
            context.messages.length ? (
              <View style={{ gap: space.xs }}>
                {context.messages.map(message => (
                  <Message key={message.id} message={message} name={names[message.fromUid] ?? "Unknown"} flagged={message.fromUid === report.reportedUid} />
                ))}
              </View>
            ) : <Caption>No messages yet.</Caption>
          ) : <Caption>{row && !row.conversationId ? "The report named no conversation." : "The conversation no longer exists."}</Caption>}

          {fromScreening && report.photo ? (
            <>
              <Heading>Held photo</Heading>
              <Card style={{ gap: space.xs }}>
                <Mono>{report.photo.path}</Mono>
                {(report.matches ?? []).length ? <Text style={type.label}>Matches</Text> : null}
                {(report.matches ?? []).map(match => (
                  <View key={match.path} style={{ gap: 2 }}>
                    <Mono>{match.path}</Mono>
                    <Text style={[type.caption, { fontSize: 12 }]}>{`${match.distance} of 64 bits differ`}</Text>
                  </View>
                ))}
                <Caption icon="information-circle-outline">Hidden from everyone until you approve it. Open these in the Firebase console.</Caption>
              </Card>
            </>
          ) : null}

          <Heading>Photos</Heading>
          {report.reportedPhotos.length ? (
            <Card style={{ gap: space.xs }}>
              {report.reportedPhotos.map(photo => (
                <Mono key={photo.id}>{photo.path}</Mono>
              ))}
              <Caption icon="information-circle-outline">Open these in the Firebase console. Nothing is downloaded here.</Caption>
            </Card>
          ) : <Caption>The reported member has no photos.</Caption>}

          <Notice message={result} />
          {actions.length ? (
            <>
              <Field label="Note" hint="Goes into the audit trail with the action. Optional." multiline value={note} onChangeText={setNote} maxLength={1000} />
              <View style={{ gap: space.sm }}>
                {actions.map(action => (
                  <Button
                    key={action}
                    label={actionLabel(action)}
                    variant={isDestructive(action) ? "danger" : action === "claim" || action === "reinstate" ? "primary" : "secondary"}
                    busy={busy === action}
                    busyLabel="Working…"
                    disabled={busy !== null && busy !== action}
                    hint={actionConsequence(action)}
                    onPress={() => confirm(action)}
                  />
                ))}
              </View>
            </>
          ) : <Caption center>This report is closed.</Caption>}

          <Heading>Verification</Heading>
          <Caption>Set the reported member’s verification by hand. The note above goes with it.</Caption>
          <View style={{ gap: space.sm }}>
            {MANUAL_VERIFICATIONS.map(status => (
              <Button
                key={status}
                label={verificationActionLabel(status)}
                variant={status === "verified" ? "secondary" : "ghost"}
                busy={busy === status}
                busyLabel="Working…"
                disabled={busy !== null && busy !== status}
                hint={verificationConsequence(status)}
                onPress={() => confirmVerification(status)}
              />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

/** A Storage path, selectable, in a fixed width face so it can be copied exactly. */
function Mono({ children }: { children: string }) {
  return <Text selectable style={[type.caption, { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>{children}</Text>;
}

function Party({ role, name, uid, deleted }: { role: string; name: string; uid: string | null; deleted: boolean | undefined }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
        <Text style={type.caption}>{role}</Text>
        <Text style={type.label}>{name}</Text>
        {deleted ? <InfoChip icon="person-remove-outline" label="Deleted" tone="plain" /> : null}
      </View>
      {uid ? <Text selectable style={[type.caption, { fontSize: 12 }]}>{uid}</Text> : null}
    </View>
  );
}

/** The reported member's messages carry a red edge so they stand out while reading. */
function Message({ message, name, flagged }: { message: ReportMessage; name: string; flagged: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel={`${name}${flagged ? ", reported" : ""}, ${whenLabel(message.createdAt)}: ${message.text}`}
      style={{
        backgroundColor: flagged ? colors.dangerSoft : colors.surface, borderWidth: 1, borderColor: flagged ? colors.danger : colors.line,
        borderLeftWidth: flagged ? 4 : 1, borderRadius: radius.input, padding: space.sm, gap: 2,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
        <Text style={[type.caption, { fontSize: 12, color: flagged ? colors.danger : colors.muted }]}>{name}</Text>
        <Text style={[type.caption, { fontSize: 12 }]}>{whenLabel(message.createdAt)}</Text>
      </View>
      <Text selectable style={type.body}>{message.text}</Text>
    </View>
  );
}
