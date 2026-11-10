// Data step. Runs before `dev` and `build`; reads only files committed in this
// repo (plus optional private inputs named by env vars). Never calls CSLC.
//
// Inputs (public, committed):
//   data/cslc/leases-YYYY-MM-DD.geojson   newest snapshot of the CSLC lease layer
//   data/layers/*.geojson + index.json    land layers (CPAD, granted, school, water lines)
//   data/curated.json                     sourced case studies and extra review candidates
//   data/ref/ca-outline.geojson           California outline (mask outside the state, Home framing)
// Optional (off by default):
//   OVERLAYS_DIR=path                     your own GeoJSON overlay layers (see README "Build your own layer")
//   LAYERS_DIR=path                       use other land-layer files instead of data/layers
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

const meta = {
  fixture: isFixture,
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

// ---------- layers ----------
// Map layer name -> file name. A layer with no file is left out and hidden in the UI.
const LAYERS = ["access", "granted", "school", "waterlines"];
const layerDir = process.env.LAYERS_DIR ? path.resolve(root, process.env.LAYERS_DIR) : path.join(root, "data/layers");
const fixtureLayers = process.env.FIXTURE_LAYERS === "1";
let index = {};
try { for (const l of readJson(path.join(layerDir, "index.json")).layers ?? []) index[l.name ?? l.id] = l; } catch {}

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
// The state outline (dissolved from data/ref/ca-counties.geojson) and its inverse,
// a world polygon with California cut out, used to quiet everything outside the state.
const outline = readJson(path.join(root, "data/ref/ca-outline.geojson"));
const caRings = outline.features.flatMap((f) => (f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.map((p) => p[0]) : [f.geometry.coordinates[0]]));
const world = [[-179.9, -85], [179.9, -85], [179.9, 85], [-179.9, 85], [-179.9, -85]];
const mask = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...caRings.map((r) => [...r].reverse())] } }] };
fs.writeFileSync(path.join(root, "public/data/ca-outline.geojson"), JSON.stringify(outline));
fs.writeFileSync(path.join(root, "public/data/ca-mask.geojson"), JSON.stringify(mask));

// MapLibre v6's ESM worker can't be resolved by webpack; serve it statically.
mkdirp(path.join(root, "public/maplibre"));
fs.copyFileSync(path.join(root, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"), path.join(root, "public/maplibre/maplibre-gl-worker.mjs"));

console.log(`sync: ${isFixture ? "FIXTURE" : "snapshot"} ${rel(snapshot)}: ${min.length} leases, ${L.candidates.length} candidates for review (${L.candidates.map((c) => c.prc).join(", ")})`);
for (const k of LAYERS) console.log(`  layer ${k}: ${manifest[k] ? `${manifest[k].kind}${manifest[k].fixture ? " (fixture)" : ""}` : "none (hidden)"}`);
console.log(`  overlays: ${overlays.length ? overlays.map((o) => `${o.id} (${o.count})`).join(", ") : `none in ${rel(overlayDir)}`}`);
