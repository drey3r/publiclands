import type { CustomLayerInterface, CustomRenderMethodInput, Map as MLMap } from "maplibre-gl";

/**
 * The sea floor: a faint translucent ink that deepens with depth, in soft bands whose edges follow
 * the depth contours, so Monterey Canyon and the basins off Southern California read as sea floor.
 *
 * It reads one small picture of depth (/data/ocean-depth.png, scripts/make-depth.mjs, from the terrain
 * tiles' ETOPO1 bathymetry, smoothed once) and interpolates it with a smooth curve (a cubic B-spline),
 * so no zoom shows the samples. The map used to shade depth straight from the terrain tiles; scaled
 * up, their coarse samples drew soft dark blobs close in.
 *
 * The shelf (shallower than about 150 m) keeps the plain water color, so the State sovereign lands
 * tint is not changed there. Each band edge is as crisp as the slope under it: a line a few pixels wide on
 * a canyon wall, a broad gradient on the open floor, never a ring around a bump on a plain.
 * Still: it is drawn when the map is, and never asks for a frame.
 */

/** Keep in step with BOX, DEPTH_MAX and DEPTH_GAMMA in scripts/make-depth.mjs. */
const BOX = { west: -137, east: -107, south: 26, north: 48 };
const DEPTH_MAX = 5200;
const DEPTH_GAMMA = 0.6;
export const SEAFLOOR_LAYER = "ocean-depth";

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

const FRAG = `#version 300 es
precision highp float;
in vec2 v_m;
uniform sampler2D u_depth;
uniform vec4 u_ext;     // mercator x0, y0 (north), x1, y1 (south)
uniform float u_size;   // the picture's width in pixels
uniform float u_opacity;
uniform float u_line;    // strength of the fine line along each band edge (quiet at Home, where they would crowd)
out vec4 o;

// Cubic B-spline through four bilinear lookups: smooth in value and in slope, so contours are curves.
float smoothDepth(vec2 uv) {
  vec2 p = uv * u_size - 0.5;
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f * f + 3.0 * f * f * f) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f * f - 3.0 * f * f * f) / 6.0;
  vec2 w3 = f * f * f / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / u_size;
  vec2 h1 = (i + 1.5 + w3 / g1) / u_size;
  float v = g0.y * (g0.x * texture(u_depth, vec2(h0.x, h0.y)).r + g1.x * texture(u_depth, vec2(h1.x, h0.y)).r)
          + g1.y * (g0.x * texture(u_depth, vec2(h0.x, h1.y)).r + g1.x * texture(u_depth, vec2(h1.x, h1.y)).r);
  return ${DEPTH_MAX.toFixed(1)} * pow(v, ${(1 / DEPTH_GAMMA).toFixed(5)});
}

void main() {
  vec2 uv = (v_m - u_ext.xy) / (u_ext.zw - u_ext.xy);
  float d = smoothDepth(uv);
  if (d < 120.0) discard;
  float px = max(fwidth(d), 0.0001); // metres of depth across one screen pixel
  // The wash: nothing on the shelf, then deepening smoothly.
  float a = 0.2 * (1.0 - exp(-max(d - 150.0, 0.0) / 1500.0)) * smoothstep(120.0, 320.0, d);
  // Bands: at 200 m, 500 m and then every 500 m the ink steps a little darker. On a slope the step is a
  // soft edge with a fine line along it; where the floor is nearly flat it spreads into a plain gradient.
  float line = 0.0;
  for (int k = 0; k < 11; k++) {
    float level = k == 0 ? 200.0 : 500.0 * float(k);
    float w = max(2.2 * px, 18.0 + 0.035 * level);
    float x = (d - level) / w;
    a += 0.013 * smoothstep(-1.0, 1.0, x);
    line += exp(-x * x * 2.5) * min(1.0, 2.2 * px / w) * (level > 3200.0 ? 0.5 : 1.0);
  }
  a += 0.05 * u_line * min(line, 1.0);
  // The picture ends far outside any view the map allows; feather it anyway.
  vec2 e = min(uv, 1.0 - uv);
  a *= smoothstep(0.0, 0.03, e.x) * smoothstep(0.0, 0.03, e.y) * u_opacity;
  o = vec4(vec3(0.149, 0.275, 0.376) * a, a);
}`;

export class SeaFloorLayer implements CustomLayerInterface {
  id = SEAFLOOR_LAYER;
  type = "custom" as const;
  renderingMode = "2d" as const;
  private map: MLMap | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private buf: WebGLBuffer | null = null;
  private tex: WebGLTexture | null = null;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private image: HTMLImageElement | null = null;
  private size = 0;

  constructor(private url = "/data/ocean-depth.png") {}

  /** Whether the depth picture has arrived (for the browser checks). */
  ready() {
    return this.size > 0;
  }

  onAdd(map: MLMap, gl: WebGL2RenderingContext) {
    this.map = map;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("[seafloor] shader", gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn("[seafloor] program", gl.getProgramInfoLog(p));
      return;
    }
    this.program = p;
    for (const u of ["u_matrix", "u_depth", "u_ext", "u_size", "u_opacity", "u_line"]) this.uni[u] = gl.getUniformLocation(p, u);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    const x0 = mercX(BOX.west), x1 = mercX(BOX.east), yN = mercY(BOX.north), yS = mercY(BOX.south);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, yN, x1, yN, x0, yS, x1, yS]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.tex = gl.createTexture();
    const img = new Image();
    img.onload = () => {
      this.image = img;
      map.triggerRepaint();
    };
    img.onerror = () => console.warn("[seafloor] depth picture did not load; no depth shading");
    img.src = this.url;
  }

  onRemove(_map: MLMap, gl: WebGL2RenderingContext) {
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.tex);
    gl.deleteBuffer(this.buf);
    gl.deleteVertexArray(this.vao);
    this.program = null;
  }

  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const m = this.map;
    if (!m || !this.program) return;
    if (this.image) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.size = this.image.naturalWidth;
      this.image = null;
    }
    if (!this.size) return;
    const z = m.getZoom();
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uni.u_matrix, false, args.defaultProjectionData.mainMatrix as Float32Array);
    gl.uniform4f(this.uni.u_ext, mercX(BOX.west), mercY(BOX.north), mercX(BOX.east), mercY(BOX.south));
    gl.uniform1f(this.uni.u_size, this.size);
    gl.uniform1f(this.uni.u_opacity, z <= 4 ? 1 : z >= 12 ? 0.8 : 1 - (0.2 * (z - 4)) / 8);
    gl.uniform1f(this.uni.u_line, 0.2 + 0.8 * Math.min(1, Math.max(0, (z - 5.5) / 2.5)));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.uni.u_depth, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}

/** Adds the sea floor right above the plain ocean (below the sovereign-lands tint's neighbours, wave marks and everything else). */
export function addSeaFloor(m: MLMap, url?: string): SeaFloorLayer | null {
  if (m.getLayer(SEAFLOOR_LAYER) || !m.getLayer("water-ocean")) return null;
  const ids = m.getLayersOrder();
  const layer = new SeaFloorLayer(url);
  m.addLayer(layer, ids[ids.indexOf("water-ocean") + 1]);
  return layer;
}
