import type { CustomLayerInterface, CustomRenderMethodInput, Map as MLMap } from "maplibre-gl";

/**
 * The ocean's wave marks: short engraved strokes, as on an old chart, drawn by a shader so that each
 * one can drift with the current where it is and brighten as the swell passes from the swell's real
 * direction. One draw call a frame, nothing computed on the CPU, nothing uploaded per frame.
 *
 * What it reads:
 *   the sea mask    /data/ocean-mask.png (scripts/make-water.mjs, from the basemap's own tiles): a custom
 *                   layer cannot be clipped to the basemap's ocean polygons, so it carries its own
 *                   picture of where the sea is and stays a little off the shore (the surf line's place)
 *   the flow grid   /api/ocean (Open-Meteo Marine): surface current on a 1° grid, and the coast-wide
 *                   swell. Until it answers, or if it fails, SKETCH_FLOW below: an illustrative drift,
 *                   labeled as such in the map's credits.
 */

/** Keep in step with MASK in scripts/make-water.mjs. */
const MASK = { west: -137, east: -107, south: 26, north: 48 };
export const OCEAN_LAYER = "ocean-waves";
/** Wave marks fade out by this zoom; past it nothing on the ocean moves (lease marks and icons own the water there). */
export const WAVES_MAX_Z = 11;
const waveOpacity = (z: number) => (z <= 8.5 ? 0.85 : z <= 10 ? 0.85 - (0.45 * (z - 8.5)) / 1.5 : Math.max(0, 0.4 * (WAVES_MAX_Z - z)));

/** What /api/ocean returns. u, v: metres a second toward east and north, row by row from the south. */
export type OceanFlow = {
  time: string;
  lat0: number;
  lon0: number;
  step: number;
  nx: number;
  ny: number;
  u: number[];
  v: number[];
  /** Coast-wide swell: the compass direction it comes from, its period (s) and height (m). */
  swell: { from: number; period: number; height: number };
  source: string;
};

/**
 * Not data: a plausible everyday picture, used until the live grid arrives and if it cannot be had.
 * The California Current sets south-southeast along the coast, stronger offshore, and the swell comes
 * from the west-northwest.
 */
export const SKETCH_FLOW: OceanFlow = (() => {
  const nx = 12, ny = 13, u: number[] = [], v: number[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const lat = 31 + j, lon = -128 + i;
      // Rough distance offshore (degrees): the coast runs from about 124.3°W at 42°N to 117°W at 32.5°N.
      const off = Math.max(0, -124.3 + (42 - lat) * 0.77 - lon);
      const s = 0.1 + 0.16 * Math.min(1, off / 3);
      const head = (152 * Math.PI) / 180;
      u.push(+(s * Math.sin(head)).toFixed(3));
      v.push(+(s * Math.cos(head)).toFixed(3));
    }
  return { time: "", lat0: 31, lon0: -128, step: 1, nx, ny, u, v, swell: { from: 295, period: 10, height: 1.5 }, source: "illustrative" };
})();

const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);

const VERT = `#version 300 es
uniform mat4 u_matrix;
in vec2 a_pos;
out vec2 v_m;
void main() {
  v_m = a_pos;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`;

/**
 * The marks live on a grid of cells in map pixels at a whole zoom level (one mark a cell, placed and
 * sized by a hash of the cell, some cells empty, rows staggered, so no grid shows). Between whole
 * zooms the two neighbouring levels cross-fade, as a map pattern does. Each mark is born, drifts a
 * few pixels along the current at its own place (further where the current is faster), fades, and
 * is born again where it began; it never leaves its cell, so a pixel only ever looks at one mark.
 */
const FRAG = `#version 300 es
precision highp float;
in vec2 v_m;
uniform sampler2D u_mask;
uniform sampler2D u_flow;
uniform vec4 u_maskExt;  // mercator x0, y0 (north), x1, y1 (south)
uniform vec4 u_flowExt;  // lon0, lat0, lon span, lat span of the grid points
uniform vec2 u_flowRes;
uniform float u_zoom;
uniform float u_t;
uniform float u_opacity;
uniform vec2 u_swellDir; // unit vector the swell travels along, in map pixels (x east, y south)
uniform float u_swellT;  // seconds for one swell to pass a point
out vec4 o;
const float PI = 3.141592653589793;
const vec2 CELL = vec2(64.0, 34.0);

vec4 hash(ivec2 p, int level) {
  uvec3 q = uvec3(uint(p.x), uint(p.y), uint(level)) * uvec3(1597334673u, 3812015801u, 2798796415u);
  uint n = (q.x ^ q.y ^ q.z) * 1597334673u;
  uvec4 r = uvec4(n, n * 16807u, n * 48271u, n * 69621u);
  return vec4((r >> 8) & uvec4(0xffffu)) / 65535.0;
}

// Current at a mercator point: metres a second toward east and north.
vec2 flow(vec2 m) {
  float lon = m.x * 360.0 - 180.0;
  float lat = degrees(atan(sinh(PI * (1.0 - 2.0 * m.y))));
  vec2 uv = clamp(vec2((lon - u_flowExt.x) / u_flowExt.z, (lat - u_flowExt.y) / u_flowExt.w), 0.0, 1.0);
  return texture(u_flow, (uv * (u_flowRes - 1.0) + 0.5) / u_flowRes).rg * 2.0 - 1.0;
}

// White stroke (x) and its darker underline (y) for the level-L grid.
vec2 marks(float L) {
  float n = 512.0 * exp2(L);
  vec2 P = v_m * n;
  float scale = exp2(u_zoom - L); // screen pixels per pattern pixel
  float row = floor(P.y / CELL.y);
  float shift = hash(ivec2(7, int(row)), int(L)).x * CELL.x;
  float col = floor((P.x + shift) / CELL.x);
  vec4 h = hash(ivec2(int(col), int(row)), int(L));
  vec4 h2 = hash(ivec2(int(col) + 9173, int(row) - 577), int(L));
  if (h2.w < 0.1) return vec2(0.0);
  vec2 origin = vec2(col * CELL.x - shift, row * CELL.y);
  vec2 base = origin + CELL * 0.5 + (h.xy - 0.5) * vec2(30.0, 12.0);
  // Drift with the current here.
  vec2 f = flow((origin + CELL * 0.5) / n);
  float sp = length(f);
  vec2 dir = sp > 0.001 ? vec2(f.x, -f.y) / sp : vec2(0.0);
  float life = fract(u_t / (8.0 + 5.0 * h.z) + h.w);
  float travel = 3.0 + 10.0 * clamp(sp / 0.5, 0.0, 1.0);
  vec2 c = base + dir * travel * (life - 0.5);
  // The swell: a band of brighter, longer marks rolling along its real direction, two crests in 240 px.
  float swell = 0.5 + 0.5 * sin(2.0 * PI * (u_t / u_swellT - dot(c, u_swellDir) / 120.0));
  c.y += 1.1 * sin(u_t * 0.55 + h2.x * 6.283) * (0.4 + 0.6 * swell);
  float a = (0.45 + 0.55 * h2.y) * (0.3 + 0.7 * swell) * smoothstep(0.0, 0.2, life) * smoothstep(1.0, 0.8, life);
  float hl = (3.5 + 6.0 * h2.z) * (0.8 + 0.25 * swell);
  vec2 q = P - c;
  float u = q.x / hl;
  if (abs(u) > 1.0) return vec2(0.0);
  // A swash: a low crest easing into a shallow trough.
  float curve = -1.3 * sin(2.75 * (u + 0.86)) * (1.0 - 0.35 * u);
  float soft = max(0.5, 0.75 / scale);
  float ends = smoothstep(1.0, 0.82, abs(u));
  float white = (1.0 - smoothstep(0.45, 0.45 + soft, abs(q.y - curve))) * ends * a;
  float under = (1.0 - smoothstep(0.4, 0.4 + soft, abs(q.y - 1.0 - curve))) * ends * a;
  return vec2(0.72 * white, 0.3 * under);
}

void main() {
  vec2 uv = (v_m - u_maskExt.xy) / (u_maskExt.zw - u_maskExt.xy);
  float sea = smoothstep(0.62, 0.92, texture(u_mask, uv).r);
  if (sea <= 0.0) discard;
  float L = floor(u_zoom);
  float w = u_zoom - L;
  vec2 a = marks(L) * (1.0 - w) + marks(L + 1.0) * w;
  vec3 rgb = vec3(0.408, 0.541, 0.62) * a.y * (1.0 - a.x) + vec3(0.965, 0.98, 0.988) * a.x;
  o = vec4(rgb, a.x + a.y * (1.0 - a.x)) * (u_opacity * sea);
}`;

export class OceanLayer implements CustomLayerInterface {
  id = OCEAN_LAYER;
  type = "custom" as const;
  renderingMode = "2d" as const;
  /** Seconds; the ambience ticker advances it (it stays put for reduced motion and on phones). */
  t = 40;
  private map: MLMap | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private buf: WebGLBuffer | null = null;
  private mask: WebGLTexture | null = null;
  private flowTex: WebGLTexture | null = null;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private maskImage: HTMLImageElement | null = null;
  private maskReady = false;
  private flow: OceanFlow = SKETCH_FLOW;
  private flowDirty = true;

  constructor(private maskUrl: string) {}

  setFlow(f: OceanFlow) {
    this.flow = f;
    this.flowDirty = true;
  }
  /** Whether the marks can be drawn (the sea mask has arrived). */
  ready() {
    return this.maskReady;
  }

  onAdd(map: MLMap, gl: WebGL2RenderingContext) {
    this.map = map;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("[ocean] shader", gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn("[ocean] program", gl.getProgramInfoLog(p));
      return;
    }
    this.program = p;
    for (const u of ["u_matrix", "u_mask", "u_flow", "u_maskExt", "u_flowExt", "u_flowRes", "u_zoom", "u_t", "u_opacity", "u_swellDir", "u_swellT"]) this.uni[u] = gl.getUniformLocation(p, u);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    const x0 = mercX(MASK.west), x1 = mercX(MASK.east), yN = mercY(MASK.north), yS = mercY(MASK.south);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, yN, x1, yN, x0, yS, x1, yS]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.mask = gl.createTexture();
    this.flowTex = gl.createTexture();
    this.flowDirty = true;
    const img = new Image();
    img.onload = () => {
      this.maskImage = img;
      map.triggerRepaint();
    };
    img.onerror = () => console.warn("[ocean] sea mask did not load; no wave marks");
    img.src = this.maskUrl;
  }

  onRemove(_map: MLMap, gl: WebGL2RenderingContext) {
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.mask);
    gl.deleteTexture(this.flowTex);
    gl.deleteBuffer(this.buf);
    gl.deleteVertexArray(this.vao);
    this.program = null;
  }

  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const m = this.map;
    if (!m || !this.program) return;
    const z = m.getZoom();
    const opacity = waveOpacity(z);
    if (opacity <= 0) return;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (this.maskImage) {
      gl.bindTexture(gl.TEXTURE_2D, this.mask);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.maskImage);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.maskImage = null;
      this.maskReady = true;
    }
    if (!this.maskReady) return;
    const f = this.flow;
    if (this.flowDirty) {
      // ±1 m/s in two bytes a cell; faster water (rare here) is drawn as 1 m/s.
      const px = new Uint8Array(f.nx * f.ny * 4);
      const enc = (x: number) => Math.round(Math.min(1, Math.max(-1, x ?? 0)) * 127 + 128);
      for (let i = 0; i < f.nx * f.ny; i++) {
        px[i * 4] = enc(f.u[i]);
        px[i * 4 + 1] = enc(f.v[i]);
        px[i * 4 + 3] = 255;
      }
      gl.bindTexture(gl.TEXTURE_2D, this.flowTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, f.nx, f.ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.flowDirty = false;
    }
    // The swell travels away from where it comes from; on the map, north is up (y grows south).
    const head = ((f.swell.from + 180) * Math.PI) / 180;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uni.u_matrix, false, args.defaultProjectionData.mainMatrix as Float32Array);
    gl.uniform4f(this.uni.u_maskExt, mercX(MASK.west), mercY(MASK.north), mercX(MASK.east), mercY(MASK.south));
    gl.uniform4f(this.uni.u_flowExt, f.lon0, f.lat0, (f.nx - 1) * f.step, (f.ny - 1) * f.step);
    gl.uniform2f(this.uni.u_flowRes, f.nx, f.ny);
    gl.uniform1f(this.uni.u_zoom, z);
    gl.uniform1f(this.uni.u_t, this.t);
    gl.uniform1f(this.uni.u_opacity, opacity);
    gl.uniform2f(this.uni.u_swellDir, Math.sin(head), -Math.cos(head));
    gl.uniform1f(this.uni.u_swellT, Math.min(14, Math.max(6, f.swell.period || 9)));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.mask);
    gl.uniform1i(this.uni.u_mask, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.flowTex);
    gl.uniform1i(this.uni.u_flow, 1);
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
