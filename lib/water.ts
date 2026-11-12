import type { Map as MLMap, StyleImageInterface } from "maplibre-gl";

/**
 * Inland water with a little movement: a faint glint on the big lakes (Tahoe, Clear Lake, Mono,
 * Shasta, the Salton Sea) and the Delta's channels, and light dashes sliding downstream on the major
 * rivers.
 *
 * The shapes are our own copy of the basemap's water, cut into cells of about 2 km, each with an id
 * (data/ref/water-shimmer.geojson, scripts/make-water.mjs). That is what lets the shimmer step aside:
 * wherever a cluster, lease mark or icon sits on the water, the cells under and around it are faded
 * out (feature state, set when the map comes to rest; no per-frame work).
 *
 * Cost: nothing at Home. The file is fetched the first time the reader zooms past SHIMMER_MIN_Z, the
 * two small patterns are redrawn by the ambience ticker only while shimmering water is in view, and
 * the layers sit below every land fill, line, name and mark. Not loaded on phones.
 */

export const SHIMMER_SOURCE = "water-shimmer";
export const LAKE_LAYER = "lake-shimmer";
export const RIVER_LAYER = "river-drift";
/** The shimmer fades in from here (Home is lower on any screen that fits the state)… */
export const SHIMMER_MIN_Z = 6.4;
/** …and is gone by here, where lease icons and their detail own the water. */
export const SHIMMER_MAX_Z = 12;
const LAKE_IMAGE = "lake-shimmer";
const RIVER_IMAGE = "river-drift";
/** Cells are tiles of this zoom (scripts/make-water.mjs CELL_Z). */
const CELL_Z = 14;

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

/** Lakes: a seamless 96 px tile of a few short glints, each brightening and dimming on its own slow breath. */
class LakePattern implements StyleImageInterface {
  width = 192;
  height = 192;
  data = new Uint8ClampedArray(192 * 192 * 4);
  private ctx: CanvasRenderingContext2D;
  private glints: { x: number; y: number; len: number; period: number; phase: number }[] = [];
  private dirty = true;

  constructor() {
    const c = document.createElement("canvas");
    c.width = c.height = 192;
    this.ctx = c.getContext("2d", { willReadFrequently: true })!;
    const r = rng(1851);
    for (let tries = 0; this.glints.length < 9 && tries < 2000; tries++) {
      const x = r() * 96, y = r() * 96;
      const ok = this.glints.every((g) => {
        const dx = Math.min(Math.abs(g.x - x), 96 - Math.abs(g.x - x)), dy = Math.min(Math.abs(g.y - y), 96 - Math.abs(g.y - y));
        return (dx / 26) ** 2 + (dy / 15) ** 2 > 1;
      });
      if (ok) this.glints.push({ x, y, len: 3 + r() * 5, period: 3.5 + r() * 4, phase: r() * Math.PI * 2 });
    }
  }

  draw(t: number) {
    const { ctx } = this;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, 96, 96);
    ctx.lineCap = "round";
    ctx.lineWidth = 1;
    const drift = (t * 0.7) % 96;
    for (const g of this.glints) {
      const s = Math.sin((t * Math.PI * 2) / g.period + g.phase);
      if (s <= 0) continue; // dark half its time: a glint, not a pattern
      ctx.strokeStyle = `rgba(250,252,253,${(0.55 * s * s).toFixed(3)})`;
      const x = (g.x + drift) % 96, half = (g.len * (0.6 + 0.4 * s)) / 2;
      for (const dx of [-96, 0, 96]) {
        if (x + dx < -8 || x + dx > 104) continue;
        ctx.beginPath();
        // A shallow arc, like a small wave mark, not a ruled dash.
        ctx.moveTo(x + dx - half, g.y + 0.5);
        ctx.quadraticCurveTo(x + dx, g.y - 0.9, x + dx + half, g.y + 0.5);
        ctx.stroke();
      }
    }
    this.dirty = true;
  }

  render() {
    if (!this.dirty) return false;
    this.dirty = false;
    this.data.set(this.ctx.getImageData(0, 0, 192, 192).data);
    return true;
  }
}

/** Rivers: soft light dashes that slide along the line, which runs downstream. */
class RiverPattern implements StyleImageInterface {
  width = 192;
  height = 8;
  data = new Uint8ClampedArray(192 * 8 * 4);
  private dirty = true;

  draw(t: number) {
    const { width: W, height: H, data } = this;
    for (let x = 0; x < W; x++) {
      // Two dashes a tile (so it repeats), about 6 px a second downstream, the second one fainter.
      const p = ((x / W) * 2 - t / 16) % 1;
      const u = p < 0 ? p + 1 : p;
      const dash = Math.max(0, Math.sin(Math.PI * Math.min(1, u / 0.3))) ** 2;
      const which = Math.floor((x / W) * 2 - t / 16) & 1 ? 0.6 : 1;
      for (let y = 0; y < H; y++) {
        const d = Math.abs((y + 0.5) / H - 0.5) * 2;
        const o = (y * W + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = 255;
        data[o + 3] = Math.round(165 * dash * which * (1 - d * d));
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

export type Shimmer = {
  /** Draw the patterns' frame for time `t` (the ambience ticker; only called while visible()). */
  draw: (t: number) => void;
  /** Whether shimmering water is on screen at this zoom, not all of it hidden under marks. */
  visible: () => boolean;
  /** For the browser checks: cells on screen, and how many of them are faded for a mark. */
  cells: () => { shown: number; hidden: number; loaded: boolean };
  destroy: () => void;
};

/**
 * Adds the lake and river shimmer below `before` (the lowest layer that must stay above it) once the
 * reader first zooms in past SHIMMER_MIN_Z. `onChange` is called when what is visible changes (the
 * ticker may need to start or stop).
 */
export function addShimmer(m: MLMap, opts: { url?: string; before: () => string | undefined; onChange: () => void }): Shimmer {
  const lake = new LakePattern();
  const river = new RiverPattern();
  let cells: { id: number; x: number; y: number }[] = []; // mercator centres
  let state: "none" | "loading" | "ready" | "failed" = "none";
  let dead = false;
  let shown = 0;
  let hiddenCount = 0;
  const hide = new Map<number, number>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const inZoom = () => m.getZoom() >= SHIMMER_MIN_Z && m.getZoom() < SHIMMER_MAX_Z;
  // Zoom must be the outermost expression: the per-cell fade goes inside its stops.
  const opacity = (k: number) => {
    const cell = ["*", k, ["-", 1, ["coalesce", ["feature-state", "hide"], 0]]];
    return ["interpolate", ["linear"], ["zoom"], SHIMMER_MIN_Z, 0, SHIMMER_MIN_Z + 0.7, cell, 10.8, cell, SHIMMER_MAX_Z, 0];
  };

  async function load() {
    if (state !== "none" || dead) return;
    state = "loading";
    try {
      const res = await fetch(opts.url ?? "/data/water-shimmer.geojson");
      if (!res.ok) throw new Error(`water shimmer ${res.status}`);
      const data = (await res.json()) as GeoJSON.FeatureCollection;
      if (dead) return;
      cells = data.features.map((f) => {
        const [lon, lat] = (f.properties as { c: [number, number] }).c;
        return { id: f.id as number, x: (lon + 180) / 360, y: 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI) };
      });
      lake.draw(40);
      river.draw(40);
      if (!m.hasImage(LAKE_IMAGE)) m.addImage(LAKE_IMAGE, lake, { pixelRatio: 2 });
      if (!m.hasImage(RIVER_IMAGE)) m.addImage(RIVER_IMAGE, river, { pixelRatio: 2 });
      m.addSource(SHIMMER_SOURCE, { type: "geojson", data, tolerance: 0.2, buffer: 8 });
      const before = opts.before();
      m.addLayer(
        {
          id: LAKE_LAYER,
          type: "fill",
          source: SHIMMER_SOURCE,
          filter: ["==", ["get", "k"], "lake"],
          minzoom: SHIMMER_MIN_Z,
          maxzoom: SHIMMER_MAX_Z,
          paint: { "fill-pattern": LAKE_IMAGE, "fill-opacity": opacity(1) as unknown as number },
        },
        before,
      );
      m.addLayer(
        {
          id: RIVER_LAYER,
          type: "line",
          source: SHIMMER_SOURCE,
          filter: ["==", ["get", "k"], "river"],
          minzoom: SHIMMER_MIN_Z,
          maxzoom: SHIMMER_MAX_Z,
          layout: { "line-join": "round", "line-cap": "butt" },
          paint: {
            "line-pattern": RIVER_IMAGE,
            "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.2, 9, 3, 12, 4.5],
            "line-opacity": opacity(0.9) as unknown as number,
          },
        },
        before,
      );
      state = "ready";
      schedule();
    } catch (e) {
      state = "failed";
      console.warn("[water]", e instanceof Error ? e.message : e);
    }
  }

  /** Lease clusters, marks and icons on screen: every circle layer and every icon layer that is not ours. */
  function marks(): { x: number; y: number; r: number }[] {
    const ids = m.getStyle().layers.filter((l) => (l as { source?: string }).source !== SHIMMER_SOURCE && (l.type === "circle" || (l.type === "symbol" && l.layout?.["icon-image"] != null)) && l.layout?.visibility !== "none").map((l) => l.id);
    if (!ids.length) return [];
    const out: { x: number; y: number; r: number }[] = [];
    const seen = new Set<string>();
    for (const f of m.queryRenderedFeatures({ layers: ids })) {
      if (f.geometry.type !== "Point") continue;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
      const n = Number(f.properties?.point_count) || 0;
      // A cluster's disc: 11 px for one, 22 for a hundred, 34 for nine hundred (the "cluster" layer's radius).
      const s = Math.sqrt(n);
      const r = n ? (s <= 10 ? 11 + ((s - 1) * 11) / 9 : Math.min(34, 22 + ((s - 10) * 12) / 20)) : 12;
      if (seen.has(key)) continue;
      seen.add(key);
      const p = m.project([lng, lat]);
      out.push({ x: p.x, y: p.y, r });
    }
    return out;
  }

  /** Fade the cells under and around each mark; count what is left on screen. */
  function update() {
    timer = null;
    if (dead || state !== "ready") return;
    if (!inZoom()) {
      shown = hiddenCount = 0;
      return;
    }
    const z = m.getZoom();
    const ws = 512 * 2 ** z;
    const c = m.getCenter();
    const cx = (c.lng + 180) / 360, cy = 0.5 - Math.log(Math.tan(Math.PI / 4 + (c.lat * Math.PI) / 360)) / (2 * Math.PI);
    const W = m.getContainer().clientWidth, H = m.getContainer().clientHeight;
    const half = ws / 2 ** CELL_Z / 2; // half a cell, in pixels
    const top = m.getPitch() < 1 && Math.abs(m.getBearing()) < 0.5;
    const pts = marks();
    const next = new Map<number, number>();
    shown = hiddenCount = 0;
    for (const cell of cells) {
      // Top-down the screen position is plain arithmetic; tilted or turned, ask the map.
      let x: number, y: number;
      if (top) {
        x = (cell.x - cx) * ws + W / 2;
        y = (cell.y - cy) * ws + H / 2;
      } else {
        const p = m.project([cell.x * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - 2 * cell.y))) * 180) / Math.PI]);
        x = p.x;
        y = p.y;
      }
      if (x < -half - 60 || y < -half - 60 || x > W + half + 60 || y > H + half + 60) continue;
      let h = 0;
      for (const p of pts) {
        // Clear of the mark's edge by 6 px (plus the cell's own reach): hidden. 30 px further: whole again.
        const d = Math.hypot(p.x - x, p.y - y) - p.r - half - 6;
        if (d >= 30) continue;
        h = Math.max(h, d <= 0 ? 1 : 1 - d / 30);
        if (h >= 1) break;
      }
      shown++;
      if (h >= 1) hiddenCount++;
      if (h > 0) next.set(cell.id, Math.round(h * 10) / 10);
    }
    for (const [id, v] of next) if (hide.get(id) !== v) m.setFeatureState({ source: SHIMMER_SOURCE, id }, { hide: v });
    for (const id of hide.keys()) if (!next.has(id)) m.setFeatureState({ source: SHIMMER_SOURCE, id }, { hide: 0 });
    hide.clear();
    for (const [id, v] of next) hide.set(id, v);
    // The ticker may need to start (shimmer came into view) or may now stop (none left).
    opts.onChange();
  }
  function schedule() {
    if (dead) return;
    if (state === "none" && m.getZoom() >= SHIMMER_MIN_Z) load();
    if (state !== "ready") return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(update, 160);
  }
  // When the map comes to rest, and when the lease marks change under a resting map (filters, clustering).
  const onSource = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (e.sourceId && e.sourceId !== SHIMMER_SOURCE && e.sourceId !== "omt" && e.isSourceLoaded && !m.isMoving()) schedule();
  };
  m.on("moveend", schedule);
  m.on("sourcedata", onSource);
  schedule();

  return {
    draw(t) {
      if (state !== "ready") return;
      lake.draw(t);
      river.draw(t);
    },
    visible: () => state === "ready" && inZoom() && shown - hiddenCount > 0,
    cells: () => ({ shown, hidden: hiddenCount, loaded: state === "ready" }),
    destroy() {
      dead = true;
      if (timer) clearTimeout(timer);
      m.off("moveend", schedule);
      m.off("sourcedata", onSource);
    },
  };
}
