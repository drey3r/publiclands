import { ERAS, eraOf } from "./legend";
import type { CatKey, KindKey, MiniLease, TypeKey } from "./types";

export type Status = "current" | "expired" | "none";
export const STATUSES: { key: Status; code: MiniLease["xs"]; label: string; note: string }[] = [
  { key: "current", code: "c", label: "Term current", note: "Expiration date after the data was pulled" },
  { key: "expired", code: "e", label: "Term expired", note: "Expiration date already passed; the layer still lists it" },
  { key: "none", code: "n", label: "No end date on file", note: "The layer has no expiration date" },
];
const CAT_KEYS: CatKey[] = ["infra", "roads", "shore", "rec", "agency", "commercial", "other"];
const TYPE_KEYS: TypeKey[] = ["cable", "pipeline", "outfall", "power"];

/**
 * "Explore by kind": one key row = one kind. The four infrastructure kinds match any kind in
 * the lease's text; the others are categories. Shareable as ?kind=<key>.
 */
export type ExploreKind = KindKey | Exclude<CatKey, "infra" | "roads" | "shore">;
export const EXPLORE_KINDS: ExploreKind[] = ["cable", "pipeline", "outfall", "power", "roads", "shore", "agency", "commercial", "rec", "other"];
const isType = (k: string): k is Exclude<TypeKey, "other"> => (TYPE_KEYS as string[]).includes(k);

export type Filters = {
  /** What is it? Categories (Estimate). */
  cats: CatKey[];
  /** Infrastructure types (Estimate). Picking any narrows Infrastructure to those types. */
  types: TypeKey[];
  eras: string[];
  minScore: number;
  region: string;
  county: string;
  waterbody: string;
  firstOnly: boolean;
  /** What's its status? Term status from the expiration date (source data). */
  status: Status[];
  /** The lease text says non-operational, abandoned, inactive or out of service. */
  nonop: boolean;
  q: string;
};

export const EMPTY: Filters = { cats: [], types: [], eras: [], minScore: 0, region: "", county: "", waterbody: "", firstOnly: false, status: [], nonop: false, q: "" };

/** The kind a filter shows, when "What is it?" is exactly one kind; otherwise null. */
export function kindOf(f: Filters): ExploreKind | null {
  if (f.types.length === 1 && (f.cats.length === 0 || (f.cats.length === 1 && f.cats[0] === "infra"))) return f.types[0] as ExploreKind;
  if (f.types.length === 0 && f.cats.length === 1 && f.cats[0] !== "infra") return f.cats[0] as ExploreKind;
  return null;
}
/** Show only this kind (or, when it is already the only one shown, show everything again). Other filters stay. */
export function withKind(f: Filters, k: ExploreKind): Filters {
  if (kindOf(f) === k) return { ...f, cats: [], types: [] };
  return isType(k) ? { ...f, cats: [], types: [k] } : { ...f, cats: [k], types: [] };
}
/** Statewide count per kind (a lease with a cable and a pipeline counts under both). */
export function kindCounts(all: MiniLease[]): Record<ExploreKind, number> {
  const n = Object.fromEntries(EXPLORE_KINDS.map((k) => [k, 0])) as Record<ExploreKind, number>;
  for (const l of all) {
    if (l.k === "infra") for (const t of l.ts ?? [l.t]) { if (isType(t)) n[t]++; }
    else n[l.k as ExploreKind]++;
  }
  return n;
}

export function activeCount(f: Filters) {
  return (
    (f.cats.length || f.types.length ? 1 : 0) +
    (f.eras.length ? 1 : 0) +
    (f.minScore > 0 ? 1 : 0) +
    (f.region ? 1 : 0) +
    (f.county ? 1 : 0) +
    (f.waterbody ? 1 : 0) +
    (f.firstOnly ? 1 : 0) +
    (f.status.length ? 1 : 0) +
    (f.nonop ? 1 : 0)
  );
}

const norm = (s: string) => s.toLowerCase().replace(/^prc\s*/, "").trim();

export function matchesQuery(l: MiniLease, q: string) {
  const n = norm(q);
  if (!n) return true;
  if (l.p.toLowerCase() === n || l.p.toLowerCase().startsWith(n + "-")) return true;
  if (/^\d+$/.test(n)) return l.p.startsWith(n);
  return l.n.toLowerCase().includes(n) || (l.w?.toLowerCase().includes(n) ?? false) || (l.c?.toLowerCase().includes(n) ?? false);
}

export function applyFilters(all: MiniLease[], f: Filters): MiniLease[] {
  const cats = new Set(f.cats);
  const types = new Set(f.types);
  const what = cats.size > 0 || types.size > 0;
  const codes = new Set(STATUSES.filter((s) => f.status.includes(s.key)).map((s) => s.code));
  const eras = f.eras.length ? ERAS.filter((e) => f.eras.includes(e.key)) : null;
  return all.filter((l) => {
    // Infrastructure narrows to the picked types when any are picked; a lease matches when
    // any of its kinds (not only the primary) is picked.
    if (what && !(l.k === "infra" ? (types.size ? (l.ts ?? [l.t]).some((t) => types.has(t)) : cats.has("infra")) : cats.has(l.k))) return false;
    if (codes.size && !codes.has(l.xs)) return false;
    if (f.nonop && !l.no) return false;
    if (eras) {
      const e = eraOf(l.e);
      if (!e || !eras.includes(e)) return false;
    }
    if (f.minScore > 0 && (l.s == null || l.s < f.minScore)) return false;
    if (f.region && l.r !== f.region) return false;
    if (f.county && l.c !== f.county) return false;
    if (f.waterbody && l.w !== f.waterbody) return false;
    if (f.firstOnly && !l.f && !l.cs) return false;
    if (f.q && !matchesQuery(l, f.q)) return false;
    return true;
  });
}

/** Filters ⇄ URL query, so a filtered view is shareable. */
export function toQuery(f: Filters): string {
  const p = new URLSearchParams();
  const kind = kindOf(f);
  if (kind) p.set("kind", kind);
  else {
    if (f.cats.length) p.set("cat", f.cats.join(","));
    if (f.types.length) p.set("type", f.types.join(","));
  }
  if (f.eras.length) p.set("era", f.eras.join(","));
  if (f.minScore) p.set("score", String(f.minScore));
  if (f.region) p.set("region", f.region);
  if (f.county) p.set("county", f.county);
  if (f.waterbody) p.set("water", f.waterbody);
  if (f.firstOnly) p.set("first", "1");
  if (f.status.length) p.set("status", f.status.join(","));
  if (f.nonop) p.set("nonop", "1");
  if (f.q) p.set("q", f.q);
  return p.toString();
}

export function fromQuery(sp: URLSearchParams): Filters {
  const list = (k: string) => (sp.get(k) ? sp.get(k)!.split(",").filter(Boolean) : []);
  // Old links: ?type=other meant every lease without an infrastructure type, which is now
  // the four non-infrastructure categories.
  const oldType = list("type");
  const cats = new Set(list("cat").filter((c): c is CatKey => (CAT_KEYS as string[]).includes(c)));
  if (oldType.includes("other")) for (const c of CAT_KEYS) if (c !== "infra") cats.add(c);
  const types = new Set(oldType.filter((t): t is TypeKey => (TYPE_KEYS as string[]).includes(t)));
  // ?kind=cable (explore by kind)
  for (const k of list("kind")) {
    if (isType(k)) types.add(k);
    else if ((EXPLORE_KINDS as string[]).includes(k)) cats.add(k as CatKey);
  }
  return {
    cats: CAT_KEYS.filter((c) => cats.has(c)),
    types: TYPE_KEYS.filter((t) => types.has(t)),
    eras: list("era"),
    minScore: Number(sp.get("score") ?? 0) || 0,
    region: sp.get("region") ?? "",
    county: sp.get("county") ?? "",
    waterbody: sp.get("water") ?? "",
    firstOnly: sp.get("first") === "1",
    status: list("status").filter((x): x is Status => STATUSES.some((s) => s.key === x)),
    nonop: sp.get("nonop") === "1",
    q: sp.get("q") ?? "",
  };
}

/** Leases with at least one point inside [w, s, e, n]. */
export function inBounds(ls: MiniLease[], b: [number, number, number, number] | null) {
  if (!b) return ls;
  const [w, s, e, n] = b;
  return ls.filter((l) => l.pts.some(([x, y]) => x >= w && x <= e && y >= s && y <= n));
}

export function sortForList(ls: MiniLease[]) {
  return [...ls].sort((a, b) => b.cs - a.cs || b.f - a.f || (b.s ?? -1) - (a.s ?? -1) || a.p.localeCompare(b.p, undefined, { numeric: true }));
}
