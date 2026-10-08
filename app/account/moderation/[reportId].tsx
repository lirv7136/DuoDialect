/**
 * One report: both parties, the thread, the reported member's photo paths, and the
 * actions that make sense from its status. Opening this screen reads a private
 * conversation, which the server records as `viewed-context`. Every action goes
 * through a confirm sheet that spells out the consequence from the contract.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { cachedReport, moderation, type ReportContext, type ReportMessage } from "../../../src/lib/moderation";
import { errorMessage } from "../../../src/domain/errors";
import {
  actionConsequence, actionLabel, describeReason, isDestructive, nextActions, partyName, statusLabel, whenLabel, type ReportAction,
} from "../../../src/domain/moderation";
import { colors, radius, space, type } from "../../../constants/theme";
import { Body, Button, Caption, Card, ErrorNotice, Field, Heading, InfoChip, Loading, Notice, Screen } from "../../../components/ui";

export default function ReportDetail() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const [context, setContext] = useState<ReportContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<ReportAction | null>(null);
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
    Alert.alert(`${label}?`, actionConsequence(action), [
      { text: "Cancel", style: "cancel" },
      { text: label, style: isDestructive(action) ? "destructive" : "default", onPress: () => void act(action) },
    ]);
  }

  async function act(action: ReportAction) {
    if (!reportId || busy) return;
    setBusy(action);
    setError(null);
    setResult(null);
    try {
      const outcome = await moderation.actOnReport(reportId, action, note.trim() || undefined);
      const removed = outcome.photosRemoved === undefined ? "" : ` ${outcome.photosRemoved} photo${outcome.photosRemoved === 1 ? "" : "s"} removed.`;
      setResult(`${actionLabel(outcome.action)} done. The report is now ${statusLabel(outcome.reportStatus).toLowerCase()}.${removed}`);
      setNote("");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (!context && !error) return <Loading label="Loading report" />;

  const report = context?.report ?? null;
  const actions = report ? nextActions(report.status) : [];
  const names: Record<string, string> = report ? {
    [report.reporterUid]: partyName(report.reporterName, row?.reporterDeleted),
    [report.reportedUid]: partyName(report.reportedName, row?.reportedUserDeleted),
  } : {};

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
            <Party role="Reporter" name={partyName(report.reporterName, row?.reporterDeleted)} uid={report.reporterUid} deleted={row?.reporterDeleted} />
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

          <Heading>Photos</Heading>
          {report.reportedPhotos.length ? (
            <Card style={{ gap: space.xs }}>
              {report.reportedPhotos.map(photo => (
                <Text key={photo.id} selectable style={[type.caption, { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>{photo.path}</Text>
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
        </>
      ) : null}
    </Screen>
  );
}

function Party({ role, name, uid, deleted }: { role: string; name: string; uid: string; deleted: boolean | undefined }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
        <Text style={type.caption}>{role}</Text>
        <Text style={type.label}>{name}</Text>
        {deleted ? <InfoChip icon="person-remove-outline" label="Deleted" tone="plain" /> : null}
      </View>
      <Text selectable style={[type.caption, { fontSize: 12 }]}>{uid}</Text>
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
