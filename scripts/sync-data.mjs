// Data step. Runs before `dev` and `build`; reads only files committed in this
// repo (plus optional private inputs named by env vars). Never calls CSLC.
//
// Inputs (public, committed):
//   data/cslc/leases-YYYY-MM-DD.geojson   newest snapshot of the CSLC lease layer
//   data/layers/*.geojson + index.json    land layers (CPAD, granted, school, water lines)
//   data/curated.json                     sourced case studies and extra review candidates
//   data/cameras.json                     optional hand-tuned Fly-in cameras by PRC
//   data/ref/ca-frame.json                California's land border + state-and-coastal-waters area (mask, labels)
//   data/ref/ca-county-*.geojson          county lines and county name points
//   data/ref/ca-labels.geojson            curated California place names (ranges, rivers, lakes, bays, passes)
//   data/state-oil-gas/*                  State oil & gas family (scripts/data/README.md): footprints, terminals,
//                                         wells on state leases, former leases, SLA line, sovereign waterbodies
// Optional (off by default):
//   CAMERAS_EXTRA=path                    more Fly-in camera overrides, same format as data/cameras.json
//   OVERLAYS_DIR=path                     your own GeoJSON overlay layers (see README "Build your own layer")
//   LAYERS_DIR=path                       use other land-layer files instead of data/layers
//   REVIEW_DIR=path                       "What the records show" files (<PRC>.json); default RESEARCH_DIR/review, else data/review
//   DATA_SOURCE=fixture                   tiny development sample (data/fixtures/)
//   FIXTURE_LAYERS=1                      hand-drawn placeholder outlines (development only)
//
// Outputs (gitignored):
//   public/data/leases.min.json, public/data/layers/*, public/data/overlays/*
//   data/generated/leases.full.json
import fs from "node:fs";
import path from "node:path";
import { buildLeases } from "./sync/leases.mjs";

const root = path.resolve(import.meta.dirname, "..");
const FIX = path.join(root, "data/fixtures");
const mode = process.env.DATA_SOURCE ?? "snapshot";
if (!["snapshot", "fixture"].includes(mode)) throw new Error(`DATA_SOURCE must be snapshot|fixture, got ${mode}`);

const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const mkdirp = (p) => fs.mkdirSync(p, { recursive: true });
const rel = (p) => path.relative(root, p);

// ---------- leases ----------
let snapshot;
if (mode === "fixture") snapshot = path.join(FIX, "leases.geojson");
else {
  const dir = path.join(root, "data/cslc");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^leases-\d{4}-\d{2}-\d{2}\.geojson$/.test(f)).sort() : [];
  if (!files.length) throw new Error("No snapshot in data/cslc/. Run `npm run fetch:leases` first.");
  snapshot = path.join(dir, files.at(-1));
}
const curated = readJson(path.join(root, "data/curated.json"));
const L = buildLeases(root, { snapshot, curated });
const isFixture = mode === "fixture";

const min = L.full.map((l) => ({
  p: l.prc,
  n: l.name,
  t: l.derived.typeKey,
  k: l.derived.categoryKey,
  // Every infrastructure kind in the text, primary first; only when there is more than one.
  ...(l.derived.typeKeys.length > 1 ? { ts: l.derived.typeKeys } : {}),
  xs: l.derived.expiry === "expired" ? "e" : l.derived.expiry === "current" ? "c" : "n",
  no: l.derived.stateText ? 1 : 0,
  ...(l.derived.stateText ? { nw: l.derived.stateText } : {}),
  ...(l.derived.expiry === "expired" ? { xd: l.facts.expiration } : {}),
  // Oil and gas kind: the state's own lease type (source data).
  ...(/^(Oil & Gas Lease|Compensatory Agreement)$/.test(l.facts.typeOfLease ?? "") ? { og: 1 } : {}),
  e: l.derived.mapEra.decade,
  s: l.score.value,
  r: l.region.value,
  c: l.derived.county?.value ?? null,
  w: l.derived.waterbody?.value ?? null,
  f: l.derived.firstTarget ? 1 : 0,
  rl: l.renewedLegacy.value ? 1 : 0,
  st: l.stage,
  x: l.completed ? 1 : 0,
  cs: l.caseStudy ? 1 : 0,
  pts: l.points ?? [[l.lng, l.lat]],
}));

const LAYERS = ["access", "granted", "school", "waterlines"];
const layerDir = process.env.LAYERS_DIR ? path.resolve(root, process.env.LAYERS_DIR) : path.join(root, "data/layers");
const fixtureLayers = process.env.FIXTURE_LAYERS === "1";
let index = {};
try { for (const l of readJson(path.join(layerDir, "index.json")).layers ?? []) index[l.name ?? l.id] = l; } catch {}

// ---------- datasets: when each was pulled, and the source's own last-updated date ----------
const snapSource = readJson(snapshot).source ?? {};
const day = (v) => (v ? String(v).slice(0, 10) : null);
const DATASET_NOTES = {
  access: "CPAD publishes named releases (2026a); the release is its version.",
};
const datasets = [
  {
    key: "leases",
    title: "State Lands Commission leases",
    source: "California State Lands Commission, public GIS lease layer",
    url: snapSource.layer ?? null,
    pulledAt: day(snapSource.pulledAt),
    sourceUpdated: day(snapSource.layerLastEdit),
    sourceNote: null,
    caveats: [
      "Locations are approximate: one point per lease, not the lease boundary.",
      "The public layer is incomplete: leases are added, modified or terminated on an ongoing basis.",
      "\u201cActive\u201d is the record status in the layer, not evidence that anything is in use.",
    ],
  },
  ...(L.lessees
    ? [{
        key: "lessees",
        title: "Lessee names (organizations)",
        source: "California State Lands Commission, meeting-item index (Name field), read by this project's research export",
        url: "https://www.slc.ca.gov/meetings/",
        pulledAt: day(L.lessees.generatedAt),
        sourceUpdated: null,
        sourceNote: "Each name cites the dated Commission item it came from, on the lease page.",
        caveats: [
          "The current or last lessee named in the newest dated Commission item for the lease; a later assignment may not be indexed yet.",
          "Organizations only: names of private individuals and trusts are not shown.",
        ],
        count: L.counts.lessees,
      }]
    : []),
  ...LAYERS.filter((n) => index[n]).map((n) => {
    const i = index[n];
    return {
      key: n,
      title: i.title ?? n,
      source: i.attribution ?? null,
      url: i.sources?.[0] ?? null,
      pulledAt: day(i.pulledAt ?? i.asOf),
      sourceUpdated: day(i.sourceLastEdit),
      sourceNote: DATASET_NOTES[n] ?? null,
      caveats: i.caveat ? [i.caveat] : [],
    };
  }),
];

// State oil & gas (data/state-oil-gas/index.json, written by scripts/data/build_state_oil_gas.py)
const ogDir = path.join(root, "data/state-oil-gas");
const ogIndex = exists(path.join(ogDir, "index.json")) ? readJson(path.join(ogDir, "index.json")) : null;
for (const d of ogIndex?.datasets ?? []) datasets.push({ ...d, family: "state-oil-gas" });

const meta = {
  fixture: isFixture,
  datasets,
  file: rel(snapshot),
  generatedAt: new Date().toISOString(),
  source: L.source,
  methods: L.methods,
  counts: L.counts,
  candidates: L.candidates,
};

mkdirp(path.join(root, "public/data/layers"));
mkdirp(path.join(root, "data/generated"));
fs.writeFileSync(path.join(root, "public/data/leases.min.json"), JSON.stringify({ meta, leases: min }));
fs.writeFileSync(path.join(root, "data/generated/leases.full.json"), JSON.stringify({ meta, leases: L.full }));

// ---------- what the records show (Finding), optional ----------
const { buildReview } = await import("./sync/review.mjs");
const review = buildReview(root);
fs.writeFileSync(path.join(root, "data/generated/review.json"), JSON.stringify(review.byPrc));

// ---------- layers ----------
// Map layer name -> file name. A layer with no file is left out and hidden in the UI.

const outLayers = path.join(root, "public/data/layers");
for (const f of fs.readdirSync(outLayers)) fs.rmSync(path.join(outLayers, f));
const manifest = {};
for (const name of LAYERS) {
  let found = null;
  for (const ext of ["pmtiles", "geojson"]) {
    const p = path.join(layerDir, `${name}.${ext}`);
    if (!found && exists(p)) found = { p, ext, fixture: false };
  }
  if (!found && fixtureLayers) found = { p: path.join(FIX, "layers", `${name}.geojson`), ext: "geojson", fixture: true };
  if (!found) continue;
  const dest = `${name}.${found.ext}`;
  fs.copyFileSync(found.p, path.join(outLayers, dest));
  const info = index[name] ?? {};
  manifest[name] = {
    url: `/data/layers/${dest}`,
    kind: found.ext,
    fixture: found.fixture,
    source: found.fixture ? "Fixture outline (hand-drawn, not data)" : info.attribution ?? null,
    sourceLayer: name,
    title: info.title ?? null,
    caveat: info.caveat ?? null,
    asOf: info.pulledAt ?? info.asOf ?? null,
  };
}
fs.writeFileSync(path.join(outLayers, "manifest.json"), JSON.stringify(manifest, null, 1));

// ---------- State oil & gas ----------
const outOg = path.join(root, "public/data/state-oil-gas");
fs.rmSync(outOg, { recursive: true, force: true });
if (ogIndex) {
  mkdirp(outOg);
  for (const f of fs.readdirSync(ogDir)) if (/\.(geo)?json$/.test(f)) fs.copyFileSync(path.join(ogDir, f), path.join(outOg, f));
  // Commission records for the footprint cards and the former-leases table, from every data/records source
  // (same merge as lib/records.ts: one entry per URL, newest first).
  const recBase = path.join(root, "data/records");
  const recDirs = fs.existsSync(recBase) ? fs.readdirSync(recBase, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(recBase, d.name)) : [];
  for (const d of (process.env.RECORDS_DIRS ?? "").split(",").map((x) => x.trim()).filter(Boolean)) recDirs.push(path.resolve(root, d));
  const fp = readJson(path.join(ogDir, "offshore-leases.geojson"));
  const formerAll = readJson(path.join(ogDir, "former-leases.json")).leases ?? [];
  const keys = new Set([...fp.features.flatMap((f) => [f.properties.recordsKey, ...(f.properties.leaseNums ?? [])]), ...formerAll.map((l) => l.prc)].filter(Boolean));
  const urlKey = (u) => String(u).trim().toLowerCase().replace(/^http:/, "https:").replace(/#.*$/, "").replace(/\/+$/, "");
  const recs = {};
  for (const k of keys) {
    const byUrl = new Map();
    for (const dir of recDirs) {
      const file = path.join(dir, `${k.replace(/[^\w.-]/g, "_")}.json`);
      if (!exists(file)) continue;
      const j = readJson(file);
      for (const r of Array.isArray(j) ? j : (j.records ?? [])) if (r?.url && r.title && !byUrl.has(urlKey(r.url))) byUrl.set(urlKey(r.url), { date: r.date ?? null, item: r.item ?? null, title: r.title, pages: r.pages ?? null, url: r.url });
    }
    if (byUrl.size) recs[k] = [...byUrl.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }
  fs.writeFileSync(path.join(outOg, "records.json"), JSON.stringify(recs));
}

// ---------- overlays: your own GeoJSON layers (optional) ----------
// Every <id>.geojson in OVERLAYS_DIR (default data/overlays/) becomes a toggle in
// the map key, drawn on top of everything. An optional <id>.json next to it sets
// { title, color, attribution, description, visible }. See README "Build your own layer".
const overlayDir = process.env.OVERLAYS_DIR ? path.resolve(root, process.env.OVERLAYS_DIR) : path.join(root, "data/overlays");
const outOverlays = path.join(root, "public/data/overlays");
fs.rmSync(outOverlays, { recursive: true, force: true });
mkdirp(outOverlays);
const overlays = [];
const PALETTE = ["#6b4f8a", "#2f7f86", "#b0623a", "#7a8a2e", "#9a3f62"];
if (fs.existsSync(overlayDir)) {
  for (const f of fs.readdirSync(overlayDir).filter((f) => f.endsWith(".geojson")).sort()) {
    const id = f.replace(/\.geojson$/, "").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
    const fc = readJson(path.join(overlayDir, f));
    if (fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) throw new Error(`Overlay ${f}: expected a GeoJSON FeatureCollection`);
    const metaFile = path.join(overlayDir, f.replace(/\.geojson$/, ".json"));
    const m = exists(metaFile) ? readJson(metaFile) : {};
    fs.copyFileSync(path.join(overlayDir, f), path.join(outOverlays, `${id}.geojson`));
    overlays.push({
      id,
      url: `/data/overlays/${id}.geojson`,
      title: m.title ?? id,
      color: m.color ?? PALETTE[overlays.length % PALETTE.length],
      attribution: m.attribution ?? null,
      description: m.description ?? null,
      visible: m.visible ?? true,
      count: fc.features.length,
    });
  }
}
fs.writeFileSync(path.join(outOverlays, "index.json"), JSON.stringify(overlays, null, 1));

// ---------- California frame ----------
// data/ref/ca-frame.json (scripts/make-ca-frame.mjs): California's land border, and an
// "area" polygon = the state plus its bays and coastal waters. Everything outside the area
// is quieted by the mask (the coast itself comes from the basemap, so it stays exact).
const frame = readJson(path.join(root, "data/ref/ca-frame.json"));
const world = [[-179.9, -85], [179.9, -85], [179.9, 85], [-179.9, 85], [-179.9, -85]];
const fc = (features) => ({ type: "FeatureCollection", features });
const mask = fc([{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, [...frame.area].reverse()] } }]);
const border = fc([{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: frame.border } }]);
fs.writeFileSync(path.join(root, "public/data/ca-outline.geojson"), fs.readFileSync(path.join(root, "data/ref/ca-outline.geojson")));
fs.writeFileSync(path.join(root, "public/data/ca-mask.geojson"), JSON.stringify(mask));
fs.writeFileSync(path.join(root, "public/data/ca-border.geojson"), JSON.stringify(border));
// County lines (shared borders only) and county name points, from data/ref/ca-counties.geojson;
// curated California place names (ranges, rivers, lakes, bays, passes).
for (const f of ["ca-county-lines.geojson", "ca-county-labels.geojson", "ca-labels.geojson"])
  fs.copyFileSync(path.join(root, "data/ref", f), path.join(root, "public/data", f));
// Moving water (scripts/make-water.mjs, from the basemap's tiles): where the sea is, for the wave marks;
// the big lakes, the Delta and the major rivers in cells, for their shimmer.
for (const f of ["ocean-mask.png", "water-shimmer.geojson"])
  if (fs.existsSync(path.join(root, "data/ref", f))) fs.copyFileSync(path.join(root, "data/ref", f), path.join(root, "public/data", f));

// ---------- Fly-in camera overrides (data/cameras.json; optional extra file via CAMERAS_EXTRA) ----------
const cameras = {};
for (const f of [path.join(root, "data/cameras.json"), process.env.CAMERAS_EXTRA && path.resolve(root, process.env.CAMERAS_EXTRA)].filter(Boolean)) {
  if (!exists(f)) continue;
  const j = readJson(f);
  for (const [prc, c] of Object.entries(j.cameras ?? {})) cameras[prc] = { ...cameras[prc], ...c };
}
fs.writeFileSync(path.join(root, "public/data/cameras.json"), JSON.stringify(cameras));

// MapLibre v6's ESM worker can't be resolved by webpack; serve it statically.
mkdirp(path.join(root, "public/maplibre"));
fs.copyFileSync(path.join(root, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"), path.join(root, "public/maplibre/maplibre-gl-worker.mjs"));

console.log(`sync: ${isFixture ? "FIXTURE" : "snapshot"} ${rel(snapshot)}: ${min.length} leases, ${L.candidates.length} candidates for review (${L.candidates.map((c) => c.prc).join(", ")})`);
for (const k of LAYERS) console.log(`  layer ${k}: ${manifest[k] ? `${manifest[k].kind}${manifest[k].fixture ? " (fixture)" : ""}` : "none (hidden)"}`);
console.log(`  state oil & gas: ${ogIndex ? ogIndex.datasets.map((d) => `${d.key} (${d.count})`).join(", ") : "none"}`);
console.log(`  overlays: ${overlays.length ? overlays.map((o) => `${o.id} (${o.count})`).join(", ") : `none in ${rel(overlayDir)}`}`);
console.log(`  what the records show: ${review.dir ? `${Object.keys(review.byPrc).length} leases from ${rel(review.dir)}` : "none (no review files)"}`);
