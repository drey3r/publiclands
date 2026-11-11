// The quiet illustrated band at the bottom of each list card: one of five settings, picked by a simple rule
// (documented on the About page). Decoration only: it says nothing about the lease or the land.
import type { MiniLease } from "./types";

export type Setting = "mountains" | "desert" | "riverlands" | "farmlands" | "ocean";
export const SETTINGS: Setting[] = ["mountains", "desert", "riverlands", "farmlands", "ocean"];
export const SETTING_LABEL: Record<Setting, string> = { mountains: "Mountains", desert: "Desert", riverlands: "Riverlands", farmlands: "Farmlands", ocean: "Ocean" };

const OCEAN = /\b(ocean|bay|harbou?r|lagoon|strait|estuary|beach|cove|marina|channel islands?|island|coast|pier|marine|point|sound)\b/i;
const RIVER = /\b(river|slough|creek|canal|delta|cut|marsh|wetlands?|bypass|levee|channel|waterway|ditch)\b/i;
const MOUNTAIN = /\b(lake|mountains?|peak|forest|sierra|wilderness|redwoods?|summit|ridge|canyon|pass|meadow)\b/i;
const DESERT = /\b(desert|mojave|death valley|joshua|anza|borrego|dunes?|dry lake|playa|salton|owens|colorado river|mesa|wash|badlands?)\b/i;

/**
 * Leases, in order:
 * 1. Ocean: the waterbody is ocean, a bay, harbor, lagoon, strait or estuary, or the lease is shoreline protection or oil and gas.
 * 2. Desert: the region is Desert & Colorado River, or the place names a desert, dry lake or the Colorado River.
 * 3. Riverlands: the waterbody is a river, slough, creek, canal or marsh, or the region is Delta & Central Valley with water named.
 * 4. Mountains: the region is Sierra & Tahoe or North Coast, or the waterbody is a lake.
 * 5. Farmlands: everything else.
 */
export function leaseSetting(l: Pick<MiniLease, "w" | "r" | "k" | "n" | "og">): Setting {
  const w = l.w ?? "";
  const text = `${w} ${l.n}`;
  if ((w && OCEAN.test(w) && !RIVER.test(w)) || l.k === "shore" || l.og) return "ocean";
  if (l.r === "Desert & Colorado River" || DESERT.test(text)) return "desert";
  if (RIVER.test(w) || RIVER.test(l.n)) return "riverlands";
  if (l.r === "Sierra & Tahoe" || l.r === "North Coast" || /\blake\b/i.test(w)) return "mountains";
  if (OCEAN.test(l.n)) return "ocean";
  return "farmlands";
}

/**
 * Public land, in order, from its name and where it is (the middle of its outline):
 * 1. Ocean: the name says beach, bay, harbor, coast, island, lagoon, marine or point.
 * 2. Desert: the name says desert, dunes, dry lake, Mojave, Death Valley, Joshua, Anza-Borrego; or it lies south of 36.5°N and east of 117.8°W.
 * 3. Riverlands: the name says river, creek, slough, delta, marsh or wetland (or a wildlife area).
 * 4. Mountains: the name says forest, mountain, peak, wilderness, lake, redwoods, canyon; or it lies in the Sierra
 *    (north of 35.5°N and east of the Central Valley's east edge, taken as a line from 118.9°W at 35.5°N to 121.6°W at 39.5°N).
 * 5. Farmlands: everything else.
 */
export function placeSetting(p: { name: string; bbox: [number, number, number, number] }): Setting {
  const n = p.name;
  const x = (p.bbox[0] + p.bbox[2]) / 2, y = (p.bbox[1] + p.bbox[3]) / 2;
  if (OCEAN.test(n) && !/\bpoint\b/i.test(n.replace(/\bpoint (?:reyes|lobos|mugu|conception|dume|sur|arena|loma)\b/i, "beach"))) return "ocean";
  if (/\b(beach|coast|marine|island|lagoon|harbou?r|bay)\b/i.test(n)) return "ocean";
  if (DESERT.test(n) || (y < 36.5 && x > -117.8)) return "desert";
  if (/\b(river|creek|slough|delta|marsh|wetlands?|wildlife area|bypass)\b/i.test(n)) return "riverlands";
  const sierraEdge = -118.9 - (y - 35.5) * 0.67;
  if (MOUNTAIN.test(n) || (y > 35.5 && x > sierraEdge && x < -117.8)) return "mountains";
  return "farmlands";
}
