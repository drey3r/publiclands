"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { matchesQuery } from "@/lib/filters";
import type { MiniLease } from "@/lib/types";
import type { Place } from "./PlaceCard";

export type Suggestion =
  | { kind: "lease"; l: MiniLease }
  | { kind: "place"; p: Place }
  | { kind: "geo"; name: string; detail: string; center: [number, number]; bbox?: [number, number, number, number] }
  | { kind: "filter"; q: string; n: number };

type Props = {
  leases: MiniLease[];
  places: Place[];
  applied: string;
  onPick: (s: Suggestion) => void;
  onClear: () => void;
  /** Run this search once leases are loaded, as if typed and Enter pressed (from ?find= links). */
  autoFind?: string | null;
};

/** "1579", "PRC 944", "478-26", "173/ 21-3": a PRC number, not a place name. */
export const looksLikePrc = (q: string) => /^(prc\s*)?\d[\d\s\-/.a-z]*$/i.test(q.trim());

// Place search: Photon (OpenStreetMap data), limited to California. Free, no key; light use only.
async function geocode(q: string, signal: AbortSignal): Promise<Suggestion[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=4&lang=en&bbox=-124.6,32.4,-114,42.1`;
  const r = await fetch(url, { signal });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.features ?? [])
    .filter((f: { properties: { state?: string } }) => !f.properties.state || f.properties.state === "California")
    .map((f: { geometry: { coordinates: [number, number] }; properties: { name: string; county?: string; city?: string; osm_value?: string; extent?: [number, number, number, number] } }) => ({
      kind: "geo" as const,
      name: f.properties.name,
      detail: [f.properties.osm_value?.replace(/_/g, " "), f.properties.city ?? f.properties.county].filter(Boolean).join(" · "),
      center: f.geometry.coordinates,
      bbox: f.properties.extent ? ([f.properties.extent[0], f.properties.extent[3], f.properties.extent[2], f.properties.extent[1]] as [number, number, number, number]) : undefined,
    }));
}

export function SearchBox({ leases, places, applied, onPick, onClear, autoFind }: Props) {
  const [q, setQ] = useState(applied);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [geo, setGeo] = useState<Suggestion[]>([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  // True once the visitor arrows or hovers through the list; then Enter takes the highlighted row.
  const moved = useRef(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setQ(applied), [applied]);

  const local = useMemo<Suggestion[]>(() => {
    const t = q.trim();
    if (!t) return [];
    const ls = leases.filter((l) => matchesQuery(l, t));
    const exact = ls.filter((l) => l.p.toLowerCase() === t.toLowerCase().replace(/^prc\s*/, ""));
    const top = [...exact, ...ls.filter((l) => !exact.includes(l)).sort((a, b) => (b.s ?? -1) - (a.s ?? -1))].slice(0, 5);
    const ps = places.filter((p) => p.name.toLowerCase().includes(t.toLowerCase())).slice(0, 3);
    const out: Suggestion[] = top.map((l) => ({ kind: "lease", l }));
    if (ls.length > 1) out.push({ kind: "filter", q: t, n: ls.length });
    return [...out, ...ps.map((p) => ({ kind: "place" as const, p }))];
  }, [q, leases, places]);

  useEffect(() => {
    const t = q.trim();
    setGeo([]);
    setGeoBusy(false);
    if (t.length < 3 || looksLikePrc(t)) return;
    const ac = new AbortController();
    setGeoBusy(true);
    const h = setTimeout(
      () =>
        geocode(t, ac.signal)
          .then(setGeo)
          .catch(() => {})
          .finally(() => !ac.signal.aborted && setGeoBusy(false)),
      280,
    );
    return () => {
      clearTimeout(h);
      ac.abort();
    };
  }, [q]);

  // A place name lists places first; a PRC number lists leases first.
  const prcLike = looksLikePrc(q);
  const placeFirst = (xs: Suggestion[]) => [...geo, ...xs.filter((s) => s.kind === "place"), ...xs.filter((s) => s.kind !== "place")];
  const items = prcLike ? [...local, ...geo] : placeFirst(local);
  useEffect(() => {
    setActive(0);
    moved.current = false;
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (s: Suggestion) => {
    setOpen(false);
    if (s.kind === "lease") setQ(`PRC ${s.l.p}`);
    if (s.kind === "geo") setQ(s.name);
    if (s.kind === "place") setQ(s.p.name);
    onPick(s);
  };

  /** Enter: the highlighted row if the visitor chose one; otherwise the place for a place name, the lease for a PRC. */
  const enter = async (text = q) => {
    const t = text.trim();
    if (!t) return;
    if (moved.current && items[active]) return pick(items[active]);
    if (looksLikePrc(t)) {
      const n = t.toLowerCase().replace(/^prc\s*/, "");
      const exact = leases.find((l) => l.p.toLowerCase() === n);
      const first = exact ? ({ kind: "lease", l: exact } as Suggestion) : items[0];
      if (first) return pick(first);
      return setOpen(true); // shows "no matches"
    }
    // Towns, lakes and counties (place search) first, then parks on the map, then leases.
    const best = (g: Suggestion[]) => g.find((s) => s.kind === "geo" && s.name.toLowerCase() === t.toLowerCase()) ?? g[0];
    if (geo[0] && q.trim() === t) return pick(best(geo));
    setSearching(true);
    try {
      const g = t.length >= 2 ? await geocode(t, new AbortController().signal).catch(() => [] as Suggestion[]) : [];
      if (g[0]) return pick(best(g));
      const tl = t.toLowerCase();
      const park = places.find((p) => p.name.toLowerCase().includes(tl));
      if (park) return pick({ kind: "place", p: park });
      const ls = leases.filter((l) => matchesQuery(l, t));
      if (ls.length > 1) return pick({ kind: "filter", q: t, n: ls.length });
      if (ls[0]) return pick({ kind: "lease", l: ls[0] });
      setOpen(true);
    } finally {
      setSearching(false);
    }
  };

  // ?find= links (from the not-found page): run once the leases are in.
  const ranAuto = useRef(false);
  useEffect(() => {
    if (!autoFind || ranAuto.current || !leases.length) return;
    ranAuto.current = true;
    setQ(autoFind);
    enter(autoFind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFind, leases.length]);

  const noMatch = open && q.trim().length > 0 && items.length === 0 && !geoBusy && !searching;

  return (
    <div ref={box} className="relative w-full">
      <label htmlFor={`${id}-q`} className="sr-only">Search PRC number or place name</label>
      <div className="flex items-center rounded-full border border-line bg-paper pl-3.5 pr-1 shadow-[0_1px_2px_rgba(43,42,38,0.06)] focus-within:border-ink-soft">
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-ink-faint"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        <input
          id={`${id}-q`}
          role="combobox"
          ref={input}
          aria-expanded={open && items.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && items[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          value={q}
          placeholder="PRC number or place (e.g. 1579, Lake Tahoe, Monterey)"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); moved.current = true; setOpen(true); setActive((a) => Math.min(a + 1, items.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); moved.current = true; setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); enter(); }
            else if (e.key === "Escape") setOpen(false);
          }}
          className="h-10 min-w-0 flex-1 bg-transparent px-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:outline-none"
        />
        {(q || applied) && (
          <button type="button" onClick={() => { setQ(""); onClear(); }} className="rounded-full px-2 py-1 text-[13px] text-ink-faint hover:text-ink" aria-label="Clear search">✕</button>
        )}
      </div>
      {open && items.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute left-0 right-0 top-12 z-40 max-h-[60vh] overflow-auto rounded-xl border border-line bg-paper py-1 shadow-[0_10px_30px_rgba(43,42,38,0.14)]">
          {items.map((s, i) => (
            <li
              key={i}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => { moved.current = true; setActive(i); }}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              className={`cursor-pointer px-3 py-2 text-[13px] ${i === active ? "bg-sand" : ""}`}
            >
              {s.kind === "lease" && (<><span className="font-semibold text-ink">PRC {s.l.p}</span> <span className="text-ink-soft">{s.l.n}</span></>)}
              {s.kind === "filter" && <span className="text-ink-soft">Show all <b className="text-ink">{s.n}</b> lease sites matching “{s.q}”</span>}
              {s.kind === "place" && (<><span className="text-[11px] font-semibold uppercase tracking-wide text-sage-deep">Visit</span> <span className="text-ink">{s.p.name}</span></>)}
              {s.kind === "geo" && (<><span className="text-[11px] font-semibold uppercase tracking-wide text-water">Go to</span> <span className="text-ink">{s.name}</span> <span className="text-ink-faint">{s.detail}</span></>)}
            </li>
          ))}
          {geo.length > 0 && <li className="px-3 pb-1 pt-1.5 text-[10px] text-ink-faint">Place search: Photon · © OpenStreetMap contributors</li>}
        </ul>
      )}
      {(noMatch || searching) && (
        <div role="status" className="absolute left-0 right-0 top-12 z-40 rounded-xl border border-line bg-paper px-3 py-2.5 text-[13px] shadow-[0_10px_30px_rgba(43,42,38,0.14)]">
          {searching ? (
            <span className="text-ink-soft">Looking up “{q.trim()}”…</span>
          ) : (
            <>
              <p className="font-semibold text-ink">No lease or place matches “{q.trim()}”.</p>
              <p className="mt-0.5 text-ink-soft">
                {looksLikePrc(q) ? "That PRC number isn't in the State Lands Commission lease layer. Check the number, or " : "Check the spelling, or "}
                try a PRC number (1579), a lake, bay or river (Lake Tahoe), a county, or a town (Monterey).
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
