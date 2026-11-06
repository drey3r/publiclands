"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { ABOUT_URL, BACK_LABEL, BACK_URL, CA_BOUNDS, DISCLAIMER, REPO_URL, STORIES } from "@/lib/config";
import { EMPTY, activeCount, applyFilters, fromQuery, inBounds, sortForList, toQuery, type Filters } from "@/lib/filters";
import type { LayerManifest, LayerName, LeasesPayload, MiniLease, OverlayDef } from "@/lib/types";
import { FilterPanel } from "./FilterPanel";
import { LeaseCard } from "./LeaseCard";
import { MapControls } from "./MapControls";
import { PlaceCard, type Place } from "./PlaceCard";
import { SearchBox, type Suggestion } from "./SearchBox";
import { FixtureBadge, ScoreRing, StageTracker, TypeDot, eraLabel, typeLabel } from "./ui";
import type { Bounds, ColorBy } from "./MapView";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="absolute inset-0 animate-pulse bg-sand" /> });

const PAGE = 40;
const PLACE_MAX = 60;
type Tab = "leases" | "places";
type Sheet = "peek" | "half" | "full";

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px)");
    const on = () => setM(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return m;
}

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function bboxOf(geom: GeoJSON.Geometry): [number, number, number, number] {
  let b: [number, number, number, number] = [180, 90, -180, -90];
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === "number") {
      const [x, y] = c as number[];
      b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
    } else (c as unknown[]).forEach(walk);
  };
  if ("coordinates" in geom) walk(geom.coordinates);
  return b;
}

export default function Explorer() {
  const [data, setData] = useState<LeasesPayload | null>(null);
  const [manifest, setManifest] = useState<LayerManifest | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<OverlayDef[]>([]);
  const [overlayVis, setOverlayVis] = useState<Record<string, boolean>>({});

  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  const [colorBy, setColorBy] = useState<ColorBy>("type");
  // All overlays start off; public access lands load on first use (CPAD is ~10 MB).
  const [layers, setLayers] = useState<Record<LayerName, boolean>>({ access: false, granted: false, school: false, waterlines: false });
  const [terrain, setTerrain] = useState(false);
  const [tab, setTab] = useState<Tab>("leases");
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [sheet, setSheet] = useState<Sheet>("peek");
  const mobile = useIsMobile();
  const map = useRef<MLMap | null>(null);
  const initial = useRef<URLSearchParams | null>(null);

  // ---- load data
  useEffect(() => {
    initial.current = new URLSearchParams(window.location.search);
    setFilters(fromQuery(initial.current));
    fetch("/data/overlays/index.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((o: OverlayDef[]) => {
        setOverlays(o);
        setOverlayVis(Object.fromEntries(o.map((x) => [x.id, x.visible])));
      })
      .catch(() => setOverlays([]));
    Promise.all([fetch("/data/leases.min.json").then((r) => r.json()), fetch("/data/layers/manifest.json").then((r) => r.json())])
      .then(async ([d, man]: [LeasesPayload, LayerManifest]) => {
        setData(d);
        setManifest(man);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // ---- places list: fetched the first time the access layer is switched on
  const placesLoaded = useRef(false);
  useEffect(() => {
    const def = manifest?.access;
    if (!layers.access || placesLoaded.current || def?.kind !== "geojson") return;
    placesLoaded.current = true;
    fetch(def.url)
      .then((r) => r.json())
      .then((fc: GeoJSON.FeatureCollection) =>
        setPlaces(
          fc.features.map((f, i) => {
            const p = f.properties ?? {};
            return {
              id: String(p.id ?? p.unitId ?? i),
              name: p.name ?? p.UNIT_NAME ?? "Public land",
              manager: p.manager ?? p.managingAgency ?? p.AGNCY_NAME,
              access: p.access ?? p.ACCESS_TYP,
              kind: p.kind ?? p.agencyLevel ?? p.AGNCY_LEV,
              visit: p.visit,
              url: p.url ?? p.PARK_URL,
              acres: p.acres ?? null,
              fixture: !!p.fixture,
              bbox: bboxOf(f.geometry),
            };
          }),
        ),
      )
      .catch(() => (placesLoaded.current = false));
  }, [layers.access, manifest]);

  // ---- filters → URL (shareable)
  useEffect(() => {
    if (!initial.current) return;
    const qs = toQuery(filters);
    const keep = new URLSearchParams(window.location.search);
    const next = new URLSearchParams(qs);
    if (selected) next.set("prc", selected);
    else keep.delete("prc");
    history.replaceState(null, "", `${location.pathname}${next.toString() ? `?${next}` : ""}`);
  }, [filters, selected]);

  const all = data?.leases ?? [];
  const hasPlaces = !!manifest?.access;
  const byPrc = useMemo(() => new Map(all.map((l) => [l.p, l])), [all]);
  const filtered = useMemo(() => applyFilters(all, filters), [all, filters]);
  const deferredFiltered = useDeferredValue(filtered);
  const inView = useMemo(() => sortForList(inBounds(deferredFiltered, bounds)), [deferredFiltered, bounds]);
  // Largest first; the list shows the top PLACE_MAX (CPAD has ~18k units).
  const placesInView = useMemo(() => {
    const v = bounds ? places.filter((p) => p.bbox[0] <= bounds[2] && p.bbox[2] >= bounds[0] && p.bbox[1] <= bounds[3] && p.bbox[3] >= bounds[1]) : places;
    return [...v].sort((a, b) => (b.acres ?? 0) - (a.acres ?? 0));
  }, [places, bounds]);
  const counties = useMemo(() => [...new Set(all.map((l) => l.c).filter(Boolean) as string[])].sort(), [all]);
  const waterbodies = useMemo(() => {
    const n = new Map<string, number>();
    all.forEach((l) => l.w && n.set(l.w, (n.get(l.w) ?? 0) + 1));
    return [...n].filter(([, c]) => c >= 2 || all.length < 200).map(([w]) => w).sort();
  }, [all]);

  useEffect(() => setLimit(PAGE), [filters, bounds]);

  // ---- camera helpers
  const padding = useCallback(() => (mobile ? { top: 70, bottom: Math.round(window.innerHeight * 0.45), left: 20, right: 20 } : 40), [mobile]);
  const fit = useCallback(
    (b: [number, number, number, number], maxZoom = 13) => map.current?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: padding(), maxZoom, duration: reduceMotion() ? 0 : 1200 }),
    [padding],
  );
  const focusLease = useCallback(
    (l: MiniLease, zoom = 12.5) => {
      const xs = l.pts.map((p) => p[0]), ys = l.pts.map((p) => p[1]);
      if (l.pts.length > 1) fit([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], zoom);
      else map.current?.flyTo({ center: l.pts[0], zoom: Math.max(map.current.getZoom(), zoom), padding: padding(), duration: reduceMotion() ? 0 : 1400 });
    },
    [fit, padding],
  );

  const select = useCallback(
    (p: string | null, fly = false) => {
      setSelected(p);
      if (p) {
        setSelectedPlace(null);
        setTab("leases");
        if (mobile) setSheet((s) => (s === "peek" ? "half" : s));
        const l = byPrc.get(p);
        if (l && fly) focusLease(l);
        requestAnimationFrame(() => document.getElementById(`card-${p}`)?.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" }));
      }
    },
    [byPrc, focusLease, mobile],
  );

  const playStory = useCallback(
    (prc: string) => {
      const s = STORIES.find((x) => x.prc === prc);
      if (!s || !map.current) return;
      setFilters(EMPTY);
      setTerrain(true);
      setSelected(prc);
      setTab("leases");
      if (mobile) setSheet("peek");
      map.current.flyTo({ ...s.camera, padding: padding(), duration: reduceMotion() ? 0 : 7000, curve: 1.6, essential: true });
    },
    [mobile, padding],
  );

  const onReady = useCallback(
    (m: MLMap) => {
      map.current = m;
      const sp = initial.current;
      const story = sp?.get("story");
      const prc = sp?.get("prc");
      if (story) setTimeout(() => playStory(story), 300);
      else if (prc) setTimeout(() => setSelected(prc), 0);
    },
    [playStory],
  );

  // Fly to ?prc= once data is in.
  const flewInitial = useRef(false);
  useEffect(() => {
    const prc = initial.current?.get("prc");
    if (flewInitial.current || !prc || !map.current || !byPrc.size || initial.current?.get("story")) return;
    const l = byPrc.get(prc);
    if (l) {
      flewInitial.current = true;
      focusLease(l);
    }
  });

  const onPick = (s: Suggestion) => {
    if (s.kind === "lease") select(s.l.p, true);
    else if (s.kind === "filter") {
      const next = { ...filters, q: s.q };
      setFilters(next);
      const ls = applyFilters(all, next);
      const pts = ls.flatMap((l) => l.pts);
      if (pts.length) fit([Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))], 12);
    } else if (s.kind === "place") {
      setLayers((l) => ({ ...l, access: true }));
      setTab("places");
      setSelectedPlace(s.p.id);
      fit(s.p.bbox, 13);
    } else if (s.kind === "geo") {
      if (s.bbox) fit(s.bbox, 13);
      else map.current?.flyTo({ center: s.center, zoom: 11, padding: padding(), duration: reduceMotion() ? 0 : 1400 });
    }
  };

  const sel = selected ? byPrc.get(selected) : null;
  const meta = data?.meta;
  const nActive = activeCount(filters);
  const atStatewide = !bounds || bounds[2] - bounds[0] > 6;

  // ---- panel contents (shared by desktop sidebar and mobile sheet)
  const panel = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-line px-4 pt-1" role="tablist" aria-label="List">
        {((hasPlaces ? ["leases", "places"] : ["leases"]) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              if (t === "places") setLayers((l) => ({ ...l, access: true }));
            }}
            className={`-mb-px border-b-2 px-2 py-2 text-[13px] font-semibold ${tab === t ? "border-ink text-ink" : "border-transparent text-ink-faint hover:text-ink-soft"}`}
          >
            {t === "leases" ? `Lease sites · ${inView.length.toLocaleString()}` : `Places to visit${places.length ? ` · ${placesInView.length.toLocaleString()}` : ""}`}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-3" id="list-scroll">
        {error && <p className="rounded-lg bg-clay/10 p-3 text-sm text-clay">Could not load map data: {error}</p>}

        {tab === "leases" && (
          <>
            {sel && <SelectedPreview l={sel} onClose={() => setSelected(null)} onZoom={() => focusLease(sel, 13.5)} />}

            {atStatewide && !filters.q && nActive === 0 && (
              <section aria-label="Featured stories" className="mb-4">
                <h2 className="kicker mb-2">Featured stories</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
                  {STORIES.map((s) => (
                    <button key={s.prc} type="button" onClick={() => playStory(s.prc)} className="card group overflow-hidden text-left hover:border-sage">
                      <div className="relative h-16 bg-[linear-gradient(160deg,#b4c7d2_0%,#dfe3cf_55%,#c9bfa6_100%)]">
                        <svg viewBox="0 0 200 64" className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="none">
                          <path d="M0 50 L30 30 L52 42 L80 14 L104 36 L130 20 L160 40 L200 26 L200 64 L0 64Z" fill="#8a9a7b" opacity=".55" />
                          <path d="M0 58 L40 46 L70 52 L110 40 L150 50 L200 44 L200 64 L0 64Z" fill="#56664f" opacity=".5" />
                        </svg>
                        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.kicker === "Completed" ? "bg-sage-deep text-paper" : "bg-paper text-clay"}`}>{s.kicker}</span>
                        <span className="absolute bottom-1.5 right-2 text-[10px] font-semibold text-paper drop-shadow">Fly in 3D →</span>
                      </div>
                      <div className="p-2.5">
                        <div className="text-[11px] font-semibold text-ink-faint">Lake Tahoe · PRC {s.prc}</div>
                        <div className="text-[14px] font-semibold leading-snug text-ink">{s.title}</div>
                        <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">{s.blurb}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="mb-2 flex items-baseline justify-between text-[12px] text-ink-faint">
              <span>
                {inView.length.toLocaleString()} in view{filtered.length !== all.length && ` · ${filtered.length.toLocaleString()} match filters`}
              </span>
              <span>Sorted: case studies, candidates, score</span>
            </div>
            {inView.length === 0 && data && (
              <div className="card p-4 text-sm text-ink-soft">
                No lease sites here with these filters. Zoom out or{" "}
                <button className="underline" onClick={() => setFilters(EMPTY)}>clear filters</button>.
              </div>
            )}
            <ul className="space-y-2" aria-label="Lease sites in view">
              {inView.slice(0, limit).map((l) => (
                <LeaseCard key={l.p} l={l} active={hover === l.p} selected={selected === l.p} onHover={setHover} onSelect={(p) => select(p, true)} />
              ))}
            </ul>
            {inView.length > limit && (
              <button type="button" onClick={() => setLimit((n) => n + PAGE * 2)} className="mt-3 w-full rounded-full border border-line bg-paper py-2 text-[13px] font-medium text-ink-soft hover:border-ink-soft">
                Show more ({(inView.length - limit).toLocaleString()} left)
              </button>
            )}
          </>
        )}

        {tab === "places" && hasPlaces && (
          <>
            <p className="mb-3 text-[12px] text-ink-soft">
              Parks, beaches and reserves you can visit. {manifest?.access?.fixture && <FixtureBadge label="Fixture outlines" />}
            </p>
            {!places.length && <div className="card p-4 text-sm text-ink-soft">Loading public access lands…</div>}
            {places.length > 0 && placesInView.length === 0 && <div className="card p-4 text-sm text-ink-soft">No public access lands in this view yet. Zoom out to see more.</div>}
            <ul className="space-y-2">
              {placesInView.slice(0, PLACE_MAX).map((p) => (
                <PlaceCard key={p.id} p={p} selected={selectedPlace === p.id} onSelect={(pl) => { setSelectedPlace(pl.id); fit(pl.bbox, 13); }} />
              ))}
            </ul>
            {placesInView.length > PLACE_MAX && <p className="mt-3 text-center text-[12px] text-ink-faint">Showing the {PLACE_MAX} largest of {placesInView.length.toLocaleString()} in view. Zoom in to see the rest.</p>}
          </>
        )}

        <SourceNote meta={meta} manifest={manifest} overlays={overlays} />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-cream">
      {/* Header */}
      <header className="relative z-30 flex items-center gap-3 border-b border-line bg-cream/95 px-3 py-2 backdrop-blur md:px-4">
        <a href={ABOUT_URL} className="flex shrink-0 items-center gap-2" aria-label="About this project">
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-sage-deep text-[13px] font-bold text-paper">P</span>
          <span className="display hidden text-[17px] text-ink md:inline">Public Lands <span className="text-ink-faint">Map</span></span>
        </a>
        <div className="min-w-0 flex-1 md:max-w-xl">
          <SearchBox leases={all} places={places} applied={filters.q} onPick={onPick} onClear={() => setFilters((f) => ({ ...f, q: "" }))} />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          aria-controls="filters"
          className={`shrink-0 rounded-full border px-3 py-2 text-[13px] font-medium ${nActive ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink hover:border-ink-soft"}`}
        >
          Filters{nActive ? ` · ${nActive}` : ""}
        </button>
        {meta?.fixture && <span className="hidden lg:inline"><FixtureBadge label={`Fixture data · ${all.length} leases`} /></span>}
        <nav className="ml-auto hidden shrink-0 items-center gap-4 text-[13px] font-medium text-ink-soft md:flex" aria-label="Site">
          {BACK_URL && <a href={BACK_URL} className="underline-offset-2 hover:text-ink hover:underline">← {BACK_LABEL}</a>}
          <a href={ABOUT_URL} className="underline-offset-2 hover:text-ink hover:underline">About</a>
          <a href={REPO_URL} className="underline-offset-2 hover:text-ink hover:underline">Source</a>
        </nav>
        {showFilters && (
          <div id="filters" className="absolute left-2 right-2 top-full z-40 mt-2 max-h-[75vh] overflow-auto rounded-2xl border border-line bg-cream p-4 shadow-[0_14px_40px_rgba(43,42,38,0.16)] md:left-auto md:right-4 md:w-[460px]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink">Filter lease sites</h2>
              <button type="button" onClick={() => setShowFilters(false)} className="rounded-full px-2 text-ink-faint hover:text-ink" aria-label="Close filters">✕</button>
            </div>
            <FilterPanel f={filters} set={setFilters} counties={counties} waterbodies={waterbodies} methods={meta?.methods ?? {}} />
            <p className="mt-3 text-[12px] text-ink-faint">{filtered.length.toLocaleString()} of {all.length.toLocaleString()} lease sites match.</p>
          </div>
        )}
      </header>

      {meta?.fixture && (
        <div className="z-20 border-b border-dashed border-clay/50 bg-clay/10 px-4 py-1 text-center text-[12px] text-clay lg:hidden">
          Fixture data: {all.length}-lease development sample, not the full dataset.
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Desktop list */}
        {!mobile && <aside className="w-[400px] shrink-0 border-r border-line bg-cream lg:w-[440px]" aria-label="Lease sites and places">{panel}</aside>}

        {/* Map */}
        <div className="relative min-w-0 flex-1">
          <MapView
            leases={filtered}
            colorBy={colorBy}
            layers={layers}
            manifest={manifest}
            terrain={terrain}
            overlays={overlays}
            overlayVis={overlayVis}
            hover={hover}
            selected={selected}
            attribution={`${meta?.fixture ? "FIXTURE · " : ""}Leases: <a href="https://www.slc.ca.gov/">California State Lands Commission</a> · Not legal or survey data`}
            onHover={setHover}
            onSelect={(p) => select(p)}
            onSelectPlace={(id) => {
              setSelectedPlace(id);
              if (id) {
                setTab("places");
                if (mobile) setSheet("half");
                requestAnimationFrame(() => document.getElementById("list-scroll")?.scrollTo({ top: 0 }));
              }
            }}
            onViewport={setBounds}
            onReady={onReady}
          />
          <div className={`pointer-events-none absolute left-3 ${mobile ? "top-3" : "bottom-8"} z-10`}>
            {(!mobile || sheet === "peek") && (
              <MapControls
                colorBy={colorBy}
                setColorBy={setColorBy}
                layers={layers}
                setLayers={setLayers}
                manifest={manifest}
                overlays={overlays}
                overlayVis={overlayVis}
                setOverlayVis={setOverlayVis}
                terrain={terrain}
                setTerrain={(t) => {
                  setTerrain(t);
                  if (t && map.current && map.current.getPitch() < 30) map.current.easeTo({ pitch: 55, duration: reduceMotion() ? 0 : 900 });
                  if (!t && map.current) map.current.easeTo({ pitch: 0, bearing: 0, duration: reduceMotion() ? 0 : 600 });
                }}
                collapsed={mobile}
                onHome={() => map.current?.fitBounds(CA_BOUNDS, { padding: padding(), pitch: 0, bearing: 0, duration: reduceMotion() ? 0 : 1000 })}
              />
            )}
          </div>
        </div>

        {/* Mobile bottom sheet */}
        {mobile && <BottomSheet state={sheet} setState={setSheet} title={tab === "leases" ? `${inView.length.toLocaleString()} lease sites in view` : `${placesInView.length} places to visit`}>{panel}</BottomSheet>}
      </div>
    </div>
  );
}

function SelectedPreview({ l, onClose, onZoom }: { l: MiniLease; onClose: () => void; onZoom: () => void }) {
  return (
    <section aria-label={`Selected: PRC ${l.p}`} className="mb-4 rounded-2xl border border-ink/50 bg-white p-3.5 shadow-[0_4px_16px_rgba(43,42,38,0.08)]">
      <div className="flex items-start gap-3">
        <ScoreRing s={l.s} size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold text-ink-faint">PRC {l.p}{l.x ? " · Completed" : l.f ? " · Candidate for review" : ""}</div>
          <h2 className="text-[16px] font-semibold leading-snug text-ink">{l.n}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-soft">
            <span className="inline-flex items-center gap-1"><TypeDot t={l.t} />{typeLabel(l.t)}</span>
            <span>{eraLabel(l.e)}</span>
            {l.w && <span>{l.w}</span>}
            <span className="text-[10px] uppercase tracking-wide text-ink-faint">(est.)</span>
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full px-1.5 text-ink-faint hover:text-ink" aria-label="Close selection">✕</button>
      </div>
      <div className="mt-3"><StageTracker stage={l.st} completed={!!l.x} /></div>
      <div className="mt-3 flex gap-2">
        <Link href={`/lease/${encodeURIComponent(l.p)}`} className="flex-1 rounded-full bg-ink py-2 text-center text-[13px] font-semibold text-paper hover:bg-ink-soft">Open lease page</Link>
        <button type="button" onClick={onZoom} className="rounded-full border border-line px-3 py-2 text-[13px] font-medium text-ink-soft hover:border-ink-soft">Zoom to</button>
      </div>
    </section>
  );
}

function SourceNote({ meta, manifest, overlays }: { meta?: LeasesPayload["meta"]; manifest: LayerManifest | null; overlays: OverlayDef[] }) {
  if (!meta) return null;
  const fx = manifest ? (Object.entries(manifest).filter(([, v]) => v?.fixture).map(([k]) => k) as string[]) : [];
  return (
    <footer className="mt-6 space-y-1.5 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-faint">
      {meta.fixture && <FixtureBadge label={`Fixture: ${meta.counts.leases}-lease sample`} />}
      <p className="text-ink-soft">{meta.source.label}.</p>
      <p>{meta.source.completeness} “Active” is the record status in the layer, not evidence that anything is in use.</p>
      <p>Type, era, region, county, waterbody and score are estimates; each lease page shows why. The score means “read this file first”, not a finding about any lessee.</p>
      {fx.length > 0 && <p>Placeholder layers (hand-drawn fixture outlines, not survey data): {fx.join(", ")}.</p>}
      {manifest &&
        Object.values(manifest)
          .filter((l) => l && !l.fixture)
          .map((l) => (
            <p key={l!.url}>
              <b className="font-semibold text-ink-soft">{l!.title}</b>: {l!.source}{l!.asOf ? `, ${l!.asOf}` : ""}. {l!.caveat}
            </p>
          ))}
      {manifest && Object.values(manifest).some((l) => l && !l.fixture && /State Lands/.test(l.source ?? "")) && <p>CSLC layers are not legal boundary determinations.</p>}
      {overlays.map((o) => (
        <p key={o.id}>
          <b className="font-semibold text-ink-soft">{o.title}</b> (added layer){o.attribution ? `: ${o.attribution}` : ""}. {o.description}
        </p>
      ))}
      <p className="font-medium text-ink-soft">{DISCLAIMER}</p>
      <p>
        <a href={ABOUT_URL} className="underline underline-offset-2 hover:text-ink">About</a> ·{" "}
        <a href={REPO_URL} className="underline underline-offset-2 hover:text-ink">Source code and corrections</a>
        {BACK_URL && <> · <a href={BACK_URL} className="underline underline-offset-2 hover:text-ink">{BACK_LABEL}</a></>}
      </p>
      <p>Basemap © OpenMapTiles © OpenStreetMap contributors via OpenFreeMap. Terrain: AWS Terrain Tiles.</p>
    </footer>
  );
}

function BottomSheet({ state, setState, title, children }: { state: Sheet; setState: (s: Sheet) => void; title: string; children: React.ReactNode }) {
  const heights: Record<Sheet, string> = { peek: "128px", half: "52dvh", full: "calc(100dvh - 64px)" };
  const drag = useRef<{ y: number; h: number } | null>(null);
  const dragged = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  const order: Sheet[] = ["peek", "half", "full"];
  return (
    <div
      ref={ref}
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t border-line bg-cream shadow-[0_-8px_30px_rgba(43,42,38,0.14)] transition-[height] duration-200"
      style={{ height: heights[state] }}
      aria-label="Results"
    >
      <button
        type="button"
        className="flex w-full touch-none flex-col items-center gap-1 pb-1 pt-2"
        aria-label={`${title}. ${state === "full" ? "Collapse" : "Expand"} list`}
        onClick={() => {
          if (dragged.current) return void (dragged.current = false);
          setState(order[(order.indexOf(state) + 1) % 3]);
        }}
        onPointerDown={(e) => {
          drag.current = { y: e.clientY, h: ref.current!.getBoundingClientRect().height };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current || !ref.current) return;
          const h = Math.max(96, Math.min(window.innerHeight - 64, drag.current.h - (e.clientY - drag.current.y)));
          ref.current.style.transition = "none";
          ref.current.style.height = `${h}px`;
        }}
        onPointerUp={(e) => {
          if (!drag.current || !ref.current) return;
          const moved = Math.abs(e.clientY - drag.current.y) > 6;
          const h = ref.current.getBoundingClientRect().height;
          ref.current.style.transition = "";
          ref.current.style.height = "";
          drag.current = null;
          if (!moved) return; // click handler cycles
          dragged.current = true;
          const vh = window.innerHeight;
          setState(h < vh * 0.3 ? "peek" : h < vh * 0.72 ? "half" : "full");
        }}
      >
        <span aria-hidden className="h-1.5 w-10 rounded-full bg-line" />
        <span className="text-[13px] font-semibold text-ink">{title}</span>
      </button>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
