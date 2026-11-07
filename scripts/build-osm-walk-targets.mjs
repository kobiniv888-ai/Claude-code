#!/usr/bin/env node
/**
 * One-off extractor for the static OpenStreetMap data behind "≈ 5 דק׳ הליכה לים" / "למעליות"
 * (round 3, brief 7.3). It asks an Overpass API instance for
 *   - sea: beaches (natural=beach) and the coastline (natural=coastline) along the Adjara coast
 *     (Sarpi, Kvariati, Gonio, Batumi, Makhinjauri, Chakvi, Tsikhisdziri, Kobuleti), and
 *   - ski lifts: aerialway ways (chair_lift, gondola, cable_car, mixed_lift, drag_lift, t-bar,
 *     j-bar, platter, rope_tow, magic_carpet) in Gudauri, Bakuriani and Mestia (Hatsvali, Tetnuldi),
 * and writes small JSON files of simplified points to src/data/osm/. The site reads only those
 * files (src/lib/geo/walk-targets.ts): there are no live map calls at runtime.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/build-osm-walk-targets.mjs            # fetch + build
 *   node scripts/build-osm-walk-targets.mjs --offline                        # rebuild from the cache
 *   OVERPASS_URL=https://overpass-api.de/api/interpreter node scripts/...    # another instance
 *
 * Options: --raw-dir <dir> (where the raw Overpass answers are cached; default: the OS temp dir),
 * --offline (no network; build from the cache), --date YYYY-MM-DD (the extraction date to record).
 * Node 22.21+ needs NODE_USE_ENV_PROXY=1 to send fetch() through HTTPS_PROXY.
 *
 * Simplification: beach outlines and lift lines are sampled into points every ~50 m, points closer
 * than 25 m to one already kept are dropped, and coordinates are rounded to 5 decimals (~1 m).
 * Beaches farther than 300 m from the coastline (river or lake beaches) are left out. Lifts keep
 * their bottom end and any middle station (OSM draws aerialways uphill; when both ends carry an
 * "ele" tag the lower one is the bottom). Disused, abandoned and construction lifts are left out.
 *
 * Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).
 * If Overpass fails after the retries, the script stops without writing anything: never invent
 * coordinates.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "src", "data", "osm");
const DEFAULT_URL = "https://maps.mail.ru/osm/tools/overpass/api/interpreter";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const OFFLINE = flag("--offline");
const RAW_DIR = path.resolve(option("--raw-dir", path.join(os.tmpdir(), "bayit-osm-raw")));
const EXTRACTED_ON = option("--date", new Date().toISOString().slice(0, 10));
const OVERPASS_URL = process.env.OVERPASS_URL?.trim() || DEFAULT_URL;

const SAMPLE_M = 50;
const DEDUPE_M = 25;
const BEACH_MAX_FROM_COAST_M = 300;

/**
 * Areas, as [south, west, north, east]. The site decides which TOWNS get a walking time
 * (src/lib/geo/walk-targets.ts); these boxes only say which data to download.
 */
const SEA_BBOX = [41.5, 41.5, 41.93, 41.86]; // Sarpi (Turkish border) → north of Kobuleti
const SKI_BBOXES = {
  gudauri: [42.42, 44.4, 42.51, 44.54],
  bakuriani: [41.69, 43.44, 41.79, 43.58],
  mestia: [42.95, 42.6, 43.11, 42.98], // Mestia town, Hatsvali and Tetnuldi
};
const LIFT_TYPES = [
  "chair_lift",
  "gondola",
  "cable_car",
  "mixed_lift",
  "drag_lift",
  "t-bar",
  "j-bar",
  "platter",
  "rope_tow",
  "magic_carpet",
];

const bbox = (b) => b.map((n) => n.toFixed(4)).join(",");
const QUERIES = {
  beaches: `[out:json][timeout:180];
nwr["natural"="beach"](${bbox(SEA_BBOX)});
out geom;`,
  coastline: `[out:json][timeout:180];
way["natural"="coastline"](${bbox(SEA_BBOX)});
out geom;`,
  lifts: `[out:json][timeout:180];
(
${Object.values(SKI_BBOXES)
  .map((b) => `  way["aerialway"~"^(${LIFT_TYPES.join("|")})$"](${bbox(b)});`)
  .join("\n")}
)->.lifts;
.lifts out geom;
node(w.lifts)->.liftNodes;
.liftNodes out;`,
};

// ─── geometry ───────────────────────────────────────────────

const R = 6_371_000;
const rad = (d) => (d * Math.PI) / 180;
function meters(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const inBox = (p, [s, w, n, e]) => p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e;

/** Points every ~SAMPLE_M along a polyline, both ends included. */
function sampleLine(line) {
  const out = [];
  if (line.length === 0) return out;
  out.push(line[0]);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const d = meters(a, b);
    const steps = Math.floor(d / SAMPLE_M);
    for (let s = 1; s <= steps; s++) {
      const t = (s * SAMPLE_M) / d;
      if (t >= 1) break;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
    out.push(b);
  }
  return out;
}

/** Drops points closer than DEDUPE_M to one already kept (grid of ~DEDUPE_M cells). */
function dedupe(points) {
  const cell = DEDUPE_M / 111_320;
  const grid = new Map();
  const kept = [];
  for (const p of points) {
    const gx = Math.floor(p.lng / cell);
    const gy = Math.floor(p.lat / cell);
    let near = false;
    for (let dx = -2; dx <= 2 && !near; dx++) {
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (const q of grid.get(`${gx + dx}:${gy + dy}`) ?? []) {
          if (meters(p, q) < DEDUPE_M) {
            near = true;
            break;
          }
        }
      }
    }
    if (near) continue;
    const key = `${gx}:${gy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(p);
    kept.push(p);
  }
  return kept;
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;
/** [[lat, lng], …] sorted south → north, so diffs stay readable in review. */
const pack = (points) =>
  points
    .map((p) => [round5(p.lat), round5(p.lng)])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

const geomLine = (geometry = []) => geometry.filter(Boolean).map((g) => ({ lat: g.lat, lng: g.lon }));

// ─── Overpass ───────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(name, query) {
  const cacheFile = path.join(RAW_DIR, `${name}.json`);
  if (OFFLINE) {
    if (!existsSync(cacheFile)) throw new Error(`--offline: no cached answer at ${cacheFile}`);
    return JSON.parse(await readFile(cacheFile, "utf8"));
  }
  const waits = [0, 20_000, 45_000, 90_000, 150_000, 240_000];
  let lastError = null;
  for (let attempt = 0; attempt < waits.length; attempt++) {
    if (waits[attempt]) {
      console.log(`  [${name}] retry ${attempt}/${waits.length - 1} in ${waits[attempt] / 1000} s`);
      await sleep(waits[attempt]);
    }
    try {
      const started = Date.now();
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "Bayit walk-targets extractor (one-off; static data, no live calls)",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(240_000),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`not JSON (server busy?): ${text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200)}`);
      }
      if (data.remark && /runtime error|timed out|out of memory/i.test(data.remark)) {
        throw new Error(`Overpass remark: ${data.remark}`);
      }
      if (!Array.isArray(data.elements)) throw new Error("no elements in the answer");
      console.log(`  [${name}] ${data.elements.length} elements in ${Math.round((Date.now() - started) / 1000)} s`);
      await mkdir(RAW_DIR, { recursive: true });
      await writeFile(cacheFile, JSON.stringify(data));
      return data;
    } catch (error) {
      lastError = error;
      console.warn(`  [${name}] failed: ${error?.message ?? error}`);
    }
  }
  throw new Error(`Overpass query "${name}" failed after ${waits.length} attempts: ${lastError?.message ?? lastError}`);
}

// ─── build ──────────────────────────────────────────────────

const LIFECYCLE_KEYS = ["disused", "abandoned", "construction", "proposed", "razed", "demolished"];
const isRetired = (tags = {}) =>
  LIFECYCLE_KEYS.some((k) => tags[k] === "yes" || tags[`${k}:aerialway`]);

function buildSea(beachesRaw, coastRaw) {
  const coastPoints = [];
  for (const el of coastRaw.elements) {
    if (el.type !== "way") continue;
    for (const p of sampleLine(geomLine(el.geometry))) if (inBox(p, SEA_BBOX)) coastPoints.push(p);
  }
  const coastline = dedupe(coastPoints);
  if (coastline.length < 100) throw new Error(`coastline looks incomplete (${coastline.length} points)`);

  // Coastline index for the "is this beach on the sea?" check.
  const cell = 0.01;
  const coastGrid = new Map();
  for (const p of coastline) {
    const key = `${Math.floor(p.lng / cell)}:${Math.floor(p.lat / cell)}`;
    if (!coastGrid.has(key)) coastGrid.set(key, []);
    coastGrid.get(key).push(p);
  }
  const distToCoast = (p) => {
    let best = Infinity;
    const gx = Math.floor(p.lng / cell);
    const gy = Math.floor(p.lat / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const q of coastGrid.get(`${gx + dx}:${gy + dy}`) ?? []) best = Math.min(best, meters(p, q));
    }
    return best;
  };

  const beachPoints = [];
  let kept = 0;
  let skipped = 0;
  for (const el of beachesRaw.elements) {
    let lines = [];
    if (el.type === "node") lines = [[{ lat: el.lat, lng: el.lon }]];
    else if (el.type === "way") lines = [geomLine(el.geometry)];
    else if (el.type === "relation") {
      lines = (el.members ?? []).filter((m) => m.type === "way" && m.role !== "inner").map((m) => geomLine(m.geometry));
    }
    const points = lines.flatMap(sampleLine).filter((p) => inBox(p, SEA_BBOX));
    if (points.length === 0) continue;
    if (!points.some((p) => distToCoast(p) <= BEACH_MAX_FROM_COAST_M)) {
      skipped++;
      continue;
    }
    kept++;
    beachPoints.push(...points);
  }
  const beaches = dedupe(beachPoints);
  console.log(`  sea: ${kept} beaches kept (${skipped} away from the sea skipped), ${beaches.length} beach points, ${coastline.length} coastline points`);
  if (beaches.length < 50) throw new Error(`beaches look incomplete (${beaches.length} points)`);
  return { beaches: pack(beaches), coastline: pack(coastline) };
}

function buildLifts(raw) {
  const nodes = new Map();
  for (const el of raw.elements) if (el.type === "node") nodes.set(el.id, el);
  const points = [];
  const perArea = Object.fromEntries(Object.keys(SKI_BBOXES).map((k) => [k, 0]));
  let lifts = 0;
  for (const el of raw.elements) {
    if (el.type !== "way" || !LIFT_TYPES.includes(el.tags?.aerialway) || isRetired(el.tags)) continue;
    const line = geomLine(el.geometry);
    const ids = el.nodes ?? [];
    if (line.length < 2 || ids.length !== line.length) continue;
    let order = line.map((p, i) => ({ ...p, id: ids[i] }));
    const ele = (id) => Number.parseFloat(nodes.get(id)?.tags?.ele ?? "");
    const first = ele(order[0].id);
    const last = ele(order[order.length - 1].id);
    if (Number.isFinite(first) && Number.isFinite(last) && first > last) order = [...order].reverse();
    const bottom = order[0];
    const middle = order.slice(1, -1).filter((p) => nodes.get(p.id)?.tags?.aerialway === "station");
    const area = Object.entries(SKI_BBOXES).find(([, b]) => inBox(bottom, b))?.[0];
    if (!area) continue;
    lifts++;
    perArea[area]++;
    points.push(bottom, ...middle);
  }
  const kept = dedupe(points);
  console.log(`  lifts: ${lifts} lifts, ${kept.length} boarding points`, perArea);
  for (const [area, count] of Object.entries(perArea)) {
    if (count === 0) throw new Error(`no lifts found in ${area}: refusing to write partial data`);
  }
  return { stations: pack(kept), perArea };
}

async function main() {
  console.log(`Overpass: ${OFFLINE ? "(offline, cache " + RAW_DIR + ")" : OVERPASS_URL}`);
  const beachesRaw = await overpass("beaches", QUERIES.beaches);
  const coastRaw = await overpass("coastline", QUERIES.coastline);
  const liftsRaw = await overpass("lifts", QUERIES.lifts);
  const osmBase = beachesRaw.osm3s?.timestamp_osm_base ?? liftsRaw.osm3s?.timestamp_osm_base ?? null;

  const sea = buildSea(beachesRaw, coastRaw);
  const ski = buildLifts(liftsRaw);

  const meta = {
    source: "OpenStreetMap",
    attribution: "© OpenStreetMap contributors",
    license: "ODbL-1.0",
    licenseUrl: "https://www.openstreetmap.org/copyright",
    extractedOn: EXTRACTED_ON,
    osmDataTimestamp: osmBase,
    generator: "scripts/build-osm-walk-targets.mjs",
  };
  await mkdir(OUT_DIR, { recursive: true });
  const seaFile = path.join(OUT_DIR, "sea.json");
  const liftFile = path.join(OUT_DIR, "ski-lifts.json");
  await writeFile(
    seaFile,
    `${JSON.stringify({ ...meta, bbox: SEA_BBOX, query: { beaches: QUERIES.beaches, coastline: QUERIES.coastline }, beaches: sea.beaches, coastline: sea.coastline })}\n`,
  );
  await writeFile(
    liftFile,
    `${JSON.stringify({ ...meta, bboxes: SKI_BBOXES, query: QUERIES.lifts, liftTypes: LIFT_TYPES, stations: ski.stations })}\n`,
  );
  for (const file of [seaFile, liftFile]) {
    const size = (await readFile(file)).length;
    console.log(`wrote ${path.relative(ROOT, file)} (${Math.round(size / 1024)} KB)`);
  }
}

main().catch((error) => {
  console.error(`\nSTOPPED: ${error?.message ?? error}\nNothing was written. Do not invent coordinates; retry later.`);
  process.exit(1);
});
