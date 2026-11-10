"use client";

import Link from "next/link";
import { memo } from "react";
import type { MiniLease } from "@/lib/types";
import { DataLabel, ScoreRing, StageTracker, WhatDot, eraColor, eraLabel, whatLabel } from "./ui";

type Props = {
  l: MiniLease;
  active: boolean;
  selected: boolean;
  onHover: (p: string | null) => void;
  onSelect: (p: string) => void;
  onFly?: (p: string) => void;
};

export const LeaseCard = memo(function LeaseCard({ l, active, selected, onHover, onSelect, onFly }: Props) {
  return (
    <li
      id={`card-${l.p}`}
      onMouseEnter={() => onHover(l.p)}
      onMouseLeave={() => onHover(null)}
      className={`card group relative flex gap-3 p-3 transition-colors ${selected ? "border-ink/60 bg-white" : active ? "border-sage-deep bg-white ring-2 ring-sage/40" : "hover:border-sage"}`}
    >
      <ScoreRing s={l.s} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-ink-faint [&>span]:whitespace-nowrap">
          <span className="font-semibold text-ink-soft">PRC {l.p}<DataLabel kind="source" /></span>
          {l.cs ? <span><span className={`rounded-full px-1.5 font-semibold ${l.x ? "bg-sage-deep text-paper" : "bg-gold/20 text-ink"}`}>{l.x ? "Completed" : "Case study"}</span><DataLabel kind="finding" /></span> : null}
          {l.f && !l.cs ? <span><span className="rounded-full bg-clay/15 px-1.5 font-semibold text-clay" title="This map assigns it, not the state: the lease text uses the state's own words non-operational or abandoned">Candidate for review</span><DataLabel kind="estimate" title="Estimate: this map assigns it; the State Lands Commission does not" /></span> : null}
          {l.rl ? <span><span className="rounded-full bg-sand px-1.5 font-medium text-ink-soft" title="PRC implies issue before 1960, current term began 1980 or later">Renewed legacy</span><DataLabel kind="estimate" /></span> : null}
        </div>
        <h3 className="truncate text-[15px] font-semibold leading-snug text-ink">
          {/* The whole card is clickable through this button; the link opens the full page. */}
          <button
            type="button"
            onClick={() => onSelect(l.p)}
            onFocus={() => onHover(l.p)}
            onBlur={() => onHover(null)}
            className="text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            aria-pressed={selected}
          >
            {l.n}
          </button>
        </h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-soft">
          <span className="inline-flex items-center gap-1"><WhatDot t={l.t} k={l.k} />{whatLabel(l.t, l.k)}</span>
          <span className="inline-flex items-center gap-1"><span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: eraColor(l.e) }} />{eraLabel(l.e)}</span>
          <span className="text-ink-faint">{l.c ? `${l.c} Co.` : l.r}</span>
          <DataLabel kind="estimate" title="Estimate: what it is, era and county are this map's readings of the record" />
        </p>
        <div className="mt-2 w-28"><StageTracker stage={l.st} completed={!!l.x} compact /></div>
      </div>
      <div className="relative z-10 flex shrink-0 flex-col items-stretch justify-center gap-1.5">
        {onFly && (
          <button
            type="button"
            onClick={() => onFly(l.p)}
            className="rounded-full bg-ink px-2.5 py-1 text-[12px] font-semibold text-paper hover:bg-ink-soft"
            aria-label={`Fly in to PRC ${l.p}, ${l.n}`}
          >
            Fly in
          </button>
        )}
        <Link
          href={`/lease/${encodeURIComponent(l.p)}`}
          className="rounded-full border border-line px-2.5 py-1 text-center text-[12px] font-medium text-ink-soft hover:border-ink-soft hover:text-ink"
          aria-label={`Open lease page for PRC ${l.p}, ${l.n}`}
        >
          Open
        </Link>
      </div>
    </li>
  );
});
