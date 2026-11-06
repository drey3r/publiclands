// Small, polite ArcGIS REST client: at most one request per second, retries,
// paged queries, and an on-disk cache of raw pages (data/cache/, gitignored).
import fs from "node:fs";
import path from "node:path";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;

export async function getJson(url: string): Promise<any> {
  const wait = last + 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "publiclands-map data refresh (open source)" } });
    if (res.ok) {
      const j = await res.json();
      if (!j.error) return j;
      console.warn(`  ArcGIS error: ${JSON.stringify(j.error)}`);
    } else console.warn(`  HTTP ${res.status}`);
    if (attempt < 3) await sleep(2000 * attempt);
  }
  throw new Error(`Failed after 3 attempts: ${url}`);
}

export type QueryOptions = {
  outFields: string[];
  pageSize?: number;
  /** Server-side generalization in degrees (e.g. 0.0002 ≈ 20 m). */
  maxAllowableOffset?: number;
  /** Decimal places for coordinates (5 ≈ 1 m, 4 ≈ 11 m). */
  precision?: number;
  cacheDir: string;
  cacheKey: string;
  refresh?: boolean;
};

/** All features of a layer as GeoJSON, paged by OBJECTID order. */
export async function queryAll(layer: string, o: QueryOptions) {
  fs.mkdirSync(o.cacheDir, { recursive: true });
  const meta = await getJson(`${layer}?f=json`);
  // Never ask for more than the server's own page limit.
  const pageSize = Math.min(o.pageSize ?? 2000, meta.maxRecordCount ?? 2000);
  const { count } = await getJson(`${layer}/query?where=1%3D1&returnCountOnly=true&f=json`);
  const features: any[] = [];
  for (let offset = 0; offset < count; ) {
    const cache = path.join(o.cacheDir, `${o.cacheKey}-${offset}.json`);
    let page: any;
    if (!o.refresh && fs.existsSync(cache)) page = JSON.parse(fs.readFileSync(cache, "utf8"));
    else {
      const q = new URLSearchParams({
        where: "1=1",
        outFields: o.outFields.join(","),
        outSR: "4326",
        orderByFields: "OBJECTID",
        resultOffset: String(offset),
        resultRecordCount: String(pageSize),
        geometryPrecision: String(o.precision ?? 5),
        f: "geojson",
      });
      if (o.maxAllowableOffset) q.set("maxAllowableOffset", String(o.maxAllowableOffset));
      page = await getJson(`${layer}/query?${q}`);
      fs.writeFileSync(cache, JSON.stringify(page));
    }
    process.stdout.write(`  ${o.cacheKey}: ${Math.min(offset + page.features.length, count)}/${count}\r`);
    features.push(...page.features);
    if (page.features.length === 0) break;
    offset += page.features.length;
  }
  process.stdout.write("\n");
  if (features.length !== count) throw new Error(`${o.cacheKey}: expected ${count} features, got ${features.length}`);
  const lastEdit = meta.editingInfo?.lastEditDate ?? meta.editingInfo?.dataLastEditDate;
  return { meta, features, lastEdit: lastEdit ? new Date(lastEdit).toISOString().slice(0, 10) : null };
}
