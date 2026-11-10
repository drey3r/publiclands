import type { StageKey, TypeKey } from "./types";

export const TYPES: { key: TypeKey; label: string; color: string; from: string }[] = [
  { key: "cable", label: "Cable", color: "#3f6075", from: "Telecom" },
  { key: "pipeline", label: "Pipeline", color: "#a4553f", from: "Pipeline / oil & gas" },
  { key: "outfall", label: "Outfall / water", color: "#3f7a6c", from: "Water & sewer" },
  { key: "power", label: "Power", color: "#c08f2f", from: "Electric utility" },
  { key: "other", label: "Other", color: "#8d887c", from: "Recreational, marina, transport, agency, other" },
];
export const TYPE_COLOR = Object.fromEntries(TYPES.map((t) => [t.key, t.color])) as Record<TypeKey, string>;
export const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.key, t.label])) as Record<TypeKey, string>;

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
