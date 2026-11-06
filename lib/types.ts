// Shapes produced by scripts/sync-data.mjs from the CSLC lease layer snapshot.
// FACTS come from the layer; every Inferred field carries its reason.

export type TypeKey = "cable" | "pipeline" | "outfall" | "power" | "other";
export type StageKey = "research" | "site-visit" | "assess" | "share" | "engage-gov" | "plan" | "execute";

export type Inferred<T> = { value: T; inferred: true; reason: string };

/** Compact lease used by the map and list. */
export type MiniLease = {
  p: string; // PRC
  n: string; // name
  t: TypeKey;
  e: number | null; // estimated decade (see meta.methods.mapEra)
  s: number | null; // score
  r: string; // region (inferred)
  c: string | null; // county (inferred)
  w: string | null; // waterbody (inferred)
  f: 0 | 1; // candidate for review
  rl: 0 | 1; // renewed legacy
  st: StageKey;
  x: 0 | 1; // completed
  cs: 0 | 1; // has case study
  pts: [number, number][];
};

export type DataMeta = {
  fixture: boolean;
  file: string;
  generatedAt: string;
  syncedAt: string;
  source: { label: string; layer: string; pulledAt: string; completeness: string };
  methods: Record<string, string>;
  counts: Record<string, unknown> & { leases: number; points: number; candidates: number };
  /** Candidates for review, each with the reason it qualifies. */
  candidates: { prc: string; name: string; reason: string; quote: string | null }[];
};

export type LeasesPayload = { meta: DataMeta; leases: MiniLease[] };

export type LayerName = "access" | "granted" | "school" | "waterlines";
/** Only layers that exist are listed (fixture outlines only with DATA_SOURCE=fixture). */
export type LayerManifest = Partial<Record<LayerName, { url: string; kind: "geojson" | "pmtiles"; fixture: boolean; source: string | null; sourceLayer: string; title?: string | null; caveat?: string | null; asOf?: string | null }>>;

export type FullLease = {
  prc: string;
  prcKind: "numeric" | "placeholder" | "nonstandard";
  prcFlag: string | null;
  name: string;
  lat: number;
  lng: number;
  points?: [number, number][];
  bucket: string;
  stage: StageKey;
  completed: boolean;
  facts: {
    recordStatus: string | null;
    leaseOrPermit: string | null;
    typeOfLease: string | null;
    location: string | null;
    improvements: string | null;
    leaseStart: string | null;
    expiration: string | null;
    lastSlcApproval: string | null;
    minuteItem: string | null;
  };
  startYear: number | null;
  era: Inferred<string>;
  eraFromPrc: (Inferred<string> & { year: number }) | null;
  likelyType: Inferred<string>;
  region: Inferred<string>;
  score: Inferred<number | null> & { why: string[] };
  renewedLegacy: Inferred<boolean>;
  caseStudy: null | {
    title: string;
    summary: string;
    layerCaveat: string;
    completed?: boolean;
    milestones: { date: string; event: string; source?: string }[];
    sources: { label: string; url: string }[];
  };
  derived: {
    typeKey: TypeKey;
    county: Inferred<string> | null;
    waterbody: Inferred<string> | null;
    mapEra: { decade: number | null; basis: "prc" | "start" | null };
    firstTarget: boolean; // candidate for review
    stateText: string | null; // the state's own word, e.g. "nonoperational"
  };
};

/** An optional overlay from OVERLAYS_DIR (your own GeoJSON layer). */
export type OverlayDef = {
  id: string;
  url: string;
  title: string;
  color: string;
  attribution: string | null;
  description: string | null;
  visible: boolean;
  count: number;
};
