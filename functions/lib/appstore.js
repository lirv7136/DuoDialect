"use strict";

const crypto = require("crypto");
const zlib = require("zlib");
const { Buffer } = require("buffer");
const { FieldValue } = require("firebase-admin/firestore");
const { refs } = require("./refs");
const { addDays } = require("./checkins");
const { localDay } = require("./stats");

/**
 * App Store downloads.
 *
 * Daily units from App Store Connect Sales and Trends (the SUMMARY sales report), so the
 * stats screen shows downloads beside sign ups. Needs the secret APPSTORE_CONNECT: a JSON
 * object { keyId, issuerId, privateKey, vendorNumber } for an App Store Connect API key
 * with the Sales, Finance or Admin role. scripts/set-appstore-secret.sh builds it.
 *
 *   appStoreDaily/{YYYY-MM-DD}   server only; units for one report day (Pacific time)
 *   stats/appStoreSync           server only; when the sync last ran, and its last error
 *
 * Driven by syncAppStoreDownloads once a day. The first run backfills BACKFILL_DAYS; later
 * runs fetch only missing days, plus the most recent ones again in case Apple was late.
 */

const TALKEVEN_APPLE_ID = "6816316060";

/** Apple's report days follow Pacific time. */
const REPORT_TIME_ZONE = "America/Los_Angeles";

const BACKFILL_DAYS = 30;
const REFETCH_RECENT_DAYS = 2;

/** Product type identifiers in the sales report, by what they count. */
const DOWNLOAD_TYPES = new Set(["1", "1F", "1T", "F1", "1E", "1EP", "1EU"]);
const REDOWNLOAD_TYPES = new Set(["3", "3F", "3T", "F3"]);
const UPDATE_TYPES = new Set(["7", "7F", "7T", "F7"]);

const API = "https://api.appstoreconnect.apple.com/v1/salesReports";

/** Reads the secret. The private key may arrive with its newlines escaped. */
function parseAppStoreConfig(raw) {
  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error("APPSTORE_CONNECT is not valid JSON.");
  }
  for (const field of ["keyId", "issuerId", "privateKey", "vendorNumber"]) {
    if (typeof config[field] !== "string" || !config[field].trim()) {
      throw new Error(`APPSTORE_CONNECT is missing ${field}.`);
    }
  }
  return {
    keyId: config.keyId.trim(),
    issuerId: config.issuerId.trim(),
    privateKey: config.privateKey.replace(/\\n/g, "\n"),
    vendorNumber: config.vendorNumber.trim(),
    appleId: typeof config.appleId === "string" && config.appleId.trim() ? config.appleId.trim() : TALKEVEN_APPLE_ID,
  };
}

/** A short lived ES256 token for the App Store Connect API. */
function appStoreToken({ keyId, issuerId, privateKey }, now = new Date()) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const issuedAt = Math.floor(now.getTime() / 1000);
  const input = `${encode({ alg: "ES256", kid: keyId, typ: "JWT" })}.${encode({
    iss: issuerId, iat: issuedAt, exp: issuedAt + 15 * 60, aud: "appstoreconnect-v1",
  })}`;
  const signature = crypto.sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${signature.toString("base64url")}`;
}

function emptyUnits() {
  return { downloads: 0, redownloads: 0, updates: 0, countries: {} };
}

/**
 * Units in one summary report, for one app. Rows for other apps under the same vendor are
 * skipped. `countries` counts first time downloads only.
 */
function summariseSales(tsv, appleId = TALKEVEN_APPLE_ID) {
  const lines = tsv.split(/\r?\n/).filter((line) => line.trim());
  const units = emptyUnits();
  if (lines.length === 0) return units;
  const header = lines[0].split("\t");
  const column = (name) => header.indexOf(name);
  const type = column("Product Type Identifier");
  const count = column("Units");
  const app = column("Apple Identifier");
  const country = column("Country Code");
  if (type < 0 || count < 0) throw new Error("The sales report has no Product Type Identifier or Units column.");

  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    if (app >= 0 && cells[app] !== appleId) continue;
    const n = Number(cells[count]) || 0;
    const kind = cells[type];
    if (DOWNLOAD_TYPES.has(kind)) {
      units.downloads += n;
      const code = country >= 0 ? cells[country] : "";
      if (code) units.countries[code] = (units.countries[code] || 0) + n;
    } else if (REDOWNLOAD_TYPES.has(kind)) {
      units.redownloads += n;
    } else if (UPDATE_TYPES.has(kind)) {
      units.updates += n;
    }
  }
  return units;
}

/**
 * One day's summary report. Returns { status: "ok", tsv }, { status: "empty" } when Apple
 * says there were no sales that day, or { status: "unavailable" } when the report is not
 * out yet. Anything else throws.
 */
async function fetchDailySummary(config, day, { fetchImpl = fetch, now = new Date() } = {}) {
  const params = new URLSearchParams({
    "filter[frequency]": "DAILY",
    "filter[reportType]": "SALES",
    "filter[reportSubType]": "SUMMARY",
    "filter[vendorNumber]": config.vendorNumber,
    "filter[reportDate]": day,
    "filter[version]": "1_1",
  });
  const response = await fetchImpl(`${API}?${params}`, {
    headers: { Authorization: `Bearer ${appStoreToken(config, now)}`, Accept: "application/a-gzip" },
  });
  if (response.status === 404) {
    const text = await response.text();
    return /no sales/i.test(text) ? { status: "empty" } : { status: "unavailable" };
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`App Store Connect answered ${response.status} for ${day}: ${text.slice(0, 200)}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  return { status: "ok", tsv: zlib.gunzipSync(body).toString("utf8") };
}

/**
 * Fetches the days that are missing, plus the most recent ones again, and records how the
 * run went. Stops at the first error so a bad key is reported once, not thirty times.
 */
async function syncAppStoreDownloads(db, config, { now = new Date(), fetchImpl = fetch } = {}) {
  const r = refs(db);
  const today = localDay(now, REPORT_TIME_ZONE);
  const days = [];
  for (let i = 1; i <= BACKFILL_DAYS; i += 1) days.push(addDays(today, -i));
  const stored = await db.getAll(...days.map((day) => r.appStoreDay(day)));
  const wanted = days.filter((day, index) => index < REFETCH_RECENT_DAYS || !stored[index].exists);

  let written = 0;
  let lastError = null;
  for (const day of wanted) {
    try {
      const report = await fetchDailySummary(config, day, { fetchImpl, now });
      if (report.status === "unavailable") continue;
      const units = report.status === "ok" ? summariseSales(report.tsv, config.appleId) : emptyUnits();
      await r.appStoreDay(day).set({ day, ...units, fetchedAt: FieldValue.serverTimestamp() });
      written += 1;
    } catch (error) {
      lastError = String((error && error.message) || error).slice(0, 300);
      break;
    }
  }

  await r.appStoreSync().set({
    lastRunAt: FieldValue.serverTimestamp(),
    lastError,
    ...(lastError ? {} : { lastSuccessAt: FieldValue.serverTimestamp() }),
  }, { merge: true });
  return { checked: wanted.length, written, lastError };
}

/**
 * The scheduled entry point: reads the secret, then syncs. A missing or malformed secret is
 * recorded as the last error, so the stats screen says what is wrong instead of nothing.
 */
async function runAppStoreSync(db, rawConfig, options = {}) {
  let config;
  try {
    config = parseAppStoreConfig(rawConfig);
  } catch (error) {
    const lastError = String(error.message).slice(0, 300);
    await refs(db).appStoreSync().set({ lastRunAt: FieldValue.serverTimestamp(), lastError }, { merge: true });
    return { checked: 0, written: 0, lastError };
  }
  return syncAppStoreDownloads(db, config, options);
}

module.exports = {
  TALKEVEN_APPLE_ID,
  parseAppStoreConfig,
  appStoreToken,
  summariseSales,
  fetchDailySummary,
  syncAppStoreDownloads,
  runAppStoreSync,
};
