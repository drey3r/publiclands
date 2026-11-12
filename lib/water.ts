import type { Map as MLMap, StyleImageInterface } from "maplibre-gl";

/**
 * Inland water that visibly moves, gently: glints on the big lakes (Tahoe, Clear Lake, Mono, Shasta,
 * the Salton Sea), nine large reservoirs and the Delta's channels, and light dashes sliding downstream
 * on the major rivers. Illustrative, not data.
 *
 * The shapes are our own copy of the basemap's water (data/ref/water-shimmer.geojson,
 * scripts/make-water.mjs), in pieces with ids: lakes and the Delta in cells of about 2 km, rivers in
 * long runs heading downstream (24 km for close zooms, 96 km for far ones: the dashes are a pattern
 * that slides along a line and starts again with every line, so a run must be longer than the pattern).
 * The pieces are what lets the movement step aside: wherever a cluster, lease mark or icon sits on the
 * water, the pieces under and around it are faded out (feature state, set when the map comes to rest;
 * no per-frame work).
 *
 * The layers sit right below the clouds: above the water's own color and the sovereign-lands tint
 * (which covered the first version on Tahoe and Clear Lake), below county lines, every name and every
 * mark. The lakes and the Delta show from Home, the rivers from a little closer; all of it to zoom
 * 12. The file is fetched once, after the map first comes to rest; the small patterns are redrawn by
 * the ambience ticker only while moving water is in view. Not loaded on phones.
 */

export const SHIMMER_SOURCE = "water-shimmer";
export const LAKE_LAYER = "lake-shimmer";
/** The Delta: narrow channels, so a finer, denser pattern than the open lakes (theirs put almost nothing on a channel 8 px wide). */
export const DELTA_LAYER = "delta-shimmer";
const DELTA_IMAGE = "delta-shimmer";
export const RIVER_LAYER = "river-drift";
export const RIVER_FAR_LAYER = "river-drift-far";
/** Below this zoom the rivers are drawn from their long runs, above it from the shorter ones. */
const RIVER_NEAR_Z = 8;
/** The rivers' drift fades in from here (the lakes and the Delta show from Home). */
export const RIVER_MIN_Z = 5.6;
/** Whole to zoom 12, gone by here, where lease icons and their detail own the water. */
export const SHIMMER_MAX_Z = 12.4;
const LAKE_IMAGE = "lake-shimmer";
/** A denser, smaller pattern for the zooms where a big lake is a few dozen pixels across. */
const LAKE_IMAGE_FAR = "lake-shimmer-far";
const LAKE_FAR_BELOW_Z = 7.6;
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

/**
 * Lakes: a seamless tile of short glints, each a white arc over a darker one (so it reads on pale
 * water), brightening and dimming on its own slow breath while the whole field drifts across.
 */
class LakePattern implements StyleImageInterface {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  private ctx: CanvasRenderingContext2D;
  private glints: { x: number; y: number; len: number; period: number; phase: number }[] = [];
  private dirty = true;

  /** `size`: the tile in CSS pixels; `count` glints of `len` to `len + more` pixels; `drift` pixels a second. */
  constructor(private size: number, count: number, len: number, more: number, private drift: number, seed: number) {
    this.width = this.height = size * 2;
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
    const c = document.createElement("canvas");
    c.width = c.height = size * 2;
    this.ctx = c.getContext("2d", { willReadFrequently: true })!;
    const r = rng(seed);
    const gap = size / Math.sqrt(count);
    for (let tries = 0; this.glints.length < count && tries < 4000; tries++) {
      const x = r() * size, y = r() * size;
      const ok = this.glints.every((g) => {
        const dx = Math.min(Math.abs(g.x - x), size - Math.abs(g.x - x)), dy = Math.min(Math.abs(g.y - y), size - Math.abs(g.y - y));
        return (dx / (gap * 1.05)) ** 2 + (dy / (gap * 0.6)) ** 2 > 1;
      });
      if (ok) this.glints.push({ x, y, len: len + r() * more, period: 2.6 + r() * 2.8, phase: r() * Math.PI * 2 });
    }
  }

  draw(t: number) {
    const { ctx, size } = this;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = "round";
    const drift = (t * this.drift) % size;
    for (const g of this.glints) {
      // Bright most of its time, with a slow dip to nothing: movement you can see, never a blink.
      const s = Math.max(0, 0.62 + 0.5 * Math.sin((t * Math.PI * 2) / g.period + g.phase));
      if (s <= 0.02) continue;
      const a = Math.min(1, s);
      const x = (g.x + drift) % size, half = (g.len * (0.7 + 0.3 * a)) / 2;
      // A little rise and fall with the breath.
      const y = g.y + 0.8 * Math.sin((t * Math.PI * 2) / (g.period * 1.7) + g.phase);
      for (const dx of [-size, 0, size])
        for (const dy of [-size, 0, size]) {
          if (x + dx < -12 || x + dx > size + 12 || y + dy < -4 || y + dy > size + 4) continue;
          for (const [off, style, w] of [[1.1, `rgba(74,112,138,${(0.5 * a).toFixed(3)})`, 1.1], [0, `rgba(255,255,255,${(0.95 * a).toFixed(3)})`, 1.35]] as const) {
            ctx.strokeStyle = style;
            ctx.lineWidth = w;
            ctx.beginPath();
            // A shallow arc, like a small wave mark, not a ruled dash.
            ctx.moveTo(x + dx - half, y + dy + off + 0.5);
            ctx.quadraticCurveTo(x + dx, y + dy + off - 1.1, x + dx + half, y + dy + off + 0.5);
            ctx.stroke();
          }
        }
    }
    this.dirty = true;
  }

  render() {
    if (!this.dirty) return false;
    this.dirty = false;
    this.data.set(this.ctx.getImageData(0, 0, this.width, this.height).data);
    return true;
  }
}

/** Rivers: bright dashes with a darker edge that slide along the line, which runs downstream. */
class RiverPattern implements StyleImageInterface {
  width = 192;
  height = 12;
  data = new Uint8ClampedArray(192 * 12 * 4);
  private dirty = true;

  draw(t: number) {
    const { width: W, height: H, data } = this;
    for (let x = 0; x < W; x++) {
      // Two dashes a tile (so it repeats), about 14 px a second downstream, the second one fainter.
      const p = ((x / W) * 2 - t / 6.9) % 1;
      const u = p < 0 ? p + 1 : p;
      const dash = Math.max(0, Math.sin(Math.PI * Math.min(1, u / 0.5)));
      const which = Math.floor((x / W) * 2 - t / 6.9) & 1 ? 0.7 : 1;
      for (let y = 0; y < H; y++) {
        const d = Math.abs((y + 0.5) / H - 0.5) * 2;
        const o = (y * W + x) * 4;
        // White core, a blue-grey rim: the dash reads on pale water and on pale land alike.
        const core = d < 0.56;
        data[o] = core ? 255 : 74;
        data[o + 1] = core ? 255 : 112;
        data[o + 2] = core ? 255 : 138;
        data[o + 3] = Math.round(255 * dash * which * (core ? 1 : 0.62 * (1 - (d - 0.56) / 0.44)));
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
 * Adds the lake and river shimmer below `before` (the lowest layer that must stay above it), once the
 * map has first come to rest. `onChange` is called when what is visible changes (the
 * ticker may need to start or stop).
 */
export function addShimmer(m: MLMap, opts: { url?: string; before: () => string | undefined; onChange: () => void }): Shimmer {
  const lake = new LakePattern(96, 24, 5.5, 6, 3.2, 1851);
  const lakeFar = new LakePattern(40, 10, 2.6, 2.4, 1.6, 977);
  const delta = new LakePattern(36, 13, 3.4, 3, 4.5, 4409);
  const river = new RiverPattern();
  /** Each piece: its kind and points on it in mercator (a cell's centre; along a river run, about every 2 km). */
  let cells: { id: number; k: "lake" | "delta" | "river" | "riverfar"; pts: number[] }[] = [];
  let state: "none" | "loading" | "ready" | "failed" = "none";
  let dead = false;
  let shown = 0;
  let hiddenCount = 0;
  const hide = new Map<number, number>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const inZoom = () => m.getZoom() < SHIMMER_MAX_Z;
  // Zoom must be the outermost expression: the per-cell fade goes inside its stops.
  const cell = ["-", 1, ["coalesce", ["feature-state", "hide"], 0]];
  const opacity = (from: number, to: number) =>
    ["interpolate", ["linear"], ["zoom"], ...(from > 0 ? [from, 0, from + 0.5, cell] : [0, cell]), ...(to < 12 ? [to - 0.25, cell, to + 0.25, 0] : [12, cell, SHIMMER_MAX_Z, 0])];

  async function load() {
    if (state !== "none" || dead) return;
    state = "loading";
    try {
      const res = await fetch(opts.url ?? "/data/water-shimmer.geojson");
      if (!res.ok) throw new Error(`water shimmer ${res.status}`);
      const data = (await res.json()) as GeoJSON.FeatureCollection;
      if (dead) return;
      cells = data.features.map((f) => {
        const { k, c } = f.properties as { k: "lake" | "delta" | "river" | "riverfar"; c: number[] };
        const pts: number[] = [];
        for (let i = 0; i + 1 < c.length; i += 2) pts.push((c[i] + 180) / 360, 0.5 - Math.log(Math.tan(Math.PI / 4 + (c[i + 1] * Math.PI) / 360)) / (2 * Math.PI));
        return { id: f.id as number, k, pts };
      });
      lake.draw(40);
      lakeFar.draw(40);
      delta.draw(40);
      river.draw(40);
      if (!m.hasImage(LAKE_IMAGE)) m.addImage(LAKE_IMAGE, lake, { pixelRatio: 2 });
      if (!m.hasImage(LAKE_IMAGE_FAR)) m.addImage(LAKE_IMAGE_FAR, lakeFar, { pixelRatio: 2 });
      if (!m.hasImage(DELTA_IMAGE)) m.addImage(DELTA_IMAGE, delta, { pixelRatio: 2 });
      if (!m.hasImage(RIVER_IMAGE)) m.addImage(RIVER_IMAGE, river, { pixelRatio: 2 });
      m.addSource(SHIMMER_SOURCE, { type: "geojson", data, tolerance: 0.2, buffer: 8 });
      const before = opts.before();
      m.addLayer(
        {
          id: LAKE_LAYER,
          type: "fill",
          source: SHIMMER_SOURCE,
          filter: ["==", ["get", "k"], "lake"],
          maxzoom: SHIMMER_MAX_Z,
          paint: { "fill-pattern": ["step", ["zoom"], LAKE_IMAGE_FAR, LAKE_FAR_BELOW_Z, LAKE_IMAGE] as unknown as string, "fill-opacity": opacity(0, 12) as unknown as number },
        },
        before,
      );
      m.addLayer(
        { id: DELTA_LAYER, type: "fill", source: SHIMMER_SOURCE, filter: ["==", ["get", "k"], "delta"], maxzoom: SHIMMER_MAX_Z, paint: { "fill-pattern": DELTA_IMAGE, "fill-opacity": opacity(0, 12) as unknown as number } },
        before,
      );
      for (const [id, k, from, to] of [[RIVER_FAR_LAYER, "riverfar", RIVER_MIN_Z, RIVER_NEAR_Z], [RIVER_LAYER, "river", RIVER_NEAR_Z - 0.25, 12]] as const)
        m.addLayer(
          {
            id,
            type: "line",
            source: SHIMMER_SOURCE,
            filter: ["==", ["get", "k"], k],
            minzoom: from,
            maxzoom: to < 12 ? to + 0.25 : SHIMMER_MAX_Z,
            layout: { "line-join": "round", "line-cap": "butt" },
            paint: {
              "line-pattern": RIVER_IMAGE,
              "line-width": ["interpolate", ["linear"], ["zoom"], 6, 3.2, 9, 5, 12, 6.5],
              "line-opacity": opacity(from, to) as unknown as number,
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
    const marksNow = marks();
    const next = new Map<number, number>();
    shown = hiddenCount = 0;
    for (const cell of cells) {
      if (cell.k === "river" ? z < RIVER_NEAR_Z - 0.25 : cell.k === "riverfar" ? z < RIVER_MIN_Z || z > RIVER_NEAR_Z + 0.25 : false) continue;
      // A lake cell reaches half a cell from its centre; a river run is its points.
      const still = cell.k === "lake" || cell.k === "delta"; // a cell of standing water, not a river run
      const reach = still ? half : 0;
      let on = false;
      let h = 0;
      let seen = 0, covered = 0;
      for (let i = 0; i < cell.pts.length && (h < 1 || !still); i += 2) {
        // Top-down the screen position is plain arithmetic; tilted or turned, ask the map.
        let x: number, y: number;
        if (top) {
          x = (cell.pts[i] - cx) * ws + W / 2;
          y = (cell.pts[i + 1] - cy) * ws + H / 2;
        } else {
          const p = m.project([cell.pts[i] * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - 2 * cell.pts[i + 1]))) * 180) / Math.PI]);
          x = p.x;
          y = p.y;
        }
        if (x < -reach - 40 || y < -reach - 40 || x > W + reach + 40 || y > H + reach + 40) continue;
        on = true;
        seen++;
        if (!still) {
          // A river run passes under the marks on it (they are drawn above it) and shows between them;
          // it is faded out only where nearly all of it on screen lies under marks.
          if (marksNow.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + 4)) covered++;
          continue;
        }
        for (const p of marksNow) {
          // Under the mark or touching its edge (2 px, plus half the cell's own reach): hidden. 10 px further:
          // whole again. Tight on purpose: the Delta's channels are lined with marks, and a wider calm
          // left no water moving there at all.
          const d = Math.hypot(p.x - x, p.y - y) - p.r - reach * 0.5 - 2;
          if (d >= 10) continue;
          h = Math.max(h, d <= 0 ? 1 : 1 - d / 10);
          if (h >= 1) break;
        }
      }
      if (!on) continue;
      if (!still) h = covered / seen > 0.85 ? 1 : 0;
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
  // Fetched once the map has drawn and come to rest, so it never competes with the first view.
  if (m.loaded() && !m.isMoving()) load();
  else m.once("idle", load);

  return {
    draw(t) {
      if (state !== "ready") return;
      if (m.getZoom() < LAKE_FAR_BELOW_Z + 0.5) lakeFar.draw(t);
      if (m.getZoom() > LAKE_FAR_BELOW_Z - 0.5) lake.draw(t);
      delta.draw(t);
      if (m.getZoom() >= RIVER_MIN_Z) river.draw(t);
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
