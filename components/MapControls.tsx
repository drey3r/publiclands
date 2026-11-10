"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CATS, ERAS, ERA_UNKNOWN, LAYER_INFO, LEASE_MARK, LEASE_TIER, SCORE_BANDS, SCORE_UNKNOWN, TYPES } from "@/lib/legend";
import type { LayerManifest, LayerName, OverlayDef } from "@/lib/types";
import type { ColorBy } from "./MapView";
import { KindIcon } from "./KindIcon";
import { DataDates } from "./DataDates";
import { DataLabel } from "./ui";
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
  filterCount: number;
  /** Datasets with pull dates and the source's own last-updated date (map key). */
  datasets: Dataset[];
  /** Explore by kind: counts per key row, the kind shown alone (if any), and the row click. */
  kinds: { counts: Record<ExploreKind, number>; active: ExploreKind | null; onPick: (k: ExploreKind) => void };
  /** The filter form (FilterPanel plus its match count). */
  filters: React.ReactNode;
  /** "panel": floating over the map (desktop). "sheet": inside the phone bottom sheet. */
  variant?: "panel" | "sheet";
  /** County lines and names (stronger than the faint default lines). */
  counties: boolean;
  setCounties: (on: boolean) => void;
  /** Floating panel: tallest it may be (px) so it stays off California at Home; it scrolls inside. */
  maxHeight?: number | null;
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

/**
 * The view controls: what the map shows and how. Floats on the right of the map (over
 * Nevada and Arizona, never over California at Home); collapses to a bar when the map is
 * small; lives in the bottom sheet on phones. Common controls are always visible; the
 * key, filters and reference layers fold away.
 */
export function MapControls(p: Props) {
  const { variant = "panel" } = p;
  const sheet = variant === "sheet";
  const ref = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(!sheet);
  const [keyOpen, setKeyOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState<Record<string, boolean>>({});
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
    const ro = new ResizeObserver(checkMore);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [checkMore, open]);

  const setOpenByUser = (v: boolean) => {
    userSet.current = true;
    setOpen(v);
  };

  const reference = (Object.keys(LAYER_INFO) as LayerName[]).filter((k) => k !== "access" && p.manifest?.[k]);
  const refOn = reference.filter((k) => p.layers[k]).length + (p.counties ? 1 : 0) + p.overlays.filter((o) => p.overlayVis[o.id] ?? o.visible).length;

  const terrainSwitch = (
    <button
      type="button"
      onClick={() => p.setTerrain(!p.terrain)}
      aria-pressed={p.terrain}
      className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-ink-soft hover:bg-sand hover:text-ink"
      title="Tilt the current view with 3D terrain (or right-drag / two-finger drag to tilt)"
    >
      3D
      <span className={`relative h-[16px] w-7 rounded-full transition-colors ${p.terrain ? "bg-ink" : "bg-line"}`} aria-hidden>
        <span className={`absolute top-[2px] h-[12px] w-[12px] rounded-full bg-paper transition-[left] ${p.terrain ? "left-[13px]" : "left-[2px]"}`} />
      </span>
    </button>
  );

  const presetSelect = (
    <label className="flex items-center gap-2 text-[12px]">
      <span className="shrink-0 font-semibold text-ink">Quick view</span>
      <select
        value={p.preset}
        onChange={(e) => e.target.value && p.onPreset(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-line bg-paper px-1.5 py-1 text-[12px] text-ink hover:border-ink-soft"
      >
        {!p.preset && <option value="">Custom</option>}
        {p.presets.map((x) => (
          <option key={x.key} value={x.key}>{x.label}</option>
        ))}
      </select>
    </label>
  );

  // The layer stack: one compact row per layer (swatch, name, count, switch).
  const stack = (
    <ul className={sheet ? "grid grid-cols-2 gap-1.5" : "space-y-1"} role="group" aria-label="Layers on the map">
      {p.toggles.map((t) => (
        <li key={t.key}>
          <button
            type="button"
            role="switch"
            aria-checked={t.on}
            onClick={t.onToggle}
            title={t.title}
            className={`flex w-full items-center gap-2 rounded-lg border text-left transition-colors ${sheet ? "px-2 py-1" : "px-2 py-[5px]"} ${t.on ? "border-ink/70 bg-white text-ink" : "border-line bg-paper/60 text-ink-faint hover:border-ink-soft"}`}
          >
            <span aria-hidden className={`flex h-4 w-4 shrink-0 items-center justify-center ${t.on ? "" : "opacity-40 grayscale"}`}>{t.swatch}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold leading-tight">{t.label}</span>
            {!sheet && <span className={`shrink-0 text-[11px] tabular-nums ${t.on ? "text-ink-soft" : "text-ink-faint"}`}>{t.on ? t.status.replace(/ in view$/, "") : "Off"}</span>}
            <span aria-hidden className={`relative h-[14px] w-6 shrink-0 rounded-full transition-colors ${t.on ? "bg-ink" : "bg-line"}`}>
              <span className={`absolute top-[2px] h-[10px] w-[10px] rounded-full bg-paper transition-[left] ${t.on ? "left-[12px]" : "left-[2px]"}`} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  const fold = (label: React.ReactNode, isOpen: boolean, toggle: () => void, id: string, children: React.ReactNode) => (
    <section className="border-t border-line">
      <button type="button" onClick={toggle} aria-expanded={isOpen} aria-controls={id} className="flex w-full items-center justify-between py-1.5 text-left text-[12.5px] font-semibold text-ink hover:text-ink-soft">
        <span>{label}</span>
        <span aria-hidden className="text-ink-faint">{isOpen ? "▾" : "▸"}</span>
      </button>
      {isOpen && <div id={id} className="pb-2.5">{children}</div>}
    </section>
  );

  const seg = (on: boolean) => `flex-1 rounded-md px-1 py-1 text-[11.5px] font-medium ${on ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`;
  const leaseKey = (
    <div className="space-y-2">
      <p className="text-[11.5px] font-semibold text-ink-soft">What it is <DataLabel kind="estimate" title="Estimate: category and kind are this map's reading of the state's lease type and text" /></p>
      <p className="text-[11px] text-ink-faint">Click a row to show only that kind{p.kinds.active ? "; click it again to show all" : ""}.</p>
      <ul className="-mx-1 text-[12px] text-ink" aria-label="Explore by kind">
        {[
          ...KIND_ROWS.map((r) => ({ key: r.key as ExploreKind, label: r.label, mark: <KindIcon k={r.key} size={20} /> })),
          ...QUIET_ROWS.map((r) => ({ key: r.key, label: r.label, mark: <TierSwatch tier={r.tier} /> })),
        ].map((r) => {
          const on = p.kinds.active === r.key;
          const dim = !!p.kinds.active && !on;
          return (
            <li key={r.key}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => p.kinds.onPick(r.key)}
                title={on ? "Show all kinds again" : `Show only ${r.label.toLowerCase()}`}
                className={`flex w-full items-center gap-2 rounded-md px-1 py-[3px] text-left ${on ? "bg-ink/10 font-semibold" : "hover:bg-sand"} ${dim ? "opacity-55" : ""}`}
              >
                {r.mark}
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className="tabular-nums text-ink-faint">{p.kinds.counts[r.key].toLocaleString()}</span>
              </button>
            </li>
          );
        })}
        <li className="flex items-center gap-2 px-1 py-[3px]"><span aria-hidden className="inline-flex w-5 justify-center"><LeaseSwatch size={15} /></span> Group of lease sites (count)</li>
      </ul>
      <p className="text-[11px] text-ink-faint">Icons from zoom 11; dots and counts below that. A lease with two kinds (say, a pipeline and a cable) counts under both.</p>
      <div>
        <p className="mb-1 text-[11.5px] font-semibold text-ink-soft">Color by</p>
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
      </div>
      {p.colorBy !== "lease" && (
        <ul className="grid grid-cols-2 gap-x-2 gap-y-1 text-[12px]">
          {p.colorBy === "cat"
            ? CATS.map((c) => <Row key={c.key} color={c.color} label={c.short} />)
            : p.colorBy === "type"
              ? TYPES.map((t) => <Row key={t.key} color={t.color} label={t.label} />)
              : p.colorBy === "score"
                ? [...SCORE_BANDS.map((b) => <Row key={b.min} color={b.color} label={`Score ${b.label}`} />), <Row key="u" color={SCORE_UNKNOWN} label="No score" />]
                : [...ERAS.map((e) => <Row key={e.key} color={e.color} label={e.label} />), <Row key="u" color={ERA_UNKNOWN} label="Unknown" />]}
        </ul>
      )}
      <ul className="grid grid-cols-1 gap-y-1 text-[12px] text-ink-soft">
        <li className="flex items-center gap-2"><span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-clay" /> Candidate for review<DataLabel kind="estimate" title="Estimate: this map assigns it; the State Lands Commission does not" /></li>
        <li className="flex items-center gap-2"><span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-sage-deep" /> Completed<DataLabel kind="finding" /></li>
      </ul>
      <p className="text-[11px] text-ink-faint">Category, kind, era and score are estimates; the state&apos;s lease type is source data; case studies and review stages are findings.</p>
    </div>
  );

  const referenceList = (
    <div className="space-y-1 text-[12px]">
      {reference.map((k) => (
        <label key={k} className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={p.layers[k]} onChange={(e) => p.setLayers({ ...p.layers, [k]: e.target.checked })} className="accent-[#2f6b3a]" />
          <span aria-hidden className="h-2.5 w-3.5 rounded-sm" style={{ background: LAYER_INFO[k].color, opacity: 0.7 }} />
          <span className="text-ink">{LAYER_INFO[k].label}</span>
          {p.manifest?.[k]?.fixture && <span className="ml-auto rounded border border-dashed border-clay/60 px-1 text-[10px] text-clay" title={p.manifest[k]?.source ?? "Fixture"}>fixture</span>}
        </label>
      ))}
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={p.counties} onChange={(e) => p.setCounties(e.target.checked)} className="accent-[#2f6b3a]" />
        <span aria-hidden className="h-0 w-3.5 border-t-[1.5px] border-dashed border-[#6f6656]" />
        <span className="text-ink">County lines</span>
      </label>
      {p.overlays.map((o) => (
        <label key={o.id} className="flex cursor-pointer items-center gap-2" title={o.description ?? undefined}>
          <input type="checkbox" checked={p.overlayVis[o.id] ?? o.visible} onChange={(e) => p.setOverlayVis({ ...p.overlayVis, [o.id]: e.target.checked })} className="accent-[#2f6b3a]" />
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />
          <span className="text-ink">{o.title}</span>
          <span className="ml-auto text-ink-faint">{o.count}</span>
        </label>
      ))}
    </div>
  );

  const folds = (
    <div>
      {p.toggles
        .filter((t) => t.on && t.legend)
        .map((t) => (
          <div key={t.key}>{fold(`${t.label} key`, !!legendOpen[t.key], () => setLegendOpen((v) => ({ ...v, [t.key]: !v[t.key] })), `key-${t.key}`, t.legend)}</div>
        ))}
      {p.leasesOn && fold("Lease colors and key", keyOpen, () => setKeyOpen((v) => !v), "lease-key", leaseKey)}
      {fold(
        <>
          Filter lease sites
          {p.filterCount > 0 && <span className="ml-1.5 rounded-full bg-ink px-1.5 py-0.5 text-[11px] text-paper">{p.filterCount}</span>}
        </>,
        filtersOpen,
        () => setFiltersOpen((v) => !v),
        "filters",
        p.filters,
      )}
      {fold(
        <>
          Reference layers
          {refOn > 0 && <span className="ml-1.5 text-[11px] font-medium text-ink-faint">{refOn} on</span>}
        </>,
        refOpen,
        () => setRefOpen((v) => !v),
        "reference",
        referenceList,
      )}
      {p.datasets.length > 0 &&
        fold(
          "Data sources and dates",
          datesOpen,
          () => setDatesOpen((v) => !v),
          "data-dates",
          <>
            <DataDates datasets={p.datasets} compact />
            <a href="/about#data" className="mt-2 inline-block text-[11.5px] font-medium text-ink-soft underline underline-offset-2 hover:text-ink">All sources and caveats</a>
          </>,
        )}
    </div>
  );

  if (sheet) {
    return (
      <div className="border-b border-line px-4 pb-3 pt-1">
        {stack}
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-2 w-full rounded-full border border-line bg-paper py-1.5 text-[12.5px] font-medium text-ink-soft">
          {open ? "Hide views, key and filters" : `Views, key, 3D and filters${p.filterCount ? ` · ${p.filterCount} on` : ""}`}
        </button>
        {open && (
          <div className="space-y-2 pt-3">
            {presetSelect}
            {p.stackNote}
            <div className="flex justify-end">{terrainSwitch}</div>
            {folds}
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
      className="pointer-events-auto absolute right-3 top-3 z-10 flex max-h-[calc(100%-24px)] w-[284px] max-w-[calc(100%-24px)] flex-col rounded-2xl border border-line bg-paper/95 shadow-[0_6px_24px_rgba(43,42,38,0.12)] backdrop-blur"
      style={p.maxHeight ? { maxHeight: `min(${p.maxHeight}px, calc(100% - 24px))` } : undefined}
      aria-label="Map view controls"
      role="region"
    >
      <div className="flex shrink-0 items-center justify-between gap-1 px-3 pb-1 pt-1.5">
        <h2 className="text-[13px] font-semibold text-ink">Show on map</h2>
        <div className="flex items-center gap-0.5">
          {terrainSwitch}
          <button type="button" onClick={() => setOpenByUser(!open)} aria-expanded={open} aria-controls="view-panel-body" className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-ink-soft hover:bg-sand hover:text-ink">
            {open ? "Collapse ▴" : `Layers${p.filterCount ? ` · ${p.filterCount} filters` : ""} ▾`}
          </button>
        </div>
      </div>
      {open ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={scroller} id="view-panel-body" onScroll={checkMore} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-1.5">
            <div className="space-y-2">
              {presetSelect}
              {stack}
              {p.stackNote}
              {folds}
            </div>
          </div>
          {above && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-paper to-transparent" />}
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
        <div className="flex flex-wrap gap-1.5 px-3 pb-2.5" role="group" aria-label="Layers on the map">
          {p.toggles.map((t) => (
            <button key={t.key} type="button" aria-pressed={t.on} onClick={t.onToggle} className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] font-semibold ${t.on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink-soft"}`}>
              <span aria-hidden className="flex h-3 w-3 items-center justify-center">{t.swatch}</span>
              {t.label}
            </button>
          ))}
        </div>
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
