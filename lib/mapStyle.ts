import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import type { ExpressionSpecification } from "maplibre-gl";
import { MASK_MODE, type MaskMode } from "./config";
import frame from "@/data/ref/ca-frame.json";

// Basemap: OpenFreeMap vector tiles (OpenMapTiles schema, no key).
// Terrain: AWS Open Data Terrain Tiles (Terrarium encoding), for hillshade and 3D.

export const TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export const ATTRIBUTION = [
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>',
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a>',
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
].join(" ");
const TERRAIN_ATTR =
  'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Terrain Tiles</a> (USGS 3DEP, SRTM, GMTED, ETOPO1)';

const C = {
  land: "#f4efe4",
  wood: "#dfe3cf",
  grass: "#e7e6d2",
  scrub: "#e9e4d1",
  sand: "#efe6d0",
  wetland: "#dce3d6",
  ice: "#f7f6f1",
  park: "#dbe2cb",
  parkLine: "#b9c4a6",
  urban: "#ece5d7",
  water: "#b4c7d2",
  waterLine: "#98b1c0",
  waterText: "#47657a",
  road: "#ffffff",
  roadMajor: "#e8dcc2",
  roadCase: "#d9ccb2",
  boundary: "#a59a84",
  text: "#57534a",
  textStrong: "#2b2a26",
  halo: "#f7f3ea",
  outside: "#ebe7de",
  outsideLine: "#cfc6b4",
  caLine: "#8a806d",
  county: "#9c8f76",
  countyStrong: "#6f6656",
  countyText: "#7d7360",
  range: "#8a7b62",
  pass: "#6f6656",
};

const FONT = ["Noto Sans Regular"];
const FONT_IT = ["Noto Sans Italic"];
const FONT_B = ["Noto Sans Bold"];
const NAME = ["coalesce", ["get", "name:en"], ["get", "name"]] as unknown as ExpressionSpecification;

/** Inside California (with its bays and coastal waters): every basemap label must be. */
const IN_CA = ["within", { type: "Polygon", coordinates: [frame.area] }] as unknown as ExpressionSpecification;
const inCA = (f?: unknown) => (f ? (["all", IN_CA, f] as unknown as ExpressionSpecification) : IN_CA);
/** Curated labels (data/ref/ca-labels.geojson): kind, and the zoom range each shows in. */
const curated = (kinds: string[]) =>
  ["all", ["match", ["get", "k"], kinds, true, false], [">=", ["zoom"], ["get", "z"]], ["<", ["zoom"], ["get", "mz"]]] as unknown as ExpressionSpecification;
/** Names the curated set already places; the basemap's copies are left out. */
const CURATED_WATER = ["Lake Tahoe", "Salton Sea", "Mono Lake", "Shasta Lake", "Clear Lake", "Lake Oroville", "Lake Almanor", "Eagle Lake", "Goose Lake", "Lake Berryessa", "Folsom Lake", "Trinity Lake", "Lake Isabella", "Honey Lake", "San Luis Reservoir", "New Melones Lake", "Don Pedro Reservoir", "Big Bear Lake", "Lake Elsinore", "Millerton Lake", "San Francisco Bay", "Monterey Bay", "San Pablo Bay", "Suisun Bay", "Humboldt Bay", "Santa Monica Bay", "San Pedro Bay", "San Diego Bay", "Tomales Bay", "Drakes Bay", "Morro Bay", "Pacific Ocean", "North Pacific Ocean"];

/**
 * Outside California, in two steps around the relief:
 *  outside-base  opaque neutral over land cover and roads (no roads or towns outside, ever)
 *  ...hillshade, major rivers and lakes are drawn here, everywhere...
 *  outside-veil  the same neutral again, mostly opaque: outside, the relief, lakes and rivers
 *                remain only as a faint landscape ("light"); fully opaque for "flat"
 * The ocean is drawn above the veil so it always reads as water.
 */
function outsideBase(): LayerSpecification {
  return { id: "outside-base", type: "fill", source: "caMask", paint: { "fill-color": C.outside, "fill-antialias": false } };
}
function outsideVeil(mode: MaskMode): LayerSpecification {
  return {
    id: "outside-veil",
    type: "fill",
    source: "caMask",
    paint: { "fill-color": C.outside, "fill-opacity": mode === "flat" ? 1 : ["interpolate", ["linear"], ["zoom"], 5, 0.62, 8, 0.56, 11, 0.44, 14, 0.38], "fill-antialias": false },
  };
}

function frameLines(): LayerSpecification[] {
  return [
    {
      id: "outside-states",
      type: "line",
      source: "omt",
      "source-layer": "boundary",
      filter: ["all", ["<=", ["coalesce", ["get", "admin_level"], 99], 4], ["!=", ["coalesce", ["get", "maritime"], 0], 1]],
      paint: { "line-color": C.outsideLine, "line-width": 0.5, "line-opacity": 0.8 },
    },
    {
      id: "ca-outline",
      type: "line",
      source: "caBorder",
      layout: { "line-join": "round" },
      paint: {
        "line-color": C.caLine,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.9, 10, 1.6],
        "line-opacity": 0.7,
      },
    },
  ];
}

const ROAD_MAJOR = ["match", ["get", "class"], ["motorway", "trunk", "primary"], true, false] as unknown as ExpressionSpecification;
const ROAD_MINOR = ["match", ["get", "class"], ["secondary", "tertiary", "minor", "service", "track"], true, false] as unknown as ExpressionSpecification;
const BRIDGE = ["==", ["get", "brunnel"], "bridge"] as unknown as ExpressionSpecification;

function roadLayers(bridges: boolean): LayerSpecification[] {
  const id = (s: string) => (bridges ? `bridge-${s}` : `road-${s}`);
  const f = (cls: ExpressionSpecification) => (bridges ? inCA(["all", cls, BRIDGE]) : cls);
  return [
    {
      id: id("major-case"),
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      minzoom: bridges ? 9 : 6,
      filter: f(ROAD_MAJOR),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": C.roadCase, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 10, 2.2, 14, 7], "line-opacity": 0.8 },
    },
    {
      id: id("minor"),
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      minzoom: 10,
      filter: f(ROAD_MINOR),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": C.road, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 3], "line-opacity": 0.9 },
    },
    {
      id: id("major"),
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      minzoom: bridges ? 9 : 6,
      filter: f(ROAD_MAJOR),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": C.roadMajor, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.3, 10, 1.4, 14, 5] },
    },
  ];
}

/** Anchors a place label may slide to when a lease mark or another label is in the way. */
const SLIDE = [
  "literal",
  ["center", [0, 0], "left", [0.9, 0], "right", [-0.9, 0], "top", [0, 0.8], "bottom", [0, -0.8], "left", [2.2, 0], "right", [-2.2, 0], "top", [0, 1.8], "bottom", [0, -1.8]],
] as unknown as ExpressionSpecification;

/**
 * California place names, in tiers by zoom:
 *   statewide  big cities, mountain ranges, the ocean, the largest bays and lakes
 *   ~7         towns, main rivers, more lakes and bays, smaller ranges, major passes
 *   ~9+        villages, the basemap's river and lake names, peaks
 * Lease marks sit above the labels and block them (see MapView), so labels slide aside or drop.
 */
function labelLayers(): LayerSpecification[] {
  return [
    {
      id: "label-range",
      type: "symbol",
      source: "caLabels",
      filter: curated(["range"]),
      layout: {
        "symbol-placement": "line-center",
        "text-field": ["get", "name"],
        "text-font": FONT,
        "text-transform": "uppercase",
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 9.5, 9, 12],
        "text-letter-spacing": 0.32,
        "text-max-angle": 30,
        "text-keep-upright": true,
      },
      paint: { "text-color": C.range, "text-opacity": 0.85, "text-halo-color": C.halo, "text-halo-width": 1.2 },
    },
    {
      id: "label-river",
      type: "symbol",
      source: "caLabels",
      filter: curated(["river"]),
      layout: { "symbol-placement": "line-center", "text-field": ["get", "name"], "text-font": FONT_IT, "text-size": 10.5, "text-letter-spacing": 0.04, "text-max-angle": 35 },
      paint: { "text-color": C.waterText, "text-halo-color": C.halo, "text-halo-width": 1.2 },
    },
    {
      id: "water-name-line",
      type: "symbol",
      source: "omt",
      "source-layer": "waterway",
      minzoom: 9,
      filter: inCA(["==", ["get", "class"], "river"]),
      layout: { "symbol-placement": "line", "text-field": NAME, "text-font": FONT_IT, "text-size": 11, "text-letter-spacing": 0.05 },
      paint: { "text-color": C.waterText, "text-halo-color": C.halo, "text-halo-width": 1.2 },
    },
    {
      id: "label-water",
      type: "symbol",
      source: "caLabels",
      filter: curated(["sea", "bay", "lake"]),
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT_IT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, ["match", ["get", "k"], "sea", 13, 10.5], 10, 13],
        "text-letter-spacing": ["match", ["get", "k"], "sea", 0.3, 0.06],
        "text-max-width": 7,
      },
      paint: { "text-color": C.waterText, "text-halo-color": "rgba(247,243,234,0.7)", "text-halo-width": 1 },
    },
    {
      id: "water-name",
      type: "symbol",
      source: "omt",
      "source-layer": "water_name",
      minzoom: 9,
      filter: inCA(["!", ["in", NAME, ["literal", CURATED_WATER]]]),
      layout: { "text-field": NAME, "text-font": FONT_IT, "text-size": ["interpolate", ["linear"], ["zoom"], 9, 11, 13, 13], "text-letter-spacing": 0.06, "text-max-width": 8 },
      paint: { "text-color": C.waterText, "text-halo-color": "rgba(247,243,234,0.7)", "text-halo-width": 1 },
    },
    {
      id: "label-pass",
      type: "symbol",
      source: "caLabels",
      filter: curated(["pass"]),
      layout: {
        "text-field": ["concat", "⌒ ", ["get", "name"]],
        "text-font": FONT,
        "text-size": 10,
        "text-variable-anchor-offset": ["literal", ["left", [0.4, 0], "right", [-0.4, 0], "top", [0, 0.4]]],
        "text-optional": true,
      },
      paint: { "text-color": C.pass, "text-halo-color": C.halo, "text-halo-width": 1.2 },
    },
    {
      id: "peak",
      type: "symbol",
      source: "omt",
      "source-layer": "mountain_peak",
      minzoom: 10,
      filter: inCA(["has", "name"]),
      layout: { "text-field": ["concat", "▲ ", ["get", "name"]], "text-font": FONT, "text-size": 10, "text-anchor": "top", "text-optional": true },
      paint: { "text-color": "#7c6f55", "text-halo-color": C.halo, "text-halo-width": 1 },
    },
    {
      id: "place-minor",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      minzoom: 9.5,
      filter: inCA(["match", ["get", "class"], ["village", "hamlet", "suburb", "neighbourhood"], true, false]),
      layout: { "text-field": NAME, "text-font": FONT, "text-size": 11, "text-variable-anchor-offset": SLIDE },
      paint: { "text-color": C.text, "text-halo-color": C.halo, "text-halo-width": 1.2 },
    },
    {
      id: "place-town",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      minzoom: 6.5,
      filter: inCA(["==", ["get", "class"], "town"]),
      layout: { "text-field": NAME, "text-font": FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 6.5, 10.5, 12, 13], "text-variable-anchor-offset": SLIDE },
      paint: { "text-color": C.text, "text-halo-color": C.halo, "text-halo-width": 1.3 },
    },
    {
      id: "place-city",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      minzoom: 4,
      filter: inCA(["==", ["get", "class"], "city"]),
      layout: {
        "text-field": NAME,
        "text-font": FONT_B,
        "text-size": ["interpolate", ["linear"], ["zoom"], 4, 10.5, 10, 15],
        "symbol-sort-key": ["coalesce", ["get", "rank"], 99],
        "text-variable-anchor-offset": SLIDE,
      },
      paint: { "text-color": C.textStrong, "text-halo-color": C.halo, "text-halo-width": 1.5 },
    },
  ];
}

/** County lines: faint as you zoom in by default; "County lines" (reference layers) makes them stronger and names counties. */
function countyLayers(): LayerSpecification[] {
  return [
    {
      id: "county-line",
      type: "line",
      source: "caCounties",
      layout: { "line-join": "round" },
      paint: { "line-color": C.county, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.4, 12, 1.1], "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.35, 8, 0.65, 12, 0.8] },
    },
    {
      id: "county-line-strong",
      type: "line",
      source: "caCounties",
      layout: { "line-join": "round", visibility: "none" },
      paint: { "line-color": C.countyStrong, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 12, 2.2], "line-opacity": 0.9, "line-dasharray": [4, 2] },
    },
  ];
}
const countyLabel: LayerSpecification = {
  id: "county-label",
  type: "symbol",
  source: "caCountyLabels",
  layout: {
    visibility: "none",
    "text-field": ["concat", ["get", "name"], " County"],
    "text-font": FONT,
    "text-transform": "uppercase",
    "text-size": ["interpolate", ["linear"], ["zoom"], 5, 8.5, 10, 11.5],
    "text-letter-spacing": 0.14,
    "text-max-width": 7,
    "text-padding": 4,
  },
  paint: { "text-color": C.countyText, "text-halo-color": C.halo, "text-halo-width": 1.4 },
};

/**
 * The sea floor, from the same terrain tiles (their bathymetry: ETOPO1 and GMTED): the shelf keeps
 * the plain water color, and the water deepens past the shelf edge, so the canyons and basins
 * offshore (Monterey Canyon, the Channel Islands basins) read faintly. Transparent above -110 m,
 * so land below sea level (Death Valley, -86 m; the Salton Sea floor) is never tinted.
 */
function oceanDepth(): LayerSpecification {
  return {
    id: "ocean-depth",
    type: "color-relief",
    source: "hillshadeDem",
    paint: {
      "color-relief-color": [
        "interpolate", ["linear"], ["elevation"],
        -5000, "#8aa6b8",
        -3000, "#93adbf",
        -1500, "#9db5c5",
        -500, "#a6bdcb",
        -180, "#adc2cf",
        -110, "rgba(180,199,210,0)",
      ],
      "color-relief-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.9, 12, 0.75],
    },
  } as unknown as LayerSpecification;
}

export function baseStyle(opts: { mask?: MaskMode } = {}): StyleSpecification {
  const mask = opts.mask ?? MASK_MODE;
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      omt: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: ATTRIBUTION },
      hillshadeDem: { type: "raster-dem", tiles: [TERRARIUM], encoding: "terrarium", tileSize: 256, maxzoom: 15, attribution: TERRAIN_ATTR },
      terrainDem: { type: "raster-dem", tiles: [TERRARIUM], encoding: "terrarium", tileSize: 256, maxzoom: 14 },
      caMask: { type: "geojson", data: "/data/ca-mask.geojson" },
      caBorder: { type: "geojson", data: "/data/ca-border.geojson" },
      caCounties: { type: "geojson", data: "/data/ca-county-lines.geojson" },
      caCountyLabels: { type: "geojson", data: "/data/ca-county-labels.geojson" },
      caLabels: { type: "geojson", data: "/data/ca-labels.geojson" },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": C.land } },
      {
        id: "landcover",
        type: "fill",
        source: "omt",
        "source-layer": "landcover",
        paint: {
          "fill-color": [
            "match", ["get", "class"],
            "wood", C.wood, "forest", C.wood,
            "grass", C.grass, "farmland", C.grass,
            "scrub", C.scrub,
            "sand", C.sand,
            "wetland", C.wetland,
            "ice", C.ice,
            C.land,
          ],
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.7, 10, 0.9],
        },
      },
      {
        id: "landuse-urban",
        type: "fill",
        source: "omt",
        "source-layer": "landuse",
        filter: ["match", ["get", "class"], ["residential", "suburb", "neighbourhood", "commercial", "industrial", "retail"], true, false],
        paint: { "fill-color": C.urban, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 12, 0.8] },
      },
      { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": C.park, "fill-opacity": 0.55 } },
      { id: "park-outline", type: "line", source: "omt", "source-layer": "park", minzoom: 8, paint: { "line-color": C.parkLine, "line-width": 0.7, "line-opacity": 0.8 } },
      {
        id: "waterway",
        type: "line",
        source: "omt",
        "source-layer": "waterway",
        paint: {
          "line-color": C.waterLine,
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, ["match", ["get", "class"], "river", 0.9, 0.3], 12, ["match", ["get", "class"], "river", 2.2, 0.9]],
        },
      },
      // Roads sit under the water (bridges are redrawn above) and under the outside mask.
      ...roadLayers(false),
      outsideBase(),
      {
        id: "hillshade",
        type: "hillshade",
        source: "hillshadeDem",
        paint: {
          "hillshade-shadow-color": "#5a523f",
          "hillshade-highlight-color": "#fffaf0",
          "hillshade-accent-color": "#7c6f55",
          "hillshade-exaggeration": ["interpolate", ["linear"], ["zoom"], 4, 0.42, 10, 0.32, 14, 0.22],
          "hillshade-illumination-direction": 315,
        },
      },
      // Major rivers again above the outside base, so they show (faintly) beyond the state line.
      {
        id: "waterway-river",
        type: "line",
        source: "omt",
        "source-layer": "waterway",
        filter: ["==", ["get", "class"], "river"],
        paint: { "line-color": C.waterLine, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.9, 12, 2.2] },
      },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", filter: ["!=", ["get", "class"], "ocean"], paint: { "fill-color": C.water } },
      outsideVeil(mask),
      // Lakes and major rivers once more, part-strength: unchanged inside California (water over
      // water), muted water outside. Off for "flat".
      ...(mask === "flat"
        ? []
        : ([
            { id: "water-muted", type: "fill", source: "omt", "source-layer": "water", filter: ["!=", ["get", "class"], "ocean"], paint: { "fill-color": C.water, "fill-opacity": 0.55 } },
            {
              id: "waterway-river-muted",
              type: "line",
              source: "omt",
              "source-layer": "waterway",
              filter: ["==", ["get", "class"], "river"],
              paint: { "line-color": C.waterLine, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.9, 12, 2.2], "line-opacity": 0.5 },
            },
          ] as LayerSpecification[])),
      { id: "water-ocean", type: "fill", source: "omt", "source-layer": "water", filter: ["==", ["get", "class"], "ocean"], paint: { "fill-color": C.water } },
      oceanDepth(),
      ...countyLayers(),
      ...roadLayers(true),
      ...frameLines(),
      ...labelLayers(),
      countyLabel,
    ],
  };
}
