import type { CanvasSource, Map as MLMap, StyleImageInterface } from "maplibre-gl";

/**
 * Ambience: the ocean's moving wave marks and the live cloud layer.
 *
 * Both run off one slow ticker (about 12 frames a second, never 60; clouds redraw at 4) that only
 * asks the map to repaint, so the map can still rest and fire `idle` between frames. The ticker
 * stops past the zooms where waves and clouds have faded, while the tab is hidden, on screens
 * 600 px wide or less, and when the reader prefers reduced motion (one still frame instead).
 */

const FPS = 12;
/** Wave marks fade out by this zoom; past it the ticker stops (lease marks and icons own the water there). */
export const WAVES_MAX_Z = 11;
/** Clouds fade out by this zoom. */
const CLOUDS_MAX_Z = 10.5;
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
const invMercY = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

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
  /** Mean 10 m wind over the grid, m/s, toward east (u) and north (v). */
  wind: [number, number];
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
function sampler(tex: Float32Array) {
  return (x: number, y: number) => {
    const fx = ((x % NOISE) + NOISE) % NOISE;
    const fy = ((y % NOISE) + NOISE) % NOISE;
    const x0 = fx | 0;
    const y0 = fy | 0;
    const tx = fx - x0;
    const ty = fy - y0;
    const x1 = (x0 + 1) & (NOISE - 1);
    const y1 = (y0 + 1) & (NOISE - 1);
    const a = tex[y0 * NOISE + x0];
    const b = tex[y0 * NOISE + x1];
    const c = tex[y1 * NOISE + x0];
    const d = tex[y1 * NOISE + x1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
}

/**
 * Turns the coarse model grid into soft clouds on a small canvas (the map scales it up).
 * Cover sets how much of the noise passes a threshold, so thin cover reads as scattered puffs and
 * full cover as a solid deck; high cloud is drawn thinner and streakier. Each cloud casts a faint
 * shadow down-right, matching the hillshade's light from the northwest.
 */
export class CloudField {
  canvas: HTMLCanvasElement;
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private W: number;
  private H: number;
  private lowD: Float32Array;
  private highD: Float32Array;
  private edge: Float32Array;
  private alpha: Float32Array;
  private puff = sampler(fbm(NOISE, 7, 6, 4));
  private puff2 = sampler(fbm(NOISE, 31, 5, 4));
  private streak = sampler(fbm(NOISE, 53, 4, 4, 4));
  private wind: [number, number];

  constructor(g: CloudGrid, width = 300) {
    const w = g.lon0;
    const e = g.lon0 + (g.nx - 1) * g.step;
    const s = g.lat0;
    const n = g.lat0 + (g.ny - 1) * g.step;
    this.coordinates = [[w, n], [e, n], [e, s], [w, s]];
    const lonRad = ((e - w) * Math.PI) / 180;
    const yTop = mercY(n);
    const yBot = mercY(s);
    this.W = width;
    this.H = Math.round((width * (yTop - yBot)) / lonRad);
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.ctx = this.canvas.getContext("2d")!;
    this.img = this.ctx.createImageData(this.W, this.H);
    const N = this.W * this.H;
    this.lowD = new Float32Array(N);
    this.highD = new Float32Array(N);
    this.edge = new Float32Array(N);
    this.alpha = new Float32Array(N);
    const sp = Math.hypot(g.wind[0], g.wind[1]) || 1;
    // Drift direction from the wind, at a slow fixed pace (the data is a snapshot, not a forecast).
    this.wind = [g.wind[0] / sp, g.wind[1] / sp];

    // Grid → canvas, with smoothstep-weighted bilinear so the 0.5° cells don't show as diamonds.
    const at = (arr: number[], i: number, j: number) => arr[Math.min(g.ny - 1, Math.max(0, j)) * g.nx + Math.min(g.nx - 1, Math.max(0, i))] / 100;
    const sample = (arr: number[], fx: number, fy: number) => {
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const tx = smooth(0, 1, fx - i);
      const ty = smooth(0, 1, fy - j);
      return (at(arr, i, j) * (1 - tx) + at(arr, i + 1, j) * tx) * (1 - ty) + (at(arr, i, j + 1) * (1 - tx) + at(arr, i + 1, j + 1) * tx) * ty;
    };
    for (let py = 0; py < this.H; py++) {
      const lat = invMercY(yTop - ((py + 0.5) / this.H) * (yTop - yBot));
      const fy = (lat - g.lat0) / g.step;
      const ey = Math.min(py, this.H - 1 - py) / this.H;
      for (let px = 0; px < this.W; px++) {
        const fx = (px + 0.5) / this.W * (g.nx - 1);
        const k = py * this.W + px;
        const lo = sample(g.low, fx, fy);
        const mi = sample(g.mid, fx, fy);
        this.lowD[k] = 1 - (1 - lo) * (1 - 0.85 * mi);
        this.highD[k] = sample(g.high, fx, fy);
        const ex = Math.min(px, this.W - 1 - px) / this.W;
        this.edge[k] = smooth(0, 0.14, ex) * smooth(0, 0.12, ey);
      }
    }
  }

  /** Draw the frame for time `t` (seconds). */
  draw(t: number) {
    const { W, H, lowD, highD, edge, alpha, puff, puff2, streak } = this;
    const [u, v] = this.wind;
    // Canvas px a second: y grows south, so northward wind moves the texture up.
    const d1 = t * 0.55;
    const d2 = t * 0.4;
    const d3 = t * 0.9;
    const ox1 = -u * d1, oy1 = v * d1;
    const ox2 = -u * d2 + t * 0.12, oy2 = v * d2 - t * 0.08;
    const ox3 = -u * d3, oy3 = v * d3;
    const SC = 1.15; // noise texels per canvas px
    for (let py = 0, k = 0; py < H; py++) {
      for (let px = 0; px < W; px++, k++) {
        const e = edge[k];
        if (e <= 0) {
          alpha[k] = 0;
          continue;
        }
        const dl = lowD[k];
        const dh = highD[k];
        let a = 0;
        if (dl > 0.04) {
          const n = 0.6 * puff(px * SC + ox1, py * SC + oy1) + 0.4 * puff2(px * SC * 1.7 + ox2, py * SC * 1.7 + oy2);
          const th = 1 - dl;
          a = smooth(th - 0.05, th + 0.3, n);
        }
        if (dh > 0.04) {
          const th = 1 - dh;
          const h = 0.5 * smooth(th, th + 0.45, streak(px * 0.9 + ox3, py * 1.6 + oy3));
          a = 1 - (1 - a) * (1 - h);
        }
        alpha[k] = a * e;
      }
    }
    const data = this.img.data;
    const SX = 3;
    const SY = 3;
    for (let py = 0, k = 0; py < H; py++) {
      for (let px = 0; px < W; px++, k++) {
        const a = alpha[k];
        const sk = py >= SY && px >= SX ? alpha[k - SY * W - SX] : 0;
        const s = sk * 0.2;
        const outA = a + (1 - a) * s;
        const o = k * 4;
        if (outA < 0.004) {
          data[o + 3] = 0;
          continue;
        }
        // Cloud: warm white. Shadow: the map's ink, cool.
        const w = a / outA;
        data[o] = 252 * w + 52 * (1 - w);
        data[o + 1] = 251 * w + 62 * (1 - w);
        data[o + 2] = 247 * w + 72 * (1 - w);
        data[o + 3] = outA * 255;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}

// ---------------------------------------------------------------------------------------------
// Wiring

export type Ambience = {
  setClouds: (on: boolean) => void;
  /** Whether the animation ticker is running (for the browser checks). */
  running: () => boolean;
  destroy: () => void;
};

/**
 * Adds the wave pattern over the ocean (`ocean-waves`, right above `water-ocean`) and, once
 * /api/clouds answers, the cloud layer below the first label layer. Returns switches.
 */
export function addAmbience(
  m: MLMap,
  opts: { clouds: boolean; waves?: boolean; cloudsUrl?: string; onClouds?: (time: string | null) => void },
): Ambience {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Phones get the same still frame: measured on a 390 px viewport at 4x CPU throttle, the ticker's
  // repaints cost ~5-10% of panning frame rate and a cloud frame takes ~27 ms.
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
  let field: CloudField | null = null;
  let src: CanvasSource | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let refetch: ReturnType<typeof setInterval> | null = null;
  let dead = false;

  const cloudsVisible = () => !!(cloudsOn && field && m.getZoom() < CLOUDS_MAX_Z);
  const wavesVisible = () => opts.waves !== false && m.getZoom() < WAVES_MAX_Z;

  const firstLabel = () => m.getStyle().layers.find((l) => l.type === "symbol")?.id;

  let tick = 0;
  function frame() {
    const t = now();
    if (!wavesVisible() && !cloudsVisible()) return stop();
    if (wavesVisible()) waves.draw(t);
    // Clouds drift a fraction of a pixel a second: a third of the ticks (4 fps) is plenty.
    if (cloudsVisible() && field && src && ++tick % 3 === 0) {
      field.draw(t);
      // A canvas source uploads only while "playing"; play for one frame, then rest.
      src.play();
      m.once("render", () => src?.pause());
    }
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
  const onMotion = () => (reduce() ? stop() : start());
  motion.addEventListener?.("change", onMotion);
  small.addEventListener?.("change", onMotion);

  async function loadClouds() {
    try {
      const res = await fetch(opts.cloudsUrl ?? "/api/clouds");
      if (!res.ok) throw new Error(`clouds ${res.status}`);
      const g = (await res.json()) as CloudGrid;
      if (dead || !g?.nx) return;
      field = new CloudField(g);
      field.draw(now());
      if (m.getSource(CLOUD_SOURCE)) {
        if (m.getLayer(CLOUD_LAYER)) m.removeLayer(CLOUD_LAYER);
        m.removeSource(CLOUD_SOURCE);
      }
      m.addSource(CLOUD_SOURCE, { type: "canvas", canvas: field.canvas, coordinates: field.coordinates, animate: false });
      src = m.getSource(CLOUD_SOURCE) as CanvasSource;
      // Canvas sources ignore the spec's attribution; set it on the source so the attribution control
      // lists Open-Meteo while the cloud layer is shown (and drops it when clouds are off).
      (src as unknown as { attribution?: string }).attribution = CLOUDS_CREDIT;
      m.addLayer(
        {
          id: CLOUD_LAYER,
          type: "raster",
          source: CLOUD_SOURCE,
          layout: { visibility: cloudsOn ? "visible" : "none" },
          paint: {
            "raster-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.72, 7, 0.6, 9, 0.3, CLOUDS_MAX_Z, 0],
            "raster-fade-duration": 0,
            "raster-resampling": "linear",
          },
        },
        firstLabel(),
      );
      opts.onClouds?.(g.time);
      start();
    } catch (e) {
      console.warn("[clouds]", e instanceof Error ? e.message : e);
      opts.onClouds?.(null);
    }
  }

  // Clouds are off by default: nothing is fetched until the reader turns them on. A page left open
  // then picks up new clouds every three hours (the route's cache period).
  function wantClouds() {
    if (refetch || dead) return;
    loadClouds();
    refetch = setInterval(loadClouds, 3 * 3600 * 1000);
  }
  if (cloudsOn) wantClouds();
  start();

  return {
    running: () => timer !== null,
    setClouds(on) {
      cloudsOn = on;
      if (on) wantClouds();
      if (m.getLayer(CLOUD_LAYER)) m.setLayoutProperty(CLOUD_LAYER, "visibility", on ? "visible" : "none");
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
    },
  };
}
