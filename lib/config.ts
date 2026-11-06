/** Public URL of this map app (for OG images and share links). */
export const MAP_URL = process.env.NEXT_PUBLIC_MAP_URL ?? "http://localhost:3100";
/** About the project. */
export const ABOUT_URL = "https://tahoelead.com";
/** Source code, issues and corrections. */
export const REPO_URL = "https://github.com/drey3r/publiclands";
/** Optional "back" link for a private deployment. Unset in the public build. */
export const BACK_URL = process.env.NEXT_PUBLIC_BACK_URL || null;
export const BACK_LABEL = process.env.NEXT_PUBLIC_BACK_LABEL || "Back";
export const DISCLAIMER = "Not legal or survey data. See the California State Lands Commission for official records.";
export const CSLC_URL = "https://www.slc.ca.gov/";

export const CA_BOUNDS: [[number, number], [number, number]] = [[-124.6, 32.4], [-114.0, 42.1]];

/** Featured stories. Camera is tuned for 3D terrain. */
export const STORIES = [
  {
    prc: "1579",
    kicker: "Completed",
    title: "Lake Tahoe's telephone cables, removed",
    blurb: "A 1955 right-of-way for telephone cables on the lakebed. The Commission authorized full removal in 2023; the lakebed cable was reported removed in 2024.",
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
