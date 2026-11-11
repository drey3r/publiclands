import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MiniMapLazy } from "@/components/MiniMapLazy";
import { ShareButton } from "@/components/ShareButton";
import { DataLabel, FixtureBadge, ScoreRing, StageTracker, WhatDot, whatLabel } from "@/components/ui";
import { ABOUT_URL, BACK_LABEL, BACK_URL, CSLC_URL, DISCLAIMER } from "@/lib/config";
import { STAGES } from "@/lib/legend";
import { getLease, loadFull, nearby } from "@/lib/server";
import { loadRecords } from "@/lib/records";
import type { Inferred } from "@/lib/types";

type Params = { params: Promise<{ prc: string }> };

// Pre-render the stories and candidates for review; everything else renders on first request.
export function generateStaticParams() {
  const { data } = loadFull();
  const keep = new Set(["1579", "944", ...data.meta.candidates.map((t) => t.prc)]);
  return data.leases.filter((l) => keep.has(l.prc)).map((l) => ({ prc: l.prc }));
}
export const dynamicParams = true;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { prc } = await params;
  const { lease: l } = getLease(decodeURIComponent(prc));
  if (!l) return { title: "Lease not found" };
  const title = `PRC ${l.prc} · ${l.name}`;
  const description = `${l.facts.leaseOrPermit ?? "Lease"} for ${l.facts.improvements ?? "unspecified improvements"} at ${l.facts.location ?? l.name}. From the California State Lands Commission public lease layer.`;
  return { title, description, openGraph: { title, description, type: "article" }, twitter: { card: "summary_large_image", title, description } };
}

const fmtDate = (d: string | null) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : null);

export default async function LeasePage({ params }: Params) {
  const { prc } = await params;
  const { meta, lease: l } = getLease(decodeURIComponent(prc));
  if (!l) notFound();
  const pts = l.points ?? ([[l.lng, l.lat]] as [number, number][]);
  const stageIdx = STAGES.findIndex((s) => s.key === l.stage);
  const near = nearby(l);
  const cs = l.caseStudy;
  const records = loadRecords(l.prc);

  const facts: [string, string | null][] = [
    ["Lease or permit", l.facts.leaseOrPermit],
    ["State lease type", l.facts.typeOfLease],
    ["Location", l.facts.location],
    ["What's authorized there", l.facts.improvements],
    ["Current term began", fmtDate(l.facts.leaseStart)],
    ["Expires", l.facts.expiration ? fmtDate(l.facts.expiration) : "None on file"],
    ["Last Commission approval", fmtDate(l.facts.lastSlcApproval)],
    ["Minute item", l.facts.minuteItem],
    ["Record status in layer", l.facts.recordStatus],
  ];

  const inferred: [string, Inferred<unknown> | null, string?][] = [
    ["Category", l.category],
    l.kinds
      ? ["Infrastructure kinds", { ...l.kinds, value: l.kinds.value.map((v, i) => (i === 0 ? `${v} (primary)` : v)).join(" · ") }]
      : ["Infrastructure type", l.likelyType],
    ["Era (current term)", l.era],
    ["Estimated original issue", l.eraFromPrc ? { ...l.eraFromPrc, value: `~${l.eraFromPrc.year} (${l.eraFromPrc.value})` } : null],
    ["Renewed legacy lease", { ...l.renewedLegacy, value: l.renewedLegacy.value ? "Likely yes" : "No" }],
    ["Region", l.region],
    ["County", l.derived.county],
    ["Waterbody", l.derived.waterbody],
  ];

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-20 flex items-center gap-2 whitespace-nowrap border-b border-line bg-cream/95 px-3 py-2.5 backdrop-blur sm:gap-3 sm:px-4">
        <Link href={`/?prc=${encodeURIComponent(l.prc)}`} className="rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-soft">← <span className="sm:hidden">Map</span><span className="hidden sm:inline">Back to map</span></Link>
        <Link href={`/?prc=${encodeURIComponent(l.prc)}&fly=1`} className="rounded-full bg-ink px-3 py-1.5 text-[13px] font-semibold text-paper hover:bg-ink-soft">Fly in</Link>
        <HeaderLinks />
        <span className="ml-auto flex items-center gap-2">
          {meta.fixture && <FixtureBadge />}
          <ShareButton path={`/lease/${encodeURIComponent(l.prc)}`} title={`PRC ${l.prc} · ${cs?.title ?? l.name}`} />
        </span>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="font-semibold text-ink-soft">PRC {l.prc}<DataLabel kind="source" /></span>
              {l.prcFlag && <span className="rounded-full bg-sand px-2 text-ink-soft" title={l.prcFlag}>Unusual PRC: {l.prcFlag}</span>}
              {l.completed && <span><span className="rounded-full bg-sage-deep px-2 font-semibold text-paper">Completed</span><DataLabel kind="finding" /></span>}
              {l.derived.firstTarget && <span><span className="rounded-full bg-clay/15 px-2 font-semibold text-clay" title={meta.methods.candidates}>Candidate for review</span><DataLabel kind="estimate" title="Estimate: this map assigns it; the State Lands Commission does not" /></span>}
            </div>
            <h1 className="display mt-1 text-[34px] text-ink sm:text-[42px]">{cs?.title ?? l.name}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{l.facts.location}<DataLabel kind="source" /></p>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-soft">
              <span className="inline-flex items-center gap-1.5" title={`Why: ${l.category.reason}`}><WhatDot t={l.derived.typeKey} k={l.derived.categoryKey} />{whatLabel(l.derived.typeKey, l.derived.categoryKey)}<DataLabel kind="estimate" /></span>
              {l.facts.typeOfLease && <span className="inline-flex items-center">State lease type: {l.facts.typeOfLease}<DataLabel kind="source" /></span>}
              <span className="inline-flex items-center gap-2"><ScoreRing s={l.score.value} size={30} /> screen score<DataLabel kind="estimate" /></span>
            </p>
          </div>
          <div className="relative h-[260px] overflow-hidden rounded-2xl border border-line bg-sand lg:row-span-2 lg:h-auto lg:min-h-[340px]">
            <MiniMapLazy points={pts} t={l.derived.typeKey} />
            <Link href={`/?prc=${encodeURIComponent(l.prc)}&fly=1`} className="absolute bottom-3 left-3 z-10 rounded-full bg-ink/90 px-3 py-1.5 text-[12.5px] font-semibold text-paper shadow hover:bg-ink">Fly in on the full map →</Link>
          </div>

          <section className="card p-4" aria-labelledby="tracker">
            <h2 id="tracker" className="kicker mb-3">Where this site is in the 7-stage process <DataLabel kind="finding" title="Finding: this project's own record of the review, not the state's" /></h2>
            <StageTracker stage={l.stage} completed={l.completed} />
            <p className="mt-3 text-[13px] text-ink-soft">
              {l.completed ? "Every stage is done: the infrastructure was removed." : `Current stage: ${STAGES[stageIdx]?.label}. ${l.stage === "research" ? "Nobody has visited or assessed this site yet." : ""}`}
            </p>
          </section>
        </div>

        {cs && (
          <section className="mt-6 rounded-2xl border border-sage-deep/30 bg-sage-soft/30 p-5">
            <h2 className="kicker">Case study <DataLabel kind="finding" /></h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink">{cs.summary}</p>
            {cs.layerCaveat && <p className="mt-2 text-[13px] text-ink-soft"><b>Note on the data:</b> {cs.layerCaveat}</p>}
            {cs.sources.length > 0 && (
              <ul className="mt-3 space-y-1 text-[13px]">
                {cs.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener" className="text-water underline underline-offset-2">{s.label} ↗</a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {l.derived.firstTarget && (
          <section className="mt-6 rounded-2xl border border-clay/30 bg-clay/5 p-5" aria-labelledby="candidate">
            <h2 id="candidate" className="kicker">Candidate for review <DataLabel kind="estimate" title="Estimate: this map assigns it; the State Lands Commission does not" /></h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink">
              The lease&apos;s own description, written by the State Lands Commission, uses the word <b>&ldquo;{l.derived.stateText}&rdquo;</b>:
            </p>
            <blockquote className="mt-2 border-l-2 border-clay/40 pl-3 text-[14px] italic text-ink-soft">{l.facts.improvements}</blockquote>
            <p className="mt-2 text-[12px] text-ink-faint">
              Why it&apos;s listed: {meta.candidates.find((c) => c.prc === l.prc)?.reason}. This map assigns &ldquo;candidate for review&rdquo;; the State Lands Commission does not. It is a reading list, not a finding: the record may already account for these facilities.
            </p>
          </section>
        )}



        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section aria-labelledby="facts">
            <h2 id="facts" className="display text-[22px] text-ink">Facts from the lease record <DataLabel kind="source" /></h2>
            <p className="mt-1 text-[12px] text-ink-faint">Verbatim from the State Lands Commission GIS layer (whitespace cleaned).</p>
            <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-paper">
              {facts.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[150px_1fr] gap-3 px-3 py-2 text-[13px]">
                  <dt className="text-ink-faint">{k}</dt>
                  <dd className="text-ink">{v ?? <span className="text-ink-faint">Not on file</span>}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[12px] text-ink-faint">“Active” is the record status in this layer. It does not mean the infrastructure is in use.</p>
          </section>

          <section aria-labelledby="inferred">
            <h2 id="inferred" className="display text-[22px] text-ink">Our estimates <DataLabel kind="estimate" /></h2>
            <p className="mt-1 text-[12px] text-ink-faint">Estimated by this map, not stated in the record. Each shows its reason.</p>
            <dl className="mt-3 divide-y divide-line rounded-xl border border-dashed border-line bg-paper">
              {inferred.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[150px_1fr] gap-3 px-3 py-2 text-[13px]">
                  <dt className="text-ink-faint">{k}</dt>
                  <dd>
                    {v ? (
                      <>
                        <span className="text-ink">{String(v.value)}</span>
                        <span className="block text-[11px] text-ink-faint">Why: {v.reason}</span>
                      </>
                    ) : (
                      <span className="text-ink-faint">Can't tell from the record</span>
                    )}
                  </dd>
                </div>
              ))}
              <div className="grid grid-cols-[150px_1fr] gap-3 px-3 py-2 text-[13px]">
                <dt className="text-ink-faint">Screen score</dt>
                <dd>
                  <span className="text-ink">{l.score.value ?? "Not scored"}</span>
                  {l.score.why.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {l.score.why.map((w) => <span key={w} className="rounded-full bg-sand px-2 text-[11px] text-ink-soft">{w}</span>)}
                    </span>
                  )}
                  <span className="mt-1 block text-[11px] text-ink-faint">Means “read this file first”. It is not a finding about the lessee.</span>
                </dd>
              </div>
            </dl>
            <details className="mt-2 text-[12px] text-ink-soft">
              <summary className="cursor-pointer text-ink-faint">How these are estimated</summary>
              <ul className="mt-2 space-y-1.5">
                {Object.entries(meta.methods).map(([k, v]) => <li key={k}><b className="text-ink">{k}</b>: {v}</li>)}
              </ul>
            </details>
          </section>
        </div>

        <section className="mt-8" aria-labelledby="records">
          <h2 id="records" className="display text-[22px] text-ink">Records found {cs?.milestones?.length ? <DataLabel kind="finding" title="Finding: this project's reading of the records (each line names its source)" /> : null}</h2>
          {cs?.milestones?.length ? (
            <ol className="mt-3 space-y-2 border-l-2 border-sage pl-4">
              {cs.milestones.map((m) => (
                <li key={m.date + m.event} className="text-[13px]">
                  <span className="font-semibold text-ink">{m.date}</span> <span className="text-ink-soft">{m.event}</span>
                  {m.source && <span className="block text-[11px] text-ink-faint">Source: {m.source}</span>}
                </li>
              ))}
            </ol>
          ) : (
            <div className="card mt-3 p-4 text-[13px] text-ink-soft">
              <p className="text-ink">No documents gathered for this site yet.</p>
              <p className="mt-1">
                The layer points to Commission minute item {l.facts.minuteItem ?? "(none listed)"}
                {l.facts.lastSlcApproval ? ` from ${fmtDate(l.facts.lastSlcApproval)}` : ""}. Useful next records: the original lease file, the
                staff report for that meeting, and any removal or abandonment conditions.
              </p>
            </div>
          )}
        </section>

        <section className="mt-8" aria-labelledby="commission">
          <h2 id="commission" className="display text-[22px] text-ink">Commission records <DataLabel kind="source" title="Source data: State Lands Commission staff reports and meeting items" /></h2>
          {records.length ? (
            <>
              <p className="mt-1 text-[12px] text-ink-faint">Staff reports and meeting items for this lease, newest first.</p>
              <ol className="mt-3 divide-y divide-line rounded-xl border border-line bg-paper">
                {records.map((r) => (
                  <li key={r.url} className="grid grid-cols-[100px_1fr] gap-3 px-3 py-2 text-[13px]">
                    <span className="tabular-nums text-ink-faint">{fmtDate(r.date) ?? "Undated"}</span>
                    <span>
                      <a href={r.url} target="_blank" rel="noopener" className="font-medium text-water underline underline-offset-2">{r.title} ↗</a>
                      <span className="block text-[11px] text-ink-faint">
                        {[r.item != null && r.item !== "" ? `Item ${r.item}` : null, r.pages != null && r.pages !== "" ? `pages ${r.pages}` : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-ink-soft">No Commission records linked here yet.</p>
          )}
        </section>

        <section className="mt-8 rounded-2xl bg-ink p-6 text-paper" aria-labelledby="help">
          <h2 id="help" className="display text-[26px]">{l.completed ? "How this one was resolved" : "The official record"}</h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-paper/80">
            {l.completed
              ? "The sources above document how this lease's facilities were removed. Official records are with the State Lands Commission."
              : "Official records for this lease are with the State Lands Commission. How this map reads them is on the About page."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <HelpLinks />
          </div>
        </section>

        {near.length > 0 && (
          <section className="mt-8" aria-labelledby="near">
            <h2 id="near" className="display text-[20px] text-ink">Nearby lease sites</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {near.map(({ o, d }) => (
                <li key={o.prc}>
                  <Link href={`/lease/${encodeURIComponent(o.prc)}`} className="card flex items-center gap-3 p-3 hover:border-sage">
                    <ScoreRing s={o.score.value} size={30} />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-ink">{o.name}</span>
                      <span className="text-[12px] text-ink-faint">PRC {o.prc} · {whatLabel(o.derived.typeKey, o.derived.categoryKey)}<DataLabel kind="estimate" /> · {d < 1 ? "<1" : Math.round(d)} km</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-10 border-t border-line pt-4 text-[11px] leading-relaxed text-ink-faint">
          {meta.fixture && <p className="mb-1"><FixtureBadge /></p>}
          <p className="text-ink-soft">{meta.source.label}.</p>
          <p>{meta.source.completeness}</p>
          <p>Map: © OpenMapTiles © OpenStreetMap contributors via OpenFreeMap. Terrain: AWS Terrain Tiles.</p>
          <p className="mt-1 font-medium text-ink-soft">{DISCLAIMER}</p>
        </footer>
      </main>
    </div>
  );
}

function HeaderLinks() {
  const cls = "text-[13px] font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline";
  return (
    <>
      <a href={ABOUT_URL} className={`hidden sm:inline ${cls}`}>About</a>
      {BACK_URL && <a href={BACK_URL} className={cls}>{BACK_LABEL}</a>}
    </>
  );
}

function HelpLinks() {
  return (
    <>
      <a href={CSLC_URL} className="rounded-full bg-paper px-4 py-2 text-[13px] font-semibold text-ink hover:bg-sand">State Lands Commission</a>
      <a href={ABOUT_URL} className="rounded-full border border-paper/40 px-4 py-2 text-[13px] font-semibold text-paper hover:border-paper">About and methodology</a>
    </>
  );
}
