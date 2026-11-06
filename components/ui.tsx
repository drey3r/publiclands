import { STAGES, TYPE_COLOR, TYPE_LABEL, eraOf } from "@/lib/legend";
import type { StageKey, TypeKey } from "@/lib/types";

export function TypeDot({ t, className = "" }: { t: TypeKey; className?: string }) {
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`} style={{ background: TYPE_COLOR[t] }} />;
}

/** Score shown as a ring that fills with the score, never as a verdict. */
export function ScoreRing({ s, size = 34 }: { s: number | null; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} title={s == null ? "No screen score" : `Screen score ${s} of 100 (estimate)`}>
      <svg width={size} height={size} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ddd3c1" strokeWidth="3" />
        {s != null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#56664f" strokeWidth="3" strokeDasharray={`${(c * s) / 100} ${c}`} strokeLinecap="round" />}
      </svg>
      <span className="absolute text-[11px] font-semibold tabular-nums text-ink">{s ?? "–"}</span>
      <span className="sr-only">{s == null ? "No score" : `Screen score ${s} of 100, estimated`}</span>
    </span>
  );
}

export function Est({ children = "est." }: { children?: React.ReactNode }) {
  return <span className="ml-1 rounded border border-line px-1 text-[10px] font-medium uppercase tracking-wide text-ink-faint">{children}</span>;
}

export function eraLabel(decade: number | null) {
  if (decade == null) return "Era unknown";
  return `${decade}s`;
}

export function typeLabel(t: TypeKey) {
  return TYPE_LABEL[t];
}

export function eraColor(decade: number | null) {
  return eraOf(decade)?.color ?? "#cfc8b8";
}

export function StageTracker({ stage, completed, compact = false }: { stage: StageKey; completed: boolean; compact?: boolean }) {
  const cur = STAGES.findIndex((s) => s.key === stage);
  return (
    <ol className={`grid grid-cols-7 ${compact ? "gap-0.5" : "gap-1"}`} aria-label={`Project stage: ${STAGES[cur]?.label}${completed ? " (completed)" : ""}`}>
      {STAGES.map((s, i) => {
        const done = i < cur || (completed && i === cur);
        const now = i === cur && !completed;
        return (
          <li key={s.key} className="flex flex-col items-center gap-1 text-center" aria-current={now ? "step" : undefined}>
            <span
              className={`flex items-center justify-center rounded-full border text-[10px] font-semibold ${compact ? "h-2 w-full rounded-sm" : "h-7 w-7"} ${
                done ? "border-sage-deep bg-sage-deep text-paper" : now ? "border-earth bg-paper text-earth ring-2 ring-earth/25" : "border-line bg-paper text-ink-faint"
              }`}
            >
              {!compact && (done ? "✓" : i + 1)}
            </span>
            {!compact && <span className={`text-[10px] leading-tight ${now ? "font-semibold text-ink" : "text-ink-faint"}`}>{s.label}</span>}
            {compact && <span className="sr-only">{s.label}{done ? " done" : now ? " current" : ""}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function FixtureBadge({ label = "Fixture data" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-clay/60 bg-clay/10 px-2 py-0.5 text-[11px] font-semibold text-clay" title="Development sample, not the full dataset">
      ◌ {label}
    </span>
  );
}
