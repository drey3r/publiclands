"use client";

import { useEffect, useState } from "react";
import { ERAS, ERA_UNKNOWN, LAYER_INFO, TYPES } from "@/lib/legend";
import type { LayerManifest, LayerName, OverlayDef } from "@/lib/types";
import type { ColorBy } from "./MapView";

type Props = {
  colorBy: ColorBy;
  setColorBy: (c: ColorBy) => void;
  layers: Record<LayerName, boolean>;
  setLayers: (l: Record<LayerName, boolean>) => void;
  manifest: LayerManifest | null;
  overlays: OverlayDef[];
  overlayVis: Record<string, boolean>;
  setOverlayVis: (v: Record<string, boolean>) => void;
  terrain: boolean;
  setTerrain: (t: boolean) => void;
  onHome: () => void;
  collapsed?: boolean;
};

export function MapControls({ colorBy, setColorBy, layers, setLayers, manifest, overlays, overlayVis, setOverlayVis, terrain, setTerrain, onHome, collapsed = false }: Props) {
  const [open, setOpen] = useState(!collapsed);
  useEffect(() => setOpen(!collapsed), [collapsed]);
  // Only layers that exist; fixture outlines aren't listed unless the app runs on fixtures.
  const available = (Object.keys(LAYER_INFO) as LayerName[]).filter((k) => manifest?.[k]);
  const seg = (on: boolean) => `flex-1 rounded-md px-2 py-1 text-[12px] font-medium ${on ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`;
  return (
    <div className="pointer-events-auto w-[228px] rounded-xl border border-line bg-paper/95 text-[12px] shadow-[0_4px_18px_rgba(43,42,38,0.10)] backdrop-blur">
      <div className="flex items-center justify-between px-3 py-2">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="font-semibold text-ink">
          Map key {open ? "▾" : "▸"}
        </button>
        <div className="flex gap-1">
          <button type="button" onClick={onHome} className="rounded-md border border-line px-1.5 py-0.5 text-ink-soft hover:text-ink" title="Show all of California">CA</button>
          <button type="button" onClick={() => setTerrain(!terrain)} aria-pressed={terrain} className={`rounded-md border px-1.5 py-0.5 font-semibold ${terrain ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:text-ink"}`} title="3D terrain (right-drag or two-finger drag to tilt)">
            3D
          </button>
        </div>
      </div>
      {open && (
        <div className="space-y-3 border-t border-line px-3 pb-3 pt-2">
          <div className="flex gap-1 rounded-lg bg-sand p-0.5" role="group" aria-label="Color lease points by">
            <button type="button" className={seg(colorBy === "type")} aria-pressed={colorBy === "type"} onClick={() => setColorBy("type")}>By type</button>
            <button type="button" className={seg(colorBy === "era")} aria-pressed={colorBy === "era"} onClick={() => setColorBy("era")}>By era</button>
          </div>
          <ul className="space-y-1">
            {colorBy === "type"
              ? TYPES.map((t) => <Row key={t.key} color={t.color} label={t.label} />)
              : [...ERAS.map((e) => <Row key={e.key} color={e.color} label={e.label} />), <Row key="u" color={ERA_UNKNOWN} label="Unknown" />]}
          </ul>
          <div className="space-y-1 text-ink-soft">
            <div className="flex items-center gap-2"><span aria-hidden className="h-3 w-3 rounded-full border-[2.5px] border-ink/80 bg-paper" /> Heavier ring = higher screen score</div>
            <div className="flex items-center gap-2"><span aria-hidden className="h-3.5 w-3.5 rounded-full border-[1.5px] border-clay" /> Candidate for review · <span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-sage-deep" aria-hidden /> completed</div>
            <p className="text-[11px] text-ink-faint">Type, era and score are estimates.</p>
          </div>
          {overlays.length > 0 && (
            <fieldset className="space-y-1 border-t border-line pt-2">
              <legend className="mb-1 font-semibold text-ink">Added layers</legend>
              {overlays.map((o) => (
                <label key={o.id} className="flex cursor-pointer items-center gap-2" title={o.description ?? undefined}>
                  <input type="checkbox" checked={overlayVis[o.id] ?? o.visible} onChange={(e) => setOverlayVis({ ...overlayVis, [o.id]: e.target.checked })} className="accent-[#56664f]" />
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />
                  <span className="text-ink">{o.title}</span>
                  <span className="ml-auto text-ink-faint">{o.count}</span>
                </label>
              ))}
            </fieldset>
          )}
          {available.length > 0 && (
            <fieldset className="space-y-1 border-t border-line pt-2">
              <legend className="mb-1 font-semibold text-ink">Layers</legend>
              {available.map((k) => (
                <label key={k} className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} className="accent-[#56664f]" />
                  <span aria-hidden className="h-2.5 w-3.5 rounded-sm" style={{ background: LAYER_INFO[k].color, opacity: 0.7 }} />
                  <span className="text-ink">{LAYER_INFO[k].label}</span>
                  {manifest?.[k]?.fixture && <span className="ml-auto rounded border border-dashed border-clay/60 px-1 text-[10px] text-clay" title={manifest[k]?.source ?? "Fixture"}>fixture</span>}
                </label>
              ))}
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-2 text-ink">
      <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </li>
  );
}

