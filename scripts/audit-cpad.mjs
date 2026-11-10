// CPAD completeness audit: does the public-land layer hold every CPAD unit?
//
//   node scripts/audit-cpad.mjs            (needs tippecanoe-decode; the live check needs network)
//
// Compares three counts by agency level and by access type:
//   source    the live CPAD service today (ArcGIS REST statistics query)
//   snapshot  what fetch:layers pulled (data/cache/layers/access.geojson, if present)
//   tiles     what the map ships (data/layers/access.pmtiles), by zoom: units at full zoom,
//             and how many appear at each lower zoom (statewide views may thin small units)
// Prints a Markdown report.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const SRC = "https://gis.cnra.ca.gov/arcgis/rest/services/Boundaries/CPAD_AgencyLevel/MapServer/1";
const tally = () => ({ level: {}, access: {}, total: 0 });
const add = (t, level, access) => {
  t.level[level ?? "(none)"] = (t.level[level ?? "(none)"] ?? 0) + 1;
  t.access[access ?? "(none)"] = (t.access[access ?? "(none)"] ?? 0) + 1;
  t.total++;
};

async function source() {
  const stats = JSON.stringify([{ statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "n" }]);
  const t = tally();
  const q = new URLSearchParams({ where: "1=1", groupByFieldsForStatistics: "AGNCY_LEV,ACCESS_TYP", outStatistics: stats, f: "json" });
  const r = await fetch(`${SRC}/query?${q}`);
  const j = await r.json();
  if (!j.features) throw new Error(JSON.stringify(j).slice(0, 300));
  for (const { attributes: a } of j.features) {
    const n = a.n ?? a.N;
    t.level[a.AGNCY_LEV] = (t.level[a.AGNCY_LEV] ?? 0) + n;
    t.access[a.ACCESS_TYP] = (t.access[a.ACCESS_TYP] ?? 0) + n;
    t.total += n;
  }
  return t;
}

function snapshot() {
  const f = path.join(root, "data/cache/layers/access.geojson");
  if (!fs.existsSync(f)) return null;
  const t = tally();
  for (const x of JSON.parse(fs.readFileSync(f, "utf8")).features) add(t, x.properties.agencyLevel, x.properties.access);
  return t;
}

async function tiles() {
  const p = spawn("tippecanoe-decode", ["-c", path.join(root, "data/layers/access.pmtiles")]);
  const byZoom = new Map();
  const props = new Map();
  for await (const line of readline.createInterface({ input: p.stdout })) {
    const s = line.trim().replace(/,$/, "");
    if (!s.startsWith("{")) continue;
    const f = JSON.parse(s);
    const z = f.tippecanoe?.minzoom;
    const id = f.properties?.id;
    if (z == null || id == null) continue;
    if (!byZoom.has(z)) byZoom.set(z, new Set());
    byZoom.get(z).add(id);
    if (!props.has(id)) props.set(id, f.properties);
  }
  const zooms = [...byZoom.keys()].sort((a, b) => a - b);
  const top = byZoom.get(zooms.at(-1));
  const t = tally();
  for (const id of top) add(t, props.get(id).agencyLevel, props.get(id).access);
  return { t, perZoom: zooms.map((z) => [z, byZoom.get(z).size]), allIds: props.size };
}

const [src, snap, tl] = await Promise.all([source().catch((e) => ({ error: String(e) })), snapshot(), tiles()]);
const keys = (k) => [...new Set([...Object.keys(src.level ? src[k] : {}), ...Object.keys(snap?.[k] ?? {}), ...Object.keys(tl.t[k])])].sort();
const row = (k, x) => `| ${x} | ${src[k]?.[x] ?? "–"} | ${snap?.[k]?.[x] ?? "–"} | ${tl.t[k][x] ?? 0} |`;
console.log(`# CPAD completeness audit (${new Date().toISOString().slice(0, 10)})\n`);
if (src.error) console.log(`Live source query failed: ${src.error}\n`);
console.log(`Units: source ${src.total ?? "–"} · snapshot ${snap?.total ?? "–"} · tiles at full zoom ${tl.t.total} (any zoom: ${tl.allIds})\n`);
for (const [k, title] of [["level", "By agency level (AGNCY_LEV)"], ["access", "By access type (ACCESS_TYP)"]]) {
  console.log(`## ${title}\n\n| | Source today | Our snapshot | Map tiles |\n|---|---:|---:|---:|`);
  for (const x of keys(k)) console.log(row(k, x));
  console.log("");
}
console.log(`## Units present at each zoom (tiles)\n\n| Zoom | Units |\n|---:|---:|`);
for (const [z, n] of tl.perZoom) console.log(`| ${z} | ${n} |`);
