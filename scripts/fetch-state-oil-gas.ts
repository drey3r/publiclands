// State oil & gas: byte-exact dated snapshots of the source layers and pages.
//
//   node scripts/fetch-state-oil-gas.ts            # all sources
//   node scripts/fetch-state-oil-gas.ts wells      # only slugs containing "wells"
//
// Each ArcGIS layer: count (returnCountOnly), then pages (resultOffset, f=geojson, outSR=4326,
// outFields=*), each response body written EXACTLY as received to
//   data-archive/snapshots/<slug>/<UTC-timestamp>/page-NNNN.json
// plus layer-metadata.json and manifest.json (URL, where, pulled_at, the layer's lastEditDate,
// server count, records saved, per-page bytes and sha256). The two CSLC oil & gas pages are saved
// the same way (page-0000.html).
//
// Validation (exit 1, published files untouched): records saved == server count; count not more
// than 5% below the previous snapshot; required fields present. data-archive/ is never committed
// or deployed. After this, run scripts/data/build_state_oil_gas.py to rebuild data/state-oil-gas/.
// At least 1 second between requests.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const ARCHIVE = path.join(root, "data-archive/snapshots");
const UA = "publiclands-map data refresh (open source; https://publiclands-map.vercel.app)";
const CSLC = "https://services3.arcgis.com/5aaQCuq3e4GRvkFG/ArcGIS/rest/services";

type Source =
  | { slug: string; kind: "arcgis"; url: string; where: string; required: string[]; pageSize?: number }
  | { slug: string; kind: "page"; url: string };

export const SOURCES: Source[] = [
  { slug: "cslc-offshore-lease-polygons", kind: "arcgis", url: `${CSLC}/Offshore_Lease_Polygons/FeatureServer/0`, where: "1=1", required: ["PRC", "Lease_Stat"] },
  { slug: "cslc-marine-oil-terminals", kind: "arcgis", url: `${CSLC}/Marine_Oil_Terminals/FeatureServer/0`, where: "1=1", required: ["WO_", "WO_Berth_ID"] },
  {
    slug: "cslc-oil-gas-lease-points", kind: "arcgis", url: `${CSLC}/CA_State_Lands_Commission_Leases/FeatureServer/0`,
    where: "TypeofLease IN ('Oil & Gas Lease','Compensatory Agreement')", required: ["LeaseNum", "TypeofLease"],
  },
  {
    slug: "calgem-wells", kind: "arcgis", url: "https://gis.conservation.ca.gov/server/rest/services/WellSTAR/Wells/MapServer/0",
    where: "1=1", required: ["API", "LeaseName", "OperatorName", "WellStatus"], pageSize: 5000,
  },
  {
    slug: "boem-sla-boundary", kind: "arcgis", url: "https://services7.arcgis.com/G5Ma95RzqJRPKsWL/arcgis/rest/services/OCS_BOEM_Offshore_Boundary_Lines/FeatureServer/8",
    where: "BDRY_TYPE_CODE='S'", required: ["BDRY_TYPE_CODE"],
  },
  { slug: "cslc-sovereign-waterbodies", kind: "arcgis", url: `${CSLC}/Significant_Lands_Waterbodies/FeatureServer/0`, where: "1=1", required: ["WATERWAY"] },
  { slug: "cslc-page-oil-gas-leases", kind: "page", url: "https://www.slc.ca.gov/oil-gas/leases/" },
  { slug: "cslc-page-lease-information", kind: "page", url: "https://www.slc.ca.gov/oil-gas/leases/lease-information/" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function getBytes(url: string): Promise<{ body: Buffer; type: string | null }> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const wait = last + 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      const body = Buffer.from(await res.arrayBuffer());
      if (res.ok) return { body, type: res.headers.get("content-type") };
      console.warn(`  HTTP ${res.status} ${url}`);
    } catch (e) {
      console.warn(`  ${(e as Error).message} ${url}`);
    }
    if (attempt < 3) await sleep(2000 * attempt);
  }
  throw new Error(`Failed after 3 attempts: ${url}`);
}
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); // 20261111T010931Z

function previousCount(slug: string): number | null {
  const dir = path.join(ARCHIVE, slug);
  if (!fs.existsSync(dir)) return null;
  for (const d of fs.readdirSync(dir).sort().reverse()) {
    const m = path.join(dir, d, "manifest.json");
    if (fs.existsSync(m)) {
      const j = JSON.parse(fs.readFileSync(m, "utf8"));
      if (j.complete) return j.records_saved;
    }
  }
  return null;
}

async function snapshotLayer(s: Extract<Source, { kind: "arcgis" }>) {
  const meta = await getBytes(`${s.url}?f=json`);
  const m = JSON.parse(meta.body.toString("utf8"));
  const oid = m.objectIdField ?? "OBJECTID";
  const pageSize = Math.min(s.pageSize ?? 2000, m.maxRecordCount ?? 1000);
  const fields: string[] = (m.fields ?? []).map((f: any) => f.name);
  const missing = s.required.filter((f) => !fields.includes(f));
  const q = (p: Record<string, string>) => `${s.url}/query?${new URLSearchParams({ where: s.where, ...p })}`;
  const { count } = JSON.parse((await getBytes(q({ returnCountOnly: "true", f: "json" }))).body.toString("utf8"));
  const prev = previousCount(s.slug);
  const out = path.join(ARCHIVE, s.slug, stamp());
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "layer-metadata.json"), meta.body);
  const pages: any[] = [];
  let records = 0;
  for (let offset = 0; offset < count; ) {
    const url = q({ outFields: "*", outSR: "4326", f: "geojson", orderByFields: oid, resultOffset: String(offset), resultRecordCount: String(pageSize) });
    const { body, type } = await getBytes(url);
    const file = `page-${String(pages.length).padStart(4, "0")}.json`;
    fs.writeFileSync(path.join(out, file), body); // exact bytes
    const n = (JSON.parse(body.toString("utf8")).features ?? []).length; // parsed only to count
    pages.push({ file, request_url: url, bytes: body.length, sha256: sha(body), features: n, content_type: type });
    records += n;
    process.stdout.write(`  ${s.slug}: ${records}/${count}\r`);
    if (n === 0) break;
    offset += n;
  }
  process.stdout.write("\n");
  const edit = m.editingInfo?.dataLastEditDate ?? m.editingInfo?.lastEditDate ?? null;
  const problems: string[] = [];
  if (records !== count) problems.push(`saved ${records} of ${count} records`);
  if (prev && count < prev * 0.95) problems.push(`count ${count} is more than 5% below the previous snapshot (${prev})`);
  if (missing.length) problems.push(`missing required fields: ${missing.join(", ")}`);
  const manifest = {
    slug: s.slug, layer_url: s.url, where: s.where, pulled_at: new Date().toISOString(),
    source_last_edit: edit ? new Date(edit).toISOString() : null,
    server_count: count, records_saved: records, previous_count: prev, complete: problems.length === 0,
    problems, pages, note: "page files are byte-exact HTTP response bodies",
  };
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function snapshotPage(s: Extract<Source, { kind: "page" }>) {
  const { body, type } = await getBytes(s.url);
  const out = path.join(ARCHIVE, s.slug, stamp());
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "page-0000.html"), body);
  const manifest = {
    slug: s.slug, url: s.url, pulled_at: new Date().toISOString(), complete: body.length > 1000, problems: body.length > 1000 ? [] : ["page body too small"],
    pages: [{ file: "page-0000.html", request_url: s.url, bytes: body.length, sha256: sha(body), content_type: type }],
    note: "page file is the byte-exact HTTP response body",
  };
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (import.meta.main ?? process.argv[1]?.endsWith("fetch-state-oil-gas.ts")) {
  const only = process.argv[2];
  let failed = false;
  for (const s of SOURCES.filter((s) => !only || s.slug.includes(only))) {
    const m: any = s.kind === "arcgis" ? await snapshotLayer(s) : await snapshotPage(s);
    const ok = m.complete;
    if (!ok) failed = true;
    console.log(`${ok ? "ok  " : "FAIL"} ${s.slug}${m.server_count != null ? `: ${m.records_saved}/${m.server_count}` : ""}${m.problems.length ? ` (${m.problems.join("; ")})` : ""}`);
  }
  if (failed) {
    console.error("Validation failed: published files left untouched. Do not run the build step.");
    process.exit(1);
  }
}
