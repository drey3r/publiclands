// Water shapes for the map's moving water, cut from the basemap's own vector tiles (OpenFreeMap,
// OpenMapTiles schema, © OpenStreetMap contributors, ODbL), so they sit exactly on the water the
// basemap draws:
//
//   data/ref/ocean-mask.png       where the sea is (white) around California: the moving wave marks are
//                                 drawn by a shader and need to know where land is
//   data/ref/water-shimmer.geojson the big lakes (Tahoe, Clear Lake, Mono, Shasta, the Salton Sea) and the
//                                 Delta's channels as polygons, and the major rivers as lines running
//                                 downstream, all cut into cells of about 2 km, each with an id: the map
//                                 fades the shimmer cell by cell wherever lease marks sit on the water
//
//   node scripts/make-water.mjs            # about 700 tile requests, a few minutes
//
// Re-run only if the lists below change; the outputs are committed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader as Pbf } from "pbf";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(root, "data/cache/water-tiles");
fs.mkdirSync(cacheDir, { recursive: true });

/** The sea mask's box (wider than any view the map allows) and size. Keep in step with lib/water.ts. */
export const MASK = { west: -137, east: -107, south: 26, north: 48, size: 2048 };
const MASK_Z = 7;
/** Cells: tiles of this zoom (about 1.9 km across at 38° N). */
const CELL_Z = 14;
const DETAIL_Z = 11;

const LAKES = [
  { name: "Lake Tahoe", box: [-120.17, 38.92, -119.92, 39.26] },
  { name: "Clear Lake", box: [-122.95, 38.92, -122.6, 39.15] },
  { name: "Mono Lake", box: [-119.17, 37.9, -118.88, 38.09] },
  { name: "Shasta Lake", box: [-122.5, 40.65, -122.05, 40.95] },
  { name: "Salton Sea", box: [-116.15, 33.05, -115.5, 33.55] },
  // The Delta: every channel and flooded tract the basemap draws as water (not the bays, which are sea).
  { name: "Sacramento–San Joaquin Delta", box: [-122.15, 37.75, -121.25, 38.45], any: true },
];
/** Major rivers, by the basemap's name, with a point at the mouth (to check they run downstream). */
const RIVERS = {
  "Sacramento River": [-121.85, 38.06],
  "San Joaquin River": [-121.8, 38.03],
  "Klamath River": [-124.08, 41.54],
  "Colorado River": [-114.72, 32.72],
  "American River": [-121.51, 38.6],
  "Feather River": [-121.63, 38.78],
  "Trinity River": [-123.7, 41.18],
  "Eel River": [-124.31, 40.64],
  "Russian River": [-123.13, 38.45],
  "Pit River": [-122.4, 40.76],
};

const outline = JSON.parse(fs.readFileSync(path.join(root, "data/ref/ca-outline.geojson"), "utf8"));
const caRings = [];
(function collect(g) {
  if (!g) return;
  if (g.type === "FeatureCollection") g.features.forEach((f) => collect(f.geometry));
  else if (g.type === "Feature") collect(g.geometry);
  else if (g.type === "Polygon") caRings.push(...g.coordinates);
  else if (g.type === "MultiPolygon") g.coordinates.forEach((p) => caRings.push(...p));
  else if (g.type === "LineString") caRings.push(g.coordinates);
  else if (g.type === "MultiLineString") caRings.push(...g.coordinates);
})(outline);
function inCA([x, y]) {
  let inside = false;
  for (const r of caRings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}
/** Kilometres from a point to California's outline (rough; for the Colorado, which is the border). */
function kmToCA([x, y]) {
  let best = Infinity;
  const kx = 111.32 * Math.cos((y * Math.PI) / 180);
  for (const r of caRings) for (const [px, py] of r) best = Math.min(best, Math.hypot((px - x) * kx, (py - y) * 110.57));
  return best;
}

const mx = (lon) => (lon + 180) / 360;
const my = (lat) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
const lonOf = (x) => x * 360 - 180;
const latOf = (y) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
const tileX = (lon, z) => Math.floor(mx(lon) * 2 ** z);
const tileY = (lat, z) => Math.floor(my(lat) * 2 ** z);

const tilejson = await (await fetch("https://tiles.openfreemap.org/planet")).json();
const template = tilejson.tiles[0];
const version = template.match(/planet\/([^/]+)\//)?.[1] ?? "unknown";
let fetched = 0;
async function tile(z, x, y) {
  const f = path.join(cacheDir, `${version}-${z}-${x}-${y}.pbf`);
  let buf;
  if (fs.existsSync(f)) buf = fs.readFileSync(f);
  else {
    for (let tries = 0; ; tries++) {
      const res = await fetch(template.replace("{z}", z).replace("{x}", x).replace("{y}", y));
      if (res.status === 404 || res.status === 204) { buf = Buffer.alloc(0); break; }
      if (res.ok) { buf = Buffer.from(await res.arrayBuffer()); break; }
      if (tries >= 2) throw new Error(`tile ${z}/${x}/${y}: ${res.status}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
    fs.writeFileSync(f, buf);
    fetched++;
  }
  return buf.length ? new VectorTile(new Pbf(buf)) : null;
}
async function each(list, fn, n = 6) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) await fn(list[i++]); }));
}

// ------------------------------------------------------------------------------ the sea mask
{
  const S = MASK.size * 2; // drawn at twice the size, then averaged down (soft, sub-pixel coast)
  const x0 = mx(MASK.west), x1 = mx(MASK.east), y0 = my(MASK.north), y1 = my(MASK.south);
  const cov = new Uint8Array(S * S);
  const tiles = [];
  for (let x = tileX(MASK.west, MASK_Z); x <= tileX(MASK.east, MASK_Z); x++) for (let y = tileY(MASK.north, MASK_Z); y <= tileY(MASK.south, MASK_Z); y++) tiles.push([x, y]);
  await each(tiles, async ([tx, ty]) => {
    const vt = await tile(MASK_Z, tx, ty);
    const layer = vt?.layers.water;
    if (!layer) return;
    const n = 2 ** MASK_Z;
    // This tile's rectangle in mask pixels: nothing is drawn outside it (tiles overlap by a buffer).
    const px = (gx) => ((gx - x0) / (x1 - x0)) * S, py = (gy) => ((gy - y0) / (y1 - y0)) * S;
    const cx0 = Math.max(0, Math.ceil(px(tx / n) - 0.5)), cx1 = Math.min(S - 1, Math.ceil(px((tx + 1) / n) - 0.5) - 1);
    const cy0 = Math.max(0, Math.ceil(py(ty / n) - 0.5)), cy1 = Math.min(S - 1, Math.ceil(py((ty + 1) / n) - 0.5) - 1);
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.properties.class !== "ocean" || f.type !== 3) continue;
      const rings = f.loadGeometry().map((r) => r.map((p) => [px((tx + p.x / f.extent) / n), py((ty + p.y / f.extent) / n)]));
      for (let row = cy0; row <= cy1; row++) {
        const yc = row + 0.5;
        const xs = [];
        for (const r of rings)
          for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
            const [ax, ay] = r[a], [bx, by] = r[b];
            if (ay > yc !== by > yc) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
          }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const from = Math.max(cx0, Math.ceil(xs[k] - 0.5)), to = Math.min(cx1, Math.ceil(xs[k + 1] - 0.5) - 1);
          for (let col = from; col <= to; col++) cov[row * S + col] = 255;
        }
      }
    }
  });
  const out = path.join(root, "data/ref/ocean-mask.png");
  await sharp(Buffer.from(cov.buffer), { raw: { width: S, height: S, channels: 1 } }).resize(MASK.size, MASK.size, { kernel: "cubic" }).blur(0.6).png({ compressionLevel: 9, palette: false }).toFile(out);
  console.log(`ocean-mask.png ${MASK.size}² from ${tiles.length} zoom-${MASK_Z} tiles, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

// ------------------------------------------------------------------------------ clipping to cells
const r5 = (v) => Math.round(v * 1e4) / 1e4; // about 10 m
/** Douglas–Peucker, about 12 m: the shimmer fades out before that would show. */
function thin(pts, tol = 0.00011) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = 0, at = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      // A closed ring starts and ends at one point: distance from that point instead.
      const d = len ? Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len : Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const tidy = (pts) => thin(pts).map(([x, y]) => [r5(x), r5(y)]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
/** Sutherland–Hodgman: a ring clipped to a box [w, s, e, n]. */
function clipRing(ring, [w, s, e, n]) {
  let pts = ring;
  const edges = [
    [(p) => p[0] >= w, (a, b) => [w, a[1] + ((w - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]],
    [(p) => p[0] <= e, (a, b) => [e, a[1] + ((e - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]],
    [(p) => p[1] >= s, (a, b) => [a[0] + ((s - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), s]],
    [(p) => p[1] <= n, (a, b) => [a[0] + ((n - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), n]],
  ];
  for (const [inside, cut] of edges) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (inside(a)) { out.push(a); if (!inside(b)) out.push(cut(a, b)); }
      else if (inside(b)) out.push(cut(a, b));
    }
    pts = out;
    if (pts.length < 3) return null;
  }
  return pts;
}
const ringArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; };
const km2 = (r) => Math.abs(ringArea(r)) * 111.32 * 110.57 * Math.cos((r[0][1] * Math.PI) / 180);
/** A line clipped to a box: the pieces inside, in order and direction. */
function clipLine(line, [w, s, e, n]) {
  const out = [];
  let cur = null;
  for (let i = 0; i + 1 < line.length; i++) {
    let [ax, ay] = line[i], [bx, by] = line[i + 1];
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    let ok = true;
    for (const [p, q] of [[-dx, ax - w], [dx, e - ax], [-dy, ay - s], [dy, n - ay]]) {
      if (p === 0) { if (q < 0) ok = false; }
      else { const t = q / p; if (p < 0) { if (t > t1) ok = false; else if (t > t0) t0 = t; } else { if (t < t0) ok = false; else if (t < t1) t1 = t; } }
      if (!ok) break;
    }
    if (!ok) { cur = null; continue; }
    const A = [ax + t0 * dx, ay + t0 * dy], B = [ax + t1 * dx, ay + t1 * dy];
    if (!cur || t0 > 0) { cur = [A]; out.push(cur); }
    cur.push(B);
    if (t1 < 1) cur = null;
  }
  return out.filter((l) => l.length > 1);
}
const cellBox = (cx, cy) => { const n = 2 ** CELL_Z; return [lonOf(cx / n), latOf((cy + 1) / n), lonOf((cx + 1) / n), latOf(cy / n)]; };
const cellsOf = (tx, ty) => { const k = 2 ** (CELL_Z - DETAIL_Z); const out = []; for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) out.push([tx * k + i, ty * k + j]); return out; };

const features = [];
let id = 1;

// ------------------------------------------------------------------------------ lakes and the Delta
for (const lake of LAKES) {
  const [w, s, e, n] = lake.box;
  const tiles = [];
  for (let x = tileX(w, DETAIL_Z); x <= tileX(e, DETAIL_Z); x++) for (let y = tileY(n, DETAIL_Z); y <= tileY(s, DETAIL_Z); y++) tiles.push([x, y]);
  let count = 0, area = 0;
  await each(tiles, async ([tx, ty]) => {
    const vt = await tile(DETAIL_Z, tx, ty);
    const layer = vt?.layers.water;
    if (!layer) return;
    const polys = [];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type !== 3 || f.properties.class === "ocean" || (!lake.any && f.properties.class !== "lake")) continue;
      if (f.properties.intermittent === 1) continue;
      const g = f.toGeoJSON(tx, ty, DETAIL_Z).geometry;
      polys.push(...(g.type === "Polygon" ? [g.coordinates] : g.coordinates));
    }
    for (const [cx, cy] of cellsOf(tx, ty)) {
      const box = cellBox(cx, cy);
      const mid = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
      if (mid[0] < w || mid[0] > e || mid[1] < s || mid[1] > n || !inCA(mid)) continue;
      const parts = [];
      for (const poly of polys) {
        const outer = clipRing(poly[0].slice(0, -1), box);
        if (!outer || km2(outer) < 0.01) continue;
        const holes = poly.slice(1).map((h) => clipRing(h.slice(0, -1), box)).filter((h) => h && km2(h) > 0.002);
        const rings = [outer, ...holes].map((r) => tidy([...r, r[0]])).filter((r) => r.length >= 4);
        if (!rings.length || rings[0].length < 4) continue;
        parts.push(rings);
        area += km2(outer) - holes.reduce((a, h) => a + km2(h), 0);
      }
      if (!parts.length) continue;
      features.push({ type: "Feature", id: id++, properties: { k: "lake", c: mid.map(r5) }, geometry: parts.length === 1 ? { type: "Polygon", coordinates: parts[0] } : { type: "MultiPolygon", coordinates: parts } });
      count++;
    }
  });
  console.log(`${lake.name}: ${count} cells, ${area.toFixed(0)} km²`);
}

// ------------------------------------------------------------------------------ rivers
{
  // Where the named rivers run, from coarse tiles over the state; then their lines from detailed tiles.
  const want = new Map(Object.keys(RIVERS).map((n) => [n, new Set()]));
  const coarse = [];
  const CZ = 9;
  for (let x = tileX(-124.5, CZ); x <= tileX(-114.1, CZ); x++) for (let y = tileY(42.1, CZ); y <= tileY(32.5, CZ); y++) coarse.push([x, y]);
  const nameOf = (p) => p["name:en"] ?? p.name ?? p["name:latin"] ?? "";
  await each(coarse, async ([tx, ty]) => {
    const layer = (await tile(CZ, tx, ty))?.layers.waterway;
    if (!layer) return;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const set = want.get(nameOf(f.properties));
      if (!set || f.properties.class !== "river") continue;
      const g = f.toGeoJSON(tx, ty, CZ).geometry;
      for (const line of g.type === "LineString" ? [g.coordinates] : g.coordinates)
        for (let k = 0; k + 1 < line.length; k++) {
          const steps = Math.max(1, Math.ceil(Math.hypot(line[k + 1][0] - line[k][0], line[k + 1][1] - line[k][1]) / 0.02));
          for (let s = 0; s <= steps; s++) {
            const lon = line[k][0] + ((line[k + 1][0] - line[k][0]) * s) / steps, lat = line[k][1] + ((line[k + 1][1] - line[k][1]) * s) / steps;
            set.add(`${tileX(lon, DETAIL_Z)},${tileY(lat, DETAIL_Z)}`);
          }
        }
    }
  });
  for (const [name, set] of want) {
    const mouth = RIVERS[name];
    let count = 0, km = 0, toward = 0, away = 0;
    await each([...set].map((k) => k.split(",").map(Number)), async ([tx, ty]) => {
      const layer = (await tile(DETAIL_Z, tx, ty))?.layers.waterway;
      if (!layer) return;
      const lines = [];
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        if (nameOf(f.properties) !== name || f.properties.class !== "river" || f.properties.intermittent === 1) continue;
        const g = f.toGeoJSON(tx, ty, DETAIL_Z).geometry;
        lines.push(...(g.type === "LineString" ? [g.coordinates] : g.coordinates));
      }
      for (const [cx, cy] of cellsOf(tx, ty)) {
        const box = cellBox(cx, cy);
        const mid = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
        if (!inCA(mid) && !(name === "Colorado River" && mid[1] < 35.01 && kmToCA(mid) < 3)) continue;
        const parts = lines.flatMap((l) => clipLine(l, box));
        if (!parts.length) continue;
        for (const p of parts) {
          const d = (q) => Math.hypot((q[0] - mouth[0]) * Math.cos((q[1] * Math.PI) / 180), q[1] - mouth[1]);
          const len = p.reduce((a, q, i) => (i ? a + Math.hypot((q[0] - p[i - 1][0]) * 88, (q[1] - p[i - 1][1]) * 110.57) : 0), 0);
          km += len;
          if (d(p.at(-1)) < d(p[0])) toward += len; else away += len;
        }
        const coords = parts.map(tidy).filter((p) => p.length > 1);
        if (!coords.length) continue;
        features.push({ type: "Feature", id: id++, properties: { k: "river", c: mid.map(r5) }, geometry: coords.length === 1 ? { type: "LineString", coordinates: coords[0] } : { type: "MultiLineString", coordinates: coords } });
        count++;
      }
    });
    console.log(`${name}: ${count} cells, ${km.toFixed(0)} km, ${((100 * toward) / (toward + away || 1)).toFixed(0)}% of its length heads toward the mouth`);
  }
}

const out = path.join(root, "data/ref/water-shimmer.geojson");
fs.writeFileSync(out, JSON.stringify({ type: "FeatureCollection", source: `OpenFreeMap planet ${version} (OpenMapTiles; © OpenStreetMap contributors, ODbL)`, features }));
console.log(`water-shimmer.geojson: ${features.length} cells, ${(fs.statSync(out).size / 1024).toFixed(0)} KB; ${fetched} tiles fetched (others from data/cache)`);
