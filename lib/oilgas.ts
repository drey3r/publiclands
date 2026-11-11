// State oil & gas family: shapes of data/state-oil-gas/* (scripts/data/build_state_oil_gas.py),
// marks, labels, and the "Worth watching" groups. Wording rules: neutral, every status carries its source.
import { LEASE_TIER } from "./legend";
import { INK, type MarkStyle } from "./icons";
import type { MiniLease } from "./types";

export const OG_BASE = "/data/state-oil-gas";

export type DateSource = { label: string; url: string; date: string; sourceUpdated?: string | null; sourceUpdatedLabel?: string; read?: string };
export type OgRecord = { date: string | null; item: string | number | null; title: string; pages: string | number | null; url: string };

/** One offshore lease footprint (CSLC Offshore_Lease_Polygons + the reconciliation CSV). */
export type Footprint = {
  prc: string;
  group: "production" | "compensatory";
  parcelClass: string | null;
  layerStatus: string | null;
  notes: string | null;
  cslc_stated_status: string | null;
  cslc_stated_status_source: string | null;
  source_last_updated: string | null;
  source_read: string | null;
  exactDate: DateSource | null;
  former: "quitclaimed" | "terminated" | null;
  staff_report_61_status_2022: string | null;
  staff_report_61_page: string | null;
  sources_agree: string | null;
  note: string | null;
  note_sources: string | null;
  leaseNums: string[];
  joinEstimate: boolean;
  dashed: boolean;
  recordsKey: string;
  recordCount: number;
};

export type Well = {
  api: string;
  leaseName: string | null;
  wellNumber: string | null;
  wellStatus: string | null;
  statusGroup: WellGroup;
  wellType: string | null;
  operator: string | null;
  field: string | null;
  county: string | null;
  offshore: boolean;
  directional: string | null;
  gisSource: string | null;
  footprintPrc: string[];
  footprintStatus: (string | null)[];
  leaseNamePrc: string | null;
  leaseNameFormer: string | null;
  cslcOperator: boolean;
};

export type Terminal = { wo: string; berth: string; terminal: string | null; city: string | null; county: string | null };

export type FormerLease = {
  prc: string;
  action: "quitclaimed" | "terminated";
  date: string;
  dateSources: DateSource[];
  lessee: string | null;
  acres: string | number | null;
  location: string | null;
  note: string | null;
  hasFootprint: boolean;
  records: OgRecord[];
};

// ---------------------------------------------------------------- marks
/** Footprint line and fill (dark gold), quieter than the lease marks above them. */
export const FP = { line: "#7a5a1e", fill: "#d2b06a", hatch: "rgba(122,90,30,0.75)" };
/** Wells: one brown, strength by status. Idle is a little stronger than active; plugged is faint (off by default). */
export const WELL_BROWN = "#8a5a2b";
export const WELL_IDLE = "#94461c";
export type WellGroup = "active" | "idle" | "plugged" | "other";
export const WELL_GROUPS: { key: WellGroup; label: string; color: string; opacity: number; hollow: boolean; on: boolean; note: string }[] = [
  { key: "idle", label: "Idle", color: WELL_IDLE, opacity: 0.85, hollow: false, on: true, note: "CalGEM well status Idle" },
  { key: "active", label: "Active", color: WELL_BROWN, opacity: 0.6, hollow: false, on: true, note: "CalGEM well status Active" },
  { key: "plugged", label: "Plugged", color: WELL_BROWN, opacity: 0.4, hollow: true, on: false, note: "CalGEM well status Plugged" },
  { key: "other", label: "Other status", color: "#9a8f7c", opacity: 0.5, hollow: true, on: false, note: "CalGEM well status Canceled, Unknown or New" },
];
export const WELL_GROUP = Object.fromEntries(WELL_GROUPS.map((g) => [g.key, g])) as Record<WellGroup, (typeof WELL_GROUPS)[number]>;

/** Close-up marks (24px from zoom 11). Lighter disc and dashed ring for former leases; wells take their status strength. */
export const PALE = "#f3ead2";
export const MARK: Record<"former" | "terminal" | `well-${WellGroup}`, MarkStyle> = {
  former: { fill: PALE, line: INK, lineAlpha: 0.75, glyph: INK, dashed: true, alpha: 0.9 },
  terminal: { fill: LEASE_TIER[2].fill, line: INK, lineAlpha: 0.7, glyph: INK },
  "well-active": { fill: PALE, line: WELL_BROWN, lineAlpha: 0.8, glyph: WELL_BROWN, alpha: 0.85 },
  "well-idle": { fill: PALE, line: WELL_IDLE, lineAlpha: 1, glyph: WELL_IDLE, alpha: 0.95 },
  "well-plugged": { fill: PALE, line: WELL_BROWN, lineAlpha: 0.6, glyph: WELL_BROWN, alpha: 0.5 },
  "well-other": { fill: PALE, line: "#9a8f7c", lineAlpha: 0.6, glyph: "#7d7360", alpha: 0.55 },
};

/** The parts of the family, each a row in its key (legend as control). */
export type OgPart = "footprints" | "former" | "terminals" | `well-${WellGroup}`;
export const OG_DEFAULT: Record<OgPart, boolean> = {
  footprints: true,
  former: true,
  terminals: true,
  "well-idle": true,
  "well-active": true,
  "well-plugged": false,
  "well-other": false,
};
/** The coast the "Oil & gas" quick view frames: Point Conception to Huntington Beach. */
export const OG_FRAME: [number, number, number, number] = [-120.55, 33.55, -117.85, 34.62];

// ---------------------------------------------------------------- labels (wording from the build prompt)
export const LABEL = {
  family: "State oil & gas",
  footprints: "Offshore lease footprints (CSLC)",
  former: "Former leases: quitclaimed or terminated (CSLC)",
  wells: "Oil and gas wells on state leases (CalGEM)",
  terminals: "Marine oil terminals (CSLC)",
  comp4736: "Compensatory agreement area (1973). Includes private ‘Leased Lands’ parcels per CSLC’s polygon notes; not all state land.",
  comp1482: "Compensatory royalty agreement area (1955): State’s interest in three slough parcels. No wells within the State lease area.",
  sla: "Submerged Lands Act boundary (BOEM): seaward limit of state submerged lands.",
  waterbodies: "CSLC Significant Lands inventory: sovereign lake and lagoon beds (not a complete sovereign-lands map).",
  waters: "State sovereign lands (public trust): tide and submerged lands. Managed by the State Lands Commission, or by local trustees where the state has granted them.",
  privateSurface: "Surface location may be on private land: CalGEM records this well onshore. A well drilled from shore can reach under state land.",
  terminalCaveat: "Locations are approximate (CSLC). No land-ownership claim.",
};
export const SR61 = "https://slcprdwordpressstorage.blob.core.windows.net/wordpressdata/2022/04/04-26-22_61.pdf";

export const compLabel = (prc: string) => (prc.startsWith("4736") ? LABEL.comp4736 : LABEL.comp1482);
export const actionLabel = (a: string | null) => (a === "quitclaimed" ? "Quitclaimed" : a === "terminated" ? "Terminated" : "");

/** "2017-04-13" -> "April 13, 2017"; "2000-04" -> "April 2000"; anything else as written. */
export function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(d);
  if (!m) return d;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1, 12));
  return dt.toLocaleDateString("en-US", m[3] ? { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" } : { year: "numeric", month: "long", timeZone: "UTC" });
}

/** "Why this well is included", one sentence per test (A, B, C). Former leases say "former state lease". */
export function wellWhy(w: Well): string[] {
  const out: string[] = [];
  w.footprintPrc.forEach((prc, i) => {
    const st = w.footprintStatus[i];
    out.push(`Surface location inside the CSLC lease footprint for PRC ${prc} (footprint approximate).${st ? ` CSLC’s stated status: ${st}.` : ""}`);
  });
  if (w.leaseNamePrc) out.push(`CalGEM records this well under lease “${w.leaseName}”${w.leaseNameFormer ? ` (PRC ${w.leaseNamePrc}, a former state lease: ${w.leaseNameFormer})` : ""}.`);
  if (w.cslcOperator) out.push("CalGEM lists the State Lands Commission as operator.");
  return out;
}

// ---------------------------------------------------------------- Worth watching (Estimate: this map flags it; the state does not)
export const WATCH_LABEL = "This map flags it; the state does not.";
export type WatchKey = "nonop" | "expired" | "notprod" | "idle" | "disagree" | "nodecom";
export const WATCH_GROUPS: { key: WatchKey; label: string; og: boolean }[] = [
  { key: "nonop", label: "Infrastructure the state’s record calls non-operational, abandoned, inactive or out of service", og: false },
  { key: "expired", label: "Infrastructure leases past their expiration date", og: false },
  { key: "notprod", label: "Oil and gas leases CSLC lists as not producing", og: true },
  { key: "idle", label: "Idle wells (CalGEM)", og: true },
  { key: "disagree", label: "Lease footprints where CSLC’s sources disagree", og: true },
  { key: "nodecom", label: "Former leases with a footprint and no Commission record on decommissioning among the records this map holds", og: true },
];

/** Infrastructure leases this map flags, with a one-line reason (the state's own word quoted). */
export function leaseWatch(l: MiniLease): { key: WatchKey; reason: string }[] {
  if (l.k !== "infra") return [];
  const out: { key: WatchKey; reason: string }[] = [];
  if (l.no) out.push({ key: "nonop", reason: `The state’s lease text says “${l.nw ?? "non-operational"}”.` });
  if (l.xs === "e") out.push({ key: "expired", reason: `Term expired${l.xd ? ` ${fmtDate(l.xd.slice(0, 10))}` : ""} (expiration date in the state’s lease layer).` });
  return out;
}
export const isWatchedLease = (l: MiniLease) => l.k === "infra" && (!!l.no || l.xs === "e");

// Words that make a record about decommissioning. Not "removed": agenda items are "removed from the agenda".
const DECOM = /decommission|abandon|\bplug(?:ged|ging)?\b|\bremoval\b|restoration/i;
/** Footprint flags (production leases only; compensatory agreements are not flagged). */
export function footprintWatch(f: Footprint, records: OgRecord[]): { key: WatchKey; reason: string }[] {
  if (f.group !== "production") return [];
  const out: { key: WatchKey; reason: string }[] = [];
  if (/^not producing/i.test(f.cslc_stated_status ?? "")) out.push({ key: "notprod", reason: "CSLC’s lease information page lists this lease as not producing." });
  if (f.sources_agree === "no") out.push({ key: "disagree", reason: `CSLC’s lease layer says “${f.layerStatus}”; its oil and gas pages say “${f.cslc_stated_status}”.` });
  if (f.former && !records.some((r) => DECOM.test(r.title))) out.push({ key: "nodecom", reason: `${actionLabel(f.former)}${f.exactDate ? ` ${fmtDate(f.exactDate.date)}` : ""}; none of the Commission records this map holds is about decommissioning.` });
  return out;
}
export const wellWatch = (w: Well) => (w.statusGroup === "idle" ? [{ key: "idle" as WatchKey, reason: "CalGEM lists this well as Idle." }] : []);
