"use client";

import { useEffect, useRef, useState } from "react";
import { ERAS, ERA_UNKNOWN, LAYER_INFO, TYPES } from "@/lib/legend";
import type { LayerManifest, LayerName, OverlayDef } from "@/lib/types";
import type { ColorBy } from "./MapView";

/** One "show on map" layer: Public spaces, Leases, or any layer a build adds. */
export type LayerToggle = {
  key: string;
  label: string;
  on: boolean;
  /** "5,573 in view", "Loading…" */
  status: string;
  swatch: React.ReactNode;
  onToggle: () => void;
  /** Legend shown under the row while the layer is on. */
  legend?: React.ReactNode;
};

type Props = {
  toggles: LayerToggle[];
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
  /** The filter form (FilterPanel plus its match count). */
  filters: React.ReactNode;
  /** "panel": floating over the map (desktop). "sheet": inside the phone bottom sheet. */
  variant?: "panel" | "sheet";
};

/**
 * The view controls: what the map shows and how. Sits on the right of the map,
 * over Nevada; collapses to a bar when the map is small; lives in the bottom sheet on phones.
 */
export function MapControls(p: Props) {
  const { variant = "panel" } = p;
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(variant === "panel");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const userSet = useRef(false);

  // Floating panel: collapse to a bar when the map area is too small for it.
  useEffect(() => {
    if (variant !== "panel") return;
    const host = ref.current?.parentElement;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      const small = host.clientWidth < 760 || host.clientHeight < 540;
      if (!userSet.current) setOpen(!small);
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [variant]);

  const setOpenByUser = (v: boolean) => {
    userSet.current = true;
    setOpen(v);
  };

  const reference = (Object.keys(LAYER_INFO) as LayerName[]).filter((k) => k !== "access" && p.manifest?.[k]);
  const sheet = variant === "sheet";

  const toggleRows = (
    // Phones: one row, however many layers the build has.
    <ul className={sheet ? "grid gap-2" : "space-y-1.5"} style={sheet ? { gridTemplateColumns: `repeat(${p.toggles.length}, minmax(0, 1fr))` } : undefined} role="group" aria-label="Show on map">
      {p.toggles.map((t) => (
        <li key={t.key}>
          <button
            type="button"
            aria-pressed={t.on}
            onClick={t.onToggle}
            className={`flex w-full items-center rounded-xl border-2 text-left transition-colors ${sheet ? "gap-1.5 px-2 py-1.5" : "gap-2.5 px-2.5 py-2"} ${t.on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink-soft hover:border-ink-soft"}`}
          >
            {!(sheet && p.toggles.length > 2) && <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center">{t.swatch}</span>}
            <span className="min-w-0 flex-1 leading-tight">
              <span className={`block truncate font-semibold ${sheet ? "text-[12.5px]" : "text-[13.5px]"}`}>{t.label}</span>
              <span className={`block text-[11.5px] ${t.on ? "text-paper/75" : "text-ink-faint"}`}>{t.on ? (sheet ? t.status.replace(/ (in view|found)$/, "") : t.status) : "Off"}</span>
            </span>
            {!sheet && <span aria-hidden className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${t.on ? "border-paper bg-paper" : "border-ink-faint"}`} />}
          </button>
          {t.on && t.legend && !sheet && <div className="px-1 pb-1 pt-1.5">{t.legend}</div>}
        </li>
      ))}
    </ul>
  );

  const terrainRow = (
    <button
      type="button"
      onClick={() => p.setTerrain(!p.terrain)}
      aria-pressed={p.terrain}
      className="flex w-full items-center justify-between rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[12.5px] text-ink hover:border-ink-soft"
      title="Tilt the current view with 3D terrain (or right-drag / two-finger drag to tilt)"
    >
      <span className="font-semibold">3D terrain</span>
      <span className={`relative h-[18px] w-8 rounded-full transition-colors ${p.terrain ? "bg-ink" : "bg-line"}`} aria-hidden>
        <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-paper transition-[left] ${p.terrain ? "left-[16px]" : "left-[2px]"}`} />
      </span>
    </button>
  );

  const seg = (on: boolean) => `flex-1 rounded-md px-2 py-1 text-[12px] font-medium ${on ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`;
  const body = (
    <div className="space-y-3">
      {sheet && toggleRows}
      {terrainRow}

      {p.leasesOn && (
        <section aria-labelledby="key-leases" className="space-y-2 border-t border-line pt-2.5">
          <h3 id="key-leases" className="text-[12px] font-semibold text-ink">Lease sites, colored by</h3>
          <div className="flex gap-1 rounded-lg bg-sand p-0.5" role="group" aria-label="Color lease points by">
            <button type="button" className={seg(p.colorBy === "type")} aria-pressed={p.colorBy === "type"} onClick={() => p.setColorBy("type")}>Type</button>
            <button type="button" className={seg(p.colorBy === "era")} aria-pressed={p.colorBy === "era"} onClick={() => p.setColorBy("era")}>Era</button>
          </div>
          <ul className="grid grid-cols-2 gap-x-2 gap-y-1 text-[12px]">
            {p.colorBy === "type"
              ? TYPES.map((t) => <Row key={t.key} color={t.color} label={t.label} />)
              : [...ERAS.map((e) => <Row key={e.key} color={e.color} label={e.label} />), <Row key="u" color={ERA_UNKNOWN} label="Unknown" />]}
          </ul>
          <div className="space-y-1 text-[12px] text-ink-soft">
            <div className="flex items-center gap-2"><span aria-hidden className="h-3 w-3 shrink-0 rounded-full border-[2.5px] border-ink/80 bg-paper" /> Heavier ring: higher screen score</div>
            <div className="flex items-center gap-2"><span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-clay" /> Candidate for review</div>
            <div className="flex items-center gap-2"><span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-sage-deep" /> Completed</div>
            <p className="text-[11px] text-ink-faint">Type, era and score are estimates.</p>
          </div>
        </section>
      )}

      <section className="border-t border-line pt-2.5">
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          aria-controls="filters"
          className="flex w-full items-center justify-between text-left text-[12.5px] font-semibold text-ink"
        >
          <span>
            Filter lease sites
            {p.filterCount > 0 && <span className="ml-1.5 rounded-full bg-ink px-1.5 py-0.5 text-[11px] text-paper">{p.filterCount}</span>}
          </span>
          <span aria-hidden className="text-ink-faint">{filtersOpen ? "▾" : "▸"}</span>
        </button>
        {filtersOpen && <div id="filters" className="pt-2.5">{p.filters}</div>}
      </section>

      {(reference.length > 0 || p.overlays.length > 0) && (
        <fieldset className="space-y-1 border-t border-line pt-2.5 text-[12px]">
          <legend className="mb-1 text-[12px] font-semibold text-ink">Reference layers</legend>
          {reference.map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={p.layers[k]} onChange={(e) => p.setLayers({ ...p.layers, [k]: e.target.checked })} className="accent-[#56664f]" />
              <span aria-hidden className="h-2.5 w-3.5 rounded-sm" style={{ background: LAYER_INFO[k].color, opacity: 0.7 }} />
              <span className="text-ink">{LAYER_INFO[k].label}</span>
              {p.manifest?.[k]?.fixture && <span className="ml-auto rounded border border-dashed border-clay/60 px-1 text-[10px] text-clay" title={p.manifest[k]?.source ?? "Fixture"}>fixture</span>}
            </label>
          ))}
          {p.overlays.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2" title={o.description ?? undefined}>
              <input type="checkbox" checked={p.overlayVis[o.id] ?? o.visible} onChange={(e) => p.setOverlayVis({ ...p.overlayVis, [o.id]: e.target.checked })} className="accent-[#56664f]" />
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />
              <span className="text-ink">{o.title}</span>
              <span className="ml-auto text-ink-faint">{o.count}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );

  if (sheet) {
    return (
      <div className="border-b border-line px-4 pb-3 pt-1">
        {toggleRows}
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-2 w-full rounded-full border border-line bg-paper py-1.5 text-[12.5px] font-medium text-ink-soft">
          {open ? "Hide map key and filters" : `Map key, 3D and filters${p.filterCount ? ` · ${p.filterCount} on` : ""}`}
        </button>
        {open && <div className="pt-3">{body}</div>}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      id="view-panel"
      data-compact={!open ? "1" : undefined}
      className="pointer-events-auto absolute right-3 top-3 z-10 flex max-h-[calc(100%-56px)] w-[300px] max-w-[calc(100%-24px)] flex-col rounded-2xl border border-line bg-paper/95 shadow-[0_6px_24px_rgba(43,42,38,0.12)] backdrop-blur"
      aria-label="Map view controls"
      role="region"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-2.5">
        <h2 className="text-[13px] font-semibold text-ink">Show on map</h2>
        <button type="button" onClick={() => setOpenByUser(!open)} aria-expanded={open} aria-controls="view-panel-body" className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-ink-soft hover:bg-sand hover:text-ink">
          {open ? "Collapse ▴" : `Map key${p.filterCount ? ` · ${p.filterCount} filters` : ""} ▾`}
        </button>
      </div>
      <div className="shrink-0 px-3 pb-2.5">
        {open ? (
          toggleRows
        ) : (
          // Compact bar: the toggles as chips.
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show on map">
            {p.toggles.map((t) => (
              <button key={t.key} type="button" aria-pressed={t.on} onClick={t.onToggle} className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${t.on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink-soft"}`}>
                {t.label}
              </button>
            ))}
            <button type="button" aria-pressed={p.terrain} onClick={() => p.setTerrain(!p.terrain)} className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${p.terrain ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink-soft"}`}>
              3D
            </button>
          </div>
        )}
      </div>
      {open && (
        <div id="view-panel-body" className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line px-3 pb-3 pt-2.5">
          {body}
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
