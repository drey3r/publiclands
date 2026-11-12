import earcut from "earcut";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MLMap } from "maplibre-gl";

/**
 * Water close in: swell lines coming ashore on the open coast, a calm ripple in the bays, and fine
 * glints on fresh water. Illustrative, not data (only the swell's direction and period are live).
 *
 * Everything is cut from the basemap's own water shapes, so it is exact at every zoom: when the map
 * rests and as tiles arrive the water polygons of the loaded tiles are
 * triangulated and drawn, top-down, into a picture of the ground around the view:
 *
 *   red    the sea                  green  fresh water (lakes, reservoirs, rivers)
 *   blue   where nothing may draw   alpha  hand-drawn zones: sheltered bays, and the Delta (tidal
 *          (public-land shapes and         water the basemap calls sea, drawn here as fresh)
 *          lease marks over water)
 *
 * That picture is blurred at four widths. The blurs say how far a point is from the shore (so the
 * swell lines can run parallel to it, close up near it and end in the surf), which way the shore
 * faces (lines are stronger where it faces the swell), how big a body of fresh water is (glints are
 * sized to it) and where an effect must fade out (toward any shoreline, park, parcel or mark).
 * The ground picture is redrawn only when the view or the tiles change; a resting frame is one draw.
 * Because the picture lies on the ground, the lines keep their place in the tilted 3D view too.
 */

export const WATERFX_LAYER = "water-fx";
/**
 * The ground picture. Seen from straight above it is exactly what the screen shows, one texel a
 * screen pixel: tiles are only sure to be loaded there, and past its edge the blurs carry the edge
 * outward (water missing beyond the view would read as a shore, and lines would curl along it).
 * Tilted or turned, it is a square of this many texels around the ground in view.
 */
const N = 2048;
/** Blur levels: size divisor, and the blur added at that size (in its own texels). Together: about 3, 10, 40 and 160 texels. */
const LEVELS = [
  { div: 2, add: 1.5 },
  { div: 4, add: 2.4 },
  { div: 8, add: 4.85 },
  { div: 32, add: 4.85 },
] as const;
/** Total blur (standard deviation) of each level, in texels of the full picture. */
const SIGMA = (() => {
  let v = 0;
  return LEVELS.map((l) => Math.sqrt((v += (l.add * l.div) ** 2)));
})();
/** Swell lines and the bay ripple fade in over these zooms (the wave marks of the open sea fade out a little later). */
const SWELL_FROM_Z = 8.7;
const SWELL_FULL_Z = 9.7;
/** Sheltered water (code 0.7), half-sheltered (0.35) and the Delta (1.0, drawn as fresh water). West, south-east order does not matter. */
const BAY = 0.7, HALF = 0.28, DELTA = 1.0;
const ZONES: { code: number; ring: [number, number][] }[] = [
  // San Francisco, San Pablo and Suisun bays, from the Golden Gate in.
  { code: BAY, ring: [[-122.4785, 37.808], [-122.4785, 37.833], [-122.5, 37.845], [-122.54, 37.865], [-122.56, 37.95], [-122.6, 38.1], [-122.6, 38.27], [-121.93, 38.27], [-121.93, 37.38], [-122.1, 37.38], [-122.25, 37.42], [-122.36, 37.52], [-122.42, 37.65], [-122.45, 37.75], [-122.47, 37.79]] },
  { code: DELTA, ring: [[-121.93, 37.7], [-121.93, 38.6], [-121.2, 38.6], [-121.2, 37.7]] },
  // Tomales Bay.
  { code: BAY, ring: [[-122.983, 38.232], [-122.962, 38.247], [-122.9, 38.25], [-122.78, 38.1], [-122.8, 38.05], [-122.86, 38.06], [-122.95, 38.17]] },
  // Humboldt Bay.
  { code: BAY, ring: [[-124.228, 40.767], [-124.185, 40.81], [-124.15, 40.86], [-124.1, 40.9], [-124.04, 40.87], [-124.06, 40.8], [-124.14, 40.74], [-124.17, 40.68], [-124.25, 40.66], [-124.265, 40.7], [-124.24, 40.75]] },
  // Morro Bay.
  { code: BAY, ring: [[-120.867, 35.366], [-120.84, 35.375], [-120.815, 35.33], [-120.83, 35.3], [-120.866, 35.305], [-120.87, 35.35]] },
  // San Diego Bay and Mission Bay.
  { code: BAY, ring: [[-117.231, 32.672], [-117.245, 32.7], [-117.23, 32.735], [-117.15, 32.74], [-117.08, 32.66], [-117.09, 32.59], [-117.125, 32.59], [-117.132, 32.63], [-117.16, 32.675], [-117.19, 32.692], [-117.215, 32.68]] },
  { code: BAY, ring: [[-117.2545, 32.756], [-117.2545, 32.8], [-117.2, 32.8], [-117.2, 32.756]] },
  // San Pedro Bay, behind the breakwaters.
  { code: BAY, ring: [[-118.277, 33.708], [-118.25, 33.7135], [-118.185, 33.722], [-118.14, 33.725], [-118.1, 33.74], [-118.1, 33.78], [-118.29, 33.78]] },
  // The inner part of Monterey Bay: swell still comes ashore, gentler.
  { code: HALF, ring: [[-122.03, 36.99], [-121.89, 36.6], [-121.75, 36.58], [-121.75, 37.0]] },
];

const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Shapes into the ground picture: positions are mercator, relative to an anchor (kept small for precision).
const GEOM_VERT = `#version 300 es
uniform vec2 u_off;    // anchor minus the picture's centre
uniform vec2 u_inv;    // 1 / half the picture's width and height
in vec2 a_pos;
in vec4 a_c;
out vec4 v_c;
void main() {
  v_c = a_c;
  gl_Position = vec4((a_pos + u_off) * u_inv, 0.0, 1.0);
}`;
const GEOM_FRAG = `#version 300 es
precision mediump float;
in vec4 v_c;
out vec4 o;
void main() { o = v_c; }`;
// Lease marks: soft discs into the blue channel.
const DISC_VERT = `#version 300 es
uniform vec2 u_off;
uniform vec2 u_inv;
in vec2 a_pos;
in vec2 a_q;
out vec2 v_q;
void main() {
  v_q = a_q;
  gl_Position = vec4((a_pos + u_off) * u_inv, 0.0, 1.0);
}`;
const DISC_FRAG = `#version 300 es
precision mediump float;
in vec2 v_q;
out vec4 o;
void main() { o = vec4(0.0, 0.0, 1.0 - smoothstep(0.72, 1.0, length(v_q)), 0.0); }`;
// Tilted: the sea beyond the loaded tiles, from the coarse statewide mask (so no false shore where the tiles end).
const COARSE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_mask;
uniform vec4 u_map;  // picture uv -> mask uv: offset, scale
out vec4 o;
void main() { o = vec4(smoothstep(0.4, 0.6, texture(u_mask, u_map.xy + v_uv * u_map.zw).r), 0.0, 0.0, 0.0); }`;
const QUAD_VERT = `#version 300 es
in vec2 a_q;
out vec2 v_uv;
void main() {
  v_uv = a_q * 0.5 + 0.5;
  gl_Position = vec4(a_q, 0.0, 1.0);
}`;
const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_dir;     // one step, in the source's uv
uniform float u_sigma;  // in steps
uniform int u_r;
out vec4 o;
void main() {
  vec4 sum = texture(u_src, v_uv);
  float total = 1.0;
  for (int i = 1; i <= 18; i++) {
    if (i > u_r) break;
    float w = exp(-0.5 * float(i * i) / (u_sigma * u_sigma));
    sum += w * (texture(u_src, v_uv + u_dir * float(i)) + texture(u_src, v_uv - u_dir * float(i)));
    total += 2.0 * w;
  }
  o = sum / total;
}`;

const FX_VERT = `#version 300 es
uniform mat4 u_matrix;  // the map's matrix, moved to the picture's centre
uniform vec2 u_half;    // half the picture's width and height (mercator)
uniform float u_ws;     // screen pixels per mercator unit
in vec2 a_q;
out vec2 v_uv;
out vec2 v_px;
void main() {
  v_uv = a_q * 0.5 + 0.5;
  v_px = a_q * u_half * u_ws;
  gl_Position = u_matrix * vec4(a_q * u_half, 0.0, 1.0);
}`;

/**
 * Patterns that must stay put on the ground (glints, ripples, the gaps in the swell lines) live on
 * grids of a whole zoom level and cross-fade to the next level, as a map pattern does. Distances
 * from the shore are in screen pixels, so the swell lines keep their spacing at every zoom.
 */
const FX_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec2 v_px;
uniform sampler2D u_t0;
uniform sampler2D u_b0;
uniform sampler2D u_b1;
uniform sampler2D u_b2;
uniform sampler2D u_b3;
uniform vec4 u_sig;      // blur of each level, screen pixels
uniform vec2 u_oA;       // pattern pixel of the picture's centre at zoom level L (mod 4096),
uniform vec2 u_oB;       // and at level L + 1
uniform float u_sA;      // screen pixels per pattern pixel at level L (1..2)
uniform float u_w;       // how far toward level L + 1
uniform float u_t;
uniform vec2 u_swell;    // unit vector the swell travels along (x east, y south)
uniform float u_swellT;  // seconds between two swell lines passing a point
uniform vec3 u_amt;      // strength at this zoom: swell lines and surf, bay ripple, fresh glints
uniform float u_debug;
uniform float u_edge;    // 1: fade out at the picture's edge (tilted: the picture ends before the horizon)
out vec4 o;
const float PI = 3.141592653589793;

vec4 hash(ivec2 p, int k) {
  uvec3 q = uvec3(uint(p.x), uint(p.y), uint(k)) * uvec3(1597334673u, 3812015801u, 2798796415u);
  uint n = (q.x ^ q.y ^ q.z) * 1597334673u;
  uvec4 r = uvec4(n, n * 16807u, n * 48271u, n * 69621u);
  return vec4((r >> 8) & uvec4(0xffffu)) / 65535.0;
}
// Smooth noise on a 256 px lattice that repeats every 4096 px.
float noise(vec2 P, int k) {
  vec2 p = P / 256.0;
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i & 15, k).x, b = hash((i + ivec2(1, 0)) & 15, k).x, c = hash((i + ivec2(0, 1)) & 15, k).x, d = hash((i + ivec2(1, 1)) & 15, k).x;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// Distance from an edge (in units of the blur) for a blurred step: the inverse of a smooth step.
float inv(float b) { b = clamp(b, 0.003, 0.997); return log(b / (1.0 - b)) / 1.702; }
float cdf(float x) { return 1.0 / (1.0 + exp(-1.702 * x)); }

// Fresh water: a fine fleck that brightens and dims on its own slow breath, drifting a little.
float glints(vec2 P, float s, float body, int lv) {
  const float C = 32.0;
  vec2 cell = floor(P / C);
  ivec2 id = ivec2(cell) & 127;
  vec4 h = hash(id, lv);
  if (h.z > 0.52) return 0.0;
  vec4 h2 = hash(id + ivec2(57, 113), lv + 5);
  float period = 3.6 + 4.0 * h2.x;
  float life = fract(u_t / period + h2.y);
  float tw = sin(PI * life);
  tw = tw * tw;
  vec2 c = (cell + 0.16 + 0.68 * h.xy) * C + vec2(1.0, 0.22) * 1.5 * period * (life - 0.5) / s;
  vec2 q = (P - c) * s;
  float tilt = (h2.w - 0.5) * 0.7;
  q = vec2(q.x + tilt * q.y, q.y - tilt * q.x);
  float len = mix(1.9, 3.2, body) * (0.7 + 0.6 * h2.z);
  float r = length(vec2(max(abs(q.x) - len, 0.0), q.y));
  return tw * (0.7 + 0.3 * h2.w) * (1.0 - smoothstep(0.6, 1.4, r));
}
// Sheltered sea: short, soft wavelets, sparse, each breathing in and out as it drifts.
float ripples(vec2 P, float s, int lv) {
  const vec2 C = vec2(64.0, 32.0);
  float row = floor(P.y / C.y);
  float shift = hash(ivec2(3, int(row) & 127), lv + 9).x * C.x;
  float col = floor((P.x + shift) / C.x);
  ivec2 id = ivec2(int(col) & 63, int(row) & 127);
  vec4 h = hash(id, lv + 11);
  if (h.z > 0.6) return 0.0;
  vec4 h2 = hash(id + ivec2(31, 77), lv + 13);
  float period = 6.0 + 5.0 * h2.x;
  float life = fract(u_t / period + h2.y);
  float tw = sin(PI * life);
  tw *= tw;
  vec2 c = vec2(col * C.x - shift, row * C.y) + C * (0.22 + 0.56 * h.xy) + vec2(0.94, 0.34) * 2.6 * period * (life - 0.5) / s;
  vec2 q = (P - c) * s;
  float hl = 4.5 + 5.0 * h2.z;
  float u = q.x / hl;
  if (abs(u) > 1.0) return 0.0;
  float curve = 0.9 * (1.0 - cos(u * 1.7));
  return tw * (0.55 + 0.45 * h2.w) * (1.0 - smoothstep(0.35, 1.25, abs(q.y - curve))) * (1.0 - smoothstep(0.55, 1.0, abs(u)));
}

void main() {
  vec4 t0 = texture(u_t0, v_uv);
  vec4 b0 = texture(u_b0, v_uv);
  vec4 b1 = texture(u_b1, v_uv);
  vec4 b2 = texture(u_b2, v_uv);
  vec4 b3 = texture(u_b3, v_uv);
  if (u_debug > 0.5) { o = vec4(b1.a, t0.g, t0.r, 1.0) * 0.6; return; }
  if (t0.r + t0.g < 0.4) discard;
  // Zones: sheltered bays (0.7), half-sheltered (0.35), the Delta (1).
  float delta = smoothstep(0.8, 0.95, b1.a);
  float calm = smoothstep(0.1, 0.62, b1.a);
  // Nothing under or beside a public-land shape or a lease mark; nothing at the picture's edge.
  vec2 e = min(v_uv, 1.0 - v_uv);
  float open = (1.0 - smoothstep(0.04, 0.36, max(b0.b, b1.b))) * mix(1.0, smoothstep(0.0, 0.04, min(e.x, e.y)), u_edge);
  float seaM = smoothstep(0.5, 0.9, t0.r);
  float sea = seaM * (1.0 - delta);
  float fresh = max(smoothstep(0.5, 0.9, t0.g), seaM * delta);
  vec2 PA = u_oA + v_px / u_sA;
  vec2 PB = u_oB + v_px / (0.5 * u_sA);

  float white = 0.0, dark = 0.0;

  if (sea > 0.0 && (u_amt.x > 0.0 || u_amt.y > 0.0)) {
    // Distance offshore (screen pixels), from the finest blur that is not yet flat.
    float d = u_sig.x * inv(b0.r);
    d = mix(d, u_sig.y * inv(b1.r), smoothstep(0.78, 0.95, b0.r));
    float d12 = mix(d, u_sig.z * inv(b2.r), smoothstep(0.78, 0.95, b1.r));
    d = mix(d12, u_sig.w * inv(b3.r), smoothstep(0.78, 0.95, b2.r));
    d = max(d, 0.0);
    // Enclosed water (harbours, lagoons, sloughs): far less sea around than open water this far from a shore would have.
    calm = max(calm, smoothstep(0.24, 0.44, cdf(d12 / u_sig.w) - b3.r));
    // Which way the shore faces, broadly; lines are strongest where it faces the swell.
    vec2 st = vec2(0.012, 0.0);
    vec2 g = vec2(texture(u_b2, v_uv + st.xy).r - texture(u_b2, v_uv - st.xy).r, texture(u_b2, v_uv + st.yx).r - texture(u_b2, v_uv - st.yx).r)
           + 2.0 * vec2(texture(u_b3, v_uv + 3.0 * st.xy).r - texture(u_b3, v_uv - 3.0 * st.xy).r, texture(u_b3, v_uv + 3.0 * st.yx).r - texture(u_b3, v_uv - 3.0 * st.yx).r);
    float glen = length(g);
    float facing = glen > 0.002 ? dot(-g / glen, u_swell) : 0.3;
    float amp = mix(0.7, 1.0, smoothstep(-0.5, 0.45, facing));
    // Sets: slow, broad unevenness that travels with the swell, so the lines do not march in step along the whole coast.
    vec2 trav = u_swell * u_t * 5.0;
    float sets = mix(noise(PA - trav / u_sA, 3), noise(PB - trav / (0.5 * u_sA), 4), u_w);
    // The lines: level lines of the distance offshore, closing up toward the beach, rolling in.
    float ph = pow(d, 0.8) / 27.0 + u_t / u_swellT + 0.55 * sets;
    float k = floor(ph);
    float c = fract(ph);
    // Each line is whole for a long stretch, then thins out; every line has gaps of its own.
    float gapsA = noise(PA + 311.0 * vec2(k, -k), 7), gapsB = noise(PB + 311.0 * vec2(k, -k), 8);
    float gaps = smoothstep(0.3, 0.52, mix(gapsA, gapsB, u_w));
    float reach = min(u_sig.w * 1.9, 310.0) * mix(1.0, 0.4, calm);
    float band = (1.0 - smoothstep(0.5 * reach, reach, d)) * smoothstep(5.0, 16.0, d);
    float crest = 1.0 - smoothstep(0.0, 0.055, abs(c - 0.5));
    crest *= crest;
    float trough = 1.0 - smoothstep(0.0, 0.08, abs(c - 0.6));
    float lines = band * gaps * amp * (1.0 - 0.9 * calm) * mix(1.0, 0.75, smoothstep(30.0, 140.0, d));
    white += 0.46 * crest * lines * u_amt.x;
    dark += 0.14 * trough * lines * u_amt.x;
    // The surf: a wash at the water's edge that swells as each line arrives, quiet in sheltered water.
    float arrive = 0.5 + 0.5 * cos(2.0 * PI * (u_t / u_swellT + 0.55 * sets - 0.5));
    float wash = 1.0 - smoothstep(1.0, 2.0 + 7.0 * (0.35 + 0.65 * arrive), d);
    white += 0.8 * wash * (0.3 + 0.7 * arrive) * amp * (1.0 - 0.85 * calm) * u_amt.x;
    // Sheltered water: the ripple, fading out toward the shore.
    if (calm > 0.01 && u_amt.y > 0.0) {
      float r = mix(ripples(PA, u_sA, 0), ripples(PB, 0.5 * u_sA, 1), u_w);
      white += 0.5 * r * calm * smoothstep(0.7, 0.96, b1.r) * u_amt.y;
    }
    white *= sea;
    dark *= sea;
  }
  if (fresh > 0.0 && u_amt.z > 0.0) {
    float f0 = b0.g + b0.r * delta, f1 = b1.g + b1.r * delta, f2 = b2.g + b2.r * delta;
    // How open the water is here: glints are smaller and fewer in a narrow arm or channel.
    float body = smoothstep(0.45, 0.97, f2) * smoothstep(0.6, 0.98, f1);
    float gA = glints(PA, u_sA, body, 20), gB = glints(PB, 0.5 * u_sA, body, 21);
    float shore = smoothstep(0.55, 0.9, f0) * mix(1.0, smoothstep(0.55, 0.95, f1), body);
    white += mix(gA, gB, u_w) * shore * fresh * u_amt.z;
  }
  white = clamp(white * open, 0.0, 1.0);
  dark = clamp(dark * open, 0.0, 1.0) * (1.0 - white);
  o = vec4(vec3(0.97, 0.985, 0.99) * white + vec3(0.25, 0.4, 0.5) * dark, white + dark);
}`;

type Tex = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number };

export class WaterFx implements CustomLayerInterface {
  id = WATERFX_LAYER;
  type = "custom" as const;
  renderingMode = "2d" as const;
  /** Seconds; the ambience ticker advances it (it stays put for reduced motion). */
  t = 40;
  /** Layers whose shapes block the effects where they lie over water. */
  blockLayers = ["access-fill"];
  /** Called when what is in view changes (the ticker may need to start or stop). */
  onChange: (() => void) | null = null;
  debug = false;
  /** The coarse statewide sea mask's texture (lib/ocean.ts owns it) and its box, for the ground beyond the loaded tiles in a tilted view. */
  coarse: (() => WebGLTexture | null) | null = null;
  coarseBox = { west: -137, east: -107, south: 26, north: 48 };
  private coverVao: WebGLVertexArrayObject | null = null;
  private coverBuf: WebGLBuffer | null = null;
  private map: MLMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private progs: Record<string, { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }> = {};
  private quad: WebGLVertexArrayObject | null = null;
  private quadBuf: WebGLBuffer | null = null;
  private geomVao: WebGLVertexArrayObject | null = null;
  private posBuf: WebGLBuffer | null = null;
  private colBuf: WebGLBuffer | null = null;
  private discVao: WebGLVertexArrayObject | null = null;
  private discBuf: WebGLBuffer | null = null;
  private t0: Tex | null = null;
  private levels: { tmp: Tex; out: Tex }[] = [];
  private probe: Tex | null = null;
  private float = false;
  private nTris = 0;
  private nDisc = 0;
  /** The geometry's anchor (mercator), and a counter that changes with every rebuild. */
  private anchor: [number, number] = [0, 0];
  private geomVersion = 0;
  private drawnKey = "";
  /** The picture's centre and half-extents (mercator) as last drawn, and whether it is the tilted kind. */
  private centre: [number, number] = [0, 0];
  private half: [number, number] = [0, 0];
  private tilted = false;
  private size: [number, number] = [0, 0];
  private wantProbe = false;
  private seen = { sea: false, fresh: false, calm: false };
  private built = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastBuild = 0;
  private buildMs = 0;
  private swell: [number, number] = [Math.sin(((295 + 180) * Math.PI) / 180), -Math.cos(((295 + 180) * Math.PI) / 180)];
  private swellT = 9;
  private dead = false;

  /** The swell: the compass direction it comes from, and its period (seconds). */
  setSwell(from: number, period: number) {
    const head = ((from + 180) * Math.PI) / 180;
    this.swell = [Math.sin(head), -Math.cos(head)];
    // A line passes every nine seconds or so: the real period, held to an unhurried range.
    this.swellT = Math.min(11, Math.max(7.5, (period || 10) * 0.9));
  }
  /** Whether anything this layer draws is in view at this zoom (the ticker runs only then). */
  active() {
    const m = this.map;
    if (!m || !this.built) return false;
    return this.seen.fresh || ((this.seen.sea || this.seen.calm) && m.getZoom() >= SWELL_FROM_Z);
  }
  /** For the browser checks. */
  state() {
    return { ...this.seen, built: this.built, triangles: this.nTris, marks: this.nDisc / 6, float: this.float };
  }

  onAdd(map: MLMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.gl = gl;
    this.float = !!gl.getExtension("EXT_color_buffer_float") || !!gl.getExtension("EXT_color_buffer_half_float");
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("[water] shader", gl.getShaderInfoLog(s));
      return s;
    };
    const prog = (name: string, vs: string, fs: string, attribs: string[], uniforms: string[]) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.warn("[water] program", name, gl.getProgramInfoLog(p));
      const u: Record<string, WebGLUniformLocation | null> = {};
      for (const n of uniforms) u[n] = gl.getUniformLocation(p, n);
      this.progs[name] = { p, u };
    };
    prog("geom", GEOM_VERT, GEOM_FRAG, ["a_pos", "a_c"], ["u_off", "u_inv"]);
    prog("disc", DISC_VERT, DISC_FRAG, ["a_pos", "a_q"], ["u_off", "u_inv"]);
    prog("coarse", QUAD_VERT, COARSE_FRAG, ["a_q"], ["u_mask", "u_map"]);
    prog("blur", QUAD_VERT, BLUR_FRAG, ["a_q"], ["u_src", "u_dir", "u_sigma", "u_r"]);
    prog("fx", FX_VERT, FX_FRAG, ["a_q"], ["u_matrix", "u_half", "u_ws", "u_t0", "u_b0", "u_b1", "u_b2", "u_b3", "u_sig", "u_oA", "u_oB", "u_sA", "u_w", "u_t", "u_swell", "u_swellT", "u_amt", "u_debug", "u_edge"]);

    this.quad = gl.createVertexArray();
    this.quadBuf = gl.createBuffer();
    gl.bindVertexArray(this.quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.geomVao = gl.createVertexArray();
    this.posBuf = gl.createBuffer();
    this.colBuf = gl.createBuffer();
    gl.bindVertexArray(this.geomVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    this.coverVao = gl.createVertexArray();
    this.coverBuf = gl.createBuffer();
    gl.bindVertexArray(this.coverVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.coverBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.discVao = gl.createVertexArray();
    this.discBuf = gl.createBuffer();
    gl.bindVertexArray(this.discVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.discBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);

    // The shapes are rebuilt when the map rests, when tiles or lease marks arrive, and about once a second on a long move.
    map.on("moveend", this.onRest);
    map.on("move", this.onMove);
    map.on("sourcedata", this.onSource);
    this.schedule(0);
  }

  private free(gl: WebGL2RenderingContext) {
    for (const t of [this.t0, this.probe, ...this.levels.flatMap((l) => [l.tmp, l.out])]) {
      if (!t) continue;
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    this.t0 = this.probe = null;
    this.levels = [];
  }

  /** The picture and its blurs, w × h texels (made again when the map is resized, tilted or set flat). */
  private alloc(gl: WebGL2RenderingContext, w: number, h: number) {
    this.free(gl);
    const target = (w: number, h: number, float: boolean): Tex => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fbo, w, h };
    };
    const level = (float: boolean) => LEVELS.map((l) => ({ tmp: target(Math.ceil(w / l.div), Math.ceil(h / l.div), float), out: target(Math.ceil(w / l.div), Math.ceil(h / l.div), float) }));
    this.levels = level(this.float);
    if (this.float && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      // Half-float targets refused after all: plain bytes (coarser distances far from shore).
      for (const t of this.levels.flatMap((l) => [l.tmp, l.out])) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      }
      this.float = false;
      this.levels = level(false);
    }
    this.t0 = target(w, h, false);
    this.probe = target(Math.ceil(w / LEVELS[3].div), Math.ceil(h / LEVELS[3].div), false);
    this.size = [w, h];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  onRemove(map: MLMap, gl: WebGL2RenderingContext) {
    this.dead = true;
    if (this.timer) clearTimeout(this.timer);
    map.off("moveend", this.onRest);
    map.off("move", this.onMove);
    map.off("sourcedata", this.onSource);
    for (const { p } of Object.values(this.progs)) gl.deleteProgram(p);
    this.free(gl);
    for (const b of [this.quadBuf, this.posBuf, this.colBuf, this.discBuf, this.coverBuf]) gl.deleteBuffer(b);
    for (const v of [this.quad, this.geomVao, this.discVao, this.coverVao]) gl.deleteVertexArray(v);
    this.progs = {};
  }

  private onRest = () => this.schedule(60);
  private onMove = () => {
    // Tiles arriving trigger their own rebuild; this only keeps a long glide from going stale, and backs off where a rebuild is slow.
    if (performance.now() - this.lastBuild > Math.max(900, 12 * this.buildMs)) this.schedule(0);
  };
  private onSource = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (e.sourceId && e.isSourceLoaded) this.schedule(140);
  };
  private schedule(ms: number) {
    if (this.dead || this.timer) return;
    // On the move, no more often than every 300 ms, and less often where a rebuild is slow.
    // (At rest too there is a floor, so a run of small moves cannot rebuild on every one.)
    const gap = this.map?.isMoving() ? Math.max(300, 12 * this.buildMs) : Math.max(150, 8 * this.buildMs);
    ms = Math.max(ms, this.lastBuild + gap - performance.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      this.build();
    }, ms);
  }

  /** Lease clusters, marks and icons on screen: every circle layer and every icon layer. */
  private marks(m: MLMap): { x: number; y: number; r: number }[] {
    const ids = m.getStyle().layers.filter((l) => (l.type === "circle" || (l.type === "symbol" && l.layout?.["icon-image"] != null)) && l.layout?.visibility !== "none").map((l) => l.id);
    if (!ids.length) return [];
    const out: { x: number; y: number; r: number }[] = [];
    const seen = new Set<string>();
    const ws = 512 * 2 ** m.getZoom();
    for (const f of m.queryRenderedFeatures({ layers: ids })) {
      if (f.geometry.type !== "Point") continue;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const n = Number(f.properties?.point_count) || 0;
      // A cluster's disc: 11 px for one, 22 for a hundred, 34 for nine hundred (the "cluster" layer's radius).
      const s = Math.sqrt(n);
      const r = n ? (s <= 10 ? 11 + ((s - 1) * 11) / 9 : Math.min(34, 22 + ((s - 10) * 12) / 20)) : 12;
      // A clear margin around the mark, soft at its edge.
      out.push({ x: mercX(lng), y: mercY(lat), r: ((r + 5) / 0.72 / ws) });
    }
    return out;
  }

  /** Triangulate the water in the loaded tiles, the shapes that block it, the zones and the marks. */
  private build() {
    const m = this.map, gl = this.gl;
    if (!m || !gl || this.dead || !m.getSource("omt")) return;
    this.lastBuild = performance.now();
    const c = m.getCenter();
    const ax = mercX(c.lng), ay = mercY(c.lat);
    const pos: number[] = [];
    const col: number[] = [];
    const add = (rings: number[][][], r: number, g: number, b: number, a: number) => {
      const flat: number[] = [];
      const holes: number[] = [];
      for (let i = 0; i < rings.length; i++) {
        if (i) holes.push(flat.length / 2);
        for (const p of rings[i]) flat.push(mercX(p[0]) - ax, mercY(p[1]) - ay);
      }
      for (const i of earcut(flat, holes)) {
        pos.push(flat[i * 2], flat[i * 2 + 1]);
        col.push(r, g, b, a);
      }
    };
    const each = (f: { geometry: GeoJSON.Geometry }, r: number, g: number, b: number, a: number) => {
      const geo = f.geometry;
      if (geo.type === "Polygon") add(geo.coordinates, r, g, b, a);
      else if (geo.type === "MultiPolygon") for (const poly of geo.coordinates) add(poly, r, g, b, a);
    };
    for (const f of m.querySourceFeatures("omt", { sourceLayer: "water" })) {
      if (f.properties?.class === "ocean") each(f, 255, 0, 0, 0);
      else each(f, 0, 255, 0, 0);
    }
    // Public-land shapes are drawn over the water they cover: no effect under them. Further out they are
    // too many (150,000 triangles around the Bay at zoom 9) and too small to matter.
    if (m.getZoom() >= 9.5)
      for (const id of this.blockLayers) {
        const l = m.getLayer(id) as unknown as { source?: string; sourceLayer?: string } | undefined;
        if (!l?.source || m.getLayoutProperty(id, "visibility") === "none") continue;
        const filter = m.getFilter(id) ?? undefined;
        for (const f of m.querySourceFeatures(l.source, { sourceLayer: l.sourceLayer, filter })) each(f, 0, 0, 255, 0);
      }
    for (const z of ZONES) add([z.ring], 0, 0, 0, Math.round(z.code * 255));
    const disc: number[] = [];
    for (const k of this.marks(m)) {
      const x = k.x - ax, y = k.y - ay;
      for (const [qx, qy] of [[-1, -1], [1, -1], [-1, 1], [1, -1], [1, 1], [-1, 1]]) disc.push(x + qx * k.r, y + qy * k.r, qx, qy);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(col), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.discBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(disc), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.nTris = pos.length / 2;
    this.nDisc = disc.length / 4;
    this.anchor = [ax, ay];
    this.geomVersion++;
    this.wantProbe = true;
    this.built = true;
    this.buildMs = performance.now() - this.lastBuild;
    m.triggerRepaint();
  }

  /** Where the ground picture goes: what the screen shows (flat), or a square around the ground in view (tilted or turned). */
  private frame(m: MLMap): { cx: number; cy: number; hx: number; hy: number; w: number; h: number; tilted: boolean } {
    const W = m.getContainer().clientWidth, H = m.getContainer().clientHeight;
    const ws = 512 * 2 ** m.getZoom();
    const c = m.getCenter();
    let cx = mercX(c.lng), cy = mercY(c.lat);
    if (m.getPitch() < 1 && Math.abs(m.getBearing()) < 0.5) {
      const k = Math.min(1, N / Math.max(W, H));
      return { cx, cy, hx: W / 2 / ws, hy: H / 2 / ws, w: Math.max(32, Math.round(W * k)), h: Math.max(32, Math.round(H * k)), tilted: false };
    }
    // Tilted or turned: the ground the screen's corners reach, held to three screens across.
    const pts = [[0, 0], [W, 0], [0, H], [W, H], [W / 2, 0]].map(([x, y]) => {
      const p = m.unproject([x, y]);
      return [mercX(p.lng), mercY(Math.max(-85, Math.min(85, p.lat)))];
    });
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const bx = (Math.min(...xs) + Math.max(...xs)) / 2, by = (Math.min(...ys) + Math.max(...ys)) / 2;
    const want = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
    const half = Math.min(want * 1.04, (3 * Math.max(W, H)) / 2 / ws);
    // The near ground (the bottom of the screen) must stay inside the picture.
    const near = Math.max(...[pts[2], pts[3]].map((p) => Math.max(Math.abs(p[0] - cx), Math.abs(p[1] - cy))));
    const room = Math.max(0, half - near * 1.04);
    const dx = bx - cx, dy = by - cy;
    const k = Math.min(1, room / Math.max(1e-12, Math.max(Math.abs(dx), Math.abs(dy))));
    cx += dx * k;
    cy += dy * k;
    return { cx, cy, hx: half, hy: half, w: N, h: N, tilted: true };
  }

  prerender(gl: WebGL2RenderingContext) {
    const m = this.map;
    if (!m || !this.built || !this.progs.fx) return;
    const { cx, cy, hx, hy, w, h, tilted } = this.frame(m);
    const key = `${cx},${cy},${hx},${hy},${w},${h},${this.geomVersion}`;
    if (key === this.drawnKey) return;
    if (!this.t0 || this.size[0] !== w || this.size[1] !== h) this.alloc(gl, w, h);
    if (!this.t0) return;
    this.drawnKey = key;
    this.centre = [cx, cy];
    this.half = [hx, hy];
    this.tilted = tilted;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    // The shapes: each channel keeps the most that any shape puts there.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.t0.fbo);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const coarse = tilted ? this.coarse?.() : null;
    if (coarse) {
      // The sea from the coarse mask everywhere, then cleared again wherever the view's own tiles lie:
      // there the exact shapes below are the whole truth.
      const B = this.coarseBox;
      const bx0 = mercX(B.west), bx1 = mercX(B.east), by0 = mercY(B.north), by1 = mercY(B.south);
      const c = this.progs.coarse;
      gl.disable(gl.BLEND);
      gl.useProgram(c.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, coarse);
      gl.uniform1i(c.u.u_mask, 0);
      gl.uniform4f(c.u.u_map, (cx - hx - bx0) / (bx1 - bx0), (cy - hy - by0) / (by1 - by0), (2 * hx) / (bx1 - bx0), (2 * hy) / (by1 - by0));
      gl.bindVertexArray(this.quad);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const tiles: number[] = [];
      for (const t of m.coveringTiles({ tileSize: 512 })) {
        const n = 2 ** t.canonical.z, x0 = t.canonical.x / n - cx, y0 = t.canonical.y / n - cy, x1 = x0 + 1 / n, y1 = y0 + 1 / n;
        tiles.push(x0, y0, x1, y0, x0, y1, x1, y0, x1, y1, x0, y1);
      }
      const g = this.progs.geom;
      gl.useProgram(g.p);
      gl.uniform2f(g.u.u_off, 0, 0);
      gl.uniform2f(g.u.u_inv, 1 / hx, 1 / hy);
      gl.bindVertexArray(this.coverVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.coverBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tiles), gl.DYNAMIC_DRAW);
      gl.vertexAttrib4f(1, 0, 0, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, tiles.length / 2);
    }
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (const [name, vao, n] of [["geom", this.geomVao, this.nTris], ["disc", this.discVao, this.nDisc]] as const) {
      if (!n) continue;
      const { p, u } = this.progs[name];
      gl.useProgram(p);
      gl.uniform2f(u.u_off, this.anchor[0] - cx, this.anchor[1] - cy);
      gl.uniform2f(u.u_inv, 1 / hx, 1 / hy);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, n);
    }
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
    // The blurs, each from the one before, across and then down.
    const { p, u } = this.progs.blur;
    gl.useProgram(p);
    gl.bindVertexArray(this.quad);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u.u_src, 0);
    const pass = (src: WebGLTexture, dst: Tex, dx: number, dy: number, sigma: number) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform2f(u.u_dir, dx, dy);
      gl.uniform1f(u.u_sigma, Math.max(0.01, sigma));
      gl.uniform1i(u.u_r, sigma > 0 ? Math.min(18, Math.ceil(sigma * 2.7)) : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    let src = this.t0.tex;
    LEVELS.forEach((l, i) => {
      const { tmp, out } = this.levels[i];
      pass(src, tmp, 1 / tmp.w, 0, l.add);
      pass(tmp.tex, out, 0, 1 / out.h, l.add);
      src = out.tex;
    });
    if (this.wantProbe && this.probe) {
      // What is in view, read back once per rebuild (64 × 64 bytes): the ticker runs only where something would move.
      this.wantProbe = false;
      pass(src, this.probe, 0, 0, 0);
      const pw = this.probe.w, ph = this.probe.h;
      const px = new Uint8Array(pw * ph * 4);
      gl.readPixels(0, 0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const seen = { sea: false, fresh: false, calm: false };
      for (let o = 0; o < px.length; o += 4) {
        const r = px[o], g = px[o + 1], a = px[o + 3];
        // A shore within reach (the blur is neither all sea nor all land), fresh water, a sheltered bay.
        if (a > 200 ? r > 2 : g > 1) seen.fresh = true;
        else if (r > 6 && r < 249) seen.sea = true;
        if (r > 6 && a > 60 && a <= 200) seen.calm = true;
      }
      const was = this.active();
      this.seen = seen;
      if (was !== this.active()) this.onChange?.();
    }
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }

  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const m = this.map;
    if (!m || !this.built || !this.t0 || !this.half[0] || !this.progs.fx) return;
    const z = m.getZoom();
    const swell = smooth(SWELL_FROM_Z, SWELL_FULL_Z, z);
    const amt: [number, number, number] = [this.seen.sea || this.seen.calm ? swell : 0, this.seen.calm ? swell : 0, this.seen.fresh ? 1 : 0];
    if (!this.debug && amt[0] + amt[1] + amt[2] <= 0) return;
    const [cx, cy] = this.centre;
    const [hx, hy] = this.half;
    const ws = 512 * 2 ** z;
    // The map's matrix, moved to the picture's centre (in doubles: at close zooms single floats lose the place).
    const M = args.defaultProjectionData.mainMatrix as ArrayLike<number>;
    const mat = new Float32Array(16);
    for (let i = 0; i < 16; i++) mat[i] = M[i];
    for (let i = 0; i < 4; i++) mat[12 + i] = M[i] * cx + M[4 + i] * cy + M[12 + i];
    const L = Math.floor(z);
    const origin = (lv: number): [number, number] => {
      const n = 512 * 2 ** lv;
      return [(cx * n) % 4096, (cy * n) % 4096];
    };
    const oA = origin(L), oB = origin(L + 1);
    const texel = (2 * hx * ws) / this.size[0];
    const { p, u } = this.progs.fx;
    gl.useProgram(p);
    gl.uniformMatrix4fv(u.u_matrix, false, mat);
    gl.uniform2f(u.u_half, hx, hy);
    gl.uniform1f(u.u_edge, this.tilted ? 1 : 0);
    gl.uniform1f(u.u_ws, ws);
    gl.uniform4f(u.u_sig, SIGMA[0] * texel, SIGMA[1] * texel, SIGMA[2] * texel, SIGMA[3] * texel);
    gl.uniform2f(u.u_oA, oA[0], oA[1]);
    gl.uniform2f(u.u_oB, oB[0], oB[1]);
    gl.uniform1f(u.u_sA, 2 ** (z - L));
    gl.uniform1f(u.u_w, z - L);
    gl.uniform1f(u.u_t, this.t);
    gl.uniform2f(u.u_swell, this.swell[0], this.swell[1]);
    gl.uniform1f(u.u_swellT, this.swellT);
    gl.uniform3f(u.u_amt, amt[0], amt[1], amt[2]);
    gl.uniform1f(u.u_debug, this.debug ? 1 : 0);
    const texs = [this.t0.tex, ...this.levels.map((l) => l.out.tex)];
    ["u_t0", "u_b0", "u_b1", "u_b2", "u_b3"].forEach((name, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, texs[i]);
      gl.uniform1i(u[name], i);
    });
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }
}
