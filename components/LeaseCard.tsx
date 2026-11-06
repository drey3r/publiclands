"use client";

import Link from "next/link";
import { memo } from "react";
import type { MiniLease } from "@/lib/types";
import { ScoreRing, StageTracker, TypeDot, eraColor, eraLabel, typeLabel } from "./ui";

type Props = {
  l: MiniLease;
  active: boolean;
  selected: boolean;
  onHover: (p: string | null) => void;
  onSelect: (p: string) => void;
};

export const LeaseCard = memo(function LeaseCard({ l, active, selected, onHover, onSelect }: Props) {
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
          <span className="font-semibold text-ink-soft">PRC {l.p}</span>
          {l.cs ? <span className={`rounded-full px-1.5 font-semibold ${l.x ? "bg-sage-deep text-paper" : "bg-gold/20 text-ink"}`}>{l.x ? "Completed" : "Case study"}</span> : null}
          {l.f && !l.cs ? <span className="rounded-full bg-clay/15 px-1.5 font-semibold text-clay" title="The lease text uses the state's own words non-operational or abandoned">Candidate for review</span> : null}
          {l.rl ? <span className="rounded-full bg-sand px-1.5 font-medium text-ink-soft" title="Estimated: PRC implies issue before 1960, current term began 1980 or later">Renewed legacy</span> : null}
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
          <span className="inline-flex items-center gap-1"><TypeDot t={l.t} />{typeLabel(l.t)}</span>
          <span className="inline-flex items-center gap-1"><span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: eraColor(l.e) }} />{eraLabel(l.e)}</span>
          <span className="text-ink-faint">{l.c ? `${l.c} Co.` : l.r}</span>
          <span className="text-[10px] uppercase tracking-wide text-ink-faint">(est.)</span>
        </p>
        <div className="mt-2 w-28"><StageTracker stage={l.st} completed={!!l.x} compact /></div>
      </div>
      <Link
        href={`/lease/${encodeURIComponent(l.p)}`}
        className="relative z-10 self-center rounded-full border border-line px-2.5 py-1 text-[12px] font-medium text-ink-soft hover:border-ink-soft hover:text-ink"
        aria-label={`Open lease page for PRC ${l.p}, ${l.n}`}
      >
        Open
      </Link>
    </li>
  );
});
