"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap, ExpressionSpecification, MapLayerMouseEvent } from "maplibre-gl";
import { baseStyle } from "@/lib/mapStyle";
import { CA_BOUNDS, CA_PATH, type MaskMode } from "@/lib/config";
import { ERAS, ERA_UNKNOWN, LAYER_INFO, TYPES, TYPE_LABEL } from "@/lib/legend";
import type { LayerManifest, LayerName, MiniLease, OverlayDef } from "@/lib/types";
import type { Place as Space } from "./PlaceCard";

// Served by scripts/sync-data.mjs (webpack can't bundle the v6 module worker).
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type ColorBy = "type" | "era";
export type Bounds = [number, number, number, number];

type Props = {
  leases: MiniLease[];
  colorBy: ColorBy;
  layers: Record<LayerName, boolean>;
  manifest: LayerManifest | null;
  terrain: boolean;
  /** "Leases" big button. */
  showLeases?: boolean;
  /** Public spaces rendered in the current view (from vector tiles), for the list. */
  onSpaces?: (spaces: Space[]) => void;
  overlays: OverlayDef[];
  overlayVis: Record<string, boolean>;
  hover: string | null;
  selected: string | null;
  attribution: string;
  onHover: (prc: string | null) => void;
  onSelect: (prc: string | null) => void;
  onSelectPlace: (id: string | null) => void;
  onViewport: (b: Bounds) => void;
  onReady: (map: MLMap) => void;
  /** Outside-California treatment. */
  mask: MaskMode;
  /** California Home button. */
  onHome: () => void;
};

/** Map control: a California silhouette that returns to the whole state. */
class HomeControl implements maplibregl.IControl {
  private el?: HTMLDivElement;
  constructor(private onClick: () => void) {}
  onAdd() {
    const el = document.createElement("div");
    el.className = "maplibregl-ctrl maplibregl-ctrl-group ca-home";
    el.innerHTML = `<button type="button" title="Show all of California" aria-label="Show all of California"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${CA_PATH}" fill="currentColor" stroke="currentColor" stroke-width="0.8" stroke-linejoin="round"/></svg></button>`;
    el.querySelector("button")!.addEventListener("click", () => this.onClick());
    this.el = el;
    return el;
  }
  onRemove() {
    this.el?.remove();
  }
}

const TYPE_EXPR = ["match", ["get", "t"], ...TYPES.flatMap((t) => [t.key, t.color]), "#8d887c"] as unknown as ExpressionSpecification;
const ERA_EXPR = [
  "step",
  ["coalesce", ["get", "e"], -1],
  ERA_UNKNOWN,
  ...ERAS.flatMap((e) => [e.min, e.color]),
] as unknown as ExpressionSpecification;

function toGeoJSON(ls: MiniLease[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const l of ls)
    for (const pt of l.pts)
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: pt }, properties: { p: l.p, n: l.n, t: l.t, e: l.e, s: l.s, f: l.f, cs: l.cs, x: l.x } });
  return { type: "FeatureCollection", features };
}

export default function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const popup = useRef<maplibregl.Popup | null>(null);
  const cb = useRef(props);
  cb.current = props;
  const byPrc = useRef(new Map<string, MiniLease>());
  const spacesDirty = useRef(true);

  // ---- create map once
  useEffect(() => {
    if (!el.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const m = new maplibregl.Map({
      container: el.current,
      style: baseStyle({ mask: cb.current.mask }),
      bounds: CA_BOUNDS,
      renderWorldCopies: false,
      maxPitch: 75,
      attributionControl: false,
      fadeDuration: reduce ? 0 : 200,
    });
    map.current = m;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __map: MLMap }).__map = m; // dev: camera tuning
    m.on("error", (e) => console.warn("[map]", e.error?.message ?? e));
    // Compact (ⓘ) so credits never cover the bottom of the state; one tap opens them.
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: cb.current.attribution }), "bottom-right");
    // Top left: Home, zoom/compass, locate. The right side holds the view controls.
    m.addControl(new HomeControl(() => cb.current.onHome()), "top-left");
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
    m.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: false }, trackUserLocation: false }), "top-left");
    m.addControl(new maplibregl.ScaleControl({ unit: "imperial", maxWidth: 90 }), "bottom-left");
    m.getCanvas().setAttribute("aria-label", "Map of California public lands and State Lands Commission lease sites");

    m.on("load", () => {
      el.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      m.setSky({ "sky-color": "#dfe5e0", "horizon-color": "#f4efe4", "fog-color": "#f4efe4", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.25, "atmosphere-blend": 0 });

      m.addSource("leases", { type: "geojson", data: toGeoJSON([]), cluster: true, clusterRadius: 44, clusterMaxZoom: 9 });
      m.addSource("hl", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

      m.addLayer({
        id: "cluster",
        type: "circle",
        source: "leases",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#56664f",
          "circle-opacity": 0.9,
          "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "point_count"]], 1, 11, 10, 22, 30, 34],
          "circle-stroke-color": "#faf7f0",
          "circle-stroke-width": 2,
        },
      });
      m.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "leases",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-allow-overlap": true },
        paint: { "text-color": "#faf7f0" },
      });
      // Marker ring for candidates for review / case studies (behind the dot).
      m.addLayer({
        id: "lease-flag",
        type: "circle",
        source: "leases",
        filter: ["all", ["!", ["has", "point_count"]], ["any", ["==", ["get", "f"], 1], ["==", ["get", "cs"], 1]]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 7, 10, 9.5, 15, 13],
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": ["case", ["==", ["get", "x"], 1], "#56664f", "#a4553f"],
          "circle-stroke-width": 1.6,
          "circle-stroke-opacity": 0.9,
        },
      });
      m.addLayer({
        id: "lease-pt",
        type: "circle",
        source: "leases",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": TYPE_EXPR,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3.6, 10, 5.5, 15, 8.5],
          // Score as a subtle ring: heavier and darker when the screen score is higher.
          "circle-stroke-color": "#2b2a26",
          "circle-stroke-width": ["interpolate", ["linear"], ["coalesce", ["get", "s"], 0], 0, 0.5, 100, 2.6],
          "circle-stroke-opacity": ["interpolate", ["linear"], ["coalesce", ["get", "s"], 0], 0, 0.18, 100, 0.8],
        },
      });
      m.addLayer({
        id: "hl-ring",
        type: "circle",
        source: "hl",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 10, 15, 15],
          "circle-color": "rgba(250,247,240,0.35)",
          "circle-stroke-color": "#2b2a26",
          "circle-stroke-width": ["case", ["==", ["get", "sel"], 1], 3, 2],
        },
      });

      // Interaction
      const pointer = (on: boolean) => (m.getCanvas().style.cursor = on ? "pointer" : "");
      m.on("mouseenter", "cluster", () => pointer(true));
      m.on("mouseleave", "cluster", () => pointer(false));
      m.on("click", "cluster", async (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const z = await (m.getSource("leases") as GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id);
        m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z + 0.2 });
      });
      m.on("mousemove", "lease-pt", (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        pointer(true);
        const p = f.properties.p as string;
        if (cb.current.hover !== p) cb.current.onHover(p);
        const l = byPrc.current.get(p);
        if (!l) return;
        const html = `<div style="font-size:12px;line-height:1.35;max-width:220px"><div style="font-weight:600;color:#2b2a26">${esc(l.n)}</div><div style="color:#57534a">PRC ${esc(l.p)} · ${TYPE_LABEL[l.t]} <span style="color:#736e63">(est.)</span></div></div>`;
        popup.current ??= new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "lease-tip" });
        popup.current.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).setHTML(html).addTo(m);
      });
      m.on("mouseleave", "lease-pt", () => {
        pointer(false);
        popup.current?.remove();
        cb.current.onHover(null);
      });
      m.on("click", "lease-pt", (e: MapLayerMouseEvent) => {
        const p = e.features?.[0]?.properties.p as string | undefined;
        if (p) cb.current.onSelect(p);
      });
      m.on("click", (e: maplibregl.MapMouseEvent) => {
        const hits = m.queryRenderedFeatures(e.point, { layers: ["lease-pt", "cluster"].filter((id) => m.getLayer(id)) });
        if (hits.length) return;
        const place = m.getLayer("access-fill") ? m.queryRenderedFeatures(e.point, { layers: ["access-fill"] })[0] : null;
        cb.current.onSelectPlace((place?.properties?.id as string) ?? null);
        if (!place) cb.current.onSelect(null);
      });
      m.on("mouseenter", "access-fill", () => pointer(true));
      m.on("mouseleave", "access-fill", () => pointer(false));

      const emit = () => {
        const b = m.getBounds();
        cb.current.onViewport([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      };
      m.on("moveend", emit);
      // Public spaces list = features in the rendered tiles, merged by id (tiles split big parks).
      const emitSpaces = () => {
        const cbk = cb.current.onSpaces;
        if (!cbk) return;
        if (!m.getSource("ov-access") || !cb.current.layers.access) return cbk([]);
        // Not loaded yet: wait for the next idle rather than reporting zero.
        if (!m.isSourceLoaded("ov-access")) return void (spacesDirty.current = true);
        const def = cb.current.manifest?.access;
        const feats = m.querySourceFeatures("ov-access", def?.kind === "pmtiles" ? { sourceLayer: def.sourceLayer } : undefined);
        const b = m.getBounds();
        const view: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
        const byId = new Map<string, Space>();
        for (const f of feats) {
          const p = f.properties ?? {};
          const id = String(p.id ?? p.unitId ?? f.id ?? "");
          if (!id) continue;
          const bb = bboxOf(f.geometry);
          if (bb[0] > view[2] || bb[2] < view[0] || bb[1] > view[3] || bb[3] < view[1]) continue;
          const prev = byId.get(id);
          if (prev) prev.bbox = [Math.min(prev.bbox[0], bb[0]), Math.min(prev.bbox[1], bb[1]), Math.max(prev.bbox[2], bb[2]), Math.max(prev.bbox[3], bb[3])];
          else
            byId.set(id, {
              id,
              name: p.name ?? "Public land",
              manager: p.managingAgency ?? p.manager,
              access: p.access,
              kind: p.agencyLevel ?? p.kind,
              visit: p.visit,
              url: p.url,
              acres: typeof p.acres === "number" ? p.acres : null,
              fixture: !!p.fixture,
              bbox: bb,
            });
        }
        cbk([...byId.values()]);
      };
      m.on("idle", () => { if (spacesDirty.current) { spacesDirty.current = false; emitSpaces(); } });
      m.on("moveend", () => (spacesDirty.current = true));
      m.on("sourcedata", (e) => { if (e.sourceId === "ov-access" && e.isSourceLoaded) spacesDirty.current = true; });
      ready.current = true;
      emit();
      syncAll();
      cb.current.onReady(m);
    });

    return () => {
      ready.current = false;
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- overlay layers from the manifest
  // Overlay sources are added the first time a layer is switched on, so a
  // visitor who never opens CPAD (10 MB) never downloads it.
  const overlaysAdded = useRef(new Set<LayerName>());
  const pmtilesReady = useRef<Promise<void> | null>(null);
  async function ensureOverlays() {
    const m = map.current;
    const man = cb.current.manifest;
    if (!m || !ready.current || !man) return;
    const want = (Object.keys(LAYER_INFO) as LayerName[]).filter((n) => man[n] && cb.current.layers[n] && !overlaysAdded.current.has(n));
    if (!want.length) return syncLayers();
    want.forEach((n) => overlaysAdded.current.add(n));
    if (want.some((n) => man[n]!.kind === "pmtiles")) {
      pmtilesReady.current ??= import("pmtiles").then(({ Protocol }) => maplibregl.addProtocol("pmtiles", new Protocol().tile));
      await pmtilesReady.current;
    }
    const before = "cluster";
    for (const name of want) {
      const def = man[name]!;
      const src = `ov-${name}`;
      const attribution = def.fixture ? "FIXTURE outlines" : def.source ?? undefined;
      m.addSource(src, def.kind === "pmtiles" ? { type: "vector", url: `pmtiles://${location.origin}${def.url}`, attribution } : { type: "geojson", data: def.url, attribution });
      const sl = def.kind === "pmtiles" ? { "source-layer": def.sourceLayer } : {};
      const color = LAYER_INFO[name].color;
      if (name === "waterlines") {
        m.addLayer({ id: "waterlines-line", type: "line", source: src, ...sl, layout: { visibility: "none" }, paint: { "line-color": color, "line-width": 1.6, "line-dasharray": [4, 2], "line-opacity": 0.85 } }, before);
        continue;
      }
      // Public spaces are on by default: light statewide so leases read first, fuller up close.
      const fillOpacity = (name === "access" ? ["interpolate", ["linear"], ["zoom"], 5, 0.16, 9, 0.26, 12, 0.32] : 0.22) as unknown as number;
      m.addLayer(
        {
          id: `${name}-fill`,
          type: "fill",
          source: src,
          ...sl,
          layout: { visibility: "none" },
          paint: {
            "fill-color": name === "access" ? ["match", ["get", "access"], "Open Access", "#7f9a6a", "Restricted Access", "#b3a46a", "#a99f8c"] : color,
            "fill-opacity": fillOpacity,
          },
        },
        before,
      );
      m.addLayer({ id: `${name}-line`, type: "line", source: src, ...sl, layout: { visibility: "none" }, paint: { "line-color": color, "line-width": 1, "line-opacity": 0.75 } }, before);
      if (name === "access")
        m.addLayer(
          {
            id: "access-label",
            type: "symbol",
            source: src,
            ...sl,
            minzoom: 9,
            layout: { visibility: "none", "text-field": ["get", "name"], "text-font": ["Noto Sans Italic"], "text-size": 11, "text-max-width": 9 },
            paint: { "text-color": "#56664f", "text-halo-color": "#f7f3ea", "text-halo-width": 1.2 },
          },
          before,
        );
    }
    syncLayers();
  }

  // ---- your own overlays (OVERLAYS_DIR): drawn above everything, added on first use
  const userAdded = useRef(new Set<string>());
  function syncUserOverlays() {
    const m = map.current;
    if (!m || !ready.current) return;
    for (const o of cb.current.overlays) {
      const on = cb.current.overlayVis[o.id] ?? o.visible;
      const src = `uo-${o.id}`;
      if (on && !userAdded.current.has(o.id)) {
        userAdded.current.add(o.id);
        m.addSource(src, { type: "geojson", data: o.url, attribution: o.attribution ?? undefined });
        const poly = ["==", ["geometry-type"], "Polygon"] as unknown as ExpressionSpecification;
        const line = ["any", ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "Polygon"]] as unknown as ExpressionSpecification;
        const pt = ["==", ["geometry-type"], "Point"] as unknown as ExpressionSpecification;
        const before = "hl-ring";
        m.addLayer({ id: `${src}-fill`, type: "fill", source: src, filter: poly, paint: { "fill-color": o.color, "fill-opacity": 0.22 } }, before);
        m.addLayer({ id: `${src}-line`, type: "line", source: src, filter: line, paint: { "line-color": o.color, "line-width": 2, "line-opacity": 0.9 } }, before);
        m.addLayer(
          {
            id: `${src}-pt`,
            type: "circle",
            source: src,
            filter: pt,
            paint: { "circle-color": o.color, "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4.5, 12, 7], "circle-stroke-color": "#faf7f0", "circle-stroke-width": 1.8 },
          },
          before,
        );
        for (const kind of ["fill", "line", "pt"]) {
          const id = `${src}-${kind}`;
          m.on("mousemove", id, (e: MapLayerMouseEvent) => {
            const f = e.features?.[0];
            if (!f) return;
            m.getCanvas().style.cursor = "pointer";
            const p = f.properties ?? {};
            const title = p.title ?? p.name ?? o.title;
            const html = `<div style="font-size:12px;line-height:1.35;max-width:240px"><div style="font-weight:600;color:#2b2a26">${esc(String(title))}</div>${p.description ? `<div style="color:#57534a">${esc(String(p.description))}</div>` : ""}<div style="color:#736e63">${esc(o.title)}</div></div>`;
            popup.current ??= new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "lease-tip" });
            popup.current.setLngLat(e.lngLat).setHTML(html).addTo(m);
          });
          m.on("mouseleave", id, () => {
            m.getCanvas().style.cursor = "";
            popup.current?.remove();
          });
          m.on("click", id, (e: MapLayerMouseEvent) => {
            const p = e.features?.[0]?.properties ?? {};
            if (p.prc) cb.current.onSelect(String(p.prc));
            else if (typeof p.url === "string" && /^https?:\/\//.test(p.url)) window.open(p.url, "_blank", "noopener");
          });
        }
      }
      if (userAdded.current.has(o.id)) for (const kind of ["fill", "line", "pt"]) m.setLayoutProperty(`${src}-${kind}`, "visibility", on ? "visible" : "none");
    }
  }

  function syncLeasesVisible() {
    const m = map.current;
    if (!m || !ready.current) return;
    const on = cb.current.showLeases ?? true;
    for (const id of ["cluster", "cluster-count", "lease-flag", "lease-pt", "hl-ring"]) if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }

  function syncLayers() {
    const m = map.current;
    if (!m) return;
    spacesDirty.current = true;
    m.triggerRepaint();
    const vis = cb.current.layers;
    const set = (id: string, on: boolean) => m.getLayer(id) && m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    for (const name of Object.keys(LAYER_INFO) as LayerName[]) {
      for (const suffix of ["fill", "line", "label"]) set(`${name}-${suffix}`, vis[name]);
    }
  }

  function syncData() {
    const m = map.current;
    if (!m || !ready.current) return;
    byPrc.current = new Map(cb.current.leases.map((l) => [l.p, l]));
    (m.getSource("leases") as GeoJSONSource).setData(toGeoJSON(cb.current.leases));
  }

  function syncHighlight() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { hover, selected } = cb.current;
    const feats: GeoJSON.Feature[] = [];
    for (const [p, sel] of [[selected, 1], [hover, 0]] as const) {
      if (!p || (sel === 0 && p === selected)) continue;
      const l = byPrc.current.get(p);
      for (const pt of l?.pts ?? []) feats.push({ type: "Feature", geometry: { type: "Point", coordinates: pt }, properties: { sel } });
    }
    (m.getSource("hl") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
  }

  function syncColor() {
    const m = map.current;
    if (!m || !ready.current) return;
    m.setPaintProperty("lease-pt", "circle-color", cb.current.colorBy === "era" ? ERA_EXPR : TYPE_EXPR);
  }

  function syncTerrain() {
    const m = map.current;
    if (!m || !ready.current) return;
    const on = cb.current.terrain;
    if (on && !m.getTerrain()) m.setTerrain({ source: "terrainDem", exaggeration: 1.35 });
    if (!on && m.getTerrain()) m.setTerrain(null);
  }

  function syncAll() {
    syncData();
    syncColor();
    syncTerrain();
    syncHighlight();
    syncLeasesVisible();
    ensureOverlays();
    syncUserOverlays();
  }

  useEffect(syncData, [props.leases]);
  useEffect(syncHighlight, [props.hover, props.selected, props.leases]);
  useEffect(syncColor, [props.colorBy]);
  useEffect(syncLeasesVisible, [props.showLeases]);
  useEffect(syncUserOverlays, [props.overlays, props.overlayVis]);
  useEffect(syncTerrain, [props.terrain]);
  useEffect(() => {
    ensureOverlays();
    syncLayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.layers, props.manifest]);

  // Inline position: maplibre's .maplibregl-map class sets position:relative, which would collapse it.
  return <div ref={el} style={{ position: "absolute", inset: 0 }} role="region" aria-label="Interactive map" />;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function bboxOf(g: GeoJSON.Geometry): [number, number, number, number] {
  let b: [number, number, number, number] = [180, 90, -180, -90];
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === "number") {
      const [x, y] = c as number[];
      b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
    } else (c as unknown[]).forEach(walk);
  };
  if ("coordinates" in g) walk(g.coordinates);
  return b;
}
