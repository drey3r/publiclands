"use client";

import { useState } from "react";
import { CATS, ERAS, REGIONS, TYPES } from "@/lib/legend";
import { EMPTY, STATUSES, type Filters } from "@/lib/filters";
import type { CatKey, TypeKey } from "@/lib/types";
import { DataLabel } from "./ui";

type Props = {
  f: Filters;
  set: (f: Filters) => void;
  counties: string[];
  waterbodies: string[];
  methods: Record<string, string>;
};

function toggle<T>(arr: T[], v: T) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

const INFRA_TYPES = TYPES.filter((t) => t.key !== "other");

/** Lease filters as three plain questions; score, region, county and waterbody under "Advanced". */
export function FilterPanel({ f, set, counties, waterbodies, methods }: Props) {
  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink-soft hover:border-ink-soft"}`;
  const pre1960: Filters = { ...EMPTY, q: f.q, eras: ["pre1940", "1940s", "1950s"], types: ["cable", "pipeline", "outfall", "power"] };
  const isPre = JSON.stringify(f) === JSON.stringify(pre1960);
  const isCand = JSON.stringify(f) === JSON.stringify({ ...EMPTY, q: f.q, firstOnly: true });
  const advancedOn = f.minScore > 0 || !!f.region || !!f.county || !!f.waterbody;
  const [advanced, setAdvanced] = useState(advancedOn);
  const infraOn = f.cats.includes("infra") || f.types.length > 0;
  const q = (text: string, label: React.ReactNode) => (
    <legend className="mb-1.5 text-[12.5px] font-semibold text-ink">
      {text} {label}
    </legend>
  );

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick filters">
        <button type="button" aria-pressed={isPre} className={chip(isPre)} onClick={() => set(isPre ? { ...EMPTY, q: f.q } : pre1960)} title="Cable, pipeline, water and power leases with an estimated issue date before 1960">
          Pre-1960 infrastructure
        </button>
        <button type="button" aria-pressed={isCand} className={chip(isCand)} onClick={() => set(isCand ? { ...EMPTY, q: f.q } : { ...EMPTY, q: f.q, firstOnly: true })}>
          Candidates for review
        </button>
      </div>

      <fieldset>
        {q("What is it?", <DataLabel kind="estimate" title={methods.category} />)}
        <div className="flex flex-wrap gap-1.5">
          {CATS.map((c) => {
            const on = c.key === "infra" ? infraOn : f.cats.includes(c.key);
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                className={chip(on)}
                title={c.note}
                onClick={() =>
                  set(c.key === "infra" && infraOn ? { ...f, cats: f.cats.filter((x) => x !== "infra"), types: [] } : { ...f, cats: toggle<CatKey>(f.cats, c.key) })
                }
              >
                {c.short}
              </button>
            );
          })}
        </div>
        {infraOn && (
          <div className="mt-2 border-l-2 border-line pl-2.5">
            <p className="mb-1 text-[11.5px] text-ink-soft">
              Which kind? <DataLabel kind="estimate" title={methods.likelyType} />
            </p>
            <div className="flex flex-wrap gap-1.5">
              {INFRA_TYPES.map((t) => (
                <button key={t.key} type="button" aria-pressed={f.types.includes(t.key)} className={chip(f.types.includes(t.key))} title={`From the Improvements text: ${t.from}`} onClick={() => set({ ...f, types: toggle<TypeKey>(f.types, t.key) })}>
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-ink-faint">None picked: all infrastructure.</p>
          </div>
        )}
      </fieldset>

      <fieldset>
        {q("When was it authorized?", <DataLabel kind="estimate" title={methods.eraFromPrc} />)}
        <div className="flex flex-wrap gap-1.5">
          {ERAS.map((e) => (
            <button key={e.key} type="button" aria-pressed={f.eras.includes(e.key)} className={chip(f.eras.includes(e.key))} onClick={() => set({ ...f, eras: toggle(f.eras, e.key) })}>
              {e.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-ink-faint">Original issue decade, estimated from the PRC number (renewals reset the start date).</p>
      </fieldset>

      <fieldset>
        {q("What's its status?", <DataLabel kind="source" title="From the lease layer's expiration date and Improvements text" />)}
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button key={s.key} type="button" aria-pressed={f.status.includes(s.key)} className={chip(f.status.includes(s.key))} title={s.note} onClick={() => set({ ...f, status: toggle(f.status, s.key) })}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-2 space-y-1.5">
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={f.nonop} onChange={(e) => set({ ...f, nonop: e.target.checked })} className="mt-0.5 accent-[#a4553f]" />
            <span className="text-[12.5px] text-ink">The state&apos;s text says non-operational, abandoned, inactive or out of service</span>
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={f.firstOnly} onChange={(e) => set({ ...f, firstOnly: e.target.checked })} className="mt-0.5 accent-[#a4553f]" />
            <span className="text-[12.5px] text-ink">
              Candidates for review only <DataLabel kind="estimate" title={methods.candidates} />
              <span className="block text-[11px] text-ink-faint">This map assigns it; the state does not. Plus case studies.</span>
            </span>
          </label>
        </div>
      </fieldset>

      <section className="rounded-lg border border-line">
        <button type="button" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced} aria-controls="f-advanced" className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-ink">
          <span>
            Advanced
            {advancedOn && <span className="ml-1.5 text-[11px] font-medium text-ink-faint">on</span>}
          </span>
          <span aria-hidden className="text-ink-faint">{advanced ? "▾" : "▸"}</span>
        </button>
        {advanced && (
          <div id="f-advanced" className="space-y-3 px-2.5 pb-2.5">
            <div>
              <label htmlFor="f-score" className="mb-1 flex justify-between text-[12px] font-semibold text-ink">
                <span>Minimum screen score <DataLabel kind="estimate" title={methods.score} /></span>
                <span className="tabular-nums text-ink-soft">{f.minScore || "Any"}</span>
              </label>
              <input id="f-score" type="range" min={0} max={90} step={10} value={f.minScore} onChange={(e) => set({ ...f, minScore: Number(e.target.value) })} className="w-full accent-[#56664f]" />
            </div>
            <Select id="f-region" label="Region" value={f.region} onChange={(v) => set({ ...f, region: v })} options={[...REGIONS]} title={methods.region} />
            <Select id="f-county" label="County" value={f.county} onChange={(v) => set({ ...f, county: v })} options={counties} title={methods.county} />
            <Select id="f-water" label="Waterbody" value={f.waterbody} onChange={(v) => set({ ...f, waterbody: v })} options={waterbodies} title={methods.waterbody} />
          </div>
        )}
      </section>

      <button type="button" onClick={() => set({ ...EMPTY, q: f.q })} className="text-[12px] font-medium text-ink-soft underline underline-offset-2 hover:text-ink">
        Clear filters
      </button>
    </div>
  );
}

function Select({ id, label, value, onChange, options, title }: { id: string; label: string; value: string; onChange: (v: string) => void; options: string[]; title?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] font-semibold text-ink">
        {label} <DataLabel kind="estimate" title={title} />
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-line bg-paper px-2 py-1.5 text-[13px] text-ink">
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
