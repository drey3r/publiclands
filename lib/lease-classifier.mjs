// CSLC lease classifier: what a State Lands Commission lease is, from two fields of the
// state's public lease layer (TypeofLease and Improvements).
//
// Standalone on purpose: plain ES module, no imports, no app code. Other projects copy or
// import this file as is. Types: lease-classifier.d.ts next to it.
//
//   import { classifyLease } from "./lease-classifier.mjs";
//   classifyLease({ typeOfLease: "Right of Way Use", improvements: "12-inch natural gas pipeline and fiber optic cable" })
//   // -> { category: { key: "infra", ... }, kinds: [pipeline, cable], primary: pipeline }
//
// Both results are ESTIMATES. The state's lease type (TypeofLease) is source data; the
// grouping and the infrastructure kinds are this classifier's reading of it, and each comes
// with a plain-English reason.

export const CLASSIFIER_VERSION = "2026-11-10";

// ---------- infrastructure kinds (from the Improvements text only) ----------
// Strong words name the facility ("fiber optic", "sewer outfall", "115 kV"). Weak words are
// often accessories ("electrical conduit" on a dock, a marina's "fuel dock") and count only
// on right-of-way, public agency and industrial leases, and only when no strong word is found.
// Every kind found is kept; the one whose word comes first in the text is the primary (the
// text usually leads with the main facility). Anchor and mooring cables are ignored.
export const KIND_RULES = [
  {
    key: "power", label: "Electric power",
    strong: /\b(power (?:cables?|lines?)|transmission lines?|distribution lines?|kilovolts?|\d+\s?kv|electric(?:al)? (?:transmission|distribution|cables?|lines?)|overhead (?:electric|power))\b/i,
    weak: /\b(electric(?:al)?)\b/i,
  },
  {
    key: "cable", label: "Cable / telecom",
    strong: /\b(telephone|telegraph|telecom\w*|fib(?:er|re)[- ]?optic|communications?|coaxial|submarine cables?)\b/i,
    weak: /\b(cables?)\b/i,
  },
  {
    key: "outfall", label: "Water & sewer",
    strong: /\b(outfall|sewer|wastewater|effluent|storm ?drain|intake|diffuser|water (?:main|line|pipe(?:line)?s?)|force main|discharge (?:pipe|line|conduit))\w*/i,
    weak: null,
  },
  {
    key: "pipeline", label: "Pipeline",
    strong: /\b(pipelines?|petroleum|crude|natural gas|gas lines?|oil lines?)\b/i,
    weak: /\b(gas|oil|fuel)\b/i,
  },
];
const KIND_LABEL = Object.fromEntries(KIND_RULES.map((r) => [r.key, r.label]));
/** Lease types on which weak words (electrical, cable, gas, oil, fuel) count. */
export const WEAK_OK = /^(Right of Way Use|Public Agency Use|Industrial Use)$/;
const ANCHOR_CABLES = /\b(anchor|mooring)\w*[\w\s-]{0,30}?cables?\b/gi;

/** Every infrastructure kind named in the text, primary (earliest in the text) first. */
export function infraKinds(improvements, typeOfLease) {
  const t = (improvements ?? "").replace(ANCHOR_CABLES, " ");
  const hits = (field) =>
    KIND_RULES.flatMap((r) => {
      const m = r[field]?.exec(t);
      return m ? [{ key: r.key, label: r.label, word: m[0], at: m.index }] : [];
    });
  let found = hits("strong");
  if (!found.length && WEAK_OK.test((typeOfLease ?? "").trim())) found = hits("weak");
  return found.sort((a, b) => a.at - b.at).map(({ at, ...k }) => k);
}

// ---------- categories ----------
export const CATEGORIES = [
  { key: "infra", label: "Infrastructure" },
  { key: "roads", label: "Roads and bridges" },
  { key: "shore", label: "Shoreline protection" },
  { key: "rec", label: "Recreation" },
  { key: "agency", label: "Public agency" },
  { key: "commercial", label: "Commercial and industrial" },
  { key: "other", label: "Other" },
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

/** State TypeofLease value -> category when no text rule applies. Anything unlisted is Other. */
export const CATEGORY_OF_LEASE_TYPE = {
  "Recreational Use": "rec",
  "Recreational and Protective Structure Use": "rec",
  "Recreational Pier Lease": "rec",
  "Residential and Recreational Use": "rec",
  "Streets and Highways - DOT Code 101.5": "roads",
  "Protective Structure Use": "shore",
  "Public Agency Use": "agency",
  "Commercial Use": "commercial",
  "Industrial Use": "commercial",
  "Oil & Gas Lease": "commercial",
  "Oil & Gas/Mineral Lease-Non SLC Land": "commercial",
  "Mineral Lease": "commercial",
  "Mineral Prospect Permit": "commercial",
  "Geothermal Lease": "commercial",
  "Dredging": "commercial",
  "Grazing Use": "commercial",
  "Agricultural Use": "commercial",
  "Forestry Management Agreement": "commercial",
  "Salvage": "commercial",
};

/** Commercial Use leases whose text describes a marina go to Recreation. */
export const MARINA = /\b(marinas?|berths?|boat slips?|yacht club|boat (?:harbor|launch\w*))\b/i;
/** Right of Way Use leases whose text names a road, bridge or highway go to Roads and bridges. */
export const ROAD = /\b(roads?|roadways?|bridges?|highways?|hwy|freeways?|streets?|causeway|overpass|vehicular crossing)\b/i;

/**
 * Category, in this order:
 *  1. Recreational lease types are Recreation (utility words there are dock accessories).
 *  2. Commercial Use leases whose text describes a marina are Recreation.
 *  3. Any infrastructure kind in the text makes it Infrastructure.
 *  4. Right of Way Use leases whose text names a road, bridge or highway are Roads and bridges.
 *  5. Otherwise the state's lease type decides (Streets and Highways -> Roads and bridges,
 *     Protective Structure Use -> Shoreline protection, ...); unlisted types are Other.
 */
export function categoryOf(typeOfLease, improvements, kinds = infraKinds(improvements, typeOfLease)) {
  const lt = (typeOfLease ?? "").trim();
  const base = CATEGORY_OF_LEASE_TYPE[lt] ?? "other";
  const said = lt ? `state lease type "${lt}"` : "no state lease type";
  const cat = (key, reason) => ({ key, label: CAT_LABEL[key], reason });
  if (base === "rec") return cat("rec", said);
  if (lt === "Commercial Use") {
    const m = MARINA.exec(improvements ?? "");
    if (m) return cat("rec", `${said}; the text mentions "${m[0]}"`);
  }
  if (kinds.length) return cat("infra", `${said}; the text mentions "${kinds[0].word}"`);
  if (lt === "Right of Way Use") {
    const m = ROAD.exec(improvements ?? "");
    if (m) return cat("roads", `${said}; the text mentions "${m[0]}"`);
  }
  return cat(base, base === "other" && lt ? `${said} is not in the other groups` : said);
}

/**
 * Category and infrastructure kinds for one lease. Kinds are given only to leases in the
 * Infrastructure category (on a recreational lease "electrical" is a dock light, not a power line).
 */
export function classifyLease({ typeOfLease, improvements }) {
  const found = infraKinds(improvements, typeOfLease);
  const category = categoryOf(typeOfLease, improvements, found);
  const kinds = category.key === "infra" ? found : [];
  return { category, kinds, primary: kinds[0] ?? null };
}

export const KIND_LABELS = { ...KIND_LABEL, other: "None" };

export const METHODS = {
  kinds:
    "Infrastructure kinds, only for leases in the Infrastructure category: keywords in the Improvements text (electric power, cable/telecom, water & sewer, pipeline). Every kind named is kept; the one named first in the text is the primary. General words such as \"electrical\", \"cable\" or \"fuel\" count only on right-of-way, public agency and industrial leases, and only when no facility is named. Anchor and mooring cables are ignored.",
  category:
    "Grouping of the state's own lease type (TypeofLease): Recreation (recreational uses, piers, docks; also Commercial Use leases whose text describes a marina), Roads and bridges (Streets and Highways, and Right of Way leases whose text names a road, bridge or highway), Shoreline protection (Protective Structure Use: seawalls, riprap, bulkheads), Public agency, Commercial and industrial (commercial, industrial, oil, gas, mineral, geothermal, dredging, grazing, agricultural, forestry, salvage), Other (everything else). A lease that is not recreational moves to Infrastructure when its Improvements text names a cable, pipeline, water/sewer line or power line.",
};
