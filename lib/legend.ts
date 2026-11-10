import type { CatKey, StageKey, TypeKey } from "./types";

/**
 * Infrastructure type (Estimate from the Improvements text). Colors are used only when
 * "Color by: Type" is on; the default lease mark is gold. None of them is gold, and none is green.
 */
export const TYPES: { key: TypeKey; label: string; color: string; from: string }[] = [
  { key: "cable", label: "Cable", color: "#3f4f93", from: "Telephone, fiber optic, communications, submarine cable" },
  { key: "pipeline", label: "Pipeline", color: "#a4553f", from: "Pipeline, petroleum, crude, natural gas" },
  { key: "outfall", label: "Water / outfall", color: "#2286ad", from: "Outfall, sewer, wastewater, intake, water line" },
  { key: "power", label: "Power", color: "#8e3b8a", from: "Power line or cable, transmission line, kV" },
  { key: "other", label: "Not infrastructure", color: "#d9d2c2", from: "Recreation, public agency, commercial and other leases" },
];
export const TYPE_COLOR = Object.fromEntries(TYPES.map((t) => [t.key, t.color])) as Record<TypeKey, string>;
export const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.key, t.label])) as Record<TypeKey, string>;

/**
 * Lease category (Estimate): a grouping of the state's own lease type (TypeofLease), with
 * infrastructure found in the Improvements text. `tier` sets how strong the mark is.
 */
export const CATS: { key: CatKey; label: string; short: string; color: string; tier: 1 | 2 | 3; note: string }[] = [
  { key: "infra", label: "Infrastructure", short: "Infrastructure", color: "#b8452c", tier: 1, note: "Cable, pipeline, water/outfall and power lines" },
  { key: "roads", label: "Roads and bridges", short: "Roads and bridges", color: "#6b7078", tier: 2, note: "Streets and Highways, and Right of Way leases whose text names a road, bridge or highway" },
  { key: "shore", label: "Shoreline protection", short: "Shoreline", color: "#4f7f7a", tier: 2, note: "Protective Structure Use: seawalls, riprap, bulkheads" },
  { key: "agency", label: "Public agency", short: "Public agency", color: "#3f4f93", tier: 2, note: "Public Agency Use without utility words" },
  { key: "commercial", label: "Commercial and industrial", short: "Commercial", color: "#5e5141", tier: 2, note: "Commercial, industrial, oil and gas, mineral, geothermal, dredging, grazing" },
  { key: "rec", label: "Recreation", short: "Recreation", color: "#e3cf9c", tier: 3, note: "Piers, docks, marinas, buoys" },
  { key: "other", label: "Other", short: "Other", color: "#c9c2b2", tier: 3, note: "Right of way with no utility or road words, surveys, compensatory agreements, other" },
];
export const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c.key, c.label])) as Record<CatKey, string>;
export const CAT_COLOR = Object.fromEntries(CATS.map((c) => [c.key, c.color])) as Record<CatKey, string>;

/** Screen score bands (Estimate), for "Color by: Score". */
export const SCORE_BANDS: { min: number; label: string; color: string }[] = [
  { min: 0, label: "0–19", color: "#f1e6c8" },
  { min: 20, label: "20–39", color: "#ddb867" },
  { min: 40, label: "40–59", color: "#b27a2c" },
  { min: 60, label: "60 and up", color: "#6a3b12" },
];
export const SCORE_UNKNOWN = "#cfc8b8";

/** Era buckets: older is darker and warmer. `min` is inclusive decade. */
export const ERAS: { key: string; label: string; min: number; max: number; color: string }[] = [
  { key: "pre1940", label: "Before 1940", min: 0, max: 1939, color: "#4f2a1f" },
  { key: "1940s", label: "1940s", min: 1940, max: 1949, color: "#74392a" },
  { key: "1950s", label: "1950s", min: 1950, max: 1959, color: "#a4553f" },
  { key: "1960s", label: "1960s", min: 1960, max: 1969, color: "#b8784b" },
  { key: "1970s", label: "1970s", min: 1970, max: 1979, color: "#c49a4a" },
  { key: "1980s", label: "1980s–90s", min: 1980, max: 1999, color: "#9fa36f" },
  { key: "2000s", label: "2000 and later", min: 2000, max: 9999, color: "#a9b79c" },
];
export const ERA_UNKNOWN = "#cfc8b8";
export const eraOf = (decade: number | null) => (decade == null ? null : ERAS.find((e) => decade >= e.min && decade <= e.max) ?? null);

export const REGIONS = [
  "North Coast",
  "Bay Area",
  "Delta & Central Valley",
  "Sierra & Tahoe",
  "Central Coast",
  "Southern California",
  "Desert & Colorado River",
] as const;

export const STAGES: { key: StageKey; label: string }[] = [
  { key: "research", label: "Research" },
  { key: "site-visit", label: "Site visit" },
  { key: "assess", label: "Assess" },
  { key: "share", label: "Share" },
  { key: "engage-gov", label: "Engage gov" },
  { key: "plan", label: "Plan" },
  { key: "execute", label: "Execute" },
];

export const LAYER_INFO = {
  access: { label: "Public spaces", color: "#7f9a6a" },
  granted: { label: "CSLC granted lands", color: "#5b7b8f" },
  school: { label: "CSLC school lands", color: "#a8754f" },
  waterlines: { label: "High & low water lines", color: "#3f6075" },
} as const;

/**
 * Public land, all green; the shade is the owner level (palette A, picked after Round 1).
 * Groups follow CPAD's AGNCY_LEV. "Local and nonprofit" also holds CPAD's small Joint,
 * Tribal, Private and Home Owners Association groups.
 */
export type LandKey = "state" | "federal" | "local";
export const LAND: { key: LandKey; label: string; color: string; note: string }[] = [
  { key: "state", label: "State lands", color: "#2f6b3a", note: "State Parks, Fish & Wildlife, conservancies, State Lands Commission and other state agencies" },
  { key: "federal", label: "Federal lands", color: "#86ad72", note: "National forests, parks, BLM, wildlife refuges and other federal agencies" },
  { key: "local", label: "Local and nonprofit", color: "#b3cf98", note: "Counties, cities, special districts, nonprofits (and CPAD's few joint, tribal and private holdings)" },
];
export const NONPROFIT_COLOR = "#9cc2ad";
export const landOf = (agencyLevel: string | null | undefined): LandKey => (agencyLevel === "State" ? "state" : agencyLevel === "Federal" ? "federal" : "local");

/** Lease marks: muted gold with a dark outline (treatment a, picked after Round 1). */
export const LEASE_MARK = { fill: "#d2b06a", line: "#2b2a26", text: "#2b2a26" };
/**
 * Priority by strength, not hue: infrastructure is full gold with a dark outline and a little
 * larger; public agency and commercial are the standard mark; recreation and other are smaller
 * and paler but still outlined.
 */
export const LEASE_TIER = {
  1: { fill: LEASE_MARK.fill, line: LEASE_MARK.line, lineOpacity: 1, width: 2, r: [4.8, 7.2, 10.5] },
  2: { fill: "#e3cd98", line: LEASE_MARK.line, lineOpacity: 0.7, width: 1, r: [3.3, 5, 7.5] },
  3: { fill: "#efe5c8", line: "#6b6352", lineOpacity: 0.65, width: 0.9, r: [2.5, 3.8, 6] },
} as const;
