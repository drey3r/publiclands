// Pulls the California State Lands Commission public lease layer (ArcGIS
// FeatureServer) and writes a dated snapshot to data/cslc/.
//
//   npm run fetch:leases             # reuse today's cached pages if present
//   npm run fetch:leases -- --refresh
//
// Pages of 2,000 records, at most one request per second, raw pages cached in
// data/cache/ (gitignored). Needs Node 22.18+ (runs TypeScript directly).
// The build never calls CSLC; it only reads the committed snapshot.
import fs from "node:fs";
import path from "node:path";
import { queryAll } from "./lib/arcgis.ts";

export const LEASE_LAYER =
  "https://services3.arcgis.com/5aaQCuq3e4GRvkFG/arcgis/rest/services/CA_State_Lands_Commission_Leases/FeatureServer/0";
// Creator/Editor fields are left out on purpose (account names, not lease data).
const FIELDS = [
  "OBJECTID", "RecordStatus", "LeaseNum", "GeneralLocation", "LeaseorPermit", "TypeofLease",
  "LeaseStartDate", "LeaseExpirationDate", "SLCApprovalDate", "MinuteItem", "Improvements",
];

const root = path.resolve(import.meta.dirname, "..");
const today = new Date().toISOString().slice(0, 10);

const { features, lastEdit } = await queryAll(LEASE_LAYER, {
  outFields: FIELDS,
  cacheDir: path.join(root, "data/cache/cslc"),
  cacheKey: `leases-${today}`,
  refresh: process.argv.includes("--refresh"),
});

const clean = features
  .map((f) => {
    const p: Record<string, unknown> = {};
    for (const k of FIELDS) {
      const v = f.properties?.[k];
      p[k] = typeof v === "string" ? v.replace(/\s+/g, " ").trim() || null : (v ?? null);
    }
    const c = f.geometry?.coordinates;
    return { type: "Feature", geometry: c ? { type: "Point", coordinates: [+c[0].toFixed(5), +c[1].toFixed(5)] } : null, properties: p };
  })
  .sort((a, b) => (a.properties.OBJECTID as number) - (b.properties.OBJECTID as number));

const snapshot = {
  type: "FeatureCollection",
  source: {
    name: "California State Lands Commission, Leases (public GIS layer)",
    layer: LEASE_LAYER,
    pulledAt: new Date().toISOString(),
    layerLastEdit: lastEdit,
    count: clean.length,
    fields: FIELDS,
  },
  features: clean,
};
const outDir = path.join(root, "data/cslc");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `leases-${today}.geojson`);
fs.writeFileSync(out, JSON.stringify(snapshot));
console.log(`Wrote ${path.relative(root, out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${clean.length} points). The sync step uses the newest snapshot.`);
