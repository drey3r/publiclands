import type { CustomLayerInterface, CustomRenderMethodInput, Map as MLMap, StyleImageInterface } from "maplibre-gl";

/**
 * Ambience: the ocean's moving wave marks, the surf line along the coast, and the live cloud layer.
 *
 * Both run off one slow ticker (about 12 frames a second, never 60) that only asks the map to
 * repaint, so the map can still rest and fire `idle` between frames. The clouds are three layers
 * (high, mid, low) shaded on the GPU in one draw call a frame, passed one after another as the reader
 * zooms in; phones get one light layer, still. The wave tile is a small canvas redrawn each tick. The ticker
 * stops past the zooms where waves and clouds have faded, while the tab is hidden, on screens
 * 600 px wide or less, and when the reader prefers reduced motion (one still frame instead).
 */

const FPS = 12;
/** Wave marks fade out by this zoom; past it the ticker stops (lease marks and icons own the water there). */
export const WAVES_MAX_Z = 11;
/**
 * Three cloud layers, each passed in turn as the reader comes down: high cloud first, then mid, then
 * low cloud and fog. Per layer: [whole until, gone by] in zoom levels below Home, how far it sits off
 * the ground at Home (its parallax when panning: 1 = on the ground), how much further it spreads from
 * the map's centre while it is passed, and its drift in screen pixels a second.
 */
const CLOUD_LEVELS = {
  low: { from: 1.5, to: 3.5, lift: 1.012, spread: 0.2, drift: 2.0 },
  mid: { from: 0.8, to: 2.2, lift: 1.03, spread: 0.3, drift: 2.6 },
  high: { from: 0.25, to: 1.3, lift: 1.055, spread: 0.42, drift: 3.4 },
} as const;
/** Phones draw one light layer (all three covers merged, no shading), still, gone a little sooner. */
const CLOUD_LITE = { from: 1.2, to: 3.0 };
/** "Home" for the descent: the map's lowest zoom, held to a sane range on very small or very large maps. */
const cloudBase = (m: MLMap) => Math.min(6.2, Math.max(4.5, m.getMinZoom()));
/** The zoom by which every cloud layer is gone, before lease detail matters. */
export const cloudsMaxZoom = (m: MLMap, lite = false) => cloudBase(m) + (lite ? CLOUD_LITE.to : CLOUD_LEVELS.low.to);
/** However overcast, the three layers together never pass this opacity: the map stays readable under them. */
const CLOUD_CAP = 0.6;
/**
 * Clouds sit right below this layer: above every land fill, tint and mask (the map inserts all of
 * those below the county lines), and below county lines, state lines, every name, mark and outline.
 */
const CLOUDS_BELOW = "county-line";
const CLOUD_CREDIT_LAYER = "clouds-credit";
export const WAVE_IMAGE = "ocean-waves";
/** The surf line fades out by this zoom, before shore leases and their icons matter. */
export const SURF_MAX_Z = 10;
export const SURF_IMAGE = "surf-line";
export const SURF_LAYER = "surf-line";
const SURF_W = 128;
const SURF_H = 12;
/** Seconds for one breath of the surf line. */
const SURF_BREATH_S = 6.5;
/** Seconds for one swell (a band of brighter wave marks) to pass a point. */
const SWELL_S = 7;
export const CLOUD_SOURCE = "clouds";
export const CLOUD_LAYER = "clouds";
/** Open-Meteo's CC BY 4.0 credit, shown in the map's attribution only while the clouds are drawn. */
const CLOUDS_CREDIT = 'Clouds: <a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, smoothed and drawn as clouds)';

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
// Ocean: an animated fill pattern of short engraved wave strokes

type Mark = { x: number; y: number; len: number; phase: number; period: number; bob: number; weight: number };

/**
 * A seamless tile of wave strokes. A slow swell brightens and lengthens the strokes in bands that
 * travel shoreward (east) while the whole field drifts the same way, like the wave marks on an
 * engraved chart set gently moving.
 */
export class WavePattern implements StyleImageInterface {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  private ctx: CanvasRenderingContext2D;
  private marks: Mark[] = [];
  private dirty = true;
  private size: number;
  private ratio: number;

  constructor(size = 240, ratio = 2) {
    this.size = size;
    this.ratio = ratio;
    this.width = this.height = size * ratio;
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
    const c = document.createElement("canvas");
    c.width = c.height = this.width;
    this.ctx = c.getContext("2d", { willReadFrequently: true })!;
    // Scattered by rejection sampling (no two marks crowd each other), so the tile never reads as a grid.
    const r = rng(1579);
    const want = 30;
    for (let tries = 0; this.marks.length < want && tries < 4000; tries++) {
      const x = r() * size;
      const y = r() * size;
      const ok = this.marks.every((m) => {
        const dx = Math.min(Math.abs(m.x - x), size - Math.abs(m.x - x));
        const dy = Math.min(Math.abs(m.y - y), size - Math.abs(m.y - y));
        return (dx / 30) ** 2 + (dy / 13) ** 2 > 1;
      });
      if (!ok) continue;
      this.marks.push({ x, y, len: 7 + r() * 12, phase: r() * Math.PI * 2, period: 6 + r() * 7, bob: r() * Math.PI * 2, weight: 0.45 + r() * 0.55 });
    }
  }

  /** Draw the frame for time `t` (seconds). */
  draw(t: number) {
    const { ctx, size, ratio } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = "round";
    const drift = (t * 2.2) % size; // css px a second, shoreward
    for (const m of this.marks) {
      const x0 = (m.x + drift) % size;
      // Swell: a slow band of brighter marks crosses the tile shoreward (two crests a tile, so it tiles),
      // a little faster than the marks drift; each mark also keeps its own slower breath.
      const swell = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (t / SWELL_S - (2 * x0) / size - (0.6 * m.y) / size));
      const own = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / m.period + m.phase);
      const breath = 0.6 * swell + 0.4 * own;
      const a = m.weight * (0.25 + 0.75 * breath);
      const len = m.len * (0.8 + 0.25 * breath);
      const y0 = m.y + 1.1 * Math.sin(t * 0.55 + m.bob) * (0.4 + 0.6 * swell);
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          const x = x0 + dx;
          const y = y0 + dy;
          if (x < -len || x > size + len || y < -6 || y > size + 6) continue;
          this.stroke(x, y, len, a);
        }
      }
    }
    this.dirty = true;
  }

  private stroke(x: number, y: number, len: number, a: number) {
    const { ctx } = this;
    const h = len / 2;
    const path = (oy: number) => {
      // A swash: a low crest that eases into a shallow trough, like a wave mark on an old chart.
      ctx.beginPath();
      ctx.moveTo(x - h, y + oy + 0.6);
      ctx.bezierCurveTo(x - h * 0.55, y + oy - 1.5, x - h * 0.1, y + oy - 1.5, x + h * 0.2, y + oy);
      ctx.bezierCurveTo(x + h * 0.5, y + oy + 1.1, x + h * 0.8, y + oy + 0.9, x + h, y + oy + 0.1);
      ctx.stroke();
    };
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = `rgba(104,138,158,${(0.3 * a).toFixed(3)})`;
    path(1);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = `rgba(246,250,252,${(0.72 * a).toFixed(3)})`;
    path(0);
  }

  render() {
    if (!this.dirty) return false;
    this.dirty = false;
    this.data.set(this.ctx.getImageData(0, 0, this.width, this.height).data);
    return true;
  }
}

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

const NOISE = 256;
/** One noise tile spans this many degrees of longitude (its largest billows are a quarter of that). */
const NOISE_DEG = 7;

const CLOUD_VERT = `#version 300 es
uniform mat4 u_matrix;
in vec2 a_pos;
out vec2 v_m;
void main() {
  v_m = a_pos;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`;

/**
 * Per pixel and per layer: where on the weather grid is this (smoothly interpolated cover), and does the
 * drifting noise there pass the threshold that cover sets? Thin cover leaves scattered puffs, full
 * cover a deck with soft cells in it. Each layer is looked up a little further from the map's centre
 * than the ground under it (its height), has its own drift, and is eroded and faded on its own as the
 * reader descends past it. Low cloud and fog: broad billows, shaded on the side away from the light,
 * with a faint ground shadow. Mid cloud: smaller, flatter cells. High cloud: thin streaks. All of it
 * is white at low opacity with wide soft edges, and the sum is capped so an overcast sky stays a veil.
 */
const CLOUD_COMMON = `#version 300 es
precision highp float;
in vec2 v_m;
uniform sampler2D u_cover;
uniform sampler2D u_noise;
uniform vec4 u_ext;     // lon0, lat0, lon span, lat span of the grid points (degrees)
uniform vec2 u_res;     // grid points across and up
uniform vec2 u_center;  // the map's centre (mercator)
uniform vec3 u_spread;  // low, mid, high: >= 1, how far from the centre each layer is looked up
uniform vec3 u_fade;    // low, mid, high: opacity for this zoom
uniform vec3 u_thin;    // low, mid, high: 0..1, how far the reader has descended through each
uniform vec2 u_d1;      // drift of the low cloud (noise units)
uniform vec2 u_d2;      // drift of the high cloud
uniform vec2 u_d3;      // drift of the mid cloud
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
vec2 lifted(float s) { return u_center + (v_m - u_center) / s; }
vec2 rot(vec2 p, float c, float s) { return vec2(p.x * c - p.y * s, p.x * s + p.y * c); }
// All layers together, held under the cap (nearly linear for thin cloud, flattening toward overcast).
float capped(float a) { return u_cap * (1.0 - exp(-2.0 * a)) / 0.8647; }
`;

const CLOUD_FRAG = CLOUD_COMMON + `
// Low cloud and fog: billows from drifting noise at three scales (each turned a different way, so no
// grid shows), eroded as the reader descends.
float lowCloud(vec2 m, float d) {
  if (d < 0.02) return 0.0;
  vec2 q = m * u_k;
  float n = 0.55 * texture(u_noise, rot(q, 0.94, 0.34) + u_d1).r
          + 0.3 * texture(u_noise, rot(q, 0.8, -0.6) * 2.3 + u_d1 * 1.6).g
          + 0.15 * texture(u_noise, rot(q, 0.5, 0.87) * 5.3 + u_d1 * 2.6).r;
  // Cover to threshold, leaning toward drawing: a point the model calls overcast always shows some cloud,
  // whatever the noise is doing there (a lone 100% point over Sacramento drew nothing with a linear map).
  float th = 0.5 + 0.42 * (1.0 - 2.0 * pow(d, 0.62)) + 0.3 * u_thin.x;
  float a = smoothstep(th - 0.13, th + 0.22, n) * smoothstep(0.02, 0.12, d);
  // Inside a deck: broad soft swells of thicker and thinner cloud, never a flat sheet.
  float swell = 0.6 * texture(u_noise, rot(q, 0.77, 0.64) * 1.7 + u_d1 * 1.3).g + 0.4 * texture(u_noise, rot(q, 0.26, -0.97) * 3.9 + u_d1 * 2.2).a;
  return a * mix(0.55, 1.0, smoothstep(0.3, 0.7, swell));
}

void main() {
  // Low.
  vec2 m1 = lifted(u_spread.x);
  float lowRaw = u_fade.x > 0.0 ? lowCloud(m1, cover(m1).x) : 0.0;
  float low = 0.72 * lowRaw * u_fade.x;
  // Mid: smaller, flatter cells in loose fields.
  float mid = 0.0;
  if (u_fade.y > 0.0) {
    vec2 m2 = lifted(u_spread.y);
    float d = cover(m2).y;
    if (d > 0.02) {
      vec2 q = m2 * u_k;
      float n = 0.5 * texture(u_noise, rot(q, 0.6, 0.8) * 1.6 + u_d3).g
              + 0.5 * texture(u_noise, rot(q, 0.98, -0.2) * 3.7 + u_d3 * 2.3).a;
      float th = 0.5 + 0.4 * (1.0 - 2.0 * pow(d, 0.7)) + 0.3 * u_thin.y;
      mid = 0.46 * smoothstep(th - 0.12, th + 0.26, n) * smoothstep(0.02, 0.14, d) * u_fade.y;
    }
  }
  // High: thin streaks.
  float hi = 0.0;
  if (u_fade.z > 0.0) {
    vec2 m3 = lifted(u_spread.z);
    float d = cover(m3).z;
    if (d > 0.02) {
      vec2 q = m3 * u_k;
      float s = 0.7 * texture(u_noise, vec2(q.x * 0.55, q.y * 1.5) + u_d2).b + 0.3 * texture(u_noise, q * 1.9 + u_d2 * 1.4).r;
      float th = 0.5 + 0.42 * (1.0 - 2.0 * d) + 0.3 * u_thin.z;
      hi = 0.3 * smoothstep(th - 0.16, th + 0.34, s) * smoothstep(0.02, 0.15, d) * u_fade.z;
    }
  }
  float a = capped(1.0 - (1.0 - low) * (1.0 - mid) * (1.0 - hi));
  // The same low cloud a little toward the light (northwest, like the hillshade). Where it is thicker
  // there, this point is on a billow's far side: tint it a pale cool white, so the tops have form.
  // Where this point has no cloud, that neighbour casts a faint shadow on the ground. Over pale
  // land plain white has nothing to stand against; this modelling is what makes valley fog read.
  float shade = 0.0;
  float sh = 0.0;
  if (u_fade.x > 0.0) {
    vec2 ms = m1 - vec2(1.4, 1.4) / (u_k * float(${NOISE}));
    float toward = lowCloud(ms, cover(ms).x);
    shade = clamp((toward - lowRaw) * 2.2, 0.0, 1.0) * low / max(a, 0.001);
    sh = 0.16 * toward * (1.0 - a) * u_fade.x;
  }
  vec3 body = mix(vec3(1.0), vec3(0.74, 0.8, 0.88), 0.75 * clamp(shade, 0.0, 1.0));
  o = vec4(body * a + vec3(0.2, 0.26, 0.34) * sh, a + sh);
}`;

/** Phones: one layer from the three covers merged, two noise lookups, no shading. */
const CLOUD_FRAG_LITE = CLOUD_COMMON + `
void main() {
  if (u_fade.x <= 0.0) discard;
  vec2 m = lifted(u_spread.x);
  vec3 c = cover(m);
  float d = 1.0 - (1.0 - c.x) * (1.0 - 0.8 * c.y) * (1.0 - 0.5 * c.z);
  float a = 0.0;
  if (d > 0.02) {
    vec2 q = m * u_k;
    float n = 0.65 * texture(u_noise, rot(q, 0.94, 0.34) + u_d1).r + 0.35 * texture(u_noise, rot(q, 0.8, -0.6) * 2.3 + u_d1 * 1.6).g;
    float th = 0.5 + 0.42 * (1.0 - 2.0 * pow(d, 0.62)) + 0.3 * u_thin.x;
    a = 0.8 * smoothstep(th - 0.13, th + 0.22, n) * smoothstep(0.02, 0.12, d) * u_fade.x;
  }
  a = capped(a);
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
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private grid: CloudGrid;
  private dirty = true;
  private d1: [number, number] = [0.13, 0.71];
  private d2: [number, number] = [0.57, 0.29];
  private d3: [number, number] = [0.31, 0.83];
  private last = 0;

  constructor(g: CloudGrid) {
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
    for (const u of ["u_matrix", "u_cover", "u_noise", "u_ext", "u_res", "u_center", "u_spread", "u_fade", "u_thin", "u_d1", "u_d2", "u_d3", "u_k", "u_cap"]) this.uni[u] = gl.getUniformLocation(p, u);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    this.cover = gl.createTexture();
    // Four noise fields in one repeating texture: billows (r, g), cirrus streaks (b), fine cells (a).
    const ch = [fbm(NOISE, 7, 6, 4), fbm(NOISE, 31, 5, 4), fbm(NOISE, 53, 4, 4, 4), fbm(NOISE, 97, 4, 8)];
    const px = new Uint8Array(NOISE * NOISE * 4);
    for (let i = 0; i < NOISE * NOISE; i++) for (let c = 0; c < 4; c++) px[i * 4 + c] = Math.round(ch[c][i] * 255);
    this.noise = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, NOISE, NOISE, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.dirty = true;
  }

  onRemove(_map: MLMap, gl: WebGL2RenderingContext) {
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.cover);
    gl.deleteTexture(this.noise);
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
    const L = CLOUD_LEVELS;
    const levels = this.lite ? [{ ...L.low, ...CLOUD_LITE }] : [L.low, L.mid, L.high];
    const thin = [0, 0, 0];
    const fade = [0, 0, 0];
    const spread = [1, 1, 1];
    levels.forEach((l, i) => {
      thin[i] = smooth(l.from, l.to, down);
      fade[i] = 1 - smooth(l.from + 0.25 * (l.to - l.from), l.to, down);
      spread[i] = l.lift + l.spread * thin[i];
    });
    if (Math.max(...fade) <= 0) return;
    if (this.dirty) this.upload(gl);
    const g = this.grid;
    const k = 360 / NOISE_DEG;
    // Drift: a steady few screen pixels a second along the real wind at each height, whatever the
    // zoom (advanced per frame, so zooming never makes the clouds jump).
    const t = performance.now() / 1000;
    const dt = this.last ? Math.min(0.25, t - this.last) : 0;
    this.last = t;
    if (!this.still && dt > 0) {
      const perPx = k / (512 * 2 ** z); // noise units per screen pixel
      const step = (d: [number, number], w: [number, number], pxPerS: number) => {
        const sp = Math.hypot(w[0], w[1]) || 1;
        // The texture moves against the lookup; mercator y grows south.
        d[0] = (d[0] - (w[0] / sp) * pxPerS * perPx * dt) % 1;
        d[1] = (d[1] + (w[1] / sp) * pxPerS * perPx * dt) % 1;
      };
      step(this.d1, g.wind, L.low.drift);
      step(this.d3, g.windMid ?? g.wind, L.mid.drift);
      step(this.d2, g.windHigh ?? g.wind, L.high.drift);
    }
    const c = m.getCenter();
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uni.u_matrix, false, args.defaultProjectionData.mainMatrix as Float32Array);
    gl.uniform4f(this.uni.u_ext, g.lon0, g.lat0, (g.nx - 1) * g.step, (g.ny - 1) * g.step);
    gl.uniform2f(this.uni.u_res, g.nx, g.ny);
    gl.uniform2f(this.uni.u_center, (c.lng + 180) / 360, 0.5 - mercY(c.lat) / (2 * Math.PI));
    gl.uniform3f(this.uni.u_spread, spread[0], spread[1], spread[2]);
    gl.uniform3f(this.uni.u_fade, fade[0], fade[1], fade[2]);
    gl.uniform3f(this.uni.u_thin, thin[0], thin[1], thin[2]);
    gl.uniform2f(this.uni.u_d1, this.d1[0], this.d1[1]);
    gl.uniform2f(this.uni.u_d2, this.d2[0], this.d2[1]);
    gl.uniform2f(this.uni.u_d3, this.d3[0], this.d3[1]);
    gl.uniform1f(this.uni.u_k, k);
    gl.uniform1f(this.uni.u_cap, CLOUD_CAP);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cover);
    gl.uniform1i(this.uni.u_cover, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    gl.uniform1i(this.uni.u_noise, 1);
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
  /** Whether the animation ticker is running (for the browser checks). */
  running: () => boolean;
  /** Whether clouds are being drawn at this zoom (for the browser checks). */
  cloudsShown: () => boolean;
  /** Each cloud layer's opacity (0..1) at this zoom, and the zoom the descent starts from (for the browser checks). */
  cloudLevels: () => { low: number; mid: number; high: number; base: number; lite: boolean };
  destroy: () => void;
};

/**
 * Adds the wave pattern over the ocean (`ocean-waves`, right above `water-ocean`) and, once
 * /api/clouds answers, the cloud layer right below the county lines. Returns switches.
 */
export function addAmbience(
  m: MLMap,
  opts: { clouds: boolean; waves?: boolean; cloudsUrl?: string; onClouds?: (time: string | null) => void },
): Ambience {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Phones get the same still frame: measured on a 390 px viewport at 4x CPU throttle, the ticker's
  // repaints cost ~5-10% of panning frame rate.
  const small = window.matchMedia("(max-width: 600px)");
  const reduce = () => motion.matches || small.matches;
  const waves = new WavePattern();
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000 + 40; // start mid-cycle, never at a blank frame
  waves.draw(now());
  if (!m.hasImage(WAVE_IMAGE)) m.addImage(WAVE_IMAGE, waves, { pixelRatio: 2 });
  if (!m.getLayer("ocean-waves") && m.getLayer("water-ocean")) {
    // Right above the sea-floor depth (or the plain ocean), so the State sovereign lands tint, which
    // ogLayers.addWaters puts below the depth, never covers them.
    const ids = m.getStyle().layers.map((l) => l.id);
    const before = ids[ids.indexOf(m.getLayer("ocean-depth") ? "ocean-depth" : "water-ocean") + 1];
    m.addLayer(
      {
        id: "ocean-waves",
        type: "fill",
        source: "omt",
        "source-layer": "water",
        filter: ["==", ["get", "class"], "ocean"],
        paint: { "fill-pattern": WAVE_IMAGE, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.85, 8.5, 0.85, 10, 0.4, WAVES_MAX_Z, 0] },
        maxzoom: WAVES_MAX_Z,
      },
      before,
    );
  }

  // The surf line: the ocean polygons' own edge (the basemap's coastline, so it is exact), right above the
  // wave marks and under the clouds.
  const surf = new SurfPattern();
  surf.draw(now());
  if (!m.hasImage(SURF_IMAGE)) m.addImage(SURF_IMAGE, surf, { pixelRatio: 2 });
  if (!m.getLayer(SURF_LAYER) && m.getLayer("ocean-waves")) {
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
      ids[ids.indexOf("ocean-waves") + 1],
    );
  }

  let cloudsOn = opts.clouds;
  let layer: CloudLayer | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let refetch: ReturnType<typeof setInterval> | null = null;
  let dead = false;

  const cloudsVisible = () => !!(cloudsOn && layer && m.getZoom() < cloudsMaxZoom(m, small.matches));
  const wavesVisible = () => opts.waves !== false && m.getZoom() < WAVES_MAX_Z;

  function frame() {
    if (!wavesVisible() && !cloudsVisible()) return stop();
    if (wavesVisible()) waves.draw(now());
    if (m.getZoom() < SURF_MAX_Z) surf.draw(now());
    // The clouds advance themselves when the map draws them; all they need is the repaint.
    m.triggerRepaint();
  }

  function start() {
    if (reduce() || timer || document.hidden || (!wavesVisible() && !cloudsVisible())) return;
    timer = setInterval(frame, 1000 / FPS);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVis);
  // Zooming back out past the fade zooms restarts the ticker.
  m.on("zoomend", start);
  // Reduced motion switched on while the map is open: hold the current frame.
  const onMotion = () => {
    if (layer) layer.still = reduce();
    if (reduce()) stop();
    else start();
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
        layer = new CloudLayer(g);
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
  start();

  return {
    running: () => timer !== null,
    cloudsShown: cloudsVisible,
    cloudLevels() {
      const down = m.getZoom() - cloudBase(m);
      const lite = small.matches;
      const f = (l: { from: number; to: number }) => +(1 - smooth(l.from + 0.25 * (l.to - l.from), l.to, down)).toFixed(3);
      return { low: f(lite ? CLOUD_LITE : CLOUD_LEVELS.low), mid: lite ? 0 : f(CLOUD_LEVELS.mid), high: lite ? 0 : f(CLOUD_LEVELS.high), base: cloudBase(m), lite };
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
      if (refetch) clearInterval(refetch);
      document.removeEventListener("visibilitychange", onVis);
      motion.removeEventListener?.("change", onMotion);
      small.removeEventListener?.("change", onMotion);
      m.off("zoomend", start);
      m.off("styledata", keepOrder);
    },
  };
}
