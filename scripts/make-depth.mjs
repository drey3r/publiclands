// The sea floor around California as one small picture, for the map's depth shading (lib/seafloor.ts):
//
//   data/ref/ocean-depth.png    depth below sea level, 0 (land and the surface) to 5,200 m, one byte a
//                               pixel (value = 255 × (depth / 5200)^0.6, so the shelf and slope keep
//                               the most steps), same box and projection as the sea mask
//
// Source: the terrain tiles the map already uses for its hillshade (Mapzen Terrarium on AWS; their sea
// floor is ETOPO1, about 1.9 km a sample). The map used to shade depth straight from those tiles, scaled
// up from zoom 8: close in, that drew the coarse samples as soft dark blobs (Monterey Bay at zoom 9).
// Here the samples are smoothed once, and the map then interpolates them with a smooth curve and draws
// depth bands that follow the canyons.
//
//   node scripts/make-depth.mjs            # 121 tile requests
//
// Re-run only if the box changes; the output is committed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(root, "data/cache/depth-tiles");
fs.mkdirSync(cacheDir, { recursive: true });

/** Keep in step with MASK in scripts/make-water.mjs and lib/ocean.ts. */
const BOX = { west: -137, east: -107, south: 26, north: 48, size: 1024 };
const Z = 7;
const T = 256;
export const DEPTH_MAX = 5200;
export const DEPTH_GAMMA = 0.6;
/** Smoothing of the tile mosaic, in its pixels (about 1.2 km each): takes out the stair steps of the 1.9 km samples. */
const SIGMA = 1.6;

const mx = (lon) => (lon + 180) / 360;
const my = (lat) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
const n = 2 ** Z;
const x0 = Math.floor(mx(BOX.west) * n), x1 = Math.floor(mx(BOX.east) * n);
const y0 = Math.floor(my(BOX.north) * n), y1 = Math.floor(my(BOX.south) * n);
const W = (x1 - x0 + 1) * T, H = (y1 - y0 + 1) * T;

async function tile(x, y) {
  const file = path.join(cacheDir, `${Z}-${x}-${y}.png`);
  if (!fs.existsSync(file)) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
      if (res.ok) {
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        break;
      }
      if (attempt >= 3) throw new Error(`terrain tile ${Z}/${x}/${y}: ${res.status}`);
    }
  }
  return sharp(file).removeAlpha().raw().toBuffer();
}

const depth = new Float32Array(W * H);
let tiles = 0;
for (let ty = y0; ty <= y1; ty++)
  for (let tx = x0; tx <= x1; tx++) {
    const px = await tile(tx, ty);
    tiles++;
    for (let j = 0; j < T; j++)
      for (let i = 0; i < T; i++) {
        const o = (j * T + i) * 3;
        const el = px[o] * 256 + px[o + 1] + px[o + 2] / 256 - 32768;
        depth[((ty - y0) * T + j) * W + (tx - x0) * T + i] = Math.max(0, -el);
      }
  }

// Separable Gaussian.
const R = Math.ceil(SIGMA * 3);
const k = Array.from({ length: 2 * R + 1 }, (_, i) => Math.exp(-((i - R) ** 2) / (2 * SIGMA * SIGMA)));
const ks = k.reduce((a, b) => a + b, 0);
const tmp = new Float32Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let d = -R; d <= R; d++) s += depth[y * W + Math.min(W - 1, Math.max(0, x + d))] * k[d + R];
    tmp[y * W + x] = s / ks;
  }
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let d = -R; d <= R; d++) s += tmp[Math.min(H - 1, Math.max(0, y + d)) * W + x] * k[d + R];
    depth[y * W + x] = s / ks;
  }

// Resample to the box (linear in mercator, like the sea mask).
const S = BOX.size;
const out = Buffer.alloc(S * S);
const bx0 = mx(BOX.west), bx1 = mx(BOX.east), byN = my(BOX.north), byS = my(BOX.south);
let deepest = 0;
for (let j = 0; j < S; j++)
  for (let i = 0; i < S; i++) {
    const fx = (bx0 + ((i + 0.5) / S) * (bx1 - bx0)) * n * T - x0 * T - 0.5;
    const fy = (byN + ((j + 0.5) / S) * (byS - byN)) * n * T - y0 * T - 0.5;
    const xi = Math.min(W - 2, Math.max(0, Math.floor(fx))), yi = Math.min(H - 2, Math.max(0, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - xi)), ty = Math.min(1, Math.max(0, fy - yi));
    const d = (depth[yi * W + xi] * (1 - tx) + depth[yi * W + xi + 1] * tx) * (1 - ty) + (depth[(yi + 1) * W + xi] * (1 - tx) + depth[(yi + 1) * W + xi + 1] * tx) * ty;
    deepest = Math.max(deepest, d);
    out[j * S + i] = Math.round(255 * Math.min(1, d / DEPTH_MAX) ** DEPTH_GAMMA);
  }
const file = path.join(root, "data/ref/ocean-depth.png");
await sharp(out, { raw: { width: S, height: S, channels: 1 } }).png({ compressionLevel: 9 }).toFile(file);
console.log(`${tiles} tiles -> ${path.relative(root, file)} ${S}x${S}, ${(fs.statSync(file).size / 1024).toFixed(0)} KB; deepest ${deepest.toFixed(0)} m`);
