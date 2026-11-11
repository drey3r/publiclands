import type { CustomLayerInterface, CustomRenderMethodInput, Map as MLMap, StyleImageInterface } from "maplibre-gl";

/**
 * Ambience: the ocean's moving wave marks and the live cloud layer.
 *
 * Both run off one slow ticker (about 12 frames a second, never 60) that only asks the map to
 * repaint, so the map can still rest and fire `idle` between frames. The clouds are shaded on the
 * GPU (one draw call a frame); the wave tile is a small canvas redrawn each tick. The ticker
 * stops past the zooms where waves and clouds have faded, while the tab is hidden, on screens
 * 600 px wide or less, and when the reader prefers reduced motion (one still frame instead).
 */

const FPS = 12;
/** Wave marks fade out by this zoom; past it the ticker stops (lease marks and icons own the water there). */
export const WAVES_MAX_Z = 11;
/** Clouds are whole up to this zoom, then thin, spread and fade, as if the reader descends through them… */
const CLOUDS_FULL_Z = 5.9;
/** …and are gone by this zoom, before lease detail matters. */
export const CLOUDS_MAX_Z = 7.6;
const cloudFade = (z: number) => 1 - smooth(CLOUDS_FULL_Z + 0.3, CLOUDS_MAX_Z, z);
/** Drift along the wind, in screen pixels a second: slow enough to notice only after a few seconds. */
const CLOUD_DRIFT_PX = 2.4;
/** How far the field spreads from the map's centre by the time it has faded (0.2 = 20%). */
const CLOUD_SPREAD = 0.2;
/**
 * Clouds sit right below this layer: above every land fill, tint and mask (the map inserts all of
 * those below the county lines), and below county lines, state lines, every name, mark and outline.
 */
const CLOUDS_BELOW = "county-line";
const CLOUD_CREDIT_LAYER = "clouds-credit";
export const WAVE_IMAGE = "ocean-waves";
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
 * A seamless tile of wave strokes. Each stroke breathes in and out on its own slow cycle while the
 * whole field drifts gently shoreward (east), like the wave marks on an engraved chart.
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
    const want = 26;
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
    const drift = (t * 1.6) % size; // css px a second, shoreward
    for (const m of this.marks) {
      const breath = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / m.period + m.phase);
      const a = m.weight * (0.25 + 0.75 * breath);
      const len = m.len * (0.8 + 0.2 * breath);
      const x0 = (m.x + drift) % size;
      const y0 = m.y + 0.7 * Math.sin(t * 0.55 + m.bob);
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
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = `rgba(118,148,166,${(0.22 * a).toFixed(3)})`;
    path(0.9);
    ctx.lineWidth = 0.95;
    ctx.strokeStyle = `rgba(244,248,250,${(0.55 * a).toFixed(3)})`;
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
 * Per pixel: where on the weather grid is this (smoothly interpolated cover), and does the drifting
 * noise there pass the threshold that cover sets? Thin cover leaves scattered puffs, full cover a
 * deck with soft cells in it. High cloud is a thinner, streakier veil. All of it is plain white at
 * low opacity, with wide soft edges; the only dark is a very faint shadow to the southeast.
 */
const CLOUD_FRAG = `#version 300 es
precision highp float;
in vec2 v_m;
uniform sampler2D u_cover;
uniform sampler2D u_noise;
uniform vec4 u_ext;     // lon0, lat0, lon span, lat span of the grid points (degrees)
uniform vec2 u_res;     // grid points across and up
uniform vec2 u_center;  // the map's centre (mercator)
uniform float u_spread; // >= 1: clouds slide outward from the centre as the reader zooms in
uniform float u_fade;   // overall opacity for this zoom
uniform float u_thin;   // 0..1: how far the reader has descended into them
uniform vec2 u_d1;      // drift of the low cloud (noise units)
uniform vec2 u_d2;      // drift of the high cloud
uniform float u_k;      // mercator -> noise units
out vec4 o;
const float PI = 3.141592653589793;

// Cover at a mercator point: x low, y mid, z high (0..1). Cubic B-spline over the grid (four
// bilinear taps), so neither the half-degree cells nor single odd points show.
vec3 cover(vec2 m) {
  float lon = m.x * 360.0 - 180.0;
  float lat = degrees(atan(sinh(PI * (1.0 - 2.0 * m.y))));
  vec2 uv = vec2((lon - u_ext.x) / u_ext.z, (lat - u_ext.y) / u_ext.w);
  vec2 p = uv * (u_res - 1.0) + 0.5;
  vec2 i = floor(p - 0.5) + 0.5;
  vec2 f = p - i;
  vec2 w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f * f + 3.0 * f * f * f) / 6.0;
  vec2 w3 = f * f * f / 6.0;
  vec2 w2 = 1.0 - w0 - w1 - w3;
  vec2 s0 = w0 + w1;
  vec2 s1 = w2 + w3;
  vec2 t0 = (i - 1.0 + w1 / s0) / u_res;
  vec2 t1 = (i + 1.0 + w3 / s1) / u_res;
  vec3 c = (texture(u_cover, vec2(t0.x, t0.y)).rgb * s0.x + texture(u_cover, vec2(t1.x, t0.y)).rgb * s1.x) * s0.y
         + (texture(u_cover, vec2(t0.x, t1.y)).rgb * s0.x + texture(u_cover, vec2(t1.x, t1.y)).rgb * s1.x) * s1.y;
  // The grid ends far outside any view of California; feather it anyway.
  vec2 e = min(uv, 1.0 - uv);
  return c * smoothstep(0.0, 0.07, e.x) * smoothstep(0.0, 0.07, e.y);
}

vec2 rot(vec2 p, float c, float s) { return vec2(p.x * c - p.y * s, p.x * s + p.y * c); }

// Low and mid cloud: billows from drifting noise at three scales (each turned a different way, so no
// grid shows), eroded as the reader descends.
float lowCloud(vec2 m, vec3 c) {
  float d = 1.0 - (1.0 - c.x) * (1.0 - 0.8 * c.y);
  if (d < 0.02) return 0.0;
  vec2 q = m * u_k;
  float n = 0.55 * texture(u_noise, rot(q, 0.94, 0.34) + u_d1).r
          + 0.3 * texture(u_noise, rot(q, 0.8, -0.6) * 2.3 + u_d1 * 1.6).g
          + 0.15 * texture(u_noise, rot(q, 0.5, 0.87) * 5.3 + u_d1 * 2.6).r;
  float th = 0.5 + 0.42 * (1.0 - 2.0 * d) + 0.3 * u_thin;
  float a = smoothstep(th - 0.13, th + 0.22, n) * smoothstep(0.02, 0.12, d);
  // Inside a deck: broad soft swells of thicker and thinner cloud, never a flat sheet.
  float swell = 0.6 * texture(u_noise, rot(q, 0.77, 0.64) * 1.7 + u_d1 * 1.3).g + 0.4 * texture(u_noise, rot(q, 0.26, -0.97) * 3.9 + u_d1 * 2.2).a;
  return a * mix(0.55, 1.0, smoothstep(0.3, 0.7, swell));
}

void main() {
  // Lifted off the map: as the reader zooms in the field spreads from the centre a little faster
  // than the ground does.
  vec2 m = u_center + (v_m - u_center) / u_spread;
  vec3 c = cover(m);
  float low = 0.68 * lowCloud(m, c);
  // High cloud: thin streaks.
  float hi = 0.0;
  if (c.z > 0.02) {
    vec2 q = m * u_k;
    float s = 0.7 * texture(u_noise, vec2(q.x * 0.55, q.y * 1.5) + u_d2).b + 0.3 * texture(u_noise, q * 1.9 + u_d2 * 1.4).r;
    float th = 0.5 + 0.42 * (1.0 - 2.0 * c.z) + 0.3 * u_thin;
    hi = 0.3 * smoothstep(th - 0.16, th + 0.34, s) * smoothstep(0.02, 0.15, c.z);
  }
  float a = 1.0 - (1.0 - low) * (1.0 - hi);
  // A very faint shadow, cast to the southeast like the hillshade's light, only where no cloud is.
  vec2 ms = m - vec2(0.9, 0.9) / (u_k * float(${NOISE}));
  float sh = 0.075 * lowCloud(ms, cover(ms)) * (1.0 - a);
  o = vec4(vec3(a) + vec3(0.2, 0.26, 0.34) * sh, a + sh) * u_fade;
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
  /** No drift and no spread: readers who prefer reduced motion, and phones. */
  still = false;
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
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, CLOUD_FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn("[clouds] program", gl.getProgramInfoLog(p));
      return;
    }
    this.program = p;
    for (const u of ["u_matrix", "u_cover", "u_noise", "u_ext", "u_res", "u_center", "u_spread", "u_fade", "u_thin", "u_d1", "u_d2", "u_k"]) this.uni[u] = gl.getUniformLocation(p, u);
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
    const fade = cloudFade(z);
    if (fade <= 0) return;
    if (this.dirty) this.upload(gl);
    const g = this.grid;
    const k = 360 / NOISE_DEG;
    // Drift: a steady few screen pixels a second along the real wind, whatever the zoom (advanced
    // per frame, so zooming never makes the clouds jump).
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
      step(this.d1, g.wind, CLOUD_DRIFT_PX);
      step(this.d2, g.windHigh ?? g.wind, CLOUD_DRIFT_PX * 1.5);
    }
    const thin = this.still ? 0 : smooth(CLOUDS_FULL_Z, CLOUDS_MAX_Z, z);
    const c = m.getCenter();
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uni.u_matrix, false, args.defaultProjectionData.mainMatrix as Float32Array);
    gl.uniform4f(this.uni.u_ext, g.lon0, g.lat0, (g.nx - 1) * g.step, (g.ny - 1) * g.step);
    gl.uniform2f(this.uni.u_res, g.nx, g.ny);
    gl.uniform2f(this.uni.u_center, (c.lng + 180) / 360, 0.5 - mercY(c.lat) / (2 * Math.PI));
    gl.uniform1f(this.uni.u_spread, 1 + CLOUD_SPREAD * thin);
    gl.uniform1f(this.uni.u_fade, fade);
    gl.uniform1f(this.uni.u_thin, thin);
    gl.uniform2f(this.uni.u_d1, this.d1[0], this.d1[1]);
    gl.uniform2f(this.uni.u_d2, this.d2[0], this.d2[1]);
    gl.uniform1f(this.uni.u_k, k);
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
        paint: { "fill-pattern": WAVE_IMAGE, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 8, 0.6, 10, 0.3, WAVES_MAX_Z, 0] },
        maxzoom: WAVES_MAX_Z,
      },
      before,
    );
  }

  let cloudsOn = opts.clouds;
  let layer: CloudLayer | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let refetch: ReturnType<typeof setInterval> | null = null;
  let dead = false;

  const cloudsVisible = () => !!(cloudsOn && layer && m.getZoom() < CLOUDS_MAX_Z);
  const wavesVisible = () => opts.waves !== false && m.getZoom() < WAVES_MAX_Z;

  function frame() {
    if (!wavesVisible() && !cloudsVisible()) return stop();
    if (wavesVisible()) waves.draw(now());
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

  // Nothing is fetched until clouds are on (by default on desktop; a switch on phones and with reduced
  // motion). A page left open then picks up new clouds every three hours (the route's cache period).
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
