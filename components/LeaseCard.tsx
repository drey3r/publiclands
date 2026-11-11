"use client";

import Link from "next/link";
import { memo } from "react";
import type { KindKey, MiniLease } from "@/lib/types";
import { leaseSetting } from "@/lib/settings";
import { KindIcon } from "./KindIcon";
import { SettingBand } from "./SettingBand";
import { ScoreRing, WhatDot, eraLabel, whatLabel } from "./ui";

type Props = {
  l: MiniLease;
  active: boolean;
  selected: boolean;
  onHover: (p: string | null) => void;
  onSelect: (p: string) => void;
  onFly?: (p: string) => void;
  /** Worth watching reasons (Estimate), shown while that filter is on. */
  watch?: string[];
};

/** The kind icon a lease draws on the map (none for the quieter categories). */
export const iconKind = (l: Pick<MiniLease, "k" | "t" | "og">): KindKey | null =>
  l.k === "infra" && l.t !== "other" ? l.t : l.k === "roads" || l.k === "shore" ? l.k : l.og ? "oilgas" : null;

/**
 * A lease in the list: score with its kind icon under it, the title (two lines at most, never cut mid-word),
 * PRC, what it is, era and county, and any flags. No data labels here: they are on the lease page.
 */
export const LeaseCard = memo(function LeaseCard({ l, active, selected, onHover, onSelect, onFly, watch }: Props) {
  const ik = iconKind(l);
  return (
    <li
      id={`card-${l.p}`}
      onMouseEnter={() => onHover(l.p)}
      onMouseLeave={() => onHover(null)}
      data-selected={selected ? "1" : undefined}
      className={`card group relative flex gap-3 overflow-hidden p-3 pb-8 transition-colors ${selected ? "border-ink bg-white ring-2 ring-ink/70" : active ? "border-sage-deep bg-white ring-2 ring-sage/40" : "hover:border-sage"}`}
    >
      <div className="relative z-[1] flex w-9 shrink-0 flex-col items-center gap-1.5">
        <ScoreRing s={l.s} />
        {ik ? <KindIcon k={ik} size={24} /> : <span className="flex h-6 w-6 items-center justify-center"><WhatDot t={l.t} k={l.k} className="!h-3.5 !w-3.5" /></span>}
      </div>
      <div className="relative z-[1] min-w-0 flex-1">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink [overflow-wrap:normal] [word-break:normal]" title={l.n}>
          {/* The whole card is clickable through this button; the link opens the full page. */}
          <button
            type="button"
            onClick={() => onSelect(l.p)}
            onFocus={() => onHover(l.p)}
            onBlur={() => onHover(null)}
            className="text-left after:absolute after:inset-0 after:z-0 after:content-[''] focus-visible:outline-none"
            aria-pressed={selected}
          >
            {l.n}
          </button>
        </h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-soft">
          <span className="font-semibold text-ink-faint">PRC {l.p}</span>
          <span>{whatLabel(l.t, l.k, l.og)}</span>
          <span>{eraLabel(l.e)}</span>
          <span className="text-ink-faint">{l.c ? `${l.c} Co.` : l.r}</span>
        </p>
        {(l.cs || l.f || l.rl) ? (
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {l.cs ? <span className={`rounded-full px-1.5 font-semibold ${l.x ? "bg-sage-deep text-paper" : "bg-gold/20 text-ink"}`}>{l.x ? "Completed" : "Case study"}</span> : null}
            {l.f && !l.cs ? <span className="rounded-full bg-clay/15 px-1.5 font-semibold text-clay" title="This map assigns it, not the state: the lease text uses the state's own words non-operational or abandoned">Candidate for review</span> : null}
            {l.rl ? <span className="rounded-full bg-sand px-1.5 font-medium text-ink-soft" title="PRC implies issue before 1960, current term began 1980 or later">Renewed legacy</span> : null}
          </p>
        ) : null}
        {watch && watch.length > 0 && <p className="mt-1 text-[12px] text-ink">{watch.join(" ")}</p>}
      </div>
      <div className="relative z-10 flex shrink-0 flex-col items-stretch justify-start gap-1.5">
        {onFly && (
          <button
            type="button"
            onClick={() => onFly(l.p)}
            className="min-h-8 rounded-full bg-ink px-3 text-[12.5px] font-semibold text-paper hover:bg-ink-soft"
            aria-label={`Fly in to PRC ${l.p}, ${l.n}`}
          >
            Fly in
          </button>
        )}
        <Link
          href={`/lease/${encodeURIComponent(l.p)}`}
          className="flex min-h-8 items-center justify-center rounded-full border border-line bg-paper px-3 text-[12.5px] font-medium text-ink-soft hover:border-ink-soft hover:text-ink"
          aria-label={`Open lease page for PRC ${l.p}, ${l.n}`}
        >
          Open
        </Link>
      </div>
      <SettingBand s={leaseSetting(l)} />
    </li>
  );
});
