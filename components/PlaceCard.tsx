"use client";
import { placeSetting } from "@/lib/settings";
import { SettingBand } from "./SettingBand";

export type Place = {
  id: string;
  name: string;
  manager?: string;
  access?: string;
  kind?: string;
  visit?: string;
  acres?: number | null;
  url?: string;
  fixture?: boolean;
  bbox: [number, number, number, number];
};

/** Only land that isn't open shows a bubble, in CPAD's own words. Open (and unrecorded) access shows nothing. */
const ACCESS_BUBBLE: Record<string, { cls: string; title: string }> = {
  "Restricted Access": { cls: "bg-gold/25 text-ink", title: "CPAD: open with restrictions (permit, hours or season)" },
  "No Public Access": { cls: "bg-clay/15 text-clay", title: "CPAD: not open to the public" },
};

export function PlaceCard({ p, selected, onSelect, onFly }: { p: Place; selected: boolean; onSelect: (p: Place) => void; onFly?: (p: Place) => void }) {
  const bubble = ACCESS_BUBBLE[p.access ?? ""];
  return (
    <li
      id={`place-${p.id}`}
      data-selected={selected ? "1" : undefined}
      className={`card relative overflow-hidden p-3 pb-8 ${selected ? "border-ink bg-white ring-2 ring-[#8a6a1f]/80" : "hover:border-sage"}`}
    >
      <div className="relative z-[1] flex items-center gap-1.5 text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-sage-deep">{p.kind ?? "Public land"}</span>
        {p.fixture && <span className="rounded-full border border-dashed border-clay/60 px-1.5 text-clay">fixture outline</span>}
      </div>
      <h3 className="relative z-[1] text-[15px] font-semibold leading-snug text-ink">
        <button type="button" onClick={() => onSelect(p)} aria-pressed={selected} className="text-left after:absolute after:inset-0 after:z-0 after:content-['']">{p.name}</button>
      </h3>
      <p className="relative z-[1] mt-0.5 text-[12.5px] text-ink-soft">{p.manager ?? "Manager not recorded"}</p>
      {bubble && (
        <p className="relative z-[1] mt-1.5">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[12.5px] font-semibold ${bubble.cls}`} title={bubble.title}>{p.access}</span>
        </p>
      )}
      {p.visit && <p className="relative z-[1] mt-1.5 text-[12px] text-ink-soft">{p.visit}</p>}
      {(p.url || onFly) && (
        <div className="relative z-10 mt-2 flex items-center gap-3">
          {onFly && (
            <button type="button" onClick={() => onFly(p)} className="min-h-8 rounded-full border border-line bg-paper px-3 text-[12.5px] font-semibold text-ink-soft hover:border-ink-soft hover:text-ink" aria-label={`Fly in to ${p.name}`}>
              Fly in
            </button>
          )}
          {p.url && (
            <a href={p.url} target="_blank" rel="noopener" className="text-[12.5px] font-medium text-water underline underline-offset-2">
              Visitor info ↗
            </a>
          )}
        </div>
      )}
      <SettingBand s={placeSetting(p)} />
    </li>
  );
}
