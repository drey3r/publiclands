// Map layers for the State oil & gas family and State sovereign lands. Added on first use; all sit under
// the lease marks (lease points and their icons stay on top, infrastructure strongest).
import type { ExpressionSpecification, GeoJSONSource, Map as MLMap } from "maplibre-gl";
import { GLYPH, MARK_GLYPH, markImage } from "@/lib/icons";
import { FP, MARK, OG_BASE, WELL_BROWN, WELL_GROUPS, WELL_IDLE, type Footprint, type OgPart, type WellGroup } from "@/lib/oilgas";

export const OG_ICON_Z = 11;
const ICON_PX = 24;
const X = (e: unknown) => e as ExpressionSpecification;

/** The data the family draws (fetched once by Explorer, shared with its lists and cards). */
export type OgData = {
  footprints: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, Footprint>;
  wells: GeoJSON.FeatureCollection<GeoJSON.Point>;
  terminals: GeoJSON.FeatureCollection<GeoJSON.Point>;
};
/** What is shown: the family's parts, and (Worth watching) only the flagged footprints and idle wells. */
export type OgView = { parts: Record<OgPart, boolean>; watch: boolean; watchFp: string[]; selected: { kind: string; id: string; coords?: [number, number] } | null };

/** A point inside each former lease footprint (largest ring's vertex average, nudged inside if needed). */
export function formerPoints(fc: OgData["footprints"]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const f of fc.features) {
    if (!f.properties.former) continue;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const ring = polys.map((p) => p[0]).sort((a, b) => b.length - a.length)[0];
    const [x, y] = ring.reduce((a, c) => [a[0] + c[0] / ring.length, a[1] + c[1] / ring.length], [0, 0]);
    features.push({ type: "Feature", properties: { prc: f.properties.prc, former: f.properties.former }, geometry: { type: "Point", coordinates: [x, y] } });
  }
  return { type: "FeatureCollection", features };
}

function hatch(color: string, gap = 8): ImageData {
  const S = gap * 2, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  for (const o of [-S, 0, S]) { g.beginPath(); g.moveTo(o, S); g.lineTo(o + S, 0); g.stroke(); }
  return g.getImageData(0, 0, S, S);
}

/** Wells from zoom 11 to 13 are grouped (count marks) so dense shores such as Huntington Beach stay readable. */
export const WELL_CLUSTER_MAX = 13;
export const OG_POINT_LAYERS = ["og-well-dot", "og-well-icon", "og-well-c-icon", "og-well-cluster", "og-term-dot", "og-term-icon", "og-former-dot", "og-former-icon"];
export const OG_FILL_LAYERS = ["og-fp-fill", "og-fp-hatch"];
const OG_LAYERS = ["og-fp-fill", "og-fp-hatch", "og-fp-line", "og-fp-line-d", "og-fp-sel", ...OG_POINT_LAYERS, "og-well-cluster-n", "og-pt-sel"];

let wellsAll: GeoJSON.FeatureCollection<GeoJSON.Point> | null = null;
let wellsKey = "";
/** Add the family's sources, images and layers (once), under `before`. */
export function addOg(m: MLMap, d: OgData, before: string) {
  if (m.getSource("og-fp")) return;
  for (const [k, st] of Object.entries(MARK)) {
    const glyph = k === "terminal" ? MARK_GLYPH.terminal : k === "former" ? GLYPH.oilgas : MARK_GLYPH.well;
    m.addImage(`og|${k}`, markImage(glyph, st, ICON_PX, 2), { pixelRatio: 2 });
  }
  m.addImage("og|hatch", hatch(FP.hatch), { pixelRatio: 2 });
  m.addSource("og-fp", { type: "geojson", data: d.footprints, attribution: "Offshore leases, terminals: California State Lands Commission" });
  m.addSource("og-former", { type: "geojson", data: formerPoints(d.footprints) });
  m.addSource("og-wells", { type: "geojson", data: d.wells, attribution: "Wells: CalGEM (California Geologic Energy Management Division)" });
  // The same wells, grouped from zoom 11 to 13 (data set by syncOg to the statuses shown).
  m.addSource("og-wells-c", { type: "geojson", data: d.wells, cluster: true, clusterRadius: 40, clusterMaxZoom: WELL_CLUSTER_MAX, clusterProperties: { idle: ["+", ["case", ["==", ["get", "statusGroup"], "idle"], 1, 0]] } });
  wellsAll = d.wells;
  wellsKey = "";
  m.addSource("og-term", { type: "geojson", data: d.terminals });
  m.addSource("og-sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  const add = (l: Parameters<MLMap["addLayer"]>[0]) => m.addLayer(l, before);
  const prod = ["==", ["get", "group"], "production"];
  const lineW = ["interpolate", ["linear"], ["zoom"], 6, 0.7, 12, 1.6];
  // Footprints: outline with a light fill; dashed (and fainter fill) when quitclaimed, terminated or not producing.
  add({ id: "og-fp-fill", type: "fill", source: "og-fp", filter: X(prod), paint: { "fill-color": FP.fill, "fill-opacity": X(["case", ["get", "dashed"], 0.07, 0.17]) } });
  // Compensatory agreements (4736, 1482): hatched, no solid outline.
  add({ id: "og-fp-hatch", type: "fill", source: "og-fp", filter: ["==", ["get", "group"], "compensatory"], paint: { "fill-pattern": "og|hatch", "fill-opacity": 0.9 } });
  add({ id: "og-fp-line", type: "line", source: "og-fp", filter: X(["all", prod, ["!", ["get", "dashed"]]]), paint: { "line-color": FP.line, "line-width": X(lineW) } });
  add({ id: "og-fp-line-d", type: "line", source: "og-fp", filter: X(["all", prod, ["get", "dashed"]]), paint: { "line-color": FP.line, "line-opacity": 0.85, "line-dasharray": [3, 2], "line-width": X(lineW) } });
  add({ id: "og-fp-sel", type: "line", source: "og-fp", filter: ["==", ["get", "prc"], "__none"], paint: { "line-color": "#2b2a26", "line-width": 2.6 } });
  // Wells: dots by status below zoom 11, the wellhead mark from zoom 11.
  const wColor = X(["match", ["get", "statusGroup"], ...WELL_GROUPS.flatMap((g) => [g.key, g.color]), "#9a8f7c"]);
  const wOpacity = X(["match", ["get", "statusGroup"], ...WELL_GROUPS.flatMap((g) => [g.key, g.opacity]), 0.5]);
  const hollow = X(["in", ["get", "statusGroup"], ["literal", WELL_GROUPS.filter((g) => g.hollow).map((g) => g.key)]]);
  add({
    id: "og-well-dot", type: "circle", source: "og-wells", maxzoom: OG_ICON_Z,
    paint: {
      "circle-color": wColor,
      "circle-opacity": X(["case", hollow, 0, wOpacity]),
      "circle-stroke-color": wColor,
      "circle-stroke-opacity": wOpacity,
      "circle-stroke-width": X(["case", hollow, 1, 0]),
      "circle-radius": X(["interpolate", ["linear"], ["zoom"], 5, ["case", hollow, 1.6, 2.1], 10.99, ["case", hollow, 2.8, 3.4]]),
    },
  });
  // Zoom 11-13: groups of nearby wells as one count mark; single wells as their mark.
  const isC = X(["has", "point_count"]);
  add({ id: "og-well-cluster", type: "circle", source: "og-wells-c", minzoom: OG_ICON_Z, maxzoom: WELL_CLUSTER_MAX + 1, filter: isC, paint: { "circle-color": "#f3ead2", "circle-opacity": 0.92, "circle-stroke-color": X(["case", [">", ["get", "idle"], 0], WELL_IDLE, WELL_BROWN]), "circle-stroke-width": 1.6, "circle-radius": X(["interpolate", ["linear"], ["sqrt", ["get", "point_count"]], 1, 10, 6, 14, 15, 19]) } });
  add({ id: "og-well-cluster-n", type: "symbol", source: "og-wells-c", minzoom: OG_ICON_Z, maxzoom: WELL_CLUSTER_MAX + 1, filter: isC, layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 10.5, "text-allow-overlap": true, "text-ignore-placement": true }, paint: { "text-color": "#5b3a1c" } });
  add({ id: "og-well-c-icon", type: "symbol", source: "og-wells-c", minzoom: OG_ICON_Z, maxzoom: WELL_CLUSTER_MAX + 1, filter: X(["!", isC]), layout: { "icon-image": X(["concat", "og|well-", ["get", "statusGroup"]]), "icon-allow-overlap": true, "icon-ignore-placement": true } });
  add({ id: "og-well-icon", type: "symbol", source: "og-wells", minzoom: WELL_CLUSTER_MAX + 1, layout: { "icon-image": X(["concat", "og|well-", ["get", "statusGroup"]]), "icon-allow-overlap": true, "icon-ignore-placement": true } });
  // Marine oil terminals and former leases: quiet dots below zoom 11, marks from zoom 11.
  const dot = (id: string, source: string, fill: string, line: string, lineOpacity: number) =>
    add({ id, type: "circle", source, maxzoom: OG_ICON_Z, paint: { "circle-color": fill, "circle-radius": X(["interpolate", ["linear"], ["zoom"], 6, 2.6, 10.99, 4.5]), "circle-stroke-color": line, "circle-stroke-width": 1, "circle-stroke-opacity": lineOpacity } });
  dot("og-term-dot", "og-term", "#e3cd98", "#2b2a26", 0.7);
  add({ id: "og-term-icon", type: "symbol", source: "og-term", minzoom: OG_ICON_Z, layout: { "icon-image": "og|terminal", "icon-allow-overlap": true, "icon-ignore-placement": true } });
  dot("og-former-dot", "og-former", "#f3ead2", "#2b2a26", 0.55);
  add({ id: "og-former-icon", type: "symbol", source: "og-former", minzoom: OG_ICON_Z, layout: { "icon-image": "og|former", "icon-allow-overlap": true, "icon-ignore-placement": true } });
  add({ id: "og-pt-sel", type: "circle", source: "og-sel", paint: { "circle-radius": X(["step", ["zoom"], 7, OG_ICON_Z, ICON_PX / 2 + 4]), "circle-color": "rgba(250,247,240,0.3)", "circle-stroke-color": "#2b2a26", "circle-stroke-width": 2.5 } });
}

/** Show or hide the family's parts; apply Worth watching; mark the selection. */
export function syncOg(m: MLMap, on: boolean, v: OgView) {
  if (!m.getSource("og-fp")) return;
  const vis = (id: string, show: boolean) => m.getLayer(id) && m.setLayoutProperty(id, "visibility", show ? "visible" : "none");
  const p = v.parts;
  for (const id of ["og-fp-fill", "og-fp-hatch", "og-fp-line", "og-fp-line-d", "og-fp-sel"]) vis(id, on && p.footprints);
  for (const id of ["og-term-dot", "og-term-icon"]) vis(id, on && p.terminals && !v.watch);
  for (const id of ["og-former-dot", "og-former-icon"]) vis(id, on && p.former);
  vis("og-pt-sel", on);
  const groups = (WELL_GROUPS.map((g) => g.key) as WellGroup[]).filter((g) => p[`well-${g}`] && (!v.watch || g === "idle"));
  for (const id of ["og-well-dot", "og-well-icon", "og-well-cluster", "og-well-cluster-n", "og-well-c-icon"]) vis(id, on && groups.length > 0);
  for (const id of ["og-well-dot", "og-well-icon"]) m.setFilter(id, X(["in", ["get", "statusGroup"], ["literal", groups]]));
  // Groups count only the wells shown: the grouped source gets the shown statuses' wells.
  const key = groups.join(",");
  if (wellsAll && key !== wellsKey) {
    wellsKey = key;
    (m.getSource("og-wells-c") as GeoJSONSource).setData({ ...wellsAll, features: wellsAll.features.filter((f) => groups.includes(f.properties?.statusGroup)) });
  }
  const watchFp = X(["in", ["get", "prc"], ["literal", v.watchFp]]);
  for (const id of ["og-fp-fill", "og-fp-line", "og-fp-line-d"]) {
    const base = id === "og-fp-fill" ? ["==", ["get", "group"], "production"] : ["all", ["==", ["get", "group"], "production"], id === "og-fp-line" ? ["!", ["get", "dashed"]] : ["get", "dashed"]];
    m.setFilter(id, X(v.watch ? ["all", base, watchFp] : base));
  }
  vis("og-fp-hatch", on && p.footprints && !v.watch);
  for (const id of ["og-former-dot", "og-former-icon"]) m.setFilter(id, v.watch ? watchFp : null);
  const s = v.selected;
  m.setFilter("og-fp-sel", ["==", ["get", "prc"], s?.kind === "footprint" ? s.id : "__none"]);
}

/** The selected well, terminal or former lease, ringed. */
export function setOgSelPoint(m: MLMap, coords: [number, number] | null) {
  (m.getSource("og-sel") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: coords ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: coords } }] : [] });
}

// ---------------------------------------------------------------- State sovereign lands (public trust)
export const SOV = { tint: "#9cc0ad", tintLow: "#6fa387", line: "#2f6b3a", granted: "#3f6075" };
const WATER = "#b4c7d2";
export const WATERS_LAYERS = ["sov-ocean", "sov-outside", "sov-wb", "sov-wb-line", "sov-granted", "sov-granted-line", "sov-sla-low", "sov-sla"];

/**
 * The basemap's own ocean (OpenStreetMap coastline via OpenFreeMap), tinted, with everything seaward of the
 * SLA line repainted in the water color; CSLC's sovereign lake and lagoon beds; granted lands hatched inside;
 * the SLA line. Stronger tint at low zoom so the 3-mile band reads at Home.
 */
export function addWaters(m: MLMap, grantedUrl: string | null) {
  if (m.getSource("sov-outside")) return;
  m.addImage("sov|hatch", hatch(SOV.granted, 6), { pixelRatio: 2 });
  m.addSource("sov-outside", { type: "geojson", data: `${OG_BASE}/sla-outside.geojson` });
  m.addSource("sov-wb", { type: "geojson", data: `${OG_BASE}/sovereign-waterbodies.geojson`, attribution: "Sovereign lands: California State Lands Commission; SLA boundary: BOEM" });
  m.addSource("sov-sla", { type: "geojson", data: `${OG_BASE}/sla-boundary.geojson` });
  if (grantedUrl) m.addSource("sov-granted", { type: "geojson", data: grantedUrl });
  const before = m.getLayer("county-line") ? "county-line" : undefined;
  const add = (l: Parameters<MLMap["addLayer"]>[0]) => m.addLayer({ ...l, layout: { ...(l as { layout?: object }).layout, visibility: "none" } } as Parameters<MLMap["addLayer"]>[0], before);
  const tint = X(["interpolate", ["linear"], ["zoom"], 5, SOV.tintLow, 8, "#8db7a0", 10, SOV.tint]);
  add({ id: "sov-ocean", type: "fill", source: "omt", "source-layer": "water", filter: ["==", ["get", "class"], "ocean"], paint: { "fill-color": tint } });
  add({ id: "sov-outside", type: "fill", source: "sov-outside", paint: { "fill-color": WATER, "fill-antialias": false } });
  add({ id: "sov-wb", type: "fill", source: "sov-wb", paint: { "fill-color": tint } });
  add({ id: "sov-wb-line", type: "line", source: "sov-wb", minzoom: 7, paint: { "line-color": SOV.line, "line-width": 0.7, "line-opacity": 0.6 } });
  if (grantedUrl) {
    add({ id: "sov-granted", type: "fill", source: "sov-granted", paint: { "fill-pattern": "sov|hatch", "fill-opacity": 0.55 } });
    add({ id: "sov-granted-line", type: "line", source: "sov-granted", minzoom: 9, paint: { "line-color": SOV.granted, "line-width": 0.8, "line-opacity": 0.7 } });
  }
  // The SLA line: a thin solid edge at statewide zoom (so the band reads), dashed closer in.
  add({ id: "sov-sla-low", type: "line", source: "sov-sla", maxzoom: 8, paint: { "line-color": SOV.line, "line-width": X(["interpolate", ["linear"], ["zoom"], 5, 0.7, 8, 1]), "line-opacity": 0.75 } });
  add({ id: "sov-sla", type: "line", source: "sov-sla", minzoom: 8, paint: { "line-color": SOV.line, "line-width": 1.2, "line-dasharray": [4, 2], "line-opacity": 0.8 } });
}
export function syncWaters(m: MLMap, on: boolean) {
  for (const id of WATERS_LAYERS) if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
}
