"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CATS, ERAS, ERA_UNKNOWN, LAYER_INFO, LEASE_MARK, LEASE_TIER, SCORE_BANDS, SCORE_UNKNOWN, TYPES } from "@/lib/legend";
import type { LayerManifest, LayerName, OverlayDef } from "@/lib/types";
import type { ColorBy } from "./MapView";
import { KindIcon } from "./KindIcon";
import { DataDates } from "./DataDates";
import { DataLabel } from "./ui";
import { EraFilter, MoreFilters, QuickFilters, StatusFilter, WhatFilter, type FilterProps } from "./FilterPanel";
import type { Dataset, KindKey } from "@/lib/types";
import type { ExploreKind } from "@/lib/filters";

/** Key rows with an icon: the four infrastructure kinds, then roads and bridges and shoreline protection. */
export const KIND_ROWS: { key: KindKey; label: string }[] = [
  { key: "cable", label: "Cable" },
  { key: "pipeline", label: "Pipeline" },
  { key: "outfall", label: "Water / outfall" },
  { key: "power", label: "Power" },
  { key: "roads", label: "Roads and bridges" },
  { key: "shore", label: "Shoreline protection" },
];
const QUIET_ROWS: { key: ExploreKind; label: string; tier: 2 | 3 }[] = [
  { key: "agency", label: "Public agency", tier: 2 },
  { key: "commercial", label: "Commercial and industrial", tier: 2 },
  { key: "rec", label: "Recreation", tier: 3 },
  { key: "other", label: "Other", tier: 3 },
];

/** One row of the layer stack. The rows are the legend and the switches at once. */
export type LayerToggle = {
  key: string;
  label: string;
  on: boolean;
  /** "5,573 in view", "Loading…" */
  status: string;
  swatch: React.ReactNode;
  onToggle: () => void;
  /** Longer description (tooltip). */
  title?: string;
  /** A key for this layer, shown as its own fold ("<label> key") while the layer is on. */
  legend?: React.ReactNode;
};

/** One-click views. */
export type Preset = { key: string; label: string };

type Props = {
  toggles: LayerToggle[];
  presets: Preset[];
  /** Key of the preset the current layers match, or "" (custom). */
  preset: string;
  onPreset: (key: string) => void;
  /** Note under the layer stack, e.g. "Only land open to the public". */
  stackNote?: React.ReactNode;
  colorBy: ColorBy;
  setColorBy: (c: ColorBy) => void;
  leasesOn: boolean;
  layers: Record<LayerName, boolean>;
  setLayers: (l: Record<LayerName, boolean>) => void;
  manifest: LayerManifest | null;
  overlays: OverlayDef[];
  overlayVis: Record<string, boolean>;
  setOverlayVis: (v: Record<string, boolean>) => void;
  terrain: boolean;
  setTerrain: (t: boolean) => void;
  /** Live clouds, and their model time once loaded. */
  clouds: boolean;
  setClouds: (on: boolean) => void;
  cloudsAt: string | null;
  filterCount: number;
  /** Datasets with pull dates and the source's own last-updated date (map key). */
  datasets: Dataset[];
  /** Explore by kind: counts per key row, the kind shown alone (if any), and the row click. */
  kinds: { counts: Record<ExploreKind, number>; active: ExploreKind | null; onPick: (k: ExploreKind) => void };
  /** The lease filters (shown in the Views, Types, Eras and Status tabs), the match line and Clear filters. */
  filterProps: FilterProps;
  matchText: string;
  onClearFilters: () => void;
  /** "panel": floating over the map (desktop). "sheet": inside the phone bottom sheet. */
  variant?: "panel" | "sheet";
  /** County lines (on by default) and, separately, county names. */
  counties: boolean;
  setCounties: (on: boolean) => void;
  countyNames: boolean;
  setCountyNames: (on: boolean) => void;
  /** Floating panel: tallest it may be (px) so it stays off California at Home; it scrolls inside. */
  maxHeight?: number | null;
  /** Worth watching (Estimate, map-wide): this map flags it; the state does not. */
  watch: { on: boolean; set: (on: boolean) => void; total: number };
};

/** A lease mark as drawn on the map. */
export function LeaseSwatch({ size = 12 }: { size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: LEASE_MARK.fill, border: `1.5px solid ${LEASE_MARK.line}` }} />;
}

/** A lease mark at its priority tier, as drawn at mid zoom. */
function TierSwatch({ tier }: { tier: 1 | 2 | 3 }) {
  const t = LEASE_TIER[tier];
  const d = Math.round(t.r[1] * 2);
  return (
    <span aria-hidden className="inline-flex w-5 shrink-0 items-center justify-center">
      <span className="rounded-full" style={{ width: d, height: d, background: t.fill, border: `${t.width}px solid ${t.line}` }} />
    </span>
  );
}

export type PanelTab = "views" | "types" | "eras" | "status" | "reference" | "sources";
const TABS: { key: PanelTab; label: string }[] = [
  { key: "views", label: "Views" },
  { key: "types", label: "Types" },
  { key: "eras", label: "Eras" },
  { key: "status", label: "Status" },
  { key: "reference", label: "Reference" },
  { key: "sources", label: "Sources" },
];

/** A switch, drawn the same everywhere (36×20, with a 40px-tall row as its hit area). */
export function SwitchMark({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-ink" : "bg-line"}`}>
      <span className={`absolute top-[3px] h-[14px] w-[14px] rounded-full bg-paper shadow-sm transition-[left] ${on ? "left-[19px]" : "left-[3px]"}`} />
    </span>
  );
}

/**
 * The view controls, in tabs: Views (quick view, layers, 3D) · Types (what it is, kinds, color by) · Eras ·
 * Status (term, non-operational, Worth watching) · Reference (reference layers, keys for State oil & gas and
 * sovereign lands) · Sources (data sources and dates). The layers are one click away on every tab (chips above
 * the other tabs). Floats on the right of the map (over Nevada and Arizona, never over California at Home);
 * collapses to a bar when the map is small; lives in the bottom sheet on phones.
 */
export function MapControls(p: Props) {
  const { variant = "panel" } = p;
  const sheet = variant === "sheet";
  const ref = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(!sheet);
  const [tab, setTab] = useState<PanelTab>("views");
  const [more, setMore] = useState(false);
  const [above, setAbove] = useState(false);
  const userSet = useRef(false);

  // Floating panel: collapse to a bar when the map area is too small for it.
  useEffect(() => {
    if (sheet) return;
    const host = ref.current?.parentElement;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      const small = host.clientWidth < 700 || host.clientHeight < 420;
      if (!userSet.current) setOpen(!small);
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [sheet]);

  // Scroll affordance: "More below" while anything is hidden under the bottom edge.
  const checkMore = useCallback(() => {
    const el = scroller.current;
    setMore(!!el && el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    setAbove(!!el && el.scrollTop > 4);
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    checkMore();
    el.scrollTop = 0;
    const ro = new ResizeObserver(checkMore);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [checkMore, open, tab]);

  const setOpenByUser = (v: boolean) => {
    userSet.current = true;
    setOpen(v);
  };

  const reference = (Object.keys(LAYER_INFO) as LayerName[]).filter((k) => k !== "access" && p.manifest?.[k]);
  const refOn = reference.filter((k) => p.layers[k]).length + (p.counties ? 1 : 0) + p.overlays.filter((o) => p.overlayVis[o.id] ?? o.visible).length;

  const terrainSwitch = (
    <button
      type="button"
      role="switch"
      onClick={() => p.setTerrain(!p.terrain)}
      aria-checked={p.terrain}
      className="flex min-h-9 items-center gap-2 whitespace-nowrap rounded-lg px-2 text-[13px] font-semibold text-ink-soft hover:bg-sand hover:text-ink"
      title="Tilt the current view with 3D terrain (or right-drag / two-finger drag to tilt)"
    >
      3D terrain
      <SwitchMark on={p.terrain} />
    </button>
  );

  // Re-render once a minute while the clouds' time is shown, so its age stays true (the map is not touched).
  const [, setMinute] = useState(0);
  useEffect(() => {
    if (!p.clouds || !p.cloudsAt) return;
    const id = setInterval(() => setMinute((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, [p.clouds, p.cloudsAt]);
  // The model time of the cloud grid actually on the map (the route's `time`), and how old that is: the grid is
  // cached for three hours, so a stale one should be plain to see.
  const cloudsDate = p.cloudsAt ? new Date(p.cloudsAt) : null;
  const cloudsOk = !!cloudsDate && !Number.isNaN(cloudsDate.getTime());
  const cloudsAgeMin = cloudsOk ? Math.max(0, (Date.now() - cloudsDate!.getTime()) / 60000) : 0;
  const cloudsTime = cloudsOk
    ? `${cloudsDate!.toDateString() === new Date().toDateString() ? "" : `${cloudsDate!.toLocaleDateString([], { month: "short", day: "numeric" })}, `}${cloudsDate!.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`
    : null;
  const cloudsAge = cloudsAgeMin < 90 ? `${Math.round(cloudsAgeMin)} min old` : `about ${Math.round(cloudsAgeMin / 60)} h old`;
  const cloudsAsOf = p.clouds && cloudsTime ? (
    <p id="clouds-asof" className={`-mt-2 text-right text-[11px] ${cloudsAgeMin > 240 ? "font-medium text-clay" : "text-ink-faint"}`} title="The weather model's time for the live cloud cover on the map now (Open-Meteo: NOAA HRRR and GFS). The map reads a new grid every three hours. The marine layer along the coast is illustrative and follows the time of day.">
      Live clouds as of {cloudsTime} · {cloudsAge}
    </p>
  ) : null;
  const cloudsSwitch = (
    <button
      type="button"
      role="switch"
      onClick={() => p.setClouds(!p.clouds)}
      aria-checked={p.clouds}
      className="flex min-h-9 items-center gap-2 whitespace-nowrap rounded-lg px-2 text-[13px] font-semibold text-ink-soft hover:bg-sand hover:text-ink"
      title={`Current cloud cover (Open-Meteo: NOAA HRRR and GFS models), refreshed every three hours, blended with an illustrative marine layer along the coast; high, mid and low cloud, passed in turn as you zoom in${cloudsTime ? `. Model time ${cloudsTime}` : ""}`}
    >
      Clouds
      <SwitchMark on={p.clouds} />
    </button>
  );

  const presetSelect = (
    <label className="flex items-center gap-2 text-[13px]">
      <span className="shrink-0 font-semibold text-ink">Quick view</span>
      <select
        value={p.preset}
        onChange={(e) => e.target.value && p.onPreset(e.target.value)}
        className="min-h-9 min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 text-[13px] text-ink hover:border-ink-soft"
      >
        {!p.preset && <option value="">Custom</option>}
        {p.presets.map((x) => (
          <option key={x.key} value={x.key}>{x.label}</option>
        ))}
      </select>
    </label>
  );

  // The layer stack: one row per layer (swatch, name, count, switch). Rows are 40px tall.
  const stack = (
    <ul className={sheet ? "grid grid-cols-2 gap-1.5" : "space-y-1.5"} role="group" aria-label="Layers on the map">
      {p.toggles.map((t) => (
        <li key={t.key}>
          <button
            type="button"
            role="switch"
            aria-checked={t.on}
            onClick={t.onToggle}
            title={t.title}
            className={`flex min-h-10 w-full items-center gap-2.5 rounded-xl border px-2.5 py-1 text-left transition-colors ${t.on ? "border-ink/70 bg-white text-ink" : "border-line bg-paper/60 text-ink-faint hover:border-ink-soft"}`}
          >
            <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center ${t.on ? "" : "opacity-40 grayscale"}`}>{t.swatch}</span>
            <span className={`min-w-0 flex-1 font-semibold leading-tight ${sheet ? "text-[13px]" : "text-[13.5px]"}`}>{t.label}</span>
            {!sheet && <span className={`shrink-0 text-[11.5px] tabular-nums ${t.on ? "text-ink-soft" : "text-ink-faint"}`}>{t.on ? t.status.replace(/ in view$/, "") : "Off"}</span>}
            <SwitchMark on={t.on} />
          </button>
        </li>
      ))}
    </ul>
  );
  // The same layers as chips: one click away on every other tab.
  const chips = (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Layers on the map">
      {p.toggles.map((t) => (
        <button
          key={t.key}
          type="button"
          role="switch"
          aria-checked={t.on}
          onClick={t.onToggle}
          title={t.title}
          className={`flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold ${t.on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink-soft hover:border-ink-soft"}`}
        >
          <span aria-hidden className={`flex h-3.5 w-3.5 items-center justify-center ${t.on ? "" : "opacity-50 grayscale"}`}>{t.swatch}</span>
          {t.label}
        </button>
      ))}
    </div>
  );

  // Worth watching: a map-wide filter, labeled Estimate everywhere it shows.
  const watchRow = (
    <button
      type="button"
      role="switch"
      aria-checked={p.watch.on}
      onClick={() => p.watch.set(!p.watch.on)}
      title="Estimate: this map flags it; the state does not. Each item says why."
      className={`flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-dashed px-2.5 text-left ${p.watch.on ? "border-ink/70 bg-white text-ink" : "border-line bg-paper/60 text-ink-soft hover:border-ink-soft"}`}
    >
      <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center text-[14px]">◎</span>
      <span className="min-w-0 flex-1 text-[13.5px] font-semibold leading-tight">Worth watching</span>
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-faint">Estimate</span>
      <SwitchMark on={p.watch.on} />
    </button>
  );

  const H = ({ children }: { children: React.ReactNode }) => <h3 className="text-[12.5px] font-semibold text-ink">{children}</h3>;
  const seg = (on: boolean) => `min-h-8 flex-1 rounded-md px-1 text-[12px] font-medium ${on ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`;
  const colorBy = (
    <div>
      <p className="mb-1 text-[12px] font-semibold text-ink-soft">Color lease sites by</p>
      <div className="flex gap-0.5 rounded-lg bg-sand p-0.5" role="group" aria-label="Color lease points by">
        {(
          [
            ["lease", "Gold"],
            ["cat", "Category"],
            ["type", "Type"],
            ["era", "Era"],
            ["score", "Score"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" className={seg(p.colorBy === k)} aria-pressed={p.colorBy === k} onClick={() => p.setColorBy(k)}>{label}</button>
        ))}
      </div>
      {p.colorBy !== "lease" && p.colorBy !== "era" && (
        <ul className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[12px]">
          {p.colorBy === "cat"
            ? CATS.map((c) => <Row key={c.key} color={c.color} label={c.short} />)
            : p.colorBy === "type"
              ? TYPES.map((t) => <Row key={t.key} color={t.color} label={t.label} />)
              : [...SCORE_BANDS.map((b) => <Row key={b.min} color={b.color} label={`Score ${b.label}`} />), <Row key="u" color={SCORE_UNKNOWN} label="No score" />]}
        </ul>
      )}
    </div>
  );

  const kindsKey = (
    <div className="space-y-1.5">
      <H>What it is <DataLabel kind="estimate" title="Estimate: category and kind are this map's reading of the state's lease type and text" /></H>
      <p className="text-[11.5px] text-ink-faint">Click a row to show only that kind{p.kinds.active ? "; click it again to show all" : ""}.</p>
      <ul className="-mx-1 text-[12.5px] text-ink" aria-label="Explore by kind">
        {[
          ...KIND_ROWS.map((r) => ({ key: r.key as ExploreKind, label: r.label, mark: <KindIcon k={r.key} size={20} /> })),
          ...QUIET_ROWS.flatMap((r) => [
            { key: r.key, label: r.label, mark: <TierSwatch tier={r.tier} /> },
            // Oil and gas: the state's lease types Oil & Gas Lease and Compensatory Agreement, a kind under Commercial and industrial.
            ...(r.key === "commercial" ? [{ key: "oilgas" as ExploreKind, label: " Oil and gas", mark: <KindIcon k="oilgas" size={20} /> }] : []),
          ]),
        ].map((r) => {
          const on = p.kinds.active === r.key;
          const dim = !!p.kinds.active && !on;
          return (
            <li key={r.key}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => p.kinds.onPick(r.key)}
                title={on ? "Show all kinds again" : `Show only ${r.label.trim().toLowerCase()}`}
                className={`flex min-h-8 w-full items-center gap-2 rounded-md px-1 text-left ${on ? "bg-ink/10 font-semibold" : "hover:bg-sand"} ${dim ? "opacity-55" : ""}`}
              >
                {r.mark}
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className="tabular-nums text-ink-faint">{p.kinds.counts[r.key].toLocaleString()}</span>
              </button>
            </li>
          );
        })}
        <li className="flex min-h-8 items-center gap-2 px-1"><span aria-hidden className="inline-flex w-5 justify-center"><LeaseSwatch size={15} /></span> Group of lease sites (count)</li>
      </ul>
      <p className="text-[11px] text-ink-faint">Icons from zoom 11; dots and counts below that. A lease with two kinds (say, a pipeline and a cable) counts under both. Oil and gas is the state&apos;s own lease type (source data), counted within Commercial and industrial.</p>
      <ul className="grid grid-cols-1 gap-y-1 pt-1 text-[12px] text-ink-soft">
        <li className="flex items-center gap-2"><span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-clay" /> Candidate for review<DataLabel kind="estimate" title="Estimate: this map assigns it; the State Lands Commission does not" /></li>
        <li className="flex items-center gap-2"><span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-sage-deep" /> Completed<DataLabel kind="finding" /></li>
      </ul>
    </div>
  );

  const eraKey = (
    <div className="space-y-2">
      <ul className="grid grid-cols-2 gap-x-2 gap-y-1 text-[12px]">
        {[...ERAS.map((e) => <Row key={e.key} color={e.color} label={e.label} />), <Row key="u" color={ERA_UNKNOWN} label="Unknown" />]}
      </ul>
      <button type="button" aria-pressed={p.colorBy === "era"} onClick={() => p.setColorBy(p.colorBy === "era" ? "lease" : "era")} className={`min-h-8 rounded-full border px-3 text-[12.5px] font-medium ${p.colorBy === "era" ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink-soft hover:border-ink-soft"}`}>
        {p.colorBy === "era" ? "Coloring lease sites by era" : "Color lease sites by era"}
      </button>
    </div>
  );

  const referenceList = (
    <div className="space-y-0.5 text-[12.5px]">
      {reference.map((k) => (
        <label key={k} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1 hover:bg-sand">
          <input type="checkbox" checked={p.layers[k]} onChange={(e) => p.setLayers({ ...p.layers, [k]: e.target.checked })} className="h-4 w-4 accent-[#2f6b3a]" />
          <span aria-hidden className="h-2.5 w-3.5 rounded-sm" style={{ background: LAYER_INFO[k].color, opacity: 0.7 }} />
          <span className="text-ink">{LAYER_INFO[k].label}</span>
          {p.manifest?.[k]?.fixture && <span className="ml-auto rounded border border-dashed border-clay/60 px-1 text-[10px] text-clay" title={p.manifest[k]?.source ?? "Fixture"}>fixture</span>}
        </label>
      ))}
      <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1 hover:bg-sand">
        <input type="checkbox" checked={p.counties} onChange={(e) => p.setCounties(e.target.checked)} className="h-4 w-4 accent-[#2f6b3a]" />
        <span aria-hidden className="h-0 w-3.5 border-t-[1.5px] border-[#4d4538]" />
        <span className="text-ink">County lines</span>
      </label>
      <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1 hover:bg-sand">
        <input type="checkbox" checked={p.countyNames} onChange={(e) => p.setCountyNames(e.target.checked)} className="h-4 w-4 accent-[#2f6b3a]" />
        <span aria-hidden className="w-3.5 text-center text-[9px] font-semibold leading-none tracking-wider text-[#7d7360]">Aa</span>
        <span className="text-ink">County names</span>
      </label>
      {p.overlays.map((o) => (
        <label key={o.id} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1 hover:bg-sand" title={o.description ?? undefined}>
          <input type="checkbox" checked={p.overlayVis[o.id] ?? o.visible} onChange={(e) => p.setOverlayVis({ ...p.overlayVis, [o.id]: e.target.checked })} className="h-4 w-4 accent-[#2f6b3a]" />
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />
          <span className="text-ink">{o.title}</span>
          <span className="ml-auto text-ink-faint">{o.count}</span>
        </label>
      ))}
    </div>
  );

  const matchLine = (
    <div className="flex items-center justify-between gap-2 text-[12px] text-ink-faint" aria-live="polite">
      <span>{p.matchText}</span>
      {p.filterCount > 0 && <button type="button" onClick={p.onClearFilters} className="font-medium text-ink-soft underline underline-offset-2 hover:text-ink">Clear filters</button>}
    </div>
  );
  const fp = p.filterProps;
  const body: Record<PanelTab, React.ReactNode> = {
    views: (
      <div className="space-y-3">
        {presetSelect}
        {!sheet && stack}
        {p.stackNote}
        <div className="flex justify-end gap-1">{cloudsSwitch}{terrainSwitch}</div>
        {cloudsAsOf}
        <QuickFilters f={fp.f} set={fp.set} />
        {matchLine}
      </div>
    ),
    types: (
      <div className="space-y-4">
        {kindsKey}
        <WhatFilter f={fp.f} set={fp.set} methods={fp.methods} />
        {colorBy}
        {matchLine}
      </div>
    ),
    eras: (
      <div className="space-y-4">
        <EraFilter f={fp.f} set={fp.set} methods={fp.methods} />
        {eraKey}
        {matchLine}
      </div>
    ),
    status: (
      <div className="space-y-4">
        <StatusFilter f={fp.f} set={fp.set} methods={fp.methods} />
        <div className="space-y-1">
          {watchRow}
          <p className="text-[11px] text-ink-faint">Map-wide: shows only what this map flags, each with its reason{p.watch.total ? ` (${p.watch.total.toLocaleString()} now)` : ""}.</p>
        </div>
        <MoreFilters {...fp} />
        {matchLine}
      </div>
    ),
    reference: (
      <div className="space-y-4">
        <div>
          <H>Reference layers{refOn > 0 && <span className="ml-1.5 text-[11px] font-medium text-ink-faint">{refOn} on</span>}</H>
          <div className="mt-1">{referenceList}</div>
        </div>
        {p.toggles.filter((t) => t.legend).map((t) => (
          <div key={t.key}>
            <H>{t.label}{!t.on && <span className="ml-1.5 text-[11px] font-medium text-ink-faint">off</span>}</H>
            {t.on ? <div className="mt-1.5">{t.legend}</div> : (
              <button type="button" onClick={t.onToggle} className="mt-1.5 min-h-8 rounded-full border border-line bg-paper px-3 text-[12.5px] font-medium text-ink-soft hover:border-ink-soft">Turn on {t.label}</button>
            )}
          </div>
        ))}
      </div>
    ),
    sources: p.datasets.length ? (
      <div>
        <DataDates datasets={p.datasets} compact />
        <p id="sources-ambience" className="mt-2 text-[12px] leading-snug text-ink-faint">
          Clouds blend live cloud cover (Open-Meteo) with an illustrative marine layer along the coast, fuller in the morning and lighter in the afternoon; the marine layer and a few high wisps are not data. Sea drift follows live currents and swell (Open-Meteo Marine). The movement on lakes and rivers is illustrative.
        </p>
        <a href="/about#data" className="mt-2 inline-block text-[12px] font-medium text-ink-soft underline underline-offset-2 hover:text-ink">All sources and caveats</a>
      </div>
    ) : <p className="text-[12px] text-ink-faint">Loading…</p>,
  };

  const tabBar = (
    <div role="tablist" aria-label="View panel" className="grid grid-cols-3 gap-1 rounded-xl bg-sand p-1">
      {TABS.map((x) => (
        <button
          key={x.key}
          id={`vp-tab-${x.key}`}
          type="button"
          role="tab"
          aria-selected={tab === x.key}
          aria-controls="view-panel-body"
          onClick={() => setTab(x.key)}
          className={`min-h-8 rounded-lg px-1 text-[12.5px] font-semibold ${tab === x.key ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
        >
          {x.label}
          {x.key === "status" && p.filterCount > 0 ? <span className="ml-1 rounded-full bg-ink px-1.5 text-[10.5px] text-paper">{p.filterCount}</span> : null}
        </button>
      ))}
    </div>
  );

  if (sheet) {
    return (
      <div className="border-b border-line px-4 pb-3 pt-1">
        {stack}
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-2 min-h-9 w-full rounded-full border border-line bg-paper text-[13px] font-medium text-ink-soft">
          {open ? "Hide views, key and filters" : `Views, key, 3D and filters${p.filterCount ? ` · ${p.filterCount} on` : ""}`}
        </button>
        {open && (
          <div className="space-y-3 pt-3">
            {tabBar}
            <div id="view-panel-body" role="tabpanel" aria-labelledby={`vp-tab-${tab}`}>{body[tab]}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      id="view-panel"
      data-compact={!open ? "1" : undefined}
      className="pointer-events-auto absolute right-3 top-3 z-10 flex max-h-[calc(100%-24px)] w-[312px] max-w-[calc(100%-24px)] flex-col rounded-2xl border border-line bg-paper/95 shadow-[0_6px_24px_rgba(43,42,38,0.12)] backdrop-blur"
      style={p.maxHeight ? { maxHeight: `min(${p.maxHeight}px, calc(100% - 24px))` } : undefined}
      aria-label="Map view controls"
      role="region"
    >
      <div className="flex shrink-0 items-center justify-between gap-1 px-3 pb-1 pt-2">
        <h2 className="text-[14px] font-semibold text-ink">Show on map</h2>
        <button type="button" onClick={() => setOpenByUser(!open)} aria-expanded={open} aria-controls="view-panel-body" className="min-h-8 rounded-lg px-2 text-[12.5px] font-medium text-ink-soft hover:bg-sand hover:text-ink">
          {open ? "Collapse ▴" : `Layers${p.filterCount ? ` · ${p.filterCount} filters` : ""} ▾`}
        </button>
      </div>
      {open ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-2 px-3 pb-2">
            {tabBar}
            {tab !== "views" && chips}
          </div>
          <div ref={scroller} id="view-panel-body" role="tabpanel" aria-labelledby={`vp-tab-${tab}`} onScroll={checkMore} className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line px-3 pb-2 pt-3">
            {body[tab]}
          </div>
          {above && <div aria-hidden className="pointer-events-none absolute inset-x-0 h-4 bg-gradient-to-b from-paper to-transparent" style={{ top: scroller.current?.offsetTop ?? 0 }} />}
          {more && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-10 items-end justify-center rounded-b-2xl bg-gradient-to-t from-paper via-paper/85 to-transparent pb-1">
              <button
                type="button"
                onClick={() => scroller.current?.scrollBy({ top: 160, behavior: "smooth" })}
                className="pointer-events-auto rounded-full border border-line bg-paper px-2.5 py-0.5 text-[11.5px] font-medium text-ink-soft shadow-sm hover:text-ink"
              >
                More below ↓
              </button>
            </div>
          )}
        </div>
      ) : (
        // Compact bar: the layers as chips.
        <div className="px-3 pb-2.5">{chips}</div>
      )}
    </div>
  );
}

function Row({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-2 text-ink">
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </li>
  );
}
