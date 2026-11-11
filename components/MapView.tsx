"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap, ExpressionSpecification, MapLayerMouseEvent } from "maplibre-gl";
import { baseStyle } from "@/lib/mapStyle";
import { CA_BOUNDS, CA_PATH, type MaskMode } from "@/lib/config";
import { kindMarker } from "@/lib/icons";
import { CAT_COLOR, TYPE_COLOR } from "@/lib/legend";
import { CATS, CAT_LABEL, ERAS, ERA_UNKNOWN, LAND, LAYER_INFO, LEASE_MARK, LEASE_TIER, NONPROFIT_COLOR, SCORE_BANDS, SCORE_UNKNOWN, TYPES, TYPE_LABEL, type LandKey } from "@/lib/legend";
import type { KindKey, LayerManifest, LayerName, MiniLease, OverlayDef } from "@/lib/types";
import type { Place as Space } from "./PlaceCard";
import { OG_FILL_LAYERS, OG_POINT_LAYERS, addOg, addWaters, setOgSelPoint, syncOg, syncWaters, type OgData, type OgView } from "./ogLayers";
import { LABEL, actionLabel, compLabel } from "@/lib/oilgas";
import { addAmbience, type Ambience } from "@/lib/ambience";

// Served by scripts/sync-data.mjs (webpack can't bundle the v6 module worker).
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type ColorBy = "lease" | "cat" | "type" | "era" | "score";
export type Bounds = [number, number, number, number];

type Props = {
  leases: MiniLease[];
  colorBy: ColorBy;
  layers: Record<LayerName, boolean>;
  manifest: LayerManifest | null;
  terrain: boolean;
  /** Public land shown: which owner levels, and whether only land open to the public. */
  land: { groups: LandKey[]; openOnly: boolean };
  /** "County lines" reference layer: stronger lines plus county names. */
  counties: boolean;
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
  /** The selected public-land unit: outlined in dark gold, with a popup (name, manager, Fly in). */
  selectedPlace: Space | null;
  onSelectPlace: (place: Space | null) => void;
  onFlyPlace: (place: Space) => void;
  onFlyLease: (prc: string) => void;
  onViewport: (b: Bounds) => void;
  /** Right after the map is created, before tiles load (Home framing). */
  onCreate: (map: MLMap) => void;
  onReady: (map: MLMap) => void;
  /** Outside-California treatment. */
  mask: MaskMode;
  /** California Home button. */
  onHome: () => void;
  /** State oil & gas family: on/off, its data (fetched by Explorer), and what is shown. */
  og: { on: boolean; data: OgData | null; view: OgView };
  /** State sovereign lands (public trust) tint. */
  waters: boolean;
  /** A well, terminal, footprint or former lease was clicked (null: clicked elsewhere). */
  onSelectOg: (sel: OgSel | null) => void;
  /** Live clouds (Open-Meteo, via /api/clouds) drifting over the state. */
  clouds: boolean;
  /** The clouds' model time once loaded (ISO), or null if they couldn't be loaded. */
  onCloudsTime?: (time: string | null) => void;
};

export type OgSel = { kind: "well" | "terminal" | "footprint" | "former"; id: string; coords?: [number, number] };

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

/** Public land by owner level (CPAD AGNCY_LEV), all green: palette A. */
const LAND_OF = ["match", ["get", "agencyLevel"], "State", "state", "Federal", "federal", "local"] as unknown as ExpressionSpecification;
const LAND_FILL = [
  "match",
  ["get", "agencyLevel"],
  "State", LAND[0].color,
  "Federal", LAND[1].color,
  "Non Profit", NONPROFIT_COLOR,
  LAND[2].color,
] as unknown as ExpressionSpecification;
const TYPE_EXPR = ["match", ["get", "t"], ...TYPES.flatMap((t) => [t.key, t.color]), "#d9d2c2"] as unknown as ExpressionSpecification;
const CAT_EXPR = ["match", ["get", "k"], ...CATS.flatMap((c) => [c.key, c.color]), "#c9c2b2"] as unknown as ExpressionSpecification;
const ERA_EXPR = [
  "step",
  ["coalesce", ["get", "e"], -1],
  ERA_UNKNOWN,
  ...ERAS.flatMap((e) => [e.min, e.color]),
] as unknown as ExpressionSpecification;
const SCORE_EXPR = ["case", ["==", ["get", "s"], null], SCORE_UNKNOWN, ["step", ["get", "s"], SCORE_BANDS[0].color, ...SCORE_BANDS.slice(1).flatMap((b) => [b.min, b.color])]] as unknown as ExpressionSpecification;

/** Priority tier by category: 1 infrastructure, 2 public agency and commercial, 3 recreation and other. */
const TIER_OF: Record<string, 1 | 2 | 3> = Object.fromEntries(CATS.map((c) => [c.key, c.tier]));
const byTier = (pick: (t: (typeof LEASE_TIER)[1 | 2 | 3]) => unknown) =>
  ["match", ["get", "tier"], 1, pick(LEASE_TIER[1]), 2, pick(LEASE_TIER[2]), pick(LEASE_TIER[3])] as unknown as ExpressionSpecification;
const TIER_FILL = byTier((t) => t.fill);

/** From zoom 11, kinds with an icon (infrastructure, roads and bridges, shoreline protection) draw as icons. */
const ICON_Z = 11;
const ICON_PX = 24;
const HAS_ICON = ["!=", ["get", "ic"], ""] as unknown as ExpressionSpecification;
/** Circle radius by tier, jumping to the icon's radius (hit area) at ICON_Z for kinds with an icon. */
const atIcon = (dot: unknown, icon: unknown) => ["case", HAS_ICON, icon, dot] as unknown as ExpressionSpecification;
const LEASE_RADIUS = [
  "interpolate", ["linear"], ["zoom"],
  5, byTier((t) => t.r[0]),
  10, byTier((t) => t.r[1]),
  ICON_Z - 0.01, byTier((t) => t.r[1] + (t.r[2] - t.r[1]) * 0.2),
  ICON_Z, atIcon(byTier((t) => t.r[1] + (t.r[2] - t.r[1]) * 0.2), ICON_PX / 2),
  15, atIcon(byTier((t) => t.r[2]), ICON_PX / 2),
] as unknown as ExpressionSpecification;
/** Hide the dot where the icon draws (the circle stays as the hit area). */
const dotOpacity = (base: unknown) => ["step", ["zoom"], base, ICON_Z, atIcon(base, 0)] as unknown as ExpressionSpecification;
const iconImage = (fill: ExpressionSpecification) => ["concat", "m|", ["get", "ic"], "|", fill] as unknown as ExpressionSpecification;
const ICON_KINDS: KindKey[] = ["cable", "pipeline", "outfall", "power", "roads", "shore", "oilgas"];
/** Every disc color any Color by mode can produce. */
const ICON_FILLS = [...new Set([LEASE_TIER[1].fill, LEASE_TIER[2].fill, LEASE_TIER[3].fill, ...CATS.map((c) => c.color), ...TYPES.map((t) => t.color), ...ERAS.map((e) => e.color), ERA_UNKNOWN, ...SCORE_BANDS.map((b) => b.color), SCORE_UNKNOWN])];
const iconOf = (l: MiniLease) => (l.k === "infra" && l.t !== "other" ? l.t : l.k === "roads" || l.k === "shore" ? l.k : l.og ? "oilgas" : "");

/** The selected public-land unit's outline color (dark gold). */
const SEL_GOLD = "#8a6a1f";
const SEL_NONE = ["==", ["literal", 0], 1] as unknown as ExpressionSpecification;
/** Kind icons for popups (data URLs from the map's own marker images). */
const iconUrls = new Map<string, string>();
function iconUrl(k: KindKey) {
  let u = iconUrls.get(k);
  if (u) return u;
  const img = kindMarker(k, 22, 2);
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")!.putImageData(img, 0, 0);
  u = c.toDataURL();
  iconUrls.set(k, u);
  return u;
}
/** A lease in a popup: name, PRC, kind icon and kind (no labels; those are on the lease page). */
function leaseHead(l: MiniLease) {
  const ic = iconOf(l) as KindKey | "";
  const kind = l.k === "infra" ? (l.ts ?? [l.t]).map((t) => TYPE_LABEL[t]).join(" + ") : l.og ? "Oil and gas" : CAT_LABEL[l.k];
  const mark = ic ? `<img src="${iconUrl(ic)}" width="22" height="22" alt="" />` : `<span class="pop-dot" style="background:${l.k === "infra" ? TYPE_COLOR[l.t] : CAT_COLOR[l.k]}"></span>`;
  return `<span class="pop-title">${esc(l.n)}</span><span class="pop-sub">PRC ${esc(l.p)}</span><span class="pop-kind">${mark}${esc(kind)}</span>`;
}

function toGeoJSON(ls: MiniLease[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const l of ls)
    for (const pt of l.pts)
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: pt }, properties: { p: l.p, n: l.n, t: l.t, k: l.k, ic: iconOf(l), tier: TIER_OF[l.k] ?? 3, e: l.e, s: l.s, f: l.f, cs: l.cs, x: l.x } });
  return { type: "FeatureCollection", features };
}

export default function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const ambience = useRef<Ambience | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const cb = useRef(props);
  cb.current = props;
  const byPrc = useRef(new Map<string, MiniLease>());
  /** The selection's popup: stays open until a click elsewhere or Esc (separate from hover tooltips). */
  const pin = useRef<maplibregl.Popup | null>(null);
  /** Where the selected lease or unit was clicked (its popup opens there). */
  const selPt = useRef<{ prc: string; at: [number, number] } | null>(null);
  const placePt = useRef<{ id: string; at: [number, number] } | null>(null);
  /** A public-land feature's properties as a list item. */
  const spaceOf = (f: { properties: Record<string, any> | null; id?: string | number; geometry: GeoJSON.Geometry }): Space | null => {
    const p = f.properties ?? {};
    const id = String(p.id ?? p.unitId ?? f.id ?? "");
    if (!id) return null;
    return { id, name: p.name ?? "Public land", manager: p.managingAgency ?? p.manager, access: p.access, kind: p.agencyLevel ?? p.kind, visit: p.visit, url: p.url, acres: typeof p.acres === "number" ? p.acres : null, fixture: !!p.fixture, bbox: bboxOf(f.geometry) };
  };
  /** A unit's extent over the loaded tiles (units are split across tiles). */
  const unitExtent = (id: string): [number, number, number, number] | null => {
    const m = map.current;
    const def = cb.current.manifest?.access;
    if (!m || !def || !m.getSource("ov-access")) return null;
    let b: [number, number, number, number] | null = null;
    for (const f of m.querySourceFeatures("ov-access", def.kind === "pmtiles" ? { sourceLayer: def.sourceLayer } : undefined)) {
      const p = f.properties ?? {};
      if (String(p.id ?? p.unitId ?? f.id ?? "") !== id) continue;
      const x = bboxOf(f.geometry);
      b = b ? [Math.min(b[0], x[0]), Math.min(b[1], x[1]), Math.max(b[2], x[2]), Math.max(b[3], x[3])] : x;
    }
    return b;
  };
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
      // Explorer observes the container and resizes (it re-frames Home); see onCreate.
      trackResize: false,
      maxPitch: 75,
      attributionControl: false,
      fadeDuration: reduce ? 0 : 200,
    });
    map.current = m;
    cb.current.onCreate(m);
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

      // Kind icons: "m|<kind>|<disc color>" (the disc follows Color by). All are added before the
      // layer exists: an image added later (styleimagemissing) never reaches tiles already parsed.
      for (const fill of ICON_FILLS) for (const k of ICON_KINDS) m.addImage(`m|${k}|${fill}`, kindMarker(k, ICON_PX, 2, fill), { pixelRatio: 2 });
      m.addSource("leases", { type: "geojson", data: toGeoJSON([]), cluster: true, clusterRadius: 44, clusterMaxZoom: 9 });
      m.addSource("hl", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

      m.addLayer({
        id: "cluster",
        type: "circle",
        source: "leases",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": LEASE_MARK.fill,
          "circle-opacity": 1,
          "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "point_count"]], 1, 11, 10, 22, 30, 34],
          "circle-stroke-color": LEASE_MARK.line,
          "circle-stroke-width": 1.4,
        },
      });
      m.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "leases",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-allow-overlap": true },
        paint: { "text-color": LEASE_MARK.text },
      });
      // Marker ring for candidates for review / case studies (behind the dot).
      m.addLayer({
        id: "lease-flag",
        type: "circle",
        source: "leases",
        filter: ["all", ["!", ["has", "point_count"]], ["any", ["==", ["get", "f"], 1], ["==", ["get", "cs"], 1]]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 7, 10, 9.5, ICON_Z - 0.01, 10, ICON_Z, atIcon(10, ICON_PX / 2 + 3.5), 15, atIcon(13, ICON_PX / 2 + 3.5)],
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
        // Infrastructure draws on top of the quieter categories.
        layout: { "circle-sort-key": ["-", 4, ["get", "tier"]] },
        paint: {
          "circle-color": TIER_FILL,
          "circle-radius": LEASE_RADIUS,
          "circle-opacity": dotOpacity(1),
          // Dark outline so the mark holds on cream, green and water; strength follows the category.
          "circle-stroke-color": byTier((t) => t.line),
          "circle-stroke-width": byTier((t) => t.width),
          "circle-stroke-opacity": dotOpacity(byTier((t) => t.lineOpacity)),
        },
      });
      // Close up, infrastructure, roads and bridges and shoreline protection show their icon.
      m.addLayer({
        id: "lease-icon",
        type: "symbol",
        source: "leases",
        minzoom: ICON_Z,
        filter: ["all", ["!", ["has", "point_count"]], HAS_ICON],
        layout: {
          "icon-image": iconImage(TIER_FILL),
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "symbol-sort-key": ["-", 4, ["get", "tier"]],
        },
      });
      m.addLayer({
        id: "hl-ring",
        type: "circle",
        source: "hl",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 10, ICON_Z - 0.01, 13.5, ICON_Z, ICON_PX / 2 + 4, 15, ICON_PX / 2 + 5],
          "circle-color": "rgba(250,247,240,0.35)",
          "circle-stroke-color": "#2b2a26",
          "circle-stroke-width": ["case", ["==", ["get", "sel"], 1], 3, 2],
        },
      });

      // Invisible blockers the size of each lease mark: place names slide aside or drop
      // instead of being drawn under a cluster or point.
      if (!m.hasImage("blk")) m.addImage("blk", { width: 2, height: 2, data: new Uint8Array(16) });
      const block = (id: string, filter: ExpressionSpecification, size: ExpressionSpecification) =>
        m.addLayer({ id, type: "symbol", source: "leases", filter, layout: { "icon-image": "blk", "icon-size": size, "icon-allow-overlap": true, "icon-ignore-placement": false }, paint: { "icon-opacity": 0 } });
      block("cluster-block", ["has", "point_count"] as unknown as ExpressionSpecification, ["interpolate", ["linear"], ["sqrt", ["get", "point_count"]], 1, 12, 10, 23, 30, 35] as unknown as ExpressionSpecification);
      block("lease-block", ["!", ["has", "point_count"]] as unknown as ExpressionSpecification, ["interpolate", ["linear"], ["zoom"], 5, 4.5, 10, 6.5, ICON_Z - 0.01, 7, ICON_Z, atIcon(7, ICON_PX / 2 + 1), 15, atIcon(9.5, ICON_PX / 2 + 1)] as unknown as ExpressionSpecification);

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
        // The selected lease already has its popup open; no second tooltip over it.
        if (!l || cb.current.selected === p) return void popup.current?.remove();
        popup.current ??= new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "lease-tip" });
        popup.current.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).setHTML(`<div class="pop-body">${leaseHead(l)}</div>`).addTo(m);
      });
      m.on("mouseleave", "lease-pt", () => {
        pointer(false);
        popup.current?.remove();
        cb.current.onHover(null);
      });
      m.on("click", "lease-pt", (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        const p = f?.properties.p as string | undefined;
        if (!p || !f) return;
        selPt.current = { prc: p, at: (f.geometry as GeoJSON.Point).coordinates as [number, number] };
        popup.current?.remove();
        cb.current.onSelect(p);
      });
      m.on("click", async (e: maplibregl.MapMouseEvent) => {
        const hits = m.queryRenderedFeatures(e.point, { layers: ["lease-pt", "cluster"].filter((id) => m.getLayer(id)) });
        if (hits.length) return;
        // State oil & gas: points first (wells, terminals, former leases), then footprints.
        const ogPt = cb.current.og.on ? m.queryRenderedFeatures(e.point, { layers: OG_POINT_LAYERS.filter((id) => m.getLayer(id)) })[0] : null;
        const ogFp = cb.current.og.on && !ogPt ? m.queryRenderedFeatures(e.point, { layers: OG_FILL_LAYERS.filter((id) => m.getLayer(id)) })[0] : null;
        if (ogPt?.layer.id === "og-well-cluster") {
          const z = await (m.getSource("og-wells-c") as GeoJSONSource).getClusterExpansionZoom(ogPt.properties.cluster_id);
          m.easeTo({ center: (ogPt.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z + 0.2 });
          return;
        }
        if (ogPt || ogFp) {
          const f = (ogPt ?? ogFp)!;
          const p = f.properties ?? {};
          const coords = ogPt ? ((f.geometry as GeoJSON.Point).coordinates as [number, number]) : undefined;
          const kind = f.layer.id.startsWith("og-well") ? "well" : f.layer.id.startsWith("og-term") ? "terminal" : f.layer.id.startsWith("og-former") ? "former" : "footprint";
          cb.current.onSelectOg({ kind, id: String(kind === "well" ? p.api : kind === "terminal" ? p.berth : p.prc), coords });
          return;
        }
        cb.current.onSelectOg(null);
        // Public land: any green area selects its unit (outline, popup, card).
        const place = m.getLayer("access-fill") && m.getLayoutProperty("access-fill", "visibility") !== "none" ? m.queryRenderedFeatures(e.point, { layers: ["access-fill"] })[0] : null;
        if (place) {
          const sp = spaceOf(place);
          if (sp) {
            sp.bbox = unitExtent(sp.id) ?? sp.bbox;
            placePt.current = { id: sp.id, at: [e.lngLat.lng, e.lngLat.lat] };
            cb.current.onSelectPlace(sp);
            return;
          }
        }
        // Clicked empty map: close the popup and clear the selection.
        cb.current.onSelectPlace(null);
        cb.current.onSelect(null);
      });
      // State oil & gas tooltips (plain HTML; full details in the card).
      const ogTip = (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        pointer(true);
        const p = f.properties ?? {};
        const id = f.layer.id;
        const line = (t: string, label = "") => `<div style="color:#57534a">${t}${label}</div>`;
        let html = "";
        if (id === "og-well-cluster") html = `<div style="font-weight:600;color:#2b2a26">${p.point_count} wells</div>${line(`${p.idle} idle · click to zoom in`)}`;
        else if (id.startsWith("og-well")) html = `<div style="font-weight:600;color:#2b2a26">Well ${esc(String(p.leaseName ?? ""))} ${esc(String(p.wellNumber ?? ""))}</div>${line(`API ${esc(String(p.api))} · ${esc(String(p.wellStatus ?? ""))}`)}${line(LABEL.wells)}`;
        else if (id.startsWith("og-term")) html = `<div style="font-weight:600;color:#2b2a26">${esc(String(p.terminal ?? "Marine oil terminal"))}</div>${line(`Berth ${esc(String(p.berth))}`)}${line(LABEL.terminals)}`;
        else if (id.startsWith("og-former")) html = `<div style="font-weight:600;color:#2b2a26">Former lease PRC ${esc(String(p.prc))}</div>${line(actionLabel(String(p.former)))}`;
        else if (id === "og-fp-hatch") html = `<div style="font-weight:600;color:#2b2a26">PRC ${esc(String(p.prc))}</div>${line(esc(compLabel(String(p.prc))))}`;
        else html = `<div style="font-weight:600;color:#2b2a26">Offshore lease PRC ${esc(String(p.prc))}</div>${line(`CSLC: ${esc(String(p.cslc_stated_status ?? ""))}`)}`;
        popup.current ??= new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "lease-tip" });
        popup.current.setLngLat(e.lngLat).setHTML(`<div style="font-size:12px;line-height:1.35;max-width:240px">${html}</div>`).addTo(m);
      };
      for (const id of [...OG_POINT_LAYERS, ...OG_FILL_LAYERS]) {
        m.on("mousemove", id, ogTip);
        m.on("mouseleave", id, () => { pointer(false); popup.current?.remove(); });
      }
      m.on("mousemove", "sov-wb", (e: MapLayerMouseEvent) => {
        const p = e.features?.[0]?.properties ?? {};
        popup.current ??= new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "lease-tip" });
        popup.current.setLngLat(e.lngLat).setHTML(`<div style="font-size:12px;line-height:1.35;max-width:240px"><div style="font-weight:600;color:#2b2a26">${esc(titleCase(String(p.name ?? "")))}</div><div style="color:#57534a">${esc(LABEL.waterbodies)}</div></div>`).addTo(m);
      });
      m.on("mouseleave", "sov-wb", () => popup.current?.remove());
      m.on("mouseenter", "access-fill", () => pointer(true));
      m.on("mouseleave", "access-fill", () => pointer(false));

      const emit = () => {
        const b = m.getBounds();
        cb.current.onViewport([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      };
      m.on("moveend", emit);
      // Esc closes the popup and clears the selection.
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key !== "Escape") return;
        if (!cb.current.selected && !cb.current.selectedPlace) return;
        cb.current.onSelect(null);
        cb.current.onSelectPlace(null);
      };
      window.addEventListener("keydown", onKey);
      m.once("remove", () => window.removeEventListener("keydown", onKey));
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
          else byId.set(id, { ...spaceOf(f)!, bbox: bb });
        }
        cbk([...byId.values()]);
      };
      m.on("idle", () => { if (spacesDirty.current) { spacesDirty.current = false; emitSpaces(); } });
      m.on("moveend", () => (spacesDirty.current = true));
      m.on("sourcedata", (e) => { if (e.sourceId === "ov-access" && e.isSourceLoaded) spacesDirty.current = true; });
      ready.current = true;
      // Moving water and live clouds (after the lease layers exist, so clouds sit under them).
      ambience.current = addAmbience(m, { clouds: cb.current.clouds, onClouds: (t) => cb.current.onCloudsTime?.(t) });
      emit();
      syncAll();
      syncSelection();
      cb.current.onReady(m);
    });

    return () => {
      ready.current = false;
      ambience.current?.destroy();
      ambience.current = null;
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
    // Land layers sit under county lines, bridges and every place name (labels must never be washed out).
    const before = m.getLayer("county-line") ? "county-line" : "cluster";
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
      const fillOpacity = (name === "access" ? ["interpolate", ["linear"], ["zoom"], 5, 0.62, 10, 0.55, 13, 0.45] : 0.22) as unknown as number;
      m.addLayer(
        {
          id: `${name}-fill`,
          type: "fill",
          source: src,
          ...sl,
          layout: { visibility: "none" },
          paint: {
            "fill-color": name === "access" ? LAND_FILL : color,
            "fill-opacity": fillOpacity,
          },
        },
        before,
      );
      m.addLayer(
        {
          id: `${name}-line`,
          type: "line",
          source: src,
          ...sl,
          layout: { visibility: "none" },
          paint:
            name === "access"
              ? { "line-color": "#3f5e3f", "line-width": 0.6, "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0, 9, 0.35, 12, 0.6] }
              : { "line-color": color, "line-width": 1, "line-opacity": 0.75 },
        },
        before,
      );
      if (name === "access") {
        // The selected unit: its whole outline in dark gold, obvious at any zoom (above land, under the lease marks).
        m.addLayer({ id: "access-sel-fill", type: "fill", source: src, ...sl, filter: SEL_NONE, paint: { "fill-color": SEL_GOLD, "fill-opacity": 0.16 } }, "cluster");
        m.addLayer({ id: "access-sel-halo", type: "line", source: src, ...sl, filter: SEL_NONE, layout: { "line-join": "round" }, paint: { "line-color": "#faf7f0", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 4, 12, 7], "line-opacity": 0.85 } }, "cluster");
        m.addLayer({ id: "access-sel-line", type: "line", source: src, ...sl, filter: SEL_NONE, layout: { "line-join": "round" }, paint: { "line-color": SEL_GOLD, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 2.2, 12, 3.6] } }, "cluster");
      }
      if (name === "access")
        m.addLayer(
          {
            id: "access-label",
            type: "symbol",
            source: src,
            ...sl,
            minzoom: 10,
            layout: { visibility: "none", "text-field": ["get", "name"], "text-font": ["Noto Sans Italic"], "text-size": 10.5, "text-max-width": 9, "text-padding": 6 },
            paint: { "text-color": "#56664f", "text-halo-color": "#f7f3ea", "text-halo-width": 1.2 },
          },
          // Park names rank below California's place names (placed after them).
          m.getLayer("label-range") ? "label-range" : "cluster",
        );
    }
    syncLayers();
    syncSelection();
  }

  // ---- the selection's popup and outline (lease or public-land unit); map and list agree both ways
  function syncSelection() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { selected, selectedPlace: sp } = cb.current;
    const f = sp ? (["==", ["to-string", ["coalesce", ["get", "id"], ["get", "unitId"], ""]], sp.id] as unknown as ExpressionSpecification) : SEL_NONE;
    for (const id of ["access-sel-fill", "access-sel-halo", "access-sel-line"]) if (m.getLayer(id)) m.setFilter(id, f);
    const l = selected ? byPrc.current.get(selected) : null;
    let at: [number, number] | null = null;
    let el: HTMLElement | null = null;
    if (l) {
      at = selPt.current?.prc === l.p ? selPt.current.at : l.pts[0];
      el = document.createElement("div");
      el.className = "pop-body";
      el.innerHTML = `<a class="pop-link" href="/lease/${encodeURIComponent(l.p)}" aria-label="Open the lease page for PRC ${esc(l.p)}">${leaseHead(l)}<span class="pop-hint">Open lease page →</span></a>`;
    } else if (sp) {
      at = placePt.current?.id === sp.id ? placePt.current.at : [(sp.bbox[0] + sp.bbox[2]) / 2, (sp.bbox[1] + sp.bbox[3]) / 2];
      el = document.createElement("div");
      el.className = "pop-body";
      el.innerHTML = `<button type="button" class="pop-link pop-card" aria-label="Show ${esc(sp.name)} in the list"><span class="pop-title">${esc(sp.name)}</span><span class="pop-sub">${esc(sp.manager ?? "Manager not recorded")}</span></button><button type="button" class="pop-fly">Fly in</button>`;
      el.querySelector(".pop-card")!.addEventListener("click", () => cb.current.onSelectPlace(sp));
      el.querySelector(".pop-fly")!.addEventListener("click", () => cb.current.onFlyPlace(sp));
    }
    if (!at || !el) {
      pin.current?.remove();
      return;
    }
    popup.current?.remove();
    pin.current ??= new maplibregl.Popup({ closeButton: true, closeOnClick: false, closeOnMove: false, offset: 14, className: "sel-pop", maxWidth: "260px", focusAfterOpen: false });
    pin.current.setLngLat(at).setDOMContent(el).addTo(m);
    // The close button clears the selection too (Esc and a click on empty map do the same).
    pin.current.getElement()?.querySelector(".maplibregl-popup-close-button")?.addEventListener("click", () => { cb.current.onSelect(null); cb.current.onSelectPlace(null); }, { once: true });
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
    for (const id of ["cluster", "cluster-count", "lease-flag", "lease-pt", "lease-icon", "hl-ring", "cluster-block", "lease-block"]) if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
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
    // Public land: only the owner levels that are on (and only open land for "Parks only").
    const { groups, openOnly } = cb.current.land;
    const f = ["all", ["in", LAND_OF, ["literal", groups]], ...(openOnly ? [["==", ["get", "access"], "Open Access"]] : [])] as unknown as ExpressionSpecification;
    for (const id of ["access-fill", "access-line", "access-label"]) if (m.getLayer(id)) m.setFilter(id, f);
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
    const c = cb.current.colorBy;
    const fill = c === "era" ? ERA_EXPR : c === "type" ? TYPE_EXPR : c === "cat" ? CAT_EXPR : c === "score" ? SCORE_EXPR : TIER_FILL;
    m.setPaintProperty("lease-pt", "circle-color", fill);
    m.setLayoutProperty("lease-icon", "icon-image", iconImage(fill));
  }

  function syncTerrain() {
    const m = map.current;
    if (!m || !ready.current) return;
    const on = cb.current.terrain;
    if (on && !m.getTerrain()) m.setTerrain({ source: "terrainDem", exaggeration: 1.35 });
    if (!on && m.getTerrain()) m.setTerrain(null);
  }

  function syncCounties() {
    const m = map.current;
    if (!m || !ready.current) return;
    const on = cb.current.counties;
    m.setLayoutProperty("county-line", "visibility", on ? "none" : "visible");
    m.setLayoutProperty("county-line-strong", "visibility", on ? "visible" : "none");
    m.setLayoutProperty("county-label", "visibility", on ? "visible" : "none");
  }

  // ---- State oil & gas and State sovereign lands (added on first use)
  function syncOgLayers() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { og } = cb.current;
    if (og.on && og.data) addOg(m, og.data, "cluster");
    syncOg(m, og.on, og.view);
    const s = og.view.selected;
    setOgSelPoint(m, s && s.kind !== "footprint" ? (s.coords ?? null) : null);
  }
  function syncWatersLayer() {
    const m = map.current;
    if (!m || !ready.current) return;
    if (cb.current.waters) addWaters(m, cb.current.manifest?.granted?.kind === "geojson" ? cb.current.manifest.granted.url : null);
    syncWaters(m, cb.current.waters);
  }

  function syncAll() {
    syncCounties();
    syncData();
    syncColor();
    syncTerrain();
    syncHighlight();
    syncLeasesVisible();
    ensureOverlays();
    syncUserOverlays();
    syncOgLayers();
    syncWatersLayer();
  }

  useEffect(syncData, [props.leases]);
  useEffect(syncHighlight, [props.hover, props.selected, props.leases]);
  useEffect(syncSelection, [props.selected, props.selectedPlace, props.leases]);
  useEffect(syncColor, [props.colorBy]);
  useEffect(syncLeasesVisible, [props.showLeases]);
  useEffect(syncUserOverlays, [props.overlays, props.overlayVis]);
  useEffect(syncTerrain, [props.terrain]);
  useEffect(() => ambience.current?.setClouds(props.clouds), [props.clouds]);
  useEffect(syncCounties, [props.counties]);
  useEffect(syncOgLayers, [props.og]);
  useEffect(syncWatersLayer, [props.waters, props.manifest]);
  useEffect(() => {
    ensureOverlays();
    syncLayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.layers, props.manifest, props.land]);

  // Inline position: maplibre's .maplibregl-map class sets position:relative, which would collapse it.
  return <div ref={el} style={{ position: "absolute", inset: 0 }} role="region" aria-label="Interactive map" />;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/'S\b/g, "'s");

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
