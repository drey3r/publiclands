// Builds lease records from the CSLC lease layer snapshot (data/cslc/).
// FACTS are copied from the layer. ESTIMATES are computed here, and every one
// carries a plain-English `reason` that the UI shows next to it.
import fs from "node:fs";
import path from "node:path";

const toDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  // The layer stores local midnight as UTC; read it back in California time.
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
};
const yearOf = (d) => (d ? Number(d.slice(0, 4)) : null);
const est = (value, reason) => ({ value, inferred: true, reason });

import { classifyLease, KIND_LABELS, METHODS as CLASSIFIER_METHODS } from "../../lib/lease-classifier.mjs";
import { leaseTitle } from "../../lib/lease-title.mjs";

// Category and infrastructure kinds come from lib/lease-classifier.mjs (standalone, shared).
export const TYPE_LABELS = KIND_LABELS;

// ---------- PRC kind ----------
function prcKind(prc) {
  if (/^(0+|9{5,}|n\/?a|tbd)$/i.test(prc)) return { kind: "placeholder", flag: "placeholder lease number in the layer" };
  if (/^\d+$/.test(prc)) return { kind: "numeric", flag: null };
  return { kind: "nonstandard", flag: "lease number has letters or punctuation" };
}

// ---------- language the state itself uses for facilities that no longer operate ----------
const STATE_TEXT = /\b(non-?\s?operational|abandon\w*|inactive|out of service)\b/i;
const WHARF = /\b(wharf|pier)\b/i;

// ---------- regions from county (browsing aid) ----------
const REGION_BY_COUNTY = {
  "North Coast": ["Del Norte", "Humboldt", "Mendocino", "Trinity", "Siskiyou", "Lake"],
  "Bay Area": ["Marin", "Sonoma", "Napa", "Solano", "Contra Costa", "Alameda", "Santa Clara", "San Mateo", "San Francisco"],
  "Delta & Central Valley": ["Sacramento", "San Joaquin", "Yolo", "Sutter", "Yuba", "Colusa", "Glenn", "Butte", "Tehama", "Shasta", "Stanislaus", "Merced", "Madera", "Fresno", "Kings", "Tulare", "Kern"],
  "Sierra & Tahoe": ["El Dorado", "Placer", "Nevada", "Sierra", "Plumas", "Lassen", "Modoc", "Alpine", "Amador", "Calaveras", "Tuolumne", "Mariposa", "Mono", "Inyo"],
  "Central Coast": ["Santa Cruz", "Monterey", "San Benito", "San Luis Obispo", "Santa Barbara"],
  "Southern California": ["Ventura", "Los Angeles", "Orange", "San Diego"],
  "Desert & Colorado River": ["San Bernardino", "Riverside", "Imperial"],
};
const REGION = Object.fromEntries(Object.entries(REGION_BY_COUNTY).flatMap(([r, cs]) => cs.map((c) => [c, r])));

// ---------- county (point in polygon) ----------
function countyIndex(root) {
  const fc = JSON.parse(fs.readFileSync(path.join(root, "data/ref/ca-counties.geojson"), "utf8"));
  return fc.features.map((f) => {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    let bb = [180, 90, -180, -90];
    for (const p of polys) for (const [x, y] of p[0]) bb = [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x), Math.max(bb[3], y)];
    return { name: f.properties.name, polys, bb };
  });
}
const inRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
function countyOf(counties, lng, lat) {
  for (const c of counties) {
    if (lng < c.bb[0] || lng > c.bb[2] || lat < c.bb[1] || lat > c.bb[3]) continue;
    for (const p of c.polys) if (inRing(lng, lat, p[0]) && !p.slice(1).some((h) => inRing(lng, lat, h))) return est(c.name, "point falls inside the county boundary");
  }
  let best = null, bestD = Infinity;
  const k = Math.cos((lat * Math.PI) / 180);
  for (const c of counties) for (const p of c.polys) for (const [x, y] of p[0]) {
    const dd = ((x - lng) * k) ** 2 + (y - lat) ** 2;
    if (dd < bestD) { bestD = dd; best = c.name; }
  }
  const km = Math.sqrt(bestD) * 111;
  return km > 25 ? null : est(best, `offshore; nearest county boundary (~${Math.round(km)} km)`);
}

// ---------- waterbody (from location text) ----------
const WATER = /\b((?:[A-Z][\w'.-]*\s){0,4}(?:River|Slough|Bay|Creek|Channel|Reservoir|Harbor|Lagoon|Estuary|Strait|Cut|Canal|Marina)|Lake\s(?:[A-Z][\w'.-]*)(?:\s[A-Z][\w'.-]*)?|Pacific Ocean|[A-Z][\w'.-]*\sLake)\b/;
function waterbodyOf(name, location) {
  for (const txt of [name, location]) {
    if (!txt) continue;
    const m = txt.match(WATER);
    if (!m) continue;
    const v = m[1].replace(/^(?:The|In|At|Of|And|Near|Old)\s/, "").trim();
    if (!/\s/.test(v)) continue;
    return est(v, `parsed from location text "${txt.slice(0, 60)}"`);
  }
  return null;
}

const decade = (y) => (y ? `${Math.floor(y / 10) * 10}s` : "Unknown");

/** Read the newest snapshot and return { source, leases (full records), mini (map payload), methods, counts, candidates }. */
export function buildLeases(root, { snapshot, curated }) {
  const snap = JSON.parse(fs.readFileSync(snapshot, "utf8"));
  const counties = countyIndex(root);

  // Group points by lease number; the lowest OBJECTID supplies the facts.
  const groups = new Map();
  for (const f of snap.features) {
    const p = f.properties;
    const prc = (p.LeaseNum ?? "").trim() || `OBJ${p.OBJECTID}`;
    if (!groups.has(prc)) groups.set(prc, []);
    groups.get(prc).push(f);
  }

  const base = [];
  for (const [prc, fs_] of groups) {
    fs_.sort((a, b) => a.properties.OBJECTID - b.properties.OBJECTID);
    const p = fs_[0].properties;
    const pts = fs_.filter((f) => f.geometry).map((f) => f.geometry.coordinates);
    if (!pts.length) continue;
    const facts = {
      recordStatus: p.RecordStatus,
      leaseOrPermit: p.LeaseorPermit,
      typeOfLease: p.TypeofLease,
      location: p.GeneralLocation,
      improvements: p.Improvements,
      leaseStart: toDate(p.LeaseStartDate),
      expiration: toDate(p.LeaseExpirationDate),
      lastSlcApproval: toDate(p.SLCApprovalDate),
      minuteItem: p.MinuteItem,
    };
    const k = prcKind(prc);
    base.push({ prc, pts, facts, kind: k.kind, flag: k.flag, num: k.kind === "numeric" ? Number(prc) : null, startYear: yearOf(facts.leaseStart) });
  }

  // Estimated issue year from the PRC number: PRC numbers were issued roughly in
  // order, and renewals only push start dates later, so the earliest start dates
  // within a band of 250 numbers track when that band was issued (10th percentile).
  const BAND = 250;
  const bandYears = new Map();
  for (const b of base) if (b.num != null && b.startYear) {
    const k = Math.floor(b.num / BAND);
    if (!bandYears.has(k)) bandYears.set(k, []);
    bandYears.get(k).push(b.startYear);
  }
  const bandEst = new Map();
  for (const [k, ys] of bandYears) {
    if (ys.length < 5) continue;
    ys.sort((a, b) => a - b);
    bandEst.set(k, { year: ys[Math.floor((ys.length - 1) * 0.1)], n: ys.length });
  }

  const pulled = (snap.source.pulledAt ?? "").slice(0, 10);
  const leases = [];
  for (const b of base) {
    const [lng, lat] = b.pts[0];
    const f = b.facts;
    const be = b.num != null ? bandEst.get(Math.floor(b.num / BAND)) : null;
    const lo = be ? Math.floor(b.num / BAND) * BAND : null;
    const eraFromPrc = be ? { ...est(decade(be.year), `~${be.year}: 10th-percentile start date of PRC ${lo}–${lo + BAND - 1} (n=${be.n})`), year: be.year } : null;
    const era = b.startYear ? est(decade(b.startYear), `current term began ${f.leaseStart}`) : eraFromPrc ? est(eraFromPrc.value, "no start date on file; estimated from the PRC number") : est("Unknown", "no start date on file");
    const { category: cat, kinds, primary: infra } = classifyLease(f);
    const category = { key: cat.key, ...est(cat.label, cat.reason) };
    const type = infra
      ? { key: infra.key, ...est(infra.label, `the Improvements text mentions "${infra.word}"`) }
      : { key: "other", ...est("None", category.key === "rec" ? "recreational lease: utility words there are dock accessories" : "no cable, pipeline, water or power words in the Improvements text") };
    const kindsAll = kinds.length > 1
      ? { value: kinds.map((k) => k.label), inferred: true, reason: kinds.map((k) => `"${k.word}"`).join(", ") + " in the Improvements text; the first named is the primary", keys: kinds.map((k) => k.key) }
      : null;
    const county = countyOf(counties, lng, lat);
    const region = county ? est(REGION[county.value] ?? "Other", `${county.value} County`) : est("Offshore", "no county within 25 km");
    const renewed = !!(eraFromPrc && eraFromPrc.year < 1960 && b.startYear && b.startYear >= 1980);
    const renewedLegacy = est(renewed, renewed ? `issued ~${eraFromPrc.year} (est.), current term from ${b.startYear}` : "pattern not met");
    const stateText = STATE_TEXT.exec(f.improvements ?? "");

    // Screen score: which files to read first. Not a finding about anyone.
    const why = [];
    let s = 0;
    const age = eraFromPrc?.year ?? b.startYear;
    if (age) {
      if (age < 1960) { s += 35; why.push(`issued ~${age}`); } else if (age < 1975) { s += 20; why.push(`issued ~${age}`); } else if (age < 1990) { s += 10; why.push(`issued ~${age}`); }
    }
    if (type.key !== "other") { s += 25; why.push(type.value.toLowerCase()); }
    if (/right of way/i.test(f.typeOfLease ?? "")) { s += 10; why.push("right of way"); }
    if (stateText) { s += 20; why.push(`lease text: "${stateText[0]}"`); }
    if (!f.expiration) { s += 5; why.push("no expiration on file"); } else if (pulled && f.expiration < pulled) { s += 10; why.push(`expired ${f.expiration}`); }
    const hasInfo = f.improvements || f.typeOfLease || age;
    const score = { ...est(hasInfo ? Math.min(100, s) : null, "screen of age, infrastructure keywords, lease type and dates"), why };

    const cs = curated.caseStudies?.[b.prc] ?? null;
    const waterbody = waterbodyOf(f.location?.split(/[,;]/)[0], f.location);
    leases.push({
      prc: b.prc,
      prcKind: b.kind,
      prcFlag: b.flag,
      // Display title from the location text (lib/lease-title.mjs); the full text stays in facts.location.
      name: leaseTitle(f.location, { waterbody: waterbody?.value ?? null, county: county?.value ?? null, prc: b.prc }),
      lat, lng,
      ...(b.pts.length > 1 ? { points: b.pts } : {}),
      stage: "research",
      completed: !!cs?.completed,
      facts: f,
      startYear: b.startYear,
      era, eraFromPrc,
      likelyType: { value: type.value, inferred: true, reason: type.reason },
      category: { value: category.value, inferred: true, reason: category.reason },
      ...(kindsAll ? { kinds: kindsAll } : {}),
      region, score, renewedLegacy,
      caseStudy: cs,
      _typeKey: type.key, _cat: category.key, _county: county, _waterbody: waterbody, _stateText: stateText?.[0] ?? null,
    });
  }

  // Candidates for review: the lease's own Improvements text uses the state's words
  // for facilities that no longer operate, on an old lease renewed on a new term,
  // for infrastructure (or a wharf/pier).
  const candidates = [];
  const extra = new Map((curated.candidates?.include ?? []).map((c) => [String(c.prc), c.reason]));
  for (const l of leases) {
    const infra = l._typeKey !== "other" || WHARF.test(l.facts.improvements ?? "");
    let reason = null;
    if (l._stateText && l.renewedLegacy.value && infra) reason = `lease text says "${l._stateText}"; ${l.renewedLegacy.reason}`;
    else if (extra.has(l.prc)) reason = extra.get(l.prc);
    if (reason) candidates.push({ prc: l.prc, name: l.name, reason, quote: l.facts.improvements });
  }
  const candSet = new Set(candidates.map((c) => c.prc));

  // Era used on the map: estimated issue decade from the PRC number, otherwise the current term's start decade.
  const full = leases
    .map(({ _typeKey, _cat, _county, _waterbody, _stateText, ...l }) => ({
      ...l,
      stage: l.completed ? "execute" : "research",
      derived: {
        typeKey: _typeKey,
        typeKeys: l.kinds?.keys ?? (_typeKey === "other" ? [] : [_typeKey]),
        categoryKey: _cat,
        expiry: !l.facts.expiration ? "none" : pulled && l.facts.expiration < pulled ? "expired" : "current",
        county: _county,
        waterbody: _waterbody,
        mapEra: l.eraFromPrc ? { decade: Math.floor(l.eraFromPrc.year / 10) * 10, basis: "prc" } : l.startYear ? { decade: Math.floor(l.startYear / 10) * 10, basis: "start" } : { decade: null, basis: null },
        firstTarget: candSet.has(l.prc),
        stateText: _stateText,
      },
    }))
    .sort((a, b) => (b.score.value ?? -1) - (a.score.value ?? -1));

  const methods = {
    likelyType: CLASSIFIER_METHODS.kinds,
    category: CLASSIFIER_METHODS.category,
    era: "Decade the current term began (LeaseStartDate). Renewed leases show their latest term, so the map uses the estimated issue decade instead when it can.",
    eraFromPrc: "Estimated issue year from the PRC number: the 10th-percentile start year among leases in the same band of 250 PRC numbers (at least 5 leases). PRC numbers were issued roughly in order.",
    renewedLegacy: "Estimated issue year before 1960 and current term starting 1980 or later: an old lease likely renewed on a new term.",
    region: "Grouped from the estimated county, for browsing only.",
    county: "Point in polygon against California county boundaries (US Census). Offshore points use the nearest county boundary within 25 km.",
    waterbody: "Parsed from the lease's location text (e.g. 'Lake Tahoe', 'Sacramento River').",
    score: "0–100 screen from estimated age, infrastructure keywords, right-of-way leases, the state's own non-operational/abandoned wording, and expiration. It ranks which files to read first. It is not a finding about any lessee.",
    candidates: "Candidates for review: leases whose Improvements text, written by the State Lands Commission, says non-operational, abandoned, inactive or out of service, on an old lease renewed on a new term, for infrastructure or a wharf/pier.",
  };

  return {
    source: {
      label: `Source: California State Lands Commission public GIS lease layer, pulled ${pulled}`,
      layer: snap.source.layer,
      pulledAt: snap.source.pulledAt,
      completeness: "CSLC describes this layer as incomplete: leases are added, modified or terminated on an ongoing basis.",
    },
    full,
    methods,
    candidates,
    counts: { leases: full.length, points: snap.features.length, candidates: candidates.length },
  };
}
