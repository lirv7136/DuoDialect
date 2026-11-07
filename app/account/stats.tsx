/**
 * Members, meetups and downloads, for the operator only. Members without the `moderator`
 * claim never see the entry point, and if one arrives here anyway the server refuses with
 * permission-denied, which shows as the standard copy with no retry. The screen reads the
 * cached daily snapshot; Refresh asks the server to recount now. No alerts, so it behaves
 * the same in the browser.
 */
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { stats, type StatsCity, type StatsPair, type StatsResponse, type StatsSnapshot } from "../../src/lib/stats";
import { ApiError } from "../../src/lib/api";
import { errorMessage } from "../../src/domain/errors";
import {
  appStoreConnected, appStoreTotals, formatCount, formatPercent, funnel, historySeries, newThisWeek, pairSides, pairSummary,
  pairTitle, pairsByCity, percentLabel, plural, seriesChange, shortDay, timeAgo, updatedLabel,
  type AppStoreStats, type FunnelStep, type HistorySeries,
} from "../../src/domain/stats";
import { MAX_FONT_SCALE, colors, fonts, radius, space, type } from "../../constants/theme";
import { Body, Button, Caption, Card, ErrorNotice, Heading, Loading, Notice, Screen, type IconName } from "../../components/ui";
import { EmptyState } from "../../components/empty-state";

type Failure = { message: string; forbidden: boolean; refresh: boolean };

export default function Stats() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (refresh: boolean) => {
    if (refresh) setRefreshing(true);
    setFailure(null);
    try {
      setData(await stats.getStats({ refresh }));
    } catch (e) {
      setFailure({ message: errorMessage(e), forbidden: e instanceof ApiError && e.code === "permission-denied", refresh });
    } finally {
      setRefreshing(false);
      setNow(Date.now());
    }
  }, []);

  useEffect(() => { void load(false); }, [load]);

  // Keeps "Updated N minutes ago" honest while the screen stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const refresh = () => { if (!refreshing) void load(true); };
  const notice = (
    <ErrorNotice message={failure?.message ?? null} onRetry={failure && !failure.forbidden ? () => void load(failure.refresh) : undefined} />
  );

  if (!data && !failure) return <Loading label="Loading stats" />;

  if (!data) {
    return (
      <Screen edges={[]}>
        {notice}
        {failure?.forbidden ? <Caption center>Stats are only for accounts with moderator access.</Caption> : null}
      </Screen>
    );
  }

  const latest = data.latest;
  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" }}>
        <View style={{ flexShrink: 1 }}>
          <Caption icon="time-outline">{latest ? updatedLabel(latest.generatedAt, now) : "No snapshot yet"}</Caption>
        </View>
        {latest ? (
          <Button variant="ghost" icon="refresh" label="Refresh" busy={refreshing} busyLabel="Refreshing…"
            hint="Recounts everything now instead of showing the last snapshot" onPress={refresh} />
        ) : null}
      </View>
      {notice}

      {latest ? <Snapshot latest={latest} data={data} now={now} /> : (
        <EmptyState title="No stats yet" body="The first snapshot is made on the daily run. Refresh to make one now.">
          <Button variant="primary" icon="refresh" label="Refresh" busy={refreshing} busyLabel="Refreshing…"
            hint="Counts everything now" onPress={refresh} />
        </EmptyState>
      )}
    </Screen>
  );
}

function Snapshot({ latest, data, now }: { latest: StatsSnapshot; data: StatsResponse; now: number }) {
  const { members, plans, meetups, accounts } = latest;
  const connected = appStoreConnected(data.appStore);
  const week = appStoreTotals(data.appStore.days, 7);
  const groups = pairsByCity(latest.pairs, latest.cities);
  return (
    <>
      <Notice tone="info" icon="information-circle-outline"
        message={latest.truncated ? "There were too many profiles to scan in one go, so these counts are partial." : null} />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
        <Tile icon="people-outline" label="Members" value={formatCount(members.total)} note={newThisWeek(members.new7)} />
        <Tile icon="pulse-outline" label="Active this week" value={formatCount(members.active7)}
          note={`${percentLabel(members.active7, members.total)} of members`} />
        <Tile icon="calendar-outline" label="Plans proposed this week" value={formatCount(plans.new7)}
          note={`${formatCount(plans.total)} all time`} />
        <Tile icon="checkmark-done-outline" label="Meetups confirmed" value={formatCount(meetups.confirmed)}
          note={`+${formatCount(meetups.confirmed30)} in 30 days`} />
        <Tile icon="logo-apple-appstore" label="App Store downloads, 7 days"
          value={connected ? formatCount(week.downloads) : "Not connected"}
          note={connected ? (week.through ? `To ${shortDay(week.through)}` : "No days reported yet") : "App Store Connect"}
          quiet={!connected} />
      </View>

      <Heading>Funnel</Heading>
      <Card style={{ gap: space.lg }}>
        {funnel(latest).map((step, index, steps) => (
          <FunnelRow key={step.label} step={step} previous={index > 0 ? steps[index - 1] : null} />
        ))}
        <Caption>{plural(accounts.withoutProfile, "account")} signed up but never finished onboarding.</Caption>
      </Card>

      <Heading>Nobody to meet yet</Heading>
      <Card style={{ gap: space.sm }}>
        <View accessible accessibilityLabel={`${formatCount(members.unmatched)} of ${plural(members.discoverable, "discoverable member")}, ${percentLabel(members.unmatched, members.discoverable)}`}
          style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, flexWrap: "wrap" }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.display} style={[type.numeric, { fontSize: 28, lineHeight: 34, color: colors.primary }]}>
            {formatCount(members.unmatched)}
          </Text>
          <Text style={[type.body, { color: colors.muted, flexShrink: 1 }]}>
            of {plural(members.discoverable, "discoverable member")} · {percentLabel(members.unmatched, members.discoverable)}
          </Text>
        </View>
        <Meter ratio={ratio(members.unmatched, members.discoverable)} />
        <Body muted>No one in their city speaks what they’re learning and is learning what they speak.</Body>
      </Card>

      <Heading>Cities</Heading>
      {latest.cities.length ? (
        <>
          <Card style={{ padding: space.md, gap: 0 }}>
            <CityHeader />
            {latest.cities.map(city => <CityRow key={city.id} city={city} />)}
          </Card>
          <Caption>Active: did something in the last 7 days. No match: discoverable, with nobody reciprocal in the city.</Caption>
        </>
      ) : <Caption>No members in any city yet.</Caption>}

      <Heading>Language pairs</Heading>
      {groups.length ? (
        <>
          <Caption>The scarce side is the one limiting how many pairs can form.</Caption>
          {groups.map(group => (
            <Card key={group.city} style={{ gap: space.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <Ionicons name="location-outline" size={18} color={colors.primary} />
                <Text accessibilityRole="header" style={[type.label, { color: colors.primary }]}>{group.name}</Text>
              </View>
              {group.pairs.map((pair, index) => <PairRow key={`${pair.a}-${pair.b}`} pair={pair} first={index === 0} />)}
            </Card>
          ))}
        </>
      ) : <Caption>No language pairs yet.</Caption>}

      <Heading>Last 30 days</Heading>
      {data.history.length ? (
        <Card style={{ gap: space.lg }}>
          <Bars title="Members" series={historySeries(data.history, "members")} />
          <Bars title="Active this week" series={historySeries(data.history, "active7")} />
        </Card>
      ) : <Caption>History builds up one day at a time.</Caption>}

      <Heading>App Store</Heading>
      <AppStore appStore={data.appStore} now={now} />
    </>
  );
}

function ratio(part: number, whole: number) {
  return whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0;
}

/** A headline number. Two to a row on a phone; the odd one out takes the full width. */
function Tile({ icon, label, value, note, quiet = false }: { icon: IconName; label: string; value: string; note: string; quiet?: boolean }) {
  return (
    <Card style={{ flexGrow: 1, flexBasis: 140, padding: space.md, gap: space.xs }}>
      <View accessible accessibilityLabel={`${label}: ${value}. ${note}`} style={{ gap: space.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <Ionicons name={icon} size={16} color={colors.accentInk} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[type.caption, { flexShrink: 1 }]}>{label}</Text>
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.display}
          style={quiet ? [type.label, { fontSize: 17, lineHeight: 34, color: colors.muted }] : [type.numeric, { fontSize: 28, lineHeight: 34, color: colors.primary }]}>
          {value}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={type.caption}>{note}</Text>
      </View>
    </Card>
  );
}

/** A horizontal share bar from zero: aqua fill on a soft track. */
function Meter({ ratio: value }: { ratio: number }) {
  return (
    <View style={{ height: 8, borderRadius: radius.chip, backgroundColor: colors.surfaceNavySoft, overflow: "hidden" }}>
      {value > 0 ? (
        <View style={{ width: `${value * 100}%`, minWidth: 4, height: "100%", borderRadius: radius.chip, backgroundColor: colors.accent }} />
      ) : null}
    </View>
  );
}

function FunnelRow({ step, previous }: { step: FunnelStep; previous: FunnelStep | null }) {
  const share = previous
    ? `${formatPercent(step.ofTotal)} of accounts · ${formatPercent(step.ofPrevious)} of ${previous.label.toLowerCase()}`
    : "Everyone who signed up";
  return (
    <View accessible accessibilityLabel={`${step.label}: ${formatCount(step.count)}. ${share}`} style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
        <Text style={[type.label, { flexShrink: 1 }]}>{step.label}</Text>
        <Text style={[type.numeric, { fontSize: 17, lineHeight: 22 }]}>{formatCount(step.count)}</Text>
      </View>
      <Meter ratio={(step.ofTotal ?? 0) / 100} />
      <Text style={type.caption}>{share}</Text>
    </View>
  );
}

const COLUMN = 60;

function CityHeader() {
  const head = (label: string) => (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[type.caption, { fontSize: 12, lineHeight: 16, width: COLUMN, textAlign: "right" }]}>{label}</Text>
  );
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
      style={{ flexDirection: "row", alignItems: "flex-end", paddingBottom: space.sm }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[type.caption, { fontSize: 12, lineHeight: 16, flex: 1 }]}>City</Text>
      {head("Members")}{head("Active")}{head("New 30d")}{head("No match")}
    </View>
  );
}

function CityRow({ city }: { city: StatsCity }) {
  const cell = (value: number) => (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[type.numeric, { fontSize: 15, lineHeight: 20, width: COLUMN, textAlign: "right" }]}>
      {formatCount(value)}
    </Text>
  );
  const label = `${city.name}: ${plural(city.members, "member")}, ${formatCount(city.active7)} active this week, ` +
    `${formatCount(city.new30)} new in 30 days, ${formatCount(city.unmatched)} with nobody to meet`;
  return (
    <View accessible accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: space.sm, borderTopWidth: 1, borderColor: colors.line }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={[type.label, { flex: 1 }]}>{city.name}</Text>
      {cell(city.members)}{cell(city.active7)}{cell(city.new30)}{cell(city.unmatched)}
    </View>
  );
}

function PairRow({ pair, first }: { pair: StatsPair; first: boolean }) {
  const sides = pairSides(pair);
  const most = Math.max(pair.aSide, pair.bSide);
  return (
    <View accessible accessibilityLabel={pairSummary(pair)}
      style={[{ gap: space.xs }, !first && { borderTopWidth: 1, borderColor: colors.line, paddingTop: space.md }]}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" }}>
        <Text style={type.label}>{pairTitle(pair)}</Text>
        <Text style={type.caption}>{plural(pair.meetups, "meetup")}</Text>
      </View>
      {sides.map(side => (
        <View key={side.text} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={{ width: 48 }}><Meter ratio={ratio(side.count, most)} /></View>
          <Text style={[type.body, { fontSize: 14, lineHeight: 20, flexShrink: 1 }, side.scarce && { fontFamily: fonts.semibold }]}>{side.text}</Text>
          {side.scarce ? (
            <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.chip, paddingHorizontal: space.sm, paddingVertical: 2 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.compact} style={{ fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, color: colors.accentInk }}>Scarce</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const BAR_HEIGHT = 56;

/** One measure as daily columns from zero, oldest on the left, newest value on the right. */
function Bars({ title, series }: { title: string; series: HistorySeries }) {
  const change = seriesChange(series);
  return (
    <View accessible accessibilityLabel={`${title}: ${change}`} style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
        <Text style={type.label}>{title}</Text>
        <Text style={[type.numeric, { fontSize: 15, lineHeight: 20 }]}>{formatCount(series.last?.value ?? 0)}</Text>
      </View>
      <View style={{ height: BAR_HEIGHT, flexDirection: "row", alignItems: "flex-end", justifyContent: "flex-end", gap: 2, borderBottomWidth: 1, borderColor: colors.line }}>
        {series.points.map(point => (
          <View key={point.day} style={{
            flex: 1, maxWidth: 16, height: point.value > 0 ? Math.max(2, point.ratio * BAR_HEIGHT) : 0,
            backgroundColor: colors.accent, borderTopLeftRadius: 2, borderTopRightRadius: 2,
          }} />
        ))}
      </View>
      {series.first && series.last ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
          <Text style={[type.caption, { fontSize: 12 }]}>{shortDay(series.first.day)}</Text>
          <Text style={[type.caption, { fontSize: 12, flexShrink: 1, textAlign: "center" }]}>{change}</Text>
          <Text style={[type.caption, { fontSize: 12 }]}>{shortDay(series.last.day)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function AppStore({ appStore, now }: { appStore: AppStoreStats; now: number }) {
  const lastError = appStore.lastError ? <ErrorNotice message={`Last sync failed: ${appStore.lastError}`} /> : null;
  if (appStore.lastSyncAt === null) {
    return (
      <Card style={{ gap: space.sm }}>
        <Body muted>Downloads appear once App Store Connect is connected.</Body>
        {lastError}
      </Card>
    );
  }
  const week = appStoreTotals(appStore.days, 7);
  const month = appStoreTotals(appStore.days, 30);
  const rows: { label: string; key: "downloads" | "redownloads" | "updates" }[] = [
    { label: "Downloads", key: "downloads" },
    { label: "Redownloads", key: "redownloads" },
    { label: "Updates", key: "updates" },
  ];
  const column = { width: 72, textAlign: "right" as const };
  return (
    <Card style={{ gap: space.sm }}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: "row" }}>
        <Text style={[type.caption, { fontSize: 12, flex: 1 }]}> </Text>
        <Text style={[type.caption, { fontSize: 12 }, column]}>7 days</Text>
        <Text style={[type.caption, { fontSize: 12 }, column]}>30 days</Text>
      </View>
      {rows.map(row => (
        <View key={row.key} accessible accessibilityLabel={`${row.label}: ${formatCount(week[row.key])} in 7 days, ${formatCount(month[row.key])} in 30 days`}
          style={{ flexDirection: "row", alignItems: "center", paddingTop: space.sm, borderTopWidth: 1, borderColor: colors.line }}>
          <Text style={[type.label, { flex: 1 }]}>{row.label}</Text>
          <Text style={[type.numeric, { fontSize: 15, lineHeight: 20 }, column]}>{formatCount(week[row.key])}</Text>
          <Text style={[type.numeric, { fontSize: 15, lineHeight: 20 }, column]}>{formatCount(month[row.key])}</Text>
        </View>
      ))}
      <Caption icon="sync-outline">
        {`Synced ${timeAgo(appStore.lastSyncAt, now)}`}{week.through ? ` · reports to ${shortDay(week.through)}` : " · no days reported yet"}
      </Caption>
      {lastError}
    </Card>
  );
}
