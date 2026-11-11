/** Public URL of this map app (for OG images and share links). */
export const MAP_URL = process.env.NEXT_PUBLIC_MAP_URL ?? "http://localhost:3100";
/** About and methodology, inside the app. */
export const ABOUT_URL = "/about";
/** Source code, issues and corrections. */
export const REPO_URL = "https://github.com/drey3r/publiclands";
/** Optional "back" link for a private deployment. Unset in the public build. */
/**
 * Where the map reads cloud cover. Unset: this deployment's own /api/clouds. A second deployment (the
 * private map) sets NEXT_PUBLIC_CLOUDS_URL to the public map's /api/clouds, which is CDN-cached and
 * allows any origin, so only one deployment ever calls Open-Meteo.
 */
export const CLOUDS_URL = process.env.NEXT_PUBLIC_CLOUDS_URL || "/api/clouds";
/** Where the map reads the sea's currents and swell: the same deployment as the clouds, at /api/ocean. */
export const OCEAN_URL = process.env.NEXT_PUBLIC_OCEAN_URL || CLOUDS_URL.replace(/\/api\/clouds$/, "/api/ocean");
export const BACK_URL = process.env.NEXT_PUBLIC_BACK_URL || null;
export const BACK_LABEL = process.env.NEXT_PUBLIC_BACK_LABEL || "Back";
export const DISCLAIMER = "Not legal or survey data. See the California State Lands Commission for official records.";
export const CSLC_URL = "https://www.slc.ca.gov/";

/** California's extent (from data/ref/ca-outline.geojson). Home frames exactly this. */
export const CA_BOUNDS: [[number, number], [number, number]] = [[-124.42, 32.53], [-114.13, 42.01]];

/**
 * What the map does outside California (no names of any kind outside the state, ever):
 *  light  a faint landscape: relief, lakes and major rivers at low contrast (default)
 *  flat   one flat neutral over the land; only the ocean still shows
 * Override per visit with ?mask=flat or ?mask=light to compare.
 */
export type MaskMode = "light" | "flat";
export const MASK_MODE: MaskMode = "light";
export const maskFrom = (v: string | null | undefined): MaskMode => (v === "light" || v === "flat" ? v : v === "blank" ? "flat" : MASK_MODE);

/** California silhouette for the Home button and icon (24×24, Web Mercator, simplified). */
export const CA_PATH =
  "M7.1 11.9L6.2 12.5L7.3 13.4L7.0 14.1L8.2 16.0L9.4 17.2L9.7 18.8L11.4 18.8L13.3 19.7L15.3 21.3L15.9 23.0L20.6 22.6L20.4 21.1L21.4 19.1L20.5 17.5L17.3 14.4L10.6 8.3L10.6 1.0L2.8 1.0L3.1 2.4L2.6 5.3L3.5 6.3L3.7 8.4L5.2 10.6L7.1 11.9Z";

/** Featured stories. Camera is tuned for 3D terrain. */
export const STORIES = [
  {
    prc: "1579",
    kicker: "Completed",
    title: "Lake Tahoe's telephone cables, removed",
    blurb: "A 1955 right-of-way for telephone cables on the lakebed. The Commission authorized full removal in 2023. The cable came out of the lake in November 2024; the last shore section went on September 17, 2025: fully removed.",
    camera: { center: [-120.081, 38.972] as [number, number], zoom: 13.2, pitch: 64, bearing: 165 },
  },
  {
    prc: "944",
    kicker: "Candidate for review",
    title: "Emerald Bay power cables",
    blurb: "The lease record lists one submarine power cable and one nonoperational submarine power cable. Current term 2022–2042.",
    camera: { center: [-120.0905, 38.9545] as [number, number], zoom: 14, pitch: 70, bearing: 185 },
  },
] as const;
