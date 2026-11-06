// Pulls the land layers shown on the map and writes a snapshot to data/layers/.
//
//   npm run fetch:layers             # reuse today's cached pages if present
//   npm run fetch:layers -- --refresh
//
// Polygons are generalized on the server (maxAllowableOffset) so the files stay
// small enough for the web. Display only: not for boundary determinations.
import fs from "node:fs";
import path from "node:path";
import { queryAll } from "./lib/arcgis.ts";

const CSLC = "https://services3.arcgis.com/5aaQCuq3e4GRvkFG/arcgis/rest/services";
const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "data/layers");
const cacheDir = path.join(root, "data/cache/layers");
const today = new Date().toISOString().slice(0, 10);
const refresh = process.argv.includes("--refresh");
const round = (n: unknown, d = 1) => (typeof n === "number" ? Math.round(n * 10 ** d) / 10 ** d : null);
const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() || null : v == null ? null : String(v));

// Douglas–Peucker on each ring (planar degrees; fine at display scale).
function dp(pts: number[][], tol: number): number[][] {
  if (pts.length <= 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d: number;
      if (len === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
        d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d > max) { max = d; idx = i; }
    }
    if (max > t2 && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = pts.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : pts.slice(0, 4);
}
const ringArea = (r: number[][]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
};
// Simplify rings and drop slivers/holes smaller than minArea (deg²; 2e-6 ≈ 2 ha).
// The largest part of each feature is always kept so no unit disappears.
function simplify(g: any, tol: number, minArea = 2e-6): any {
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return g;
  const polys: number[][][][] = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  const big = polys.reduce((m, p) => Math.max(m, ringArea(p[0])), 0);
  const out = polys
    .filter((p) => ringArea(p[0]) >= minArea || ringArea(p[0]) === big)
    .map((p) => [dp(p[0], tol), ...p.slice(1).filter((h) => ringArea(h) >= minArea).map((h) => dp(h, tol))]);
  return out.length === 1 ? { type: "Polygon", coordinates: out[0] } : { type: "MultiPolygon", coordinates: out };
}

type Spec = {
  name: "access" | "granted" | "school" | "waterlines";
  title: string;
  attribution: string;
  caveat: string;
  sources: { url: string; fields: string[]; offset?: number; precision?: number; simplify?: number; props: (p: any) => Record<string, unknown> }[];
};

const SPECS: Spec[] = [
  {
    name: "access",
    title: "Parks and protected lands (CPAD units)",
    attribution: "California Protected Areas Database (CPAD), GreenInfo Network, www.calands.org",
    caveat: "Fee-owned protected lands only (no easements). Access is CPAD's ACCESS_TYP field. Geometry generalized for web display.",
    sources: [
      {
        url: "https://gis.cnra.ca.gov/arcgis/rest/services/Boundaries/CPAD_AgencyLevel/MapServer/1",
        fields: ["OBJECTID", "UNIT_ID", "UNIT_NAME", "AGNCY_NAME", "AGNCY_LEV", "MNG_AGENCY", "ACCESS_TYP", "ACRES", "COUNTY", "PARK_URL"],
        // ~50 m generalization and 4 decimals keep CPAD near 10 MB.
        offset: 0.0005,
        precision: 4,
        simplify: 0.0006,
        props: (p) => ({
          id: String(p.OBJECTID),
          name: str(p.UNIT_NAME),
          agencyLevel: str(p.AGNCY_LEV),
          managingAgency: str(p.MNG_AGENCY),
          access: str(p.ACCESS_TYP),
          acres: round(p.ACRES),
          county: str(p.COUNTY),
          url: str(p.PARK_URL),
        }),
      },
    ],
  },
  {
    name: "granted",
    title: "Granted public trust lands (CSLC)",
    attribution: "California State Lands Commission",
    caveat: "Incomplete: CSLC notes parcel digitization is partial. No polygon does not mean no grant. Not a legal boundary.",
    sources: [
      {
        url: `${CSLC}/Granted_Lands/FeatureServer/0`,
        fields: ["OBJECTID", "GRANT_HOLD", "COUNTY", "Status", "DATA_QUALI", "Grant_Link"],
        offset: 0.0001,
        props: (p) => ({ grantee: str(p.GRANT_HOLD), county: str(p.COUNTY), status: str(p.Status), dataQuality: p.DATA_QUALI ?? null, grantLink: str(p.Grant_Link) }),
      },
    ],
  },
  {
    name: "school",
    title: "State school lands (CSLC)",
    attribution: "California State Lands Commission, Land Management Division",
    caveat: "School lands only. Sovereign tide and submerged lands are not in this layer. Not a legal boundary.",
    sources: [
      {
        url: `${CSLC}/School_Lands_Public/FeatureServer/0`,
        fields: ["OBJECTID", "SEC_TRCT", "TWP", "RNGE", "MERID", "CNTY", "GIS_AC"],
        offset: 0.0001,
        props: (p) => ({ section: str(p.SEC_TRCT), township: str(p.TWP), range: str(p.RNGE), meridian: str(p.MERID), county: str(p.CNTY), acres: round(p.GIS_AC) }),
      },
    ],
  },
  {
    name: "waterlines",
    title: "Ordinary high and low water lines (CSLC administrative maps)",
    attribution: "California State Lands Commission",
    caveat: "Only portions of some waterways, each mapped at one point in time. These boundaries move; not a statewide or current line.",
    sources: [
      { url: `${CSLC}/AdminMapsPublic/FeatureServer/2`, fields: ["OBJECTID"], props: () => ({ line: "high" }) },
      { url: `${CSLC}/AdminMapsPublic/FeatureServer/1`, fields: ["OBJECTID"], props: () => ({ line: "low" }) },
    ],
  },
];

fs.mkdirSync(outDir, { recursive: true });
const index: Record<string, unknown>[] = [];
for (const spec of SPECS) {
  const features: any[] = [];
  let lastEdit: string | null = null;
  let attribution = spec.attribution;
  for (const s of spec.sources) {
    const r = await queryAll(s.url, {
      outFields: s.fields,
      maxAllowableOffset: s.offset,
      precision: s.precision,
      cacheDir,
      cacheKey: `${spec.name}-${path.basename(path.dirname(s.url))}-${path.basename(s.url)}-${s.offset ?? 0}-${today}`,
      refresh,
    });
    lastEdit = r.lastEdit ?? lastEdit;
    const release = /CPAD\s*\d{4}[ab]/i.exec(`${r.meta.description ?? ""} ${r.meta.copyrightText ?? ""}`)?.[0];
    if (release && spec.name === "access") attribution = attribution.replace("(CPAD)", `(${release.replace(/\s+/, " ")})`);
    for (const f of r.features) if (f.geometry) features.push({ type: "Feature", geometry: s.simplify ? simplify(f.geometry, s.simplify) : f.geometry, properties: s.props(f.properties ?? {}) });
  }
  const file = path.join(outDir, `${spec.name}.geojson`);
  fs.writeFileSync(file, JSON.stringify({ type: "FeatureCollection", features }));
  const bytes = fs.statSync(file).size;
  console.log(`${spec.name}: ${features.length} features, ${(bytes / 1e6).toFixed(1)} MB`);
  index.push({
    name: spec.name,
    file: `${spec.name}.geojson`,
    title: spec.title,
    attribution,
    caveat: spec.caveat,
    sources: spec.sources.map((s) => s.url),
    count: features.length,
    pulledAt: today,
    sourceLastEdit: lastEdit,
  });
}
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify({ generatedAt: new Date().toISOString(), layers: index }, null, 1));
console.log("Wrote data/layers/index.json. The sync step copies these into public/data/layers/.");
