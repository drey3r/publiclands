import { ERAS, eraOf } from "./legend";
import type { MiniLease, TypeKey } from "./types";

export type Filters = {
  types: TypeKey[];
  eras: string[];
  minScore: number;
  region: string;
  county: string;
  waterbody: string;
  firstOnly: boolean;
  q: string;
};

export const EMPTY: Filters = { types: [], eras: [], minScore: 0, region: "", county: "", waterbody: "", firstOnly: false, q: "" };

export function activeCount(f: Filters) {
  return (
    (f.types.length ? 1 : 0) +
    (f.eras.length ? 1 : 0) +
    (f.minScore > 0 ? 1 : 0) +
    (f.region ? 1 : 0) +
    (f.county ? 1 : 0) +
    (f.waterbody ? 1 : 0) +
    (f.firstOnly ? 1 : 0)
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
  const types = new Set(f.types);
  const eras = f.eras.length ? ERAS.filter((e) => f.eras.includes(e.key)) : null;
  return all.filter((l) => {
    if (types.size && !types.has(l.t)) return false;
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
  if (f.types.length) p.set("type", f.types.join(","));
  if (f.eras.length) p.set("era", f.eras.join(","));
  if (f.minScore) p.set("score", String(f.minScore));
  if (f.region) p.set("region", f.region);
  if (f.county) p.set("county", f.county);
  if (f.waterbody) p.set("water", f.waterbody);
  if (f.firstOnly) p.set("first", "1");
  if (f.q) p.set("q", f.q);
  return p.toString();
}

export function fromQuery(sp: URLSearchParams): Filters {
  const list = (k: string) => (sp.get(k) ? sp.get(k)!.split(",").filter(Boolean) : []);
  return {
    types: list("type") as TypeKey[],
    eras: list("era"),
    minScore: Number(sp.get("score") ?? 0) || 0,
    region: sp.get("region") ?? "",
    county: sp.get("county") ?? "",
    waterbody: sp.get("water") ?? "",
    firstOnly: sp.get("first") === "1",
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
