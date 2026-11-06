"use client";

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

const ACCESS_STYLE: Record<string, string> = {
  "Open Access": "bg-sage-deep text-paper",
  "Restricted Access": "bg-gold/25 text-ink",
  "No Public Access": "bg-sand text-ink-soft",
};

export function PlaceCard({ p, selected, onSelect }: { p: Place; selected: boolean; onSelect: (p: Place) => void }) {
  return (
    <li className={`card relative p-3 ${selected ? "border-ink/60 bg-white" : "hover:border-sage"}`}>
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-sage-deep">{p.kind ?? "Public land"}</span>
        {p.fixture && <span className="rounded-full border border-dashed border-clay/60 px-1.5 text-clay">fixture outline</span>}
      </div>
      <h3 className="text-[15px] font-semibold leading-snug text-ink">
        <button type="button" onClick={() => onSelect(p)} className="text-left after:absolute after:inset-0 after:content-['']">{p.name}</button>
      </h3>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-[12px] text-ink-soft">
        <dt className="text-ink-faint">Managed by</dt>
        <dd>{p.manager ?? "Unknown"}</dd>
        <dt className="text-ink-faint">Can you visit?</dt>
        <dd>
          <span className={`rounded-full px-1.5 text-[11px] font-semibold ${ACCESS_STYLE[p.access ?? ""] ?? "bg-sand text-ink-soft"}`}>
            {p.access === "Open Access" ? "Yes, open to the public" : p.access === "Restricted Access" ? "Yes, with restrictions" : p.access ?? "Unknown"}
          </span>
        </dd>
      </dl>
      {p.visit && <p className="mt-1.5 text-[12px] text-ink-soft">{p.visit}</p>}
      {p.url && (
        <a href={p.url} target="_blank" rel="noopener" className="relative z-10 mt-1.5 inline-block text-[12px] font-medium text-water underline underline-offset-2">
          Visitor info ↗
        </a>
      )}
    </li>
  );
}
