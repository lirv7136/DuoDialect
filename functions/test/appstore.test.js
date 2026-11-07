"use strict";

/**
 * App Store downloads, without Apple: the secret is parsed, the token verifies with the
 * matching public key, the summary report is counted per product type for this app only,
 * and Apple's three kinds of answer (a report, "no sales", not out yet) are told apart.
 * The sync against Firestore is in stats.test.js, which runs with the emulators.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { Buffer } = require("node:buffer");
const {
  TALKEVEN_APPLE_ID, parseAppStoreConfig, appStoreToken, summariseSales, fetchDailySummary,
} = require("../lib/appstore");

const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" });

const CONFIG = {
  keyId: "ABC123DEFG", issuerId: "11111111-2222-3333-4444-555555555555", privateKey: PEM, vendorNumber: "87654321",
};

const HEADER = [
  "Provider", "Provider Country", "SKU", "Developer", "Title", "Version", "Product Type Identifier", "Units",
  "Developer Proceeds", "Begin Date", "End Date", "Customer Currency", "Country Code", "Currency of Proceeds",
  "Apple Identifier", "Customer Price",
].join("\t");

function row({ type, units, country = "AU", appleId = TALKEVEN_APPLE_ID }) {
  return ["APPLE", "US", "talkeven", "Talkeven", "Talkeven", "1.1.2", type, String(units), "0", "11/05/2026",
    "11/05/2026", "AUD", country, "AUD", appleId, "0"].join("\t");
}

test("the secret parses, unescapes the key and defaults to the Talkeven app", () => {
  const raw = JSON.stringify({ ...CONFIG, privateKey: PEM.replace(/\n/g, "\\n") });
  const config = parseAppStoreConfig(raw);
  assert.equal(config.privateKey, PEM);
  assert.equal(config.appleId, TALKEVEN_APPLE_ID);
  assert.throws(() => parseAppStoreConfig("not json"), /not valid JSON/);
  assert.throws(() => parseAppStoreConfig(JSON.stringify({ ...CONFIG, vendorNumber: "" })), /missing vendorNumber/);
});

test("the token is an ES256 JWT for App Store Connect that verifies with the public key", () => {
  const now = new Date("2026-11-06T00:00:00Z");
  const [head, body, signature] = appStoreToken(CONFIG, now).split(".");
  const decode = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  assert.deepEqual(decode(head), { alg: "ES256", kid: CONFIG.keyId, typ: "JWT" });
  const claims = decode(body);
  assert.equal(claims.iss, CONFIG.issuerId);
  assert.equal(claims.aud, "appstoreconnect-v1");
  assert.ok(claims.exp - claims.iat <= 20 * 60, "Apple refuses tokens that live longer than 20 minutes");
  const valid = crypto.verify("sha256", Buffer.from(`${head}.${body}`), {
    key: publicKey, dsaEncoding: "ieee-p1363",
  }, Buffer.from(signature, "base64url"));
  assert.ok(valid);
});

test("units are split into downloads, redownloads and updates, for this app only", () => {
  const tsv = [
    HEADER,
    row({ type: "1", units: 3 }),
    row({ type: "1F", units: 2, country: "NZ" }),
    row({ type: "3", units: 4 }),
    row({ type: "7", units: 9 }),
    row({ type: "IA1", units: 5 }),
    row({ type: "1", units: 50, appleId: "999" }),
  ].join("\n");
  assert.deepEqual(summariseSales(tsv), {
    downloads: 5, redownloads: 4, updates: 9, countries: { AU: 3, NZ: 2 },
  });
  assert.deepEqual(summariseSales(""), { downloads: 0, redownloads: 0, updates: 0, countries: {} });
  assert.throws(() => summariseSales("Units\n1"), /Product Type Identifier/);
});

function fakeFetch(status, body) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () => String(body),
      arrayBuffer: async () => body,
    };
  };
  return { impl, calls };
}

test("a report, a day with no sales and a report not out yet are told apart", async () => {
  const gz = zlib.gzipSync(Buffer.from(`${HEADER}\n${row({ type: "1", units: 1 })}\n`));
  const ok = fakeFetch(200, gz);
  const report = await fetchDailySummary(CONFIG, "2026-11-05", { fetchImpl: ok.impl });
  assert.equal(report.status, "ok");
  assert.equal(summariseSales(report.tsv).downloads, 1);

  const { url, init } = ok.calls[0];
  const params = new URL(url).searchParams;
  assert.equal(params.get("filter[vendorNumber]"), CONFIG.vendorNumber);
  assert.equal(params.get("filter[reportDate]"), "2026-11-05");
  assert.equal(params.get("filter[reportSubType]"), "SUMMARY");
  assert.match(init.headers.Authorization, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);

  const none = fakeFetch(404, JSON.stringify({ errors: [{ detail: "There were no sales for the date specified." }] }));
  assert.deepEqual(await fetchDailySummary(CONFIG, "2026-11-05", { fetchImpl: none.impl }), { status: "empty" });

  const notYet = fakeFetch(404, JSON.stringify({ errors: [{ detail: "Report is not available yet." }] }));
  assert.deepEqual(await fetchDailySummary(CONFIG, "2026-11-05", { fetchImpl: notYet.impl }), { status: "unavailable" });

  const denied = fakeFetch(401, "NOT_AUTHORIZED");
  await assert.rejects(fetchDailySummary(CONFIG, "2026-11-05", { fetchImpl: denied.impl }), /answered 401/);
});
