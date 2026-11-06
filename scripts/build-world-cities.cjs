#!/usr/bin/env node
/**
 * Builds functions/data/cities.json, the list of cities a profile can belong to. The
 * backend loads it to validate `city` and the app imports the same file for its picker,
 * so there is one list. Run it to refresh the data; commit the output.
 *
 *   node scripts/build-world-cities.cjs [--cache <dir>] [--refresh] [--out <file>]
 *
 * Source: GeoNames (https://www.geonames.org), licensed CC BY 4.0. It downloads
 * cities15000.zip, countryInfo.txt and admin1CodesASCII.txt into the cache directory (kept
 * between runs; --refresh downloads again) and keeps:
 *   - every populated place of at least 100,000 people, except sections of a city (PPLX,
 *     such as Tokyo's wards or Kowloon) and historical or abandoned places;
 *   - every capital (PPLC), however small;
 *   - the eleven cities from before the world list, under their original ids;
 * then leaves out boroughs and districts that GeoNames lists as places of their own
 * (Brooklyn, Paris 15 Vaugirard, Iztapalapa): a place near a city at least three times
 * its size in the same country belongs to that city, unless it is a capital or a state or
 * province capital. Two entries with one name in one region are merged into the bigger.
 *
 * Ids are what profiles store, so they never change and never disappear:
 *   - the eleven original cities keep their bare ids (sydney, melbourne, ..., wellington);
 *   - every other city is `<ascii name>-<country>`, such as london-gb or sao-paulo-br, and
 *     `<ascii name>-<country>-<admin1 code>` when that would collide, such as
 *     springfield-us-il;
 *   - an id already in the output file is kept for the same GeoNames place, and a place
 *     that drops out of the selection (a smaller population, a deletion upstream) stays
 *     in the list, so a refresh can only add cities.
 *
 * The output is deterministic for the same input files: rows are sorted by population,
 * then id, and the only date in it is the newest modification date in the dump.
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const SOURCE = "https://download.geonames.org/export/dump/";
const MIN_POPULATION = 100000;
/** Sections of a city, historical, abandoned and destroyed places. */
const SKIPPED_FEATURES = new Set(["PPLX", "PPLH", "PPLQ", "PPLW", "PPLCH"]);
const CAPITAL = "PPLC";

/** The cities from before the world list, by GeoNames id. Production profiles store these ids. */
const LEGACY = {
  sydney: 2147714,
  melbourne: 2158177,
  brisbane: 2174003,
  perth: 2063523,
  adelaide: 2078025,
  canberra: 2172517,
  hobart: 2163355,
  darwin: 2073124,
  "gold-coast": 2165087,
  auckland: 2193733,
  wellington: 2179537,
};

/**
 * Countries whose GeoNames names are romanised from another script ("Aswān", "Kānpur",
 * "Honchō"). Their transliteration marks are not how people write the name in English, so
 * these use the plain ASCII name ("Aswan"). Every other country keeps its own spelling,
 * accents included ("São Paulo", "Kraków", "Sétif").
 */
const ROMANISED_LANGUAGES = new Set([
  "am", "ar", "be", "bg", "bn", "cmn", "dv", "dz", "el", "fa", "he", "hi", "hy", "ja", "ka", "kk", "km", "ko",
  "ky", "lo", "mk", "mn", "my", "ne", "ps", "ru", "si", "ta", "te", "tg", "th", "ti", "uk", "ur", "uz", "zh",
]);
/** English is listed first for India, but its GeoNames names are romanised. */
const ROMANISED_COUNTRIES = new Set(["IN"]);
/** Arabic first, but the names are the French spellings people use. */
const LATIN_COUNTRIES = new Set(["DZ", "MA", "TN"]);

/**
 * A place this close to a city FOLD_RATIO times its size is part of it: within about 8 km
 * of a city of a million people, 24 km of nine million.
 */
const FOLD_RATIO = 3;
const foldRadiusKm = (population) => 2.5 * Math.sqrt(population / 100000);

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const FIELDS = ["id", "name", "country", "zone", "population", "geonameid", "region"];

function parseArgs(argv) {
  const args = { cache: path.join(os.tmpdir(), "talkeven-geonames"), refresh: false,
    out: path.resolve(__dirname, "..", "functions", "data", "cities.json") };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--cache") args.cache = path.resolve(argv[++i]);
    else if (argv[i] === "--out") args.out = path.resolve(argv[++i]);
    else if (argv[i] === "--refresh") args.refresh = true;
    else throw new Error(`Unknown argument ${argv[i]}. Usage: node scripts/build-world-cities.cjs [--cache <dir>] [--refresh] [--out <file>]`);
  }
  return args;
}

async function download(name, dir, refresh) {
  const file = path.join(dir, name);
  if (!refresh && fs.existsSync(file)) return fs.readFileSync(file);
  const response = await fetch(SOURCE + name);
  if (!response.ok) throw new Error(`${SOURCE + name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, bytes);
  console.log(`Downloaded ${name} (${bytes.length} bytes)`);
  return bytes;
}

/** One named file out of a zip archive, read through the central directory. */
function unzip(zip, wanted) {
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("Not a zip archive");
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i += 1) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error("Corrupt zip central directory");
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    if (name === wanted) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data);
      throw new Error(`Unsupported zip compression method ${method}`);
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${wanted} is not in the archive`);
}

const rows = (text) => text.split("\n").filter((line) => line && !line.startsWith("#")).map((line) => line.split("\t"));

/** "Xi'an" → "xian", "Sao Paulo" → "sao-paulo". */
function slug(text) {
  return text.toLowerCase().replace(/['’‘`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** The part before a comma: "Mianzhu, Deyang, Sichuan" is Mianzhu. The app adds its own commas. */
const firstPart = (text) => text.split(",")[0].trim();

function readPrevious(file) {
  if (!fs.existsSync(file)) return new Map();
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const previous = new Map();
  for (const row of data.cities) {
    const [id, name, country, zone, population, geonameid, region] = row;
    previous.set(geonameid, { id, name, country, zone: data.zones[zone], population, geonameid, region: region || "" });
  }
  return previous;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [zip, countryText, admin1Text] = await Promise.all([
    download("cities15000.zip", args.cache, args.refresh),
    download("countryInfo.txt", args.cache, args.refresh),
    download("admin1CodesASCII.txt", args.cache, args.refresh),
  ]);

  const countries = new Map();
  const romanised = new Set(ROMANISED_COUNTRIES);
  for (const columns of rows(countryText.toString("utf8"))) {
    const [iso, , , , name] = columns;
    countries.set(iso, name.trim());
    const language = (columns[15] || "").split(",")[0].split("-")[0];
    if (ROMANISED_LANGUAGES.has(language) && !LATIN_COUNTRIES.has(iso)) romanised.add(iso);
  }
  const admin1 = new Map();
  for (const [code, name, ascii] of rows(admin1Text.toString("utf8"))) admin1.set(code, { name, ascii });

  // Every place in the dump, by GeoNames id.
  const places = new Map();
  let newest = "";
  for (const c of rows(unzip(zip, "cities15000.txt").toString("utf8"))) {
    const geonameid = Number(c[0]);
    const country = c[8];
    const ascii = firstPart(c[2]);
    const region = admin1.get(`${country}.${c[10]}`);
    places.set(geonameid, {
      geonameid,
      name: romanised.has(country) ? ascii : firstPart(c[1]),
      ascii,
      feature: c[7],
      country,
      admin1: c[10],
      region: region ? (romanised.has(country) ? region.ascii : region.name) : "",
      population: Number(c[14]) || 0,
      zone: c[17],
      lat: Number(c[4]),
      lon: Number(c[5]),
    });
    if (c[18] > newest) newest = c[18];
  }

  const legacyIds = new Map(Object.entries(LEGACY).map(([id, geonameid]) => [geonameid, id]));
  for (const [id, geonameid] of Object.entries(LEGACY)) {
    if (!places.has(geonameid)) throw new Error(`The ${id} place (${geonameid}) is missing from the dump`);
  }

  // Every city already shipped stays, under its id, even if it no longer qualifies. One that
  // GeoNames no longer has at all keeps its old row as it was.
  const previous = readPrevious(args.out);
  const keep = new Set([...legacyIds.keys(), ...previous.keys()]);
  const qualifies = (place) => place.feature === CAPITAL
    || (place.population >= MIN_POPULATION && !SKIPPED_FEATURES.has(place.feature));
  const retained = [...previous.values()].filter((old) => !places.has(old.geonameid));
  for (const old of retained) console.warn(`Keeping ${old.id} as it was: GeoNames no longer lists ${old.geonameid}.`);
  for (const old of previous.values()) {
    const place = places.get(old.geonameid);
    if (place && !qualifies(place) && !legacyIds.has(old.geonameid)) console.warn(`Keeping ${old.id}: it no longer qualifies.`);
  }

  const candidates = [...places.values()].filter((place) => keep.has(place.geonameid) || qualifies(place));
  for (const place of candidates) {
    if (!place.zone) throw new Error(`${place.name} (${place.geonameid}) has no time zone`);
    if (!countries.has(place.country)) throw new Error(`${place.name} (${place.geonameid}) has unknown country ${place.country}`);
    if (!slug(place.ascii)) throw new Error(`${place.name} (${place.geonameid}) has no ASCII name to make an id from`);
  }

  // Biggest first; between equals, the capital or administrative seat, then the older entry.
  const rank = (feature) => (feature === CAPITAL ? 0 : feature.startsWith("PPLA") ? 1 : 2);
  candidates.sort((p, q) => q.population - p.population || rank(p.feature) - rank(q.feature) || p.geonameid - q.geonameid);

  // GeoNames sometimes lists a town twice, or two towns of one name in one region. Nobody
  // could tell them apart in the app, so the bigger one stands for both.
  const labels = new Map();
  const chosen = [];
  let merged = 0;
  for (const place of candidates) {
    const label = `${place.name}|${place.admin1}|${place.country}`.toLowerCase();
    if (labels.has(label) && !keep.has(place.geonameid)) { merged += 1; continue; }
    if (labels.has(label)) console.warn(`Same name and region for ${labels.get(label)} and ${place.geonameid}: ${place.name}, ${place.country}`);
    labels.set(label, place.geonameid);
    chosen.push(place);
  }

  // A borough or district listed on its own (Brooklyn, Paris 15 Vaugirard, Iztapalapa,
  // Pudong) would split one city's members in two, and Discover never crosses a city. So a
  // place near a city at least three times its size in the same country is left out, and
  // its people choose that city. Capitals, first-order administrative seats (state and
  // province capitals) and every city already shipped always stay.
  const kept = [];
  const folded = [];
  for (const place of chosen) {
    const into = keep.has(place.geonameid) || place.feature === CAPITAL || place.feature === "PPLA" ? null
      : kept.find((city) => city.country === place.country && city.population >= FOLD_RATIO * place.population
        && distanceKm(city, place) <= foldRadiusKm(city.population));
    if (into) folded.push([place, into]);
    else kept.push(place);
  }
  if (process.env.SHOW_FOLDED) for (const [place, into] of folded) console.log(`${place.name} (${place.population}) -> ${into.name}`);
  chosen.length = 0;
  chosen.push(...kept);

  // Same ASCII name in the same country: the region tells them apart, in the id and on screen.
  const groups = new Map();
  for (const place of chosen) {
    const key = `${slug(place.ascii)}-${place.country.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(place);
  }

  const taken = new Map(retained.map((row) => [row.id, row.geonameid]));
  for (const old of previous.values()) taken.set(old.id, old.geonameid);
  for (const [geonameid, id] of legacyIds) taken.set(id, geonameid);
  const out = [...retained];
  for (const place of chosen) {
    const key = `${slug(place.ascii)}-${place.country.toLowerCase()}`;
    const ambiguous = groups.get(key).length > 1;
    let id = legacyIds.get(place.geonameid) || previous.get(place.geonameid)?.id;
    if (!id) {
      const candidates = ambiguous ? [] : [key];
      if (place.admin1 && place.admin1 !== "00") candidates.push(`${key}-${slug(place.admin1)}`);
      candidates.push(`${key}-${place.geonameid}`);
      id = candidates.find((candidate) => !taken.has(candidate) || taken.get(candidate) === place.geonameid);
      taken.set(id, place.geonameid);
    }
    out.push({ ...place, id, region: ambiguous ? place.region : "" });
  }

  const ids = new Set(out.map((city) => city.id));
  if (ids.size !== out.length) throw new Error("Duplicate ids");
  for (const id of Object.keys(LEGACY)) if (!ids.has(id)) throw new Error(`Lost the legacy id ${id}`);
  for (const id of previous.values()) if (!ids.has(id.id)) throw new Error(`Lost the id ${id.id}`);

  out.sort((p, q) => q.population - p.population || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  const zones = [...new Set(out.map((city) => city.zone))].sort();
  const zoneIndex = new Map(zones.map((zone, index) => [zone, index]));
  const usedCountries = [...new Set(out.map((city) => city.country))].sort();

  const json = (value) => JSON.stringify(value);
  const lines = out.map((city) => json([city.id, city.name, city.country, zoneIndex.get(city.zone), city.population, city.geonameid,
    ...(city.region ? [city.region] : [])]));
  const text = "{\n"
    + `"about":${json("Cities a Talkeven profile can belong to. Generated by scripts/build-world-cities.cjs; do not edit by hand. "
      + "Data from GeoNames (https://www.geonames.org), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).")},\n`
    + `"geonames":${json(newest)},\n`
    + `"fields":${json(FIELDS)},\n`
    + `"countries":${json(Object.fromEntries(usedCountries.map((code) => [code, countries.get(code) || code])))},\n`
    + `"zones":${json(zones)},\n`
    + `"cities":[\n${lines.join(",\n")}\n]}\n`;
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, text);

  const regions = out.filter((city) => city.region).length;
  console.log(`${path.relative(process.cwd(), args.out)}: ${out.length} cities in ${usedCountries.length} countries and ${zones.length} time zones, `
    + `${regions} with a region to tell them apart, ${merged} duplicate entries merged, ${folded.length} districts folded into their city, ${Buffer.byteLength(text)} bytes (GeoNames data as of ${newest}).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
