"use client";

import { ERAS, REGIONS, TYPES } from "@/lib/legend";
import { EMPTY, type Filters } from "@/lib/filters";
import type { TypeKey } from "@/lib/types";

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

export function FilterPanel({ f, set, counties, waterbodies, methods }: Props) {
  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink-soft hover:border-ink-soft"}`;
  return (
    <div className="space-y-4 text-sm">
      <fieldset>
        <legend className="mb-1.5 text-[12px] font-semibold text-ink">
          Type <span className="font-normal text-ink-faint" title={methods.mapType}>(estimated from lease text)</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button key={t.key} type="button" aria-pressed={f.types.includes(t.key)} className={chip(f.types.includes(t.key))} onClick={() => set({ ...f, types: toggle<TypeKey>(f.types, t.key) })} title={`From likelyType: ${t.from}`}>
              <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: t.color }} />
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-[12px] font-semibold text-ink">
          Era <span className="font-normal text-ink-faint" title={methods.mapEra}>(est. original issue decade)</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {ERAS.map((e) => (
            <button key={e.key} type="button" aria-pressed={f.eras.includes(e.key)} className={chip(f.eras.includes(e.key))} onClick={() => set({ ...f, eras: toggle(f.eras, e.key) })}>
              {e.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="f-score" className="mb-1 flex justify-between text-[12px] font-semibold text-ink">
          <span>Minimum screen score <span className="font-normal text-ink-faint" title={methods.score}>(est.)</span></span>
          <span className="tabular-nums text-ink-soft">{f.minScore || "Any"}</span>
        </label>
        <input id="f-score" type="range" min={0} max={90} step={10} value={f.minScore} onChange={(e) => set({ ...f, minScore: Number(e.target.value) })} className="w-full accent-[#56664f]" />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select id="f-region" label="Region (est.)" value={f.region} onChange={(v) => set({ ...f, region: v })} options={[...REGIONS]} />
        <Select id="f-county" label="County (est.)" value={f.county} onChange={(v) => set({ ...f, county: v })} options={counties} />
        <Select id="f-water" label="Waterbody (est.)" value={f.waterbody} onChange={(v) => set({ ...f, waterbody: v })} options={waterbodies} />
      </div>

      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-paper p-2.5">
        <input type="checkbox" checked={f.firstOnly} onChange={(e) => set({ ...f, firstOnly: e.target.checked })} className="mt-0.5 accent-[#a4553f]" />
        <span>
          <span className="font-semibold text-ink">Candidates for review only</span>
          <span className="block text-[12px] text-ink-faint">Leases whose own text, written by the state, says non-operational or abandoned. Plus case studies.</span>
        </span>
      </label>

      <button type="button" onClick={() => set({ ...EMPTY, q: f.q })} className="text-[12px] font-medium text-ink-soft underline underline-offset-2 hover:text-ink">
        Clear filters
      </button>
    </div>
  );
}

function Select({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] font-semibold text-ink">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-line bg-paper px-2 py-1.5 text-[13px] text-ink">
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
