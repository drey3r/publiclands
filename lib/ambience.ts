import type { CustomLayerInterface, CustomRenderMethodInput, Map as MLMap, StyleImageInterface } from "maplibre-gl";
import { OCEAN_LAYER, OceanLayer, WAVES_MAX_Z, type OceanFlow } from "./ocean";
import { addShimmer, type Shimmer } from "./water";

/**
 * Ambience: the ocean's moving wave marks, the surf line along the coast, and the live cloud layer.
 *
 * Both run off one slow ticker (about 12 frames a second, never 60) that only asks the map to
 * repaint, so the map can still rest and fire `idle` between frames. The clouds are three layers
 * (high, mid, low) shaded on the GPU in one draw call a frame, passed one after another as the reader
 * zooms in; phones get one light layer, still. The wave marks are a shader too (lib/ocean.ts): they
 * drift with the live current and brighten with the swell from its real direction. Only the surf
 * line is a small canvas redrawn each tick, and, from a little below Home, two more for the glint on
 * the big lakes and the drift on the major rivers (lib/water.ts), only while those are in view. The ticker
 * stops past the zooms where waves and clouds have faded, while the tab is hidden, on screens
 * 600 px wide or less, and when the reader prefers reduced motion (one still frame instead).
 */

const FPS = 12;
/**
 * Three cloud layers, each passed in turn as the reader comes down: high cloud first, then mid, then
 * low cloud and fog. Per layer: [whole until, gone by] in zoom levels below Home, how far it sits off
 * the ground at Home (its parallax when panning: 1 = on the ground), how much further it spreads from
 * the map's centre while it is passed, and its drift in screen pixels a second (the same at every
 * zoom: slow, but seen within three or four seconds).
 */
const CLOUD_LEVELS = {
  low: { from: 1.3, to: 4.1, hold: 0.7, lift: 1.012, spread: 0.22, drift: 6 },
  mid: { from: 0.9, to: 2.7, hold: 0.5, lift: 1.03, spread: 0.5, drift: 9 },
  high: { from: 0.2, to: 1.5, hold: 0.5, lift: 1.055, spread: 0.8, drift: 13 },
} as const;
/** Low cloud and fog linger to about this zoom, thinning all the way, then the reader is in clear air. */
const LOW_GONE_Z = 9.5;
/** Phones draw one light layer (all three covers merged, no shading), still, gone sooner. */
const CLOUD_LITE = { from: 1.3, to: 3.4, hold: 0.5 };
/** "Home" for the descent: the map's lowest zoom, held to a sane range on very small or very large maps. */
const cloudBase = (m: MLMap) => Math.min(6.2, Math.max(4.5, m.getMinZoom()));
const cloudLevelsFor = (m: MLMap) => ({ ...CLOUD_LEVELS, low: { ...CLOUD_LEVELS.low, to: Math.max(3.2, LOW_GONE_Z - cloudBase(m)) } });
/** A layer's opacity and how far the reader is through it, `down` zoom levels below Home. It thins from `from` on, and fades out over the last part (after `hold` of the way). */
const levelAt = (l: { from: number; to: number; hold: number }, down: number) => ({ thin: smooth(l.from, l.to, down), fade: 1 - smooth(l.from + l.hold * (l.to - l.from), l.to, down) });
/** The zoom by which every cloud layer is gone, before lease detail matters. */
export const cloudsMaxZoom = (m: MLMap, lite = false) => cloudBase(m) + (lite ? CLOUD_LITE.to : cloudLevelsFor(m).low.to);
/** However overcast, the three layers together never pass this opacity: the map stays readable under them. */
const CLOUD_CAP = 0.6;
/**
 * The illustrative marine layer (not data): a deck of low cloud over the sea that reaches the coast,
 * at its fullest about 6 in the morning and thinnest about 3 in the afternoon, California time.
 * Returns its strength (0..1) and how far it reaches: the share of sea around a point (0.5 = the
 * shoreline) from which it begins.
 */
function marineLayer(now = new Date()): [number, number] {
  let h = 9;
  // The browser checks and recordings can pin the hour (window.__cloudsHour).
  const pinned = (globalThis as { __cloudsHour?: number }).__cloudsHour;
  try {
    if (typeof pinned === "number") throw new Error("pinned");
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
    h = Number(parts.find((x) => x.type === "hour")?.value) + Number(parts.find((x) => x.type === "minute")?.value) / 60;
  } catch {
    // No time zone data: a mid-morning sky.
    if (typeof pinned === "number") h = pinned;
  }
  const f = h >= 6 && h <= 15 ? 0.5 + 0.5 * Math.cos((Math.PI * (h - 6)) / 9) : 0.5 - 0.5 * Math.cos((Math.PI * ((h + 24 - 15) % 24)) / 15);
  return [0.72 + 0.28 * f, 0.58 - 0.13 * f];
}
/** Keep in step with MASK in lib/ocean.ts: the sea mask's box. */
const SEA_BOX = { west: -137, east: -107, south: 26, north: 48 };
/**
 * Clouds sit right below this layer: above every land fill, tint and mask (the map inserts all of
 * those below the county lines), and below county lines, state lines, every name, mark and outline.
 */
const CLOUDS_BELOW = "county-line";
const CLOUD_CREDIT_LAYER = "clouds-credit";
/** The surf line fades out by this zoom, before shore leases and their icons matter. */
export const SURF_MAX_Z = 10;
export const SURF_IMAGE = "surf-line";
export const SURF_LAYER = "surf-line";
const SURF_W = 128;
const SURF_H = 12;
/** Seconds for one breath of the surf line. */
const SURF_BREATH_S = 6.5;
/** Credits for the sea's motion: the live grid's, or a plain statement that the drift is a sketch. */
const OCEAN_CREDIT = 'Sea currents and swell: <a href="https://open-meteo.com/en/docs/marine-weather-api">Open-Meteo Marine</a>, generated using E.U. Copernicus Marine Service Information (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>; coarse, not for navigation)';
const OCEAN_SKETCH_CREDIT = "Sea drift: illustrative, not data";
export const CLOUD_SOURCE = "clouds";
export const CLOUD_LAYER = "clouds";
/** Open-Meteo's CC BY 4.0 credit, shown in the map's attribution only while the clouds are drawn. */
const CLOUDS_CREDIT = 'Clouds: <a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, drawn as clouds) blended with an illustrative marine layer';

// ---------------------------------------------------------------------------------------------
// Small helpers

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

// ---------------------------------------------------------------------------------------------
// Surf: a soft white line along the coast that breathes

/**
 * The surf line's pattern: a soft white band, drawn along the coast as a line pattern. It swells
 * and eases as a whole on a slow breath, and brighter stretches slide slowly along the shore. It
 * is redrawn on the same ticker as the waves (a 256 × 24 px canvas), so it adds no repaint of its own.
 */
export class SurfPattern implements StyleImageInterface {
  width = SURF_W * 2;
  height = SURF_H * 2;
  data: Uint8ClampedArray;
  private dirty = true;

  constructor() {
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
  }

  /** Draw the frame for time `t` (seconds). */
  draw(t: number) {
    const { width: W, height: H, data } = this;
    const breath = 0.72 + 0.28 * Math.sin((t * Math.PI * 2) / SURF_BREATH_S);
    for (let x = 0; x < W; x++) {
      // Two sets a tile (so it repeats seamlessly), sliding along the shore.
      const along = 0.62 + 0.38 * Math.sin(Math.PI * 2 * ((2 * x) / W - t / 9));
      const peak = breath * along;
      // The band is widest when it is brightest, like a wash running up and drawing back.
      const half = 0.28 + 0.2 * peak;
      for (let y = 0; y < H; y++) {
        const d = Math.abs((y + 0.5) / H - 0.5) / half;
        const a = d >= 1 ? 0 : peak * (1 - d * d) ** 2;
        const o = (y * W + x) * 4;
        data[o] = 255;
        data[o + 1] = 255;
        data[o + 2] = 255;
        data[o + 3] = Math.round(a * 255);
      }
    }
    this.dirty = true;
  }

  render() {
    if (!this.dirty) return false;
    this.dirty = false;
    return true;
  }
}

// ---------------------------------------------------------------------------------------------
// Clouds

/** What /api/clouds returns: cloud cover (0–100) on a regular lat/lon grid, row by row from the south. */
export type CloudGrid = {
  /** Model time of the values (ISO, UTC). */
  time: string;
  lat0: number;
  lon0: number;
  step: number;
  nx: number;
  ny: number;
  low: number[];
  mid: number[];
  high: number[];
  /** Mean wind at low-cloud height (850 hPa), m/s, toward east (u) and north (v). */
  wind: [number, number];
  /** Mean wind at mid-cloud height (700 hPa); the low wind if absent. */
  windMid?: [number, number];
  /** Mean wind at high-cloud height (300 hPa); the low wind if absent. */
  windHigh?: [number, number];
  source: string;
};

/** Tileable value-noise fBm, 0..1. `sx` stretches it along x (streaky cirrus). */
function fbm(n: number, seed: number, octaves: number, base: number, sx = 1): Float32Array {
  const out = new Float32Array(n * n);
  const r = rng(seed);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const gx = Math.max(1, Math.round((base << o) / sx));
    const gy = base << o;
    const g = new Float32Array(gx * gy);
    for (let i = 0; i < g.length; i++) g[i] = r();
    for (let y = 0; y < n; y++) {
      const fy = (y / n) * gy;
      const y0 = Math.floor(fy);
      const ty = smooth(0, 1, fy - y0);
      const r0 = (y0 % gy) * gx;
      const r1 = ((y0 + 1) % gy) * gx;
      for (let x = 0; x < n; x++) {
        const fx = (x / n) * gx;
        const x0 = Math.floor(fx);
        const tx = smooth(0, 1, fx - x0);
        const a = x0 % gx;
        const b = (x0 + 1) % gx;
        const v = (g[r0 + a] * (1 - tx) + g[r0 + b] * tx) * (1 - ty) + (g[r1 + a] * (1 - tx) + g[r1 + b] * tx) * ty;
        out[y * n + x] += v * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  // Normalize to 0..1 by its own range, so thresholds mean the same thing for every seed.
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < out.length; i++) {
    out[i] /= total;
    lo = Math.min(lo, out[i]);
    hi = Math.max(hi, out[i]);
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return out;
}

const NOISE = 512;
const NOISE_LITE = 256;
/** One noise tile spans this many degrees of longitude. Every lookup is turned, stretched and warped, so the tile never shows. */
const NOISE_DEG = 12;

const CLOUD_VERT = `#version 300 es
uniform mat4 u_matrix;
in vec2 a_pos;
out vec2 v_m;
void main() {
  v_m = a_pos;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`;

/**
 * Per pixel and per layer: how much cloud is here (the live cover, smoothly interpolated; for low
 * cloud, also the illustrative marine layer, and whichever is more wins), and a sheet of cloud cut
 * from that. A sheet is the cover plus a broad noise field, stretched along the wind at its height and
 * warped so nothing in it is round: full cover is a deck with thinner streaks in it, partial cover a
 * deck with clear slots and ragged banks, thin cover a few long wisps. Each layer is looked up a
 * little further from the map's centre than the ground under it (its height), slides down its own wind,
 * and is eroded and faded on its own as the reader descends through it. All of it is white at low
 * opacity with wide soft edges, and the sum is capped so an overcast sky stays a veil.
 */
const CLOUD_COMMON = `#version 300 es
precision highp float;
in vec2 v_m;
uniform sampler2D u_cover;
uniform sampler2D u_noise;
uniform sampler2D u_sea;    // the sea mask, small, with mip levels: blurred, it says how far offshore a point is
uniform vec4 u_ext;     // lon0, lat0, lon span, lat span of the grid points (degrees)
uniform vec4 u_seaExt;  // mercator x0, y0 (north), x1, y1 (south) of the sea mask
uniform vec2 u_res;     // grid points across and up
uniform vec2 u_center;  // the map's centre (mercator)
uniform vec3 u_spread;  // low, mid, high: >= 1, how far from the centre each layer is looked up
uniform vec3 u_fade;    // low, mid, high: opacity for this zoom
uniform vec3 u_thin;    // low, mid, high: 0..1, how far the reader has descended through each
uniform vec3 u_s;       // low, mid, high: how far each layer has slid down its wind (noise units)
uniform vec2 u_w1;      // unit vectors on the map (x east, y south) along the wind: low,
uniform vec2 u_w2;      // mid,
uniform vec2 u_w3;      // high
uniform vec2 u_marine;  // the marine layer: strength, and the share of sea around a point where it begins
uniform float u_morph;  // slow time: the sheets change shape as they go
uniform float u_k;      // mercator -> noise units
uniform float u_cap;
out vec4 o;
const float PI = 3.141592653589793;

// Cover at a mercator point: x low, y mid, z high (0..1). Smooth between grid points but exact at
// them: the model's fog and cloud patches are often one grid point wide, and a wider smoothing
// (tried: a cubic B-spline) flattened a lone 100% point to under half and drew nothing there.
vec3 cover(vec2 m) {
  float lon = m.x * 360.0 - 180.0;
  float lat = degrees(atan(sinh(PI * (1.0 - 2.0 * m.y))));
  vec2 uv = vec2((lon - u_ext.x) / u_ext.z, (lat - u_ext.y) / u_ext.w);
  vec2 p = uv * (u_res - 1.0);
  vec2 i = floor(p);
  vec2 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  vec3 c = texture(u_cover, (i + 0.5 + f) / u_res).rgb;
  // The grid ends far outside any view of California; feather it anyway.
  vec2 e = min(uv, 1.0 - uv);
  return c * smoothstep(0.0, 0.07, e.x) * smoothstep(0.0, 0.07, e.y);
}
// The illustrative marine layer: over the sea up to the shore (a little inland in the morning, a little
// off it in the afternoon), in banks with clearer stretches between them, thinner far out.
float marine(vec2 m) {
  vec2 uv = (m - u_seaExt.xy) / (u_seaExt.zw - u_seaExt.xy);
  float near = textureLod(u_sea, uv, 2.5).r;
  float far = textureLod(u_sea, uv, 4.5).r;
  float banks = texture(u_noise, m * u_k * 0.21 + vec2(0.37 + u_morph * 0.4, 0.11)).g;
  vec2 e = min(uv, 1.0 - uv);
  // Whole along the coast; further out it thins and breaks into banks.
  float out_ = smoothstep(0.78, 1.0, far);
  return u_marine.x * smoothstep(u_marine.y, u_marine.y + 0.22, near) * mix(1.0, 0.8 * mix(0.4, 1.0, smoothstep(0.34, 0.56, banks)), out_)
       * smoothstep(0.0, 0.04, min(e.x, e.y));
}
vec2 lifted(float s) { return u_center + (v_m - u_center) / s; }
vec2 rot(vec2 p, float c, float s) { return vec2(p.x * c - p.y * s, p.x * s + p.y * c); }
// A point in a layer's own frame: x down the wind, y across it, slid back by the layer's drift.
vec2 frame(vec2 m, vec2 w, float s) { vec2 q = m * u_k; return vec2(dot(q, w) - s, dot(q, vec2(-w.y, w.x))); }
// A sheet of cloud for cover d at a point q of the layer's frame: 0..1. along < 1 draws it out along the wind.
float sheet(vec2 q, float d, float along, float scale, float erode) {
  if (d < 0.02) return 0.0;
  vec2 warp = texture(u_noise, q * 0.29 * scale + vec2(u_morph, 0.4)).rg - 0.5;
  vec2 p = vec2(q.x * along, q.y) * scale + 0.42 * warp;
  float n = 0.5 * texture(u_noise, p * 0.83).r
          + 0.32 * texture(u_noise, rot(p, 0.8, -0.6) * 2.1 + vec2(u_morph * 1.7, 0.0)).g
          + 0.18 * texture(u_noise, rot(p, 0.5, 0.87) * 4.7).a
          + 0.09 * (texture(u_noise, rot(p, 0.26, -0.97) * 12.3).r - 0.5);
  return smoothstep(0.44, 0.66, d + (n - 0.5) * 1.6 - erode) * smoothstep(0.02, 0.1, d);
}
// Low cloud: the sheet, with broad swells and long streaks of thicker and thinner cloud in it (down the
// wind), so even a full deck has form and is never a flat veil.
float lowBody(vec2 q, float d, float erode) {
  float a = sheet(q, d, 0.68, 1.0, erode);
  if (a <= 0.0) return 0.0;
  vec2 w = 0.3 * texture(u_noise, q * 0.9).rg;
  float t = 0.6 * texture(u_noise, vec2(q.x * 0.8, q.y * 1.7) + w + vec2(0.0, u_morph)).g
          + 0.4 * texture(u_noise, vec2(q.x * 1.1, q.y * 3.7) + w).b;
  return a * mix(0.42, 1.0, smoothstep(0.32, 0.68, t));
}
// Passing through a layer: a faint even haze where it has cover, strongest halfway through.
float haze(float d, float thin) { return 0.1 * d * 4.0 * thin * (1.0 - thin); }
// All layers together, held under the cap (nearly linear for thin cloud, flattening toward overcast).
float capped(float a) { return u_cap * (1.0 - exp(-2.0 * a)) / 0.8647; }
`;

const CLOUD_FRAG = CLOUD_COMMON + `
void main() {
  // Low cloud and fog: the live cover or the marine layer, whichever is more.
  float low = 0.0, lowRaw = 0.0, d1 = 0.0;
  vec2 q1 = vec2(0.0);
  if (u_fade.x > 0.0) {
    vec2 m1 = lifted(u_spread.x);
    d1 = max(cover(m1).x, marine(m1));
    q1 = frame(m1, u_w1, u_s.x);
    lowRaw = lowBody(q1, d1, 0.3 * u_thin.x);
    low = (0.82 * lowRaw + haze(d1, u_thin.x)) * u_fade.x;
  }
  // Mid: a thinner, flatter sheet in smaller pieces.
  float mid = 0.0;
  if (u_fade.y > 0.0) {
    vec2 m2 = lifted(u_spread.y);
    float d = cover(m2).y;
    mid = (0.5 * sheet(frame(m2, u_w2, u_s.y) + vec2(3.1, 1.7), d, 0.6, 1.5, 0.42 * u_thin.y) + haze(d, u_thin.y)) * u_fade.y;
  }
  // High: thin streaks drawn far out along the wind; a few wisps on any day (illustrative), more where the data has them.
  float hi = 0.0;
  if (u_fade.z > 0.0) {
    vec2 m3 = lifted(u_spread.z);
    float wisps = 0.5 * smoothstep(0.48, 0.68, texture(u_noise, m3 * u_k * 0.17 + vec2(0.61, 0.23 + u_morph * 0.3)).r);
    float d = max(cover(m3).z, wisps);
    hi = (0.5 * sheet(frame(m3, u_w3, u_s.z) + vec2(5.3, 2.9), d, 0.22, 1.25, 0.42 * u_thin.z) + 0.5 * haze(d, u_thin.z)) * u_fade.z;
  }
  float a = capped(1.0 - (1.0 - low) * (1.0 - mid) * (1.0 - hi));
  // The same low cloud a little toward the light (northwest, like the hillshade). Where it is thicker
  // there, this point is on a bank's far side: tint it a pale cool white, so the tops have form.
  // Where this point has no cloud, that neighbour casts a faint shadow on the ground.
  float shade = 0.0;
  float sh = 0.0;
  if (u_fade.x > 0.0 && d1 > 0.02) {
    vec2 off = vec2(-0.0055, -0.0055);
    float toward = lowBody(q1 + vec2(dot(off, u_w1), dot(off, vec2(-u_w1.y, u_w1.x))), d1, 0.3 * u_thin.x);
    shade = clamp((toward - lowRaw) * 2.6, 0.0, 1.0) * low / max(a, 0.001);
    sh = 0.13 * toward * (1.0 - a) * u_fade.x;
  }
  vec3 body = mix(vec3(1.0), vec3(0.76, 0.82, 0.89), 0.7 * clamp(shade, 0.0, 1.0));
  // High cloud alone is a cooler, greyer white: plain white wisps vanish over pale land.
  body = mix(body, vec3(0.86, 0.9, 0.95), hi * (1.0 - low) * (1.0 - mid) / max(low + mid + hi, 0.001));
  o = vec4(body * a + vec3(0.2, 0.26, 0.34) * sh, a + sh);
}`;

/** Phones: one sheet from the three covers merged and the marine layer, no shading. */
const CLOUD_FRAG_LITE = CLOUD_COMMON + `
void main() {
  if (u_fade.x <= 0.0) discard;
  vec2 m = lifted(u_spread.x);
  vec3 c = cover(m);
  float d = max(1.0 - (1.0 - c.x) * (1.0 - 0.8 * c.y) * (1.0 - 0.5 * c.z), marine(m));
  float a = capped(0.8 * sheet(frame(m, u_w1, u_s.x), d, 0.68, 1.0, 0.3 * u_thin.x) * u_fade.x);
  o = vec4(a);
}`;

/**
 * The cloud layer: one quad over the weather grid, shaded on the GPU. Nothing is computed per pixel
 * on the CPU and nothing is uploaded per frame; a frame costs one draw call. It never asks for a
 * repaint itself (the ambience ticker does, and only while clouds are in view).
 */
class CloudLayer implements CustomLayerInterface {
  id = CLOUD_LAYER;
  type = "custom" as const;
  renderingMode = "2d" as const;
  /** Whether the layer draws (the switch). */
  on = true;
  /** No drift: readers who prefer reduced motion, and phones. */
  still = false;
  /** One light layer instead of three (phones). Set before the layer is added. */
  lite = false;
  private map: MLMap | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private buf: WebGLBuffer | null = null;
  private cover: WebGLTexture | null = null;
  private noise: WebGLTexture | null = null;
  private sea: WebGLTexture | null = null;
  private seaCanvas: HTMLCanvasElement | null = null;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private grid: CloudGrid;
  private dirty = true;
  /** How far each layer (low, mid, high) has slid down its wind, in noise tiles. */
  private slid: [number, number, number] = [0.13, 0.57, 0.31];
  private morph = 0;
  private last = 0;

  constructor(g: CloudGrid, private seaUrl = "/data/ocean-mask.png") {
    this.grid = g;
  }

  setGrid(g: CloudGrid) {
    this.grid = g;
    this.dirty = true;
  }

  onAdd(map: MLMap, gl: WebGL2RenderingContext) {
    this.map = map;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("[clouds] shader", gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, CLOUD_VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, this.lite ? CLOUD_FRAG_LITE : CLOUD_FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn("[clouds] program", gl.getProgramInfoLog(p));
      return;
    }
    this.program = p;
    for (const u of ["u_matrix", "u_cover", "u_noise", "u_sea", "u_ext", "u_seaExt", "u_res", "u_center", "u_spread", "u_fade", "u_thin", "u_s", "u_w1", "u_w2", "u_w3", "u_marine", "u_morph", "u_k", "u_cap"]) this.uni[u] = gl.getUniformLocation(p, u);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    this.cover = gl.createTexture();
    // Four noise fields in one repeating texture: broad fields (r, g), long streaks (b), fine grain (a).
    const N = this.lite ? NOISE_LITE : NOISE;
    const oct = this.lite ? 5 : 7;
    const ch = [fbm(N, 7, oct, 4), fbm(N, 31, oct, 4), fbm(N, 53, 5, 4, 4), fbm(N, 97, 5, 8)];
    const px = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) for (let c = 0; c < 4; c++) px[i * 4 + c] = Math.round(ch[c][i] * 255);
    this.noise = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    // Where the sea is, for the marine layer: nothing (no marine layer) until the mask arrives.
    this.sea = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sea);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const img = new Image();
    img.onload = () => {
      // 512 px across 30 degrees is plenty: it is only ever read blurred.
      const c = document.createElement("canvas");
      c.width = c.height = 512;
      c.getContext("2d")!.drawImage(img, 0, 0, 512, 512);
      this.seaCanvas = c;
      map.triggerRepaint();
    };
    img.onerror = () => console.warn("[clouds] sea mask did not load; no marine layer");
    img.src = this.seaUrl;
    this.dirty = true;
  }

  onRemove(_map: MLMap, gl: WebGL2RenderingContext) {
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.cover);
    gl.deleteTexture(this.noise);
    gl.deleteTexture(this.sea);
    gl.deleteBuffer(this.buf);
    gl.deleteVertexArray(this.vao);
    this.program = null;
  }

  /** The grid as a texture (row 0 = south) and its quad in mercator units. */
  private upload(gl: WebGL2RenderingContext) {
    const g = this.grid;
    const px = new Uint8Array(g.nx * g.ny * 4);
    for (let i = 0; i < g.nx * g.ny; i++) {
      px[i * 4] = Math.round((g.low[i] ?? 0) * 2.55);
      px[i * 4 + 1] = Math.round((g.mid[i] ?? 0) * 2.55);
      px[i * 4 + 2] = Math.round((g.high[i] ?? 0) * 2.55);
      px[i * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.cover);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, g.nx, g.ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const x0 = (g.lon0 + 180) / 360;
    const x1 = (g.lon0 + (g.nx - 1) * g.step + 180) / 360;
    const y = (lat: number) => 0.5 - mercY(lat) / (2 * Math.PI);
    const yS = y(g.lat0);
    const yN = y(g.lat0 + (g.ny - 1) * g.step);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, yN, x1, yN, x0, yS, x1, yS]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program!, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.dirty = false;
  }

  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const m = this.map;
    if (!m || !this.program || !this.on) return;
    const z = m.getZoom();
    // How far below Home the reader is, and what that does to each layer.
    const down = z - cloudBase(m);
    const L = cloudLevelsFor(m);
    const levels = this.lite ? [{ ...L.low, ...CLOUD_LITE }] : [L.low, L.mid, L.high];
    const thin = [0, 0, 0];
    const fade = [0, 0, 0];
    const spread = [1, 1, 1];
    levels.forEach((l, i) => {
      const at = levelAt(l, down);
      thin[i] = at.thin;
      fade[i] = at.fade;
      spread[i] = l.lift + l.spread * at.thin;
    });
    if (Math.max(...fade) <= 0) return;
    if (this.dirty) this.upload(gl);
    if (this.seaCanvas) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, this.sea);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.seaCanvas);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.seaCanvas = null;
    }
    const g = this.grid;
    const k = 360 / NOISE_DEG;
    // Drift: a steady few screen pixels a second down the real wind at each height, whatever the
    // zoom (advanced per frame, so zooming never makes the clouds jump).
    const t = performance.now() / 1000;
    const dt = this.last ? Math.min(0.25, t - this.last) : 0;
    this.last = t;
    if (!this.still && dt > 0) {
      const perPx = k / (512 * 2 ** z); // noise units per screen pixel
      [L.low.drift, L.mid.drift, L.high.drift].forEach((pxPerS, i) => (this.slid[i] = (this.slid[i] + pxPerS * perPx * dt) % 64));
      this.morph = (this.morph + dt * 0.0035) % 64;
    }
    // Unit vectors down each wind on the map (mercator y grows south).
    const dir = (w: [number, number]): [number, number] => {
      const sp = Math.hypot(w[0], w[1]);
      return sp > 0.01 ? [w[0] / sp, -w[1] / sp] : [1, 0];
    };
    const w1 = dir(g.wind), w2 = dir(g.windMid ?? g.wind), w3 = dir(g.windHigh ?? g.wind);
    const marine = marineLayer();
    const c = m.getCenter();
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uni.u_matrix, false, args.defaultProjectionData.mainMatrix as Float32Array);
    gl.uniform4f(this.uni.u_ext, g.lon0, g.lat0, (g.nx - 1) * g.step, (g.ny - 1) * g.step);
    gl.uniform2f(this.uni.u_res, g.nx, g.ny);
    gl.uniform2f(this.uni.u_center, (c.lng + 180) / 360, 0.5 - mercY(c.lat) / (2 * Math.PI));
    gl.uniform3f(this.uni.u_spread, spread[0], spread[1], spread[2]);
    gl.uniform3f(this.uni.u_fade, fade[0], fade[1], fade[2]);
    gl.uniform3f(this.uni.u_thin, thin[0], thin[1], thin[2]);
    gl.uniform3f(this.uni.u_s, this.slid[0], this.slid[1], this.slid[2]);
    gl.uniform2f(this.uni.u_w1, w1[0], w1[1]);
    gl.uniform2f(this.uni.u_w2, w2[0], w2[1]);
    gl.uniform2f(this.uni.u_w3, w3[0], w3[1]);
    gl.uniform2f(this.uni.u_marine, marine[0], marine[1]);
    gl.uniform1f(this.uni.u_morph, this.morph);
    const mx = (lon: number) => (lon + 180) / 360;
    const my = (lat: number) => 0.5 - mercY(lat) / (2 * Math.PI);
    gl.uniform4f(this.uni.u_seaExt, mx(SEA_BOX.west), my(SEA_BOX.north), mx(SEA_BOX.east), my(SEA_BOX.south));
    gl.uniform1f(this.uni.u_k, k);
    gl.uniform1f(this.uni.u_cap, CLOUD_CAP);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cover);
    gl.uniform1i(this.uni.u_cover, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    gl.uniform1i(this.uni.u_noise, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.sea);
    gl.uniform1i(this.uni.u_sea, 2);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }
}

// ---------------------------------------------------------------------------------------------
// Wiring

export type Ambience = {
  setClouds: (on: boolean) => void;
  /** Where the sea's motion comes from: the live grid, the illustrative sketch (load failed), or not asked yet. */
  oceanFlow: () => "live" | "sketch" | "none";
  /** Lake and river shimmer cells on screen, and how many are faded out under lease marks (for the browser checks). */
  shimmer: () => { shown: number; hidden: number; loaded: boolean };
  /** Whether the animation ticker is running (for the browser checks). */
  running: () => boolean;
  /** Whether clouds are being drawn at this zoom (for the browser checks). */
  cloudsShown: () => boolean;
  /** Each cloud layer's opacity (0..1) at this zoom, and the zoom the descent starts from (for the browser checks). */
  cloudLevels: () => { low: number; mid: number; high: number; base: number; lite: boolean };
  destroy: () => void;
};

/**
 * Adds the wave marks over the ocean (`ocean-waves`, right above the sea-floor depth) and, once
 * /api/clouds answers, the cloud layer right below the county lines. Returns switches.
 */
export function addAmbience(
  m: MLMap,
  opts: { clouds: boolean; waves?: boolean; cloudsUrl?: string; oceanUrl?: string; maskUrl?: string; onClouds?: (time: string | null) => void },
): Ambience {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Phones get the same still frame: measured on a 390 px viewport at 4x CPU throttle, the ticker's
  // repaints cost ~5-10% of panning frame rate.
  const small = window.matchMedia("(max-width: 600px)");
  const reduce = () => motion.matches || small.matches;
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000 + 40; // start mid-cycle, never at a blank frame
  const ocean = new OceanLayer(opts.maskUrl ?? "/data/ocean-mask.png");
  if (!m.getLayer(OCEAN_LAYER) && m.getLayer("water-ocean")) {
    // Right above the sea-floor depth (or the plain ocean), so the State sovereign lands tint, which
    // ogLayers.addWaters puts below the depth, never covers them.
    const ids = m.getStyle().layers.map((l) => l.id);
    m.addLayer(ocean, ids[ids.indexOf(m.getLayer("ocean-depth") ? "ocean-depth" : "water-ocean") + 1]);
    // Credits ride on empty sources, shown by a layer that is visible only while they apply.
    for (const [id, attribution] of [["ocean-flow", OCEAN_CREDIT], ["ocean-sketch", OCEAN_SKETCH_CREDIT]] as const) {
      m.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] }, attribution });
      m.addLayer({ id: `${id}-credit`, type: "line", source: id, layout: { visibility: "none" } }, OCEAN_LAYER);
    }
  }
  const oceanCredit = (which: "ocean-flow" | "ocean-sketch" | null) => {
    for (const id of ["ocean-flow", "ocean-sketch"]) if (m.getLayer(`${id}-credit`)) m.setLayoutProperty(`${id}-credit`, "visibility", id === which ? "visible" : "none");
  };
  let flowKind: "live" | "sketch" | "none" = "none";
  async function loadOcean() {
    try {
      const res = await fetch(opts.oceanUrl ?? "/api/ocean");
      if (!res.ok) throw new Error(`ocean ${res.status}`);
      const f = (await res.json()) as OceanFlow;
      if (dead) return;
      if (!f?.nx || !f.swell || f.u?.length !== f.nx * f.ny) throw new Error("ocean: unexpected answer");
      ocean.setFlow(f);
      flowKind = "live";
      oceanCredit("ocean-flow");
    } catch (e) {
      if (dead) return;
      console.warn("[ocean]", e instanceof Error ? e.message : e);
      // The layer keeps (or falls back to) its own illustrative drift, and the credits say so.
      if (flowKind !== "live") {
        flowKind = "sketch";
        oceanCredit("ocean-sketch");
      }
    }
    m.triggerRepaint();
  }

  // The surf line: the ocean polygons' own edge (the basemap's coastline, so it is exact), right above the
  // wave marks and under the clouds.
  const surf = new SurfPattern();
  surf.draw(now());
  if (!m.hasImage(SURF_IMAGE)) m.addImage(SURF_IMAGE, surf, { pixelRatio: 2 });
  if (!m.getLayer(SURF_LAYER) && m.getLayer(OCEAN_LAYER)) {
    const ids = m.getLayersOrder();
    m.addLayer(
      {
        id: SURF_LAYER,
        type: "line",
        source: "omt",
        "source-layer": "water",
        filter: ["==", ["get", "class"], "ocean"],
        maxzoom: SURF_MAX_Z,
        layout: { "line-join": "round" },
        paint: {
          "line-pattern": SURF_IMAGE,
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 4, 8, 7, SURF_MAX_Z, 10],
          // Shifted onto the water: centred on the coastline, half the band lay on pale land and vanished.
          "line-offset": ["interpolate", ["linear"], ["zoom"], 5, 1.5, 8, 2.8, SURF_MAX_Z, 4],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.9, 8.5, 0.9, SURF_MAX_Z, 0],
        },
      },
      ids[ids.indexOf(OCEAN_LAYER) + 1],
    );
  }

  let cloudsOn = opts.clouds;
  let layer: CloudLayer | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let refetch: ReturnType<typeof setInterval> | null = null;
  let oceanRefetch: ReturnType<typeof setInterval> | null = null;
  let dead = false;

  const cloudsVisible = () => !!(cloudsOn && layer && m.getZoom() < cloudsMaxZoom(m, small.matches));
  const wavesVisible = () => opts.waves !== false && m.getZoom() < WAVES_MAX_Z;

  function frame() {
    if (!wavesVisible() && !cloudsVisible() && !shimmer?.visible()) return stop();
    if (shimmer?.visible()) shimmer.draw(now());
    if (wavesVisible()) ocean.t = now();
    if (m.getZoom() < SURF_MAX_Z) surf.draw(now());
    // The clouds advance themselves when the map draws them; all they need is the repaint.
    m.triggerRepaint();
  }

  function start() {
    if (reduce() || timer || document.hidden || (!wavesVisible() && !cloudsVisible() && !shimmer?.visible())) return;
    timer = setInterval(frame, 1000 / FPS);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }
  // Lakes, the Delta and the major rivers (lib/water.ts): below the ocean layers, so below every land
  // fill, line, name and mark. Not on phones.
  const shimmer: Shimmer | null = small.matches ? null : addShimmer(m, { before: () => (m.getLayer("water-ocean") ? "water-ocean" : undefined), onChange: () => start() });
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVis);
  // Zooming back out past the fade zooms restarts the ticker.
  m.on("zoomend", start);
  // Reduced motion switched on while the map is open: hold the current frame.
  const onMotion = () => {
    if (layer) layer.still = reduce();
    if (reduce()) stop();
    else {
      wantOcean();
      start();
    }
  };
  motion.addEventListener?.("change", onMotion);
  small.addEventListener?.("change", onMotion);

  // Layers added later (public lands, the sovereign-lands tint, a private build's own) go in below the
  // county lines too, which would put them over the clouds: keep the clouds directly under the lines.
  const keepOrder = () => {
    if (dead || !layer || !m.getLayer(CLOUD_LAYER) || !m.getLayer(CLOUDS_BELOW)) return;
    // getLayersOrder, not getStyle: a custom layer is not part of the serialized style.
    const ids = m.getLayersOrder();
    if (ids[ids.indexOf(CLOUD_LAYER) + 1] !== CLOUDS_BELOW) m.moveLayer(CLOUD_LAYER, CLOUDS_BELOW);
  };
  m.on("styledata", keepOrder);

  async function loadClouds() {
    try {
      const res = await fetch(opts.cloudsUrl ?? "/api/clouds");
      if (!res.ok) throw new Error(`clouds ${res.status}`);
      const g = (await res.json()) as CloudGrid;
      if (dead || !g?.nx) return;
      if (layer) layer.setGrid(g);
      else {
        layer = new CloudLayer(g, opts.maskUrl);
        layer.on = cloudsOn;
        layer.still = reduce();
        layer.lite = small.matches;
        m.addLayer(layer, m.getLayer(CLOUDS_BELOW) ? CLOUDS_BELOW : undefined);
        // A custom layer has no source to carry a credit: an empty source with Open-Meteo's attribution,
        // used by a layer that is visible only while the clouds are, puts it in the attribution control.
        m.addSource(CLOUD_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] }, attribution: CLOUDS_CREDIT });
        m.addLayer({ id: CLOUD_CREDIT_LAYER, type: "line", source: CLOUD_SOURCE, layout: { visibility: cloudsOn ? "visible" : "none" } }, CLOUD_LAYER);
        m.setLayoutProperty(CLOUD_LAYER, "visibility", cloudsOn ? "visible" : "none");
      }
      opts.onClouds?.(g.time);
      m.triggerRepaint();
      start();
    } catch (e) {
      console.warn("[clouds]", e instanceof Error ? e.message : e);
      opts.onClouds?.(null);
    }
  }

  // Nothing is fetched until clouds are on (by default; a switch for readers who prefer reduced motion). A page left open then picks up new clouds every three hours (the route's cache period).
  function wantClouds() {
    if (refetch || dead) return;
    loadClouds();
    refetch = setInterval(loadClouds, 3 * 3600 * 1000);
  }
  if (cloudsOn) wantClouds();
  // The sea's motion is only asked for where it will be seen moving (not for a still frame), and again
  // every three hours on a page left open.
  function wantOcean() {
    if (oceanRefetch || dead || reduce() || opts.waves === false) return;
    loadOcean();
    oceanRefetch = setInterval(loadOcean, 3 * 3600 * 1000);
  }
  wantOcean();
  start();

  return {
    running: () => timer !== null,
    oceanFlow: () => flowKind,
    shimmer: () => shimmer?.cells() ?? { shown: 0, hidden: 0, loaded: false },
    cloudsShown: cloudsVisible,
    cloudLevels() {
      const down = m.getZoom() - cloudBase(m);
      const lite = small.matches;
      const L = cloudLevelsFor(m);
      const f = (l: { from: number; to: number; hold: number }) => +levelAt(l, down).fade.toFixed(3);
      return { low: f(lite ? CLOUD_LITE : L.low), mid: lite ? 0 : f(L.mid), high: lite ? 0 : f(L.high), base: cloudBase(m), lite };
    },
    setClouds(on) {
      cloudsOn = on;
      if (on) wantClouds();
      if (layer) layer.on = on;
      for (const id of [CLOUD_LAYER, CLOUD_CREDIT_LAYER]) if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      m.triggerRepaint();
      start();
    },
    destroy() {
      dead = true;
      stop();
      shimmer?.destroy();
      if (refetch) clearInterval(refetch);
      if (oceanRefetch) clearInterval(oceanRefetch);
      document.removeEventListener("visibilitychange", onVis);
      motion.removeEventListener?.("change", onMotion);
      small.removeEventListener?.("change", onMotion);
      m.off("zoomend", start);
      m.off("styledata", keepOrder);
    },
  };
}
