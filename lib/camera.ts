// Fly-in cameras. A site gets, in order: its override from data/cameras.json,
// a hand-tuned story camera, or an automatic one: fixed pitch and zoom, with the
// bearing chosen from elevation tiles so terrain doesn't hide the site.

import { TERRARIUM } from "./mapStyle";

export type CameraOverride = { center?: [number, number]; zoom?: number; pitch?: number; bearing?: number };
export type Camera = { center: [number, number]; zoom: number; pitch: number; bearing: number };

export const AUTO_PITCH = 60;
export const AUTO_ZOOM = 14.2;
/** Same exaggeration as the main map's 3D terrain. */
const EXAGGERATION = 1.35;

const Z = 12; // ~9.5 km tiles in California: a 2×2 block covers 3 km in every direction.
const tileCache = new Map<string, Promise<ImageData | null>>();

function loadTile(x: number, y: number): Promise<ImageData | null> {
  const key = `${x}/${y}`;
  let p = tileCache.get(key);
  if (!p) {
    p = fetch(TERRARIUM.replace("{z}", String(Z)).replace("{x}", String(x)).replace("{y}", String(y)))
      .then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
      .then((b) => createImageBitmap(b))
      .then((img) => {
        const c = document.createElement("canvas");
        c.width = c.height = 256;
        const g = c.getContext("2d", { willReadFrequently: true })!;
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, 256, 256);
      })
      .catch(() => null);
    tileCache.set(key, p);
  }
  return p;
}

const worldXY = (lng: number, lat: number) => {
  const n = 2 ** Z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
};

/** Elevation sampler over the 2×2 tile block nearest a point. */
async function sampler(lng: number, lat: number) {
  const [fx, fy] = worldXY(lng, lat);
  const x0 = Math.floor(fx - 0.5), y0 = Math.floor(fy - 0.5);
  const tiles = await Promise.all([0, 1].flatMap((dy) => [0, 1].map((dx) => loadTile(x0 + dx, y0 + dy))));
  if (tiles.some((t) => !t)) return null;
  return (lo: number, la: number) => {
    const [px, py] = worldXY(lo, la);
    const tx = Math.floor(px) - x0, ty = Math.floor(py) - y0;
    if (tx < 0 || tx > 1 || ty < 0 || ty > 1) return null;
    const t = tiles[ty * 2 + tx]!;
    const ix = Math.min(255, Math.floor((px - Math.floor(px)) * 256)), iy = Math.min(255, Math.floor((py - Math.floor(py)) * 256));
    const i = (iy * 256 + ix) * 4;
    return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
  };
}

const offset = (lng: number, lat: number, bearingDeg: number, m: number): [number, number] => {
  const t = (bearingDeg * Math.PI) / 180;
  return [lng + (m * Math.sin(t)) / (111320 * Math.cos((lat * Math.PI) / 180)), lat + (m * Math.cos(t)) / 111320];
};

/**
 * Pick a map bearing for a tilted view of a site. With bearing B the camera sits
 * on the B+180° side. Bearings whose camera side has terrain rising above the
 * line of sight are rejected; of the rest, the one with the lowest ground on the
 * camera side wins (looking from a lake or valley toward the slope behind the site).
 * Returns null if the tiles can't be read.
 */
export async function bestBearing([lng, lat]: [number, number], pitch = AUTO_PITCH): Promise<number | null> {
  const elev = await sampler(lng, lat);
  if (!elev) return null;
  const h0 = Math.max(0, elev(lng, lat) ?? 0); // offshore sites: sea level, not the sea floor
  const slope = Math.tan(((90 - pitch) * Math.PI) / 180); // rise of the line of sight per meter
  const DISTS = [200, 400, 700, 1000, 1500, 2200, 3000];
  let best: { b: number; score: number } | null = null;
  for (let b = 0; b < 360; b += 15) {
    let block = 0, sum = 0, n = 0;
    for (const d of DISTS) {
      const [x, y] = offset(lng, lat, b + 180, d);
      const h = elev(x, y);
      if (h == null) continue;
      block = Math.max(block, (Math.max(0, h) - h0) * EXAGGERATION - d * slope);
      sum += Math.max(0, h);
      n++;
    }
    if (!n) continue;
    // Blocked views lose to any clear one; then lower ground behind the camera wins;
    // small preference for north-up so similar sites look alike.
    const tilt = Math.min(b, 360 - b) / 180;
    const score = (block > 0 ? 1e6 + block : 0) + sum / n + tilt * 15;
    if (!best || score < best.score) best = { b, score };
  }
  return best ? (best.b > 180 ? best.b - 360 : best.b) : null;
}

/** bestBearing, but never waits longer than `ms` (falls back to north-up). */
export async function bearingWithin(center: [number, number], ms = 900, pitch = AUTO_PITCH): Promise<number> {
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), ms));
  return (await Promise.race([bestBearing(center, pitch).catch(() => null), timeout])) ?? 0;
}
