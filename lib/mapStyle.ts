import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { MASK_MODE, type MaskMode } from "./config";

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
  outside: "#ece8df",
  outsideLine: "#b9af9c",
  caLine: "#6f6656",
};

const FONT = ["Noto Sans Regular"];
const FONT_IT = ["Noto Sans Italic"];
const FONT_B = ["Noto Sans Bold"];

/** Outside-California treatment: drawn above the basemap, below every data layer. */
function frameLayers(mode: MaskMode): LayerSpecification[] {
  const out: LayerSpecification[] = [];
  if (mode !== "outline")
    out.push({
      id: "outside-mask",
      type: "fill",
      source: "caMask",
      paint: {
        "fill-color": C.outside,
        // Fade: strongest statewide, lighter up close so a border site keeps its context.
        "fill-opacity": mode === "blank" ? 1 : ["interpolate", ["linear"], ["zoom"], 5, 0.7, 8, 0.6, 11, 0.42, 14, 0.32],
        "fill-antialias": false,
      },
    });
  // Neighboring states, faint, above the wash.
  out.push({
    id: "outside-states",
    type: "line",
    source: "omt",
    "source-layer": "boundary",
    filter: ["all", ["<=", ["coalesce", ["get", "admin_level"], 99], 4], ["!=", ["coalesce", ["get", "maritime"], 0], 1]],
    paint: { "line-color": C.outsideLine, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 10, 1.1], "line-opacity": mode === "outline" ? 0 : 0.9 },
  });
  out.push({
    id: "ca-outline",
    type: "line",
    source: "caOutline",
    layout: { "line-join": "round" },
    paint: {
      "line-color": C.caLine,
      "line-width": ["interpolate", ["linear"], ["zoom"], 4, mode === "outline" ? 1.8 : 1.1, 10, mode === "outline" ? 3 : 2],
      "line-opacity": mode === "outline" ? 0.85 : 0.6,
    },
  });
  return out;
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
      caOutline: { type: "geojson", data: "/data/ca-outline.geojson" },
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
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": C.water } },
      {
        id: "boundary-county",
        type: "line",
        source: "omt",
        "source-layer": "boundary",
        minzoom: 7,
        filter: ["all", ["==", ["get", "admin_level"], 6], ["!=", ["coalesce", ["get", "maritime"], 0], 1]],
        paint: { "line-color": C.boundary, "line-width": 0.6, "line-dasharray": [2, 2], "line-opacity": 0.55 },
      },
      {
        id: "boundary-state",
        type: "line",
        source: "omt",
        "source-layer": "boundary",
        filter: ["all", ["<=", ["coalesce", ["get", "admin_level"], 99], 4], ["!=", ["coalesce", ["get", "maritime"], 0], 1]],
        paint: { "line-color": C.boundary, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.8, 10, 1.6], "line-dasharray": [3, 2] },
      },
      {
        id: "road-major-case",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 6,
        filter: ["match", ["get", "class"], ["motorway", "trunk", "primary"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": C.roadCase, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 10, 2.2, 14, 7], "line-opacity": 0.8 },
      },
      {
        id: "road-minor",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 10,
        filter: ["match", ["get", "class"], ["secondary", "tertiary", "minor", "service", "track"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": C.road, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 3], "line-opacity": 0.9 },
      },
      {
        id: "road-major",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 6,
        filter: ["match", ["get", "class"], ["motorway", "trunk", "primary"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": C.roadMajor, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.3, 10, 1.4, 14, 5] },
      },
      {
        id: "water-name-line",
        type: "symbol",
        source: "omt",
        "source-layer": "waterway",
        minzoom: 9,
        filter: ["==", ["get", "class"], "river"],
        layout: { "symbol-placement": "line", "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": FONT_IT, "text-size": 11, "text-letter-spacing": 0.05 },
        paint: { "text-color": C.waterText, "text-halo-color": C.halo, "text-halo-width": 1.2 },
      },
      {
        id: "water-name",
        type: "symbol",
        source: "omt",
        "source-layer": "water_name",
        layout: {
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
          "text-font": FONT_IT,
          "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 10, 13],
          "text-letter-spacing": 0.08,
          "text-max-width": 8,
        },
        paint: { "text-color": C.waterText, "text-halo-color": "rgba(247,243,234,0.6)", "text-halo-width": 1 },
      },
      {
        id: "peak",
        type: "symbol",
        source: "omt",
        "source-layer": "mountain_peak",
        minzoom: 10,
        filter: ["has", "name"],
        layout: { "text-field": ["concat", "▲ ", ["get", "name"]], "text-font": FONT, "text-size": 10, "text-anchor": "top", "text-optional": true },
        paint: { "text-color": "#7c6f55", "text-halo-color": C.halo, "text-halo-width": 1 },
      },
      {
        id: "place-minor",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        minzoom: 9,
        filter: ["match", ["get", "class"], ["village", "hamlet", "suburb", "neighbourhood"], true, false],
        layout: { "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": FONT, "text-size": 11 },
        paint: { "text-color": C.text, "text-halo-color": C.halo, "text-halo-width": 1.2 },
      },
      {
        id: "place-town",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        minzoom: 6,
        filter: ["==", ["get", "class"], "town"],
        layout: { "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 6, 10.5, 12, 13] },
        paint: { "text-color": C.text, "text-halo-color": C.halo, "text-halo-width": 1.3 },
      },
      {
        id: "place-city",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        minzoom: 4,
        filter: ["==", ["get", "class"], "city"],
        layout: {
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
          "text-font": FONT_B,
          "text-size": ["interpolate", ["linear"], ["zoom"], 4, 10.5, 10, 15],
          "symbol-sort-key": ["coalesce", ["get", "rank"], 99],
        },
        paint: { "text-color": C.textStrong, "text-halo-color": C.halo, "text-halo-width": 1.5 },
      },
      ...frameLayers(mask),
    ],
  };
}
