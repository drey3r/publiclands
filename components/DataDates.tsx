import type { Dataset } from "@/lib/types";

const fmt = (d: string | null) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : null);

/**
 * When each dataset was pulled, and the source's own last-updated date where it publishes one.
 * `compact` for the map key; the full version (with every caveat) for the About page.
 */
const FAMILY_TITLE: Record<string, string> = { "state-oil-gas": "State oil & gas and state sovereign lands" };

export function DataDates({ datasets, compact = false }: { datasets: Dataset[]; compact?: boolean }) {
  if (!datasets?.length) return null;
  const families = [...new Set(datasets.map((d) => d.family).filter(Boolean))] as string[];
  return (
    <>
      <DateList datasets={datasets.filter((d) => !d.family)} compact={compact} />
      {families.map((f) => (
        <div key={f} className={compact ? "mt-3" : "mt-6"}>
          <p className={compact ? "mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint" : "mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-faint"}>{FAMILY_TITLE[f] ?? f}</p>
          <DateList datasets={datasets.filter((d) => d.family === f)} compact={compact} />
        </div>
      ))}
    </>
  );
}

function DateList({ datasets, compact }: { datasets: Dataset[]; compact: boolean }) {
  return (
    <ul className={compact ? "space-y-2 text-[11.5px]" : "space-y-4 text-[14px]"}>
      {datasets.map((d) => (
        <li key={d.key}>
          <p className={compact ? "font-semibold text-ink" : "font-semibold text-ink"}>{d.title}</p>
          <p className="text-ink-soft">
            Pulled {fmt(d.pulledAt) ?? "date unknown"}
            {" · "}
            {d.sourceUpdated ? <>source last updated {fmt(d.sourceUpdated)}</> : d.sourceNote ?? "the source publishes no last-updated date"}
          </p>
          {!compact && d.source && (
            <p className="text-[13px] text-ink-faint">
              {d.source}
              {d.url && (
                <>
                  {" · "}
                  <a href={d.url} className="underline underline-offset-2 hover:text-ink" target="_blank" rel="noopener">service ↗</a>
                </>
              )}
            </p>
          )}
          {(compact ? d.key === "leases" : true) && d.caveats.length > 0 && (
            <ul className={compact ? "mt-0.5 list-disc space-y-0.5 pl-4 text-ink-faint" : "mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-ink-soft"}>
              {d.caveats.map((c) => <li key={c}>{c}</li>)}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
