"use client";

// State oil & gas family: its key (rows are switches), the cards for a footprint, well or terminal,
// the former-leases table, and State sovereign lands' key. Every value carries its label.
import Link from "next/link";
import { GLYPH, MARK_GLYPH } from "@/lib/icons";
import {
  FP, LABEL, MARK, SR61, WATCH_GROUPS, WATCH_LABEL, WELL_GROUPS, actionLabel, compLabel, fmtDate, wellWhy,
  type FormerLease, type Footprint, type OgPart, type OgRecord, type Terminal, type WatchKey, type Well, type WellGroup,
} from "@/lib/oilgas";
import { MarkIcon } from "./KindIcon";
import { DataLabel, QuietLabel } from "./ui";
import { SOV } from "./ogLayers";

const PAGE_NAME: Record<string, string> = {
  "https://www.slc.ca.gov/oil-gas/leases/lease-information/": "CSLC lease information page",
  "https://www.slc.ca.gov/oil-gas/leases/": "CSLC oil and gas leases page",
};
const pageName = (u: string) => PAGE_NAME[u.trim()] ?? u.trim();
const urls = (s: string | null) => (s ? s.split(/;\s*/).map((x) => x.trim()).filter(Boolean) : []);
const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener" className="underline decoration-ink-faint/50 underline-offset-2 hover:text-ink">{children}</a>
);

// ---------------------------------------------------------------- key (legend as control)
function Switch({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`relative h-[12px] w-5 shrink-0 rounded-full transition-colors ${on ? "bg-ink" : "bg-line"}`}>
      <span className={`absolute top-[2px] h-[8px] w-[8px] rounded-full bg-paper transition-[left] ${on ? "left-[10px]" : "left-[2px]"}`} />
    </span>
  );
}
function Row({ on, onClick, mark, label, count, title }: { on: boolean; onClick: () => void; mark: React.ReactNode; label: React.ReactNode; count?: number | string; title?: string }) {
  return (
    <li>
      <button type="button" role="switch" aria-checked={on} onClick={onClick} title={title} className={`flex w-full items-center gap-2 rounded-md px-1 py-[3px] text-left hover:bg-sand ${on ? "" : "opacity-55"}`}>
        <span className="inline-flex w-5 shrink-0 justify-center">{mark}</span>
        <span className="min-w-0 flex-1 leading-tight">{label}</span>
        {count != null && <span className="tabular-nums text-ink-faint">{typeof count === "number" ? count.toLocaleString() : count}</span>}
        <Switch on={on} />
      </button>
    </li>
  );
}
export function FootprintSwatch({ dashed = false, hatch = false }: { dashed?: boolean; hatch?: boolean }) {
  return (
    <svg aria-hidden width="20" height="14" viewBox="0 0 20 14" className="shrink-0">
      <defs>
        <pattern id="og-h" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke={FP.hatch} strokeWidth="1.5" /></pattern>
      </defs>
      <rect x="1" y="1" width="18" height="12" rx="1.5" fill={hatch ? "url(#og-h)" : FP.fill} fillOpacity={hatch ? 1 : dashed ? 0.25 : 0.45} stroke={hatch ? "none" : FP.line} strokeWidth="1.3" strokeDasharray={dashed ? "3 2" : undefined} />
    </svg>
  );
}
export function WellDot({ g, size = 9 }: { g: WellGroup; size?: number }) {
  const w = WELL_GROUPS.find((x) => x.key === g)!;
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: w.hollow ? "transparent" : w.color, opacity: w.opacity, border: `1.2px solid ${w.color}` }} />;
}

export function OgKey({ parts, setPart, counts }: { parts: Record<OgPart, boolean>; setPart: (p: OgPart, on: boolean) => void; counts: { footprints: number; comp: number; former: number; formerAll: number; terminals: number; wells: Record<WellGroup, number> } }) {
  const t = (p: OgPart) => () => setPart(p, !parts[p]);
  return (
    <div className="space-y-2 text-[12px] text-ink">
      <p className="text-[11px] text-ink-faint">Click a row to show or hide it. Marks from zoom 11; dots below that.</p>
      <ul className="-mx-1">
        <Row on={parts.footprints} onClick={t("footprints")} mark={<FootprintSwatch />} label={LABEL.footprints} count={counts.footprints} title="Outline with a light fill. Source data: CSLC Offshore_Lease_Polygons" />
      </ul>
      <ul className="ml-6 space-y-0.5 text-[11.5px] text-ink-soft">
        <li className="flex items-center gap-2"><FootprintSwatch dashed /> Quitclaimed, terminated or not producing (CSLC)</li>
        <li className="flex items-center gap-2"><FootprintSwatch hatch /> Compensatory agreement areas, PRC 4736 and 1482 ({counts.comp} parcels)</li>
      </ul>
      <ul className="-mx-1">
        <Row on={parts.former} onClick={t("former")} mark={<MarkIcon glyph={GLYPH.oilgas} st={MARK.former} size={20} />} label={LABEL.former} count={`${counts.former} of ${counts.formerAll}`} title="Former leases with a public footprint are marked on it; all are in the table" />
        <Row on={parts.terminals} onClick={t("terminals")} mark={<MarkIcon glyph={MARK_GLYPH.terminal} st={MARK.terminal} size={20} />} label={LABEL.terminals} count={counts.terminals} />
      </ul>
      <p className="flex items-center pt-1 text-[11.5px] font-semibold text-ink-soft">{LABEL.wells}<DataLabel kind="source" title="Source data: CalGEM WellSTAR. Which wells are included is this map's selection (Estimate)" /></p>
      <ul className="-mx-1">
        {WELL_GROUPS.map((g) => (
          <Row key={g.key} on={parts[`well-${g.key}`]} onClick={t(`well-${g.key}`)} mark={<span className="flex items-center gap-1"><WellDot g={g.key} /></span>} label={g.label} count={counts.wells[g.key]} title={g.note} />
        ))}
      </ul>
      <p className="flex items-center gap-1.5 text-[11px] text-ink-faint"><MarkIcon glyph={MARK_GLYPH.well} st={MARK["well-idle"]} size={20} /> Wellhead mark from zoom 11 (stronger for idle, faint for plugged).</p>
      <p className="text-[11px] text-ink-faint">A well drilled from shore may have its surface location on private land. Oil and gas lease points (the state&apos;s lease types Oil &amp; Gas Lease and Compensatory Agreement) are a kind under Commercial and industrial in the lease key.</p>
    </div>
  );
}

export function WatersSwatch() {
  return <span aria-hidden className="inline-block h-3.5 w-4 shrink-0 rounded-[3px]" style={{ background: SOV.tint, border: `1.2px solid ${SOV.line}` }} />;
}
export function WatersKey() {
  return (
    <div className="space-y-1.5 text-[12px] text-ink">
      <p className="flex items-start gap-2"><WatersSwatch /><span>{LABEL.waters}</span></p>
      <p className="flex items-center gap-2 text-ink-soft">
        <svg aria-hidden width="16" height="14" viewBox="0 0 16 14" className="shrink-0"><defs><pattern id="sv-h" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke={SOV.granted} strokeWidth="1.3" /></pattern></defs><rect x="1" y="1" width="14" height="12" rx="2" fill={SOV.tint} /><rect x="1" y="1" width="14" height="12" rx="2" fill="url(#sv-h)" opacity="0.7" /></svg>
        Granted to a local trustee (CSLC granted lands layer; incomplete)
      </p>
      <p className="flex items-center gap-2 text-ink-soft"><span aria-hidden className="h-0 w-4 shrink-0 border-t-[1.5px] border-dashed" style={{ borderColor: SOV.line }} />{LABEL.sla}</p>
      <p className="text-[11px] text-ink-faint">
        Ocean: the basemap&apos;s OpenStreetMap shoreline to BOEM&apos;s Submerged Lands Act line. Lakes and lagoons: {LABEL.waterbodies} River beds are not shown. Not a legal boundary.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- records
export function CommissionRecords({ records, empty }: { records: OgRecord[]; empty?: React.ReactNode }) {
  if (!records.length) return empty ? <>{empty}</> : null;
  return (
    <div className="mt-2">
      <p className="flex items-center text-[12px] font-semibold text-ink">Commission records<DataLabel kind="source" /></p>
      <ul className="mt-1 space-y-1 text-[12px] text-ink-soft">
        {records.map((r) => (
          <li key={r.url}>
            <A href={r.url}>{[r.date ? fmtDate(r.date) : null, r.item, r.pages ? `${/^p/.test(String(r.pages)) ? "" : "pp. "}${r.pages}` : null].filter(Boolean).join(" · ")}</A>
            <span className="block text-[11.5px] text-ink-faint">{r.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
export function recordsFor(f: Footprint, all: Record<string, OgRecord[]>): OgRecord[] {
  const seen = new Set<string>();
  const out: OgRecord[] = [];
  for (const k of [f.recordsKey, ...f.leaseNums]) for (const r of all[k] ?? []) if (!seen.has(r.url)) { seen.add(r.url); out.push(r); }
  return out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

// ---------------------------------------------------------------- cards
function Card({ kicker, title, onClose, onZoom, children }: { kicker: React.ReactNode; title: React.ReactNode; onClose: () => void; onZoom?: () => void; children: React.ReactNode }) {
  return (
    <section aria-label="Selected" className="mb-4 rounded-2xl border border-ink/50 bg-white p-3.5 shadow-[0_4px_16px_rgba(43,42,38,0.08)]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{kicker}</div>
          <h2 className="text-[16px] font-semibold leading-snug text-ink">{title}</h2>
        </div>
        {onZoom && <button type="button" onClick={onZoom} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] font-medium text-ink-soft hover:border-ink-soft">Zoom to</button>}
        <button type="button" onClick={onClose} className="rounded-full px-1.5 text-ink-faint hover:text-ink" aria-label="Close">✕</button>
      </div>
      <div className="mt-2 space-y-1.5 text-[12.5px] leading-snug text-ink-soft">{children}</div>
    </section>
  );
}
function Field({ k, v, label, title }: { k: string; v: React.ReactNode; label?: "source" | "estimate" | "finding"; title?: string }) {
  if (v == null || v === "") return null;
  return (
    <p className="flex items-baseline gap-1">
      <span className="min-w-0 flex-1"><span className="text-ink-faint">{k}: </span><span className="text-ink">{v}</span></span>
      {label && <QuietLabel kind={label} title={title} />}
    </p>
  );
}
function Reasons({ reasons }: { reasons: { key: WatchKey; reason: string }[] }) {
  if (!reasons.length) return null;
  return (
    <div className="rounded-lg border border-dashed border-ink-faint/50 bg-cream/60 p-2 text-[12px]">
      <p className="flex items-center font-semibold text-ink">Worth watching<DataLabel kind="estimate" title={`Estimate: ${WATCH_LABEL}`} /></p>
      <ul className="mt-0.5 list-disc pl-4">{reasons.map((r) => <li key={r.key}>{r.reason}</li>)}</ul>
      <p className="mt-0.5 text-[11px] text-ink-faint">{WATCH_LABEL}</p>
    </div>
  );
}

export function FootprintCard({ f, parcels, records, reasons, onClose, onZoom }: { f: Footprint; parcels: Footprint[]; records: OgRecord[]; reasons: { key: WatchKey; reason: string }[]; onClose: () => void; onZoom: () => void }) {
  const comp = f.group === "compensatory";
  const base = f.recordsKey;
  const stSources = urls(f.cslc_stated_status_source);
  return (
    <Card kicker={comp ? "Compensatory agreement area" : f.former ? "Former state oil lease" : "Offshore oil and gas lease footprint"} title={`PRC ${comp ? base : f.prc}`} onClose={onClose} onZoom={onZoom}>
      {comp && <p className="text-ink">{compLabel(f.prc)}</p>}
      {comp && f.prc.startsWith("4736") && (
        <ul className="space-y-0.5">
          {parcels.map((p, i) => (
            <li key={`${p.prc}-${i}`} className="flex items-baseline gap-1"><span className="flex-1"><span className="text-ink-faint">Parcel {p.prc.replace("4736-", "")}: </span><span className="text-ink">{p.parcelClass}</span></span><QuietLabel kind="source" title="Source data: the parcel's Notes field in CSLC's Offshore_Lease_Polygons" /></li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-cream/70 p-2">
        <div>
          <p className="text-[11px] text-ink-faint">Status in CSLC&apos;s lease layer</p>
          <p className="font-semibold text-ink">{f.layerStatus ?? "None"}</p>
          <QuietLabel kind="source" title="Source data: Lease_Stat in CSLC's Offshore_Lease_Polygons" />
        </div>
        <div>
          <p className="text-[11px] text-ink-faint">CSLC&apos;s stated status</p>
          <p className="font-semibold text-ink">{f.cslc_stated_status}</p>
          <QuietLabel kind="source" />
        </div>
        <p className="col-span-2 text-[11.5px] text-ink-faint">
          {stSources.map((u, i) => <span key={u}>{i > 0 && "; "}<A href={u}>{pageName(u)}</A></span>)}
          {f.source_last_updated && `, last updated ${f.source_last_updated}`}{f.source_read && `, read ${f.source_read}`}.
        </p>
      </div>
      {f.exactDate && <Field k={`${actionLabel(f.former)} on`} v={<>{fmtDate(f.exactDate.date)} (<A href={f.exactDate.url}>{f.exactDate.label}</A>{f.exactDate.sourceUpdated ? `, last updated ${f.exactDate.sourceUpdated}` : ""}{f.exactDate.read ? `, read ${f.exactDate.read}` : ""})</>} label="source" />}
      {f.staff_report_61_status_2022 && <Field k="Staff Report 61 (April 2022)" v={<>{f.staff_report_61_status_2022}{f.staff_report_61_page ? <> (<A href={SR61}>p. {f.staff_report_61_page}</A>)</> : null}</>} label="source" />}
      {f.note && (
        <p className="flex items-baseline gap-1">
          <span className="flex-1">{f.note}{urls(f.note_sources).length > 0 && <span className="text-[11.5px] text-ink-faint"> Sources: {urls(f.note_sources).map((u, i) => <span key={u}>{i > 0 && ", "}<A href={u}>{i + 1}</A></span>)}</span>}</span>
          <QuietLabel kind="finding" title="Finding: this project's reading of CSLC's sources, quoted as written; where they disagree, both are shown and neither is picked" />
        </p>
      )}
      {f.leaseNums.length > 0 && (
        <p className="flex items-baseline gap-1">
          <span className="flex-1"><span className="text-ink-faint">Lease page: </span>{f.leaseNums.map((n, i) => <span key={n}>{i > 0 && ", "}<Link href={`/lease/${encodeURIComponent(n)}`} className="font-semibold text-ink underline underline-offset-2">PRC {n}</Link></span>)}</span>
          <QuietLabel kind={f.joinEstimate ? "estimate" : "source"} title={f.joinEstimate ? "Estimate: footprint PRC 392 is matched to lease 5-1938-392 (CSLC lists it as E-392)" : "Source data: the same PRC in CSLC's lease layer"} />
        </p>
      )}
      <Reasons reasons={reasons} />
      <CommissionRecords records={records} empty={!f.note ? <p className="text-ink-faint">No Commission records on this map for this lease.</p> : null} />
    </Card>
  );
}

export function WellCard({ w, reasons, onClose, onZoom }: { w: Well; reasons: { key: WatchKey; reason: string }[]; onClose: () => void; onZoom: () => void }) {
  return (
    <Card kicker={LABEL.wells} title={`Well ${[w.leaseName, w.wellNumber].filter(Boolean).join(" ")}`} onClose={onClose} onZoom={onZoom}>
      <Field k="API" v={w.api} label="source" />
      <Field k="Lease name" v={w.leaseName} label="source" />
      <Field k="Well status" v={w.wellStatus} label="source" />
      <Field k="Well type" v={w.wellType} label="source" />
      <Field k="Operator" v={w.operator} label="source" />
      <Field k="Field" v={w.field} label="source" />
      <Field k="County" v={w.county ? `${w.county}${w.offshore ? " (offshore, per CalGEM's county field)" : " (onshore, per CalGEM's county field)"}` : null} label="source" title="Source data: CalGEM's CountyName ('… Offshore' means offshore)" />
      <Field k="Directionally drilled" v={w.directional === "Y" ? "Yes" : w.directional === "N" ? "No" : w.directional} label="source" />
      <Field k="Location source" v={w.gisSource} label="source" title="Source data: CalGEM's GISSource field" />
      {!w.offshore && <p className="rounded-md bg-sand/70 px-2 py-1 text-[12px] text-ink">{LABEL.privateSurface}</p>}
      <div>
        <p className="flex items-center text-[12px] font-semibold text-ink">Why this well is included<DataLabel kind="estimate" title="Estimate: this map's selection of wells on state leases" /></p>
        <ul className="mt-0.5 list-disc pl-4">{wellWhy(w).map((s) => <li key={s}>{s}</li>)}</ul>
      </div>
      <Reasons reasons={reasons} />
      <p className="text-[11px] text-ink-faint">CalGEM WellSTAR. CalGEM publishes no last-updated date for this layer.</p>
    </Card>
  );
}

export function TerminalCard({ berths, caveat, onClose, onZoom }: { berths: Terminal[]; caveat: string; onClose: () => void; onZoom: () => void }) {
  const t = berths[0];
  return (
    <Card kicker={LABEL.terminals} title={t.terminal ?? `Marine oil terminal ${t.wo}`} onClose={onClose} onZoom={onZoom}>
      <Field k="Place" v={[t.city, t.county ? `${t.county} County` : null].filter(Boolean).join(", ")} label="source" />
      <Field k={`Berths (terminal ${t.wo})`} v={berths.map((b) => b.berth).join(", ")} label="source" title="Source data: WO_ and WO_Berth_ID in CSLC's Marine_Oil_Terminals" />
      <p className="text-[11.5px] text-ink-faint">{caveat}</p>
      <p className="text-[11.5px] text-ink-faint">{LABEL.terminalCaveat}</p>
    </Card>
  );
}

// ---------------------------------------------------------------- former leases table
export function FormerTable({ former, records, onShow }: { former: FormerLease[]; records: Record<string, OgRecord[]>; onShow: (prc: string) => void }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-paper text-[12px]" aria-label="Former state offshore oil leases">
      {former.map((l) => {
        const recs = records[l.prc] ?? l.records ?? [];
        return (
          <li key={l.prc} className="px-2.5 py-1.5">
            <div className="flex items-baseline gap-2">
              <span className="w-12 shrink-0 font-semibold text-ink">{l.prc}</span>
              <span className="min-w-0 flex-1 text-ink-soft">
                {actionLabel(l.action)} {fmtDate(l.date)}
                {l.lessee && <> · {l.lessee}</>}
                {l.acres != null && l.acres !== "" && <> · {l.acres} acres</>}
              </span>
              {l.hasFootprint ? (
                <button type="button" onClick={() => onShow(l.prc)} className="shrink-0 rounded-full border border-line px-2 text-[11.5px] font-medium text-ink-soft hover:border-ink-soft">Show</button>
              ) : (
                <span className="shrink-0 text-[11px] text-ink-faint">no public geometry found</span>
              )}
            </div>
            <p className="pl-14 text-[11px] text-ink-faint">
              {l.dateSources.map((d, i) => <span key={d.url + i}>{i > 0 && "; "}<A href={d.url}>{d.label}</A>{d.date !== l.date ? ` (${fmtDate(d.date)})` : ""}</span>)}
              {l.note && <> · {l.note}</>}
            </p>
            {recs.length > 0 && (
              <details className="pl-14">
                <summary className="cursor-pointer text-[11.5px] text-ink-soft">Commission records ({recs.length})</summary>
                <CommissionRecords records={recs} />
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- Worth watching summary
export function WatchSummary({ counts, ogOn }: { counts: Record<WatchKey, number>; ogOn: boolean }) {
  return (
    <section aria-label="Worth watching" className="mb-4 rounded-2xl border border-dashed border-ink-faint/60 bg-paper p-3">
      <h2 className="flex items-center text-[14px] font-semibold text-ink">Worth watching<DataLabel kind="estimate" title={`Estimate: ${WATCH_LABEL}`} /></h2>
      <p className="text-[12px] text-ink-soft">{WATCH_LABEL} It means &ldquo;look here first&rdquo;, not that anything is wrong. Each item says why.</p>
      <ul className="mt-1.5 space-y-0.5 text-[12px]">
        {WATCH_GROUPS.filter((g) => ogOn || !g.og).map((g) => (
          <li key={g.key} className="flex items-baseline gap-2"><span className="min-w-0 flex-1 text-ink-soft">{g.label}</span><span className="tabular-nums font-semibold text-ink">{counts[g.key].toLocaleString()}</span></li>
        ))}
      </ul>
      {!ogOn && <p className="mt-1 text-[11px] text-ink-faint">Turn on State oil &amp; gas for its four groups.</p>}
    </section>
  );
}
