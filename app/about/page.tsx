import type { Metadata } from "next";
import Link from "next/link";
import { DataDates } from "@/components/DataDates";
import { DataLabel } from "@/components/ui";
import { BACK_LABEL, BACK_URL, CSLC_URL, DISCLAIMER, REPO_URL } from "@/lib/config";
import { CATS, STAGES, TYPES } from "@/lib/legend";
import { loadFull } from "@/lib/server";

export const metadata: Metadata = {
  title: "About and methodology",
  description: "What the California Public Lands Map shows, where its data comes from, and how leases are categorized and screened.",
};

/** What each stage of the review means. */
const STAGE_NOTE: Record<string, string> = {
  research: "Read the lease record, the Commission's staff reports and any removal conditions.",
  "site-visit": "Go and look at what is there, from public land or the water.",
  assess: "Work out what remains, its condition, and who is responsible for it.",
  share: "Publish what was found, with the records behind it.",
  "engage-gov": "Bring it to the State Lands Commission and other agencies with the evidence.",
  plan: "Agree on a removal or restoration plan with the responsible parties.",
  execute: "The work is done and confirmed.",
};

export default function AboutPage() {
  const { data } = loadFull();
  const { meta, leases } = data;
  const n = (k: string) => leases.filter((l) => l.derived.categoryKey === k).length;
  const infra = n("infra");
  const og = (k: string) => (meta.datasets.find((d) => d.key === k)?.count ?? 0).toLocaleString();
  const compN = leases.filter((l) => l.facts.typeOfLease === "Compensatory Agreement").length;
  const kindAny = (t: string) => leases.filter((l) => l.derived.categoryKey === "infra" && l.derived.typeKeys.includes(t as never)).length;

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-cream/95 px-4 py-2.5 backdrop-blur">
        <Link href="/" className="rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-soft">← Back to map</Link>
        <nav className="flex gap-3 text-[13px] font-medium text-ink-soft">
          <a href="#data" className="hover:text-ink">Data</a>
          <a href="#oil-gas" className="hover:text-ink">Oil &amp; gas</a>
          <a href="#methodology" className="hover:text-ink">Methodology</a>
          <a href="#changes" className="hover:text-ink">Changes</a>
          {BACK_URL && <a href={BACK_URL} className="hover:text-ink">{BACK_LABEL}</a>}
        </nav>
      </header>

      <main className="prose-about mx-auto max-w-3xl px-4 pb-16 pt-8 text-[15px] leading-relaxed text-ink-soft">
        <h1 className="display text-[36px] text-ink">About this map</h1>
        <p className="mt-3">
          This map shows the leases the California State Lands Commission has issued on state-owned land, mostly the beds of
          rivers, lakes, bays and the ocean, together with public land from the California Protected Areas Database and the
          Commission&apos;s own reference layers. It is a reading aid for public records: each lease links to what the state&apos;s
          layer says about it and to this map&apos;s estimates, each with its reason.
        </p>
        <p className="mt-3">
          It is not an official record. For official records, contact the <a href={CSLC_URL} className="text-water underline underline-offset-2">State Lands Commission</a>.
        </p>

        <h2 id="labels" className="display mt-10 scroll-mt-16 text-[26px] text-ink">How to read the labels</h2>
        <ul className="mt-3 space-y-2">
          <li id="label-source" className="scroll-mt-16"><DataLabel kind="source" /> <b className="text-ink">Source data</b>: copied from the official record, here the Commission&apos;s public layers.</li>
          <li id="label-estimate" className="scroll-mt-16"><DataLabel kind="estimate" /> <b className="text-ink">Estimate</b>: this map&apos;s classification or score. Every estimate shows its reason.</li>
          <li id="label-finding" className="scroll-mt-16"><DataLabel kind="finding" /> <b className="text-ink">Finding</b>: an editorial determination by this project, such as a case study or a site&apos;s review stage, with its sources. &ldquo;What the records show&rdquo; on a lease page is a finding too: what this project read in the Commission&apos;s staff reports and minute items, with each quote and its page.</li>
        </ul>

        <h2 id="data" className="display mt-10 scroll-mt-16 text-[26px] text-ink">Where the data comes from</h2>
        <p className="mt-2">When each dataset was pulled for this map, and the source&apos;s own last-updated date where it publishes one.</p>
        <div className="mt-4"><DataDates datasets={meta.datasets} /></div>

        <h2 id="oil-gas" className="display mt-10 scroll-mt-16 text-[26px] text-ink">State oil and gas on public lands</h2>
        <p className="mt-2">
          California owns the tide and submerged lands along its coast, out to three nautical miles, and the beds of its navigable
          lakes and rivers. It holds them in trust for the public. The State Lands Commission leases rights on these lands,
          including rights to produce oil and gas. When a lease or a well stops producing, what is left on or under these lands can
          become a cleanup job. This part of the map shows the state&apos;s own records about those leases and wells, each with its source.
        </p>
        <ul className="mt-3 space-y-2">
          <li><b className="text-ink">Offshore lease footprints</b> (CSLC, {og("og-footprints")} polygons). Each shows the status in CSLC&apos;s lease layer and CSLC&apos;s stated status from its oil and gas pages side by side; where they differ, both are shown and the map does not pick one. Footprints are dashed where CSLC lists the lease as quitclaimed, terminated or not producing. The compensatory agreement areas are hatched: PRC 4736 (1973) includes private &ldquo;Leased Lands&rdquo; parcels per CSLC&apos;s polygon notes, so it is not all state land; PRC 1482 (1955) shows the State&apos;s interest in three slough parcels.</li>
          <li><b className="text-ink">Former leases</b>: the 47 leases CSLC lists as quitclaimed or terminated, from its own tables. Exact dates come from CSLC&apos;s lease information page where it gives one; the table&apos;s date or period is kept as a second source. Eleven have a public footprint; the others have none, and the map does not invent one.</li>
          <li><b className="text-ink">Oil and gas wells on state leases</b> (CalGEM, {og("og-wells")} wells). This map selects them (an <b className="text-ink">estimate</b>): the surface location is inside a production-lease footprint, CalGEM&apos;s lease name names a CSLC lease, or CalGEM lists the State Lands Commission as operator. Onshore or offshore is CalGEM&apos;s own county field. A well drilled from shore may have its surface location on private land.</li>
          <li><b className="text-ink">Marine oil terminals</b> (CSLC, {og("og-terminals")} berths). Locations are approximate; the map makes no land-ownership claim for them.</li>
          <li><b className="text-ink">Oil and gas leases</b> in the lease layer (the state&apos;s lease types Oil &amp; Gas Lease and Compensatory Agreement) have their own icon, as a kind under Commercial and industrial. They are not counted as infrastructure.</li>
          <li><b className="text-ink">Commission records</b> on footprint cards and in the former-leases table are staff reports and meeting records that name the lease, newest first, as <b className="text-ink">source data</b>.</li>
        </ul>

        <h3 className="mt-6 text-[18px] font-semibold text-ink">State sovereign lands (public trust)</h3>
        <p className="mt-2">
          Tide and submerged lands, managed by the State Lands Commission, or by local trustees where the state has granted them. The
          ocean area runs from the shoreline to BOEM&apos;s Submerged Lands Act line. For the shoreline the map uses the basemap&apos;s own
          coastline (OpenStreetMap, via OpenFreeMap), so the shaded area meets the coast exactly where the map draws it; it is a
          display line, not the legal ordinary high water mark. Lakes and lagoons come from CSLC&apos;s Significant Lands inventory (42
          records; Lake Tahoe and Goose Lake clipped to California). Where CSLC&apos;s granted lands layer covers an area, it is hatched.
        </p>
        <p className="mt-2">
          Two gaps: the grant boundaries for Los Angeles, Long Beach, San Francisco and Oakland are not published, so those ports are
          shaded like other state lands without the granted hatch; and river beds are not shown. None of this is a legal boundary.
        </p>

        <h3 className="mt-6 text-[18px] font-semibold text-ink">Worth watching</h3>
        <p className="mt-2">
          A map-wide filter, labeled <b className="text-ink">estimate</b>: this map flags it; the state does not. It means &ldquo;look here
          first&rdquo;, not that anything is wrong, and every item says why. Infrastructure leases whose state record says non-operational,
          abandoned, inactive or out of service (quoting the state&apos;s word), and infrastructure leases past their expiration date. With
          State oil &amp; gas on: leases CSLC lists as not producing, idle wells, footprints where CSLC&apos;s sources disagree, and former
          leases with a footprint where none of the Commission records this map holds is about decommissioning.
        </p>

        <h2 id="methodology" className="display mt-10 scroll-mt-16 text-[26px] text-ink">Methodology</h2>

        <h3 className="mt-6 text-[18px] font-semibold text-ink">How leases are categorized</h3>
        <p className="mt-2">
          The state&apos;s lease type (the layer&apos;s TypeofLease field) is <b className="text-ink">source data</b>. The category and the
          infrastructure kind are <b className="text-ink">estimates</b> by this map: the category groups the state&apos;s lease type, and
          the text of the lease (the Improvements field) can move a lease into Infrastructure or Roads and bridges.
        </p>
        <ul className="mt-3 space-y-1.5">
          {CATS.map((c) => (
            <li key={c.key}><b className="text-ink">{c.label}</b> ({n(c.key).toLocaleString()}): {c.note}.</li>
          ))}
        </ul>
        <p className="mt-3">
          Infrastructure kinds come from the Improvements text only: {TYPES.filter((t) => t.key !== "other").map((t) => `${t.label.toLowerCase()} (${kindAny(t.key)})`).join(", ")}.
          A lease can have more than one kind; the one named first is its primary kind and sets its icon. Utility words on a
          recreational lease (a dock&apos;s electrical conduit or water intake) do not count.
        </p>
        <details className="mt-3 text-[13px]">
          <summary className="cursor-pointer text-ink-faint">The exact rules</summary>
          <ul className="mt-2 space-y-1.5">
            <li><b className="text-ink">Category</b>: {meta.methods.category}</li>
            <li><b className="text-ink">Infrastructure kinds</b>: {meta.methods.likelyType}</li>
            <li><b className="text-ink">Era</b>: {meta.methods.eraFromPrc}</li>
            <li><b className="text-ink">County</b>: {meta.methods.county}</li>
          </ul>
        </details>

        <h3 className="mt-6 text-[18px] font-semibold text-ink">The screen score</h3>
        <p className="mt-2">
          {meta.methods.score} It is an <b className="text-ink">estimate</b>; each lease page lists what went into its score.
        </p>

        <h3 className="mt-6 text-[18px] font-semibold text-ink">Candidates for review</h3>
        <p className="mt-2">
          {meta.methods.candidates} There are {meta.counts.candidates} now.
        </p>
        <p className="mt-2 text-ink">
          This map assigns &ldquo;candidate for review&rdquo;; the State Lands Commission does not. It means &ldquo;read this file first&rdquo;,
          not that anything is wrong: the record may already account for these facilities.
        </p>

        <h3 className="mt-6 text-[18px] font-semibold text-ink">The 7-stage review</h3>
        <p className="mt-2">Each lease page shows where its site is in this process. Most sites have not been looked at yet and are at Research.</p>
        <ol className="mt-3 space-y-1.5">
          {STAGES.map((s, i) => (
            <li key={s.key}><b className="text-ink">{i + 1}. {s.label}</b>: {STAGE_NOTE[s.key]}</li>
          ))}
        </ol>

        <h2 id="changes" className="display mt-10 scroll-mt-16 text-[26px] text-ink">Changes to our numbers</h2>
        <ul className="mt-3 space-y-3">
          <li>
            <b className="text-ink">November 11, 2026.</b> Compensatory agreements ({compN} leases, the state&apos;s lease type
            Compensatory Agreement) moved from Other to Commercial and industrial, where oil and gas leases already were; both now have
            the oil and gas icon.
          </li>
          <li>
            <b className="text-ink">November 10, 2026.</b> We narrowed the infrastructure classifier, so the infrastructure count went from
            842 to {infra.toLocaleString()}. The earlier count included leases where a utility word was an accessory (a dock&apos;s
            electrical conduit, a marina&apos;s fuel dock) or came from the lease type (every oil and gas lease counted as a pipeline);
            it now reads only the lease&apos;s description and needs words that name a facility, which also found water and power
            lines the old word list missed.
          </li>
        </ul>

        <footer className="mt-12 border-t border-line pt-4 text-[12px] text-ink-faint">
          <p className="font-medium text-ink-soft">{DISCLAIMER}</p>
          <p className="mt-1">
            <a href={REPO_URL} className="underline underline-offset-2 hover:text-ink">Source code</a> · Map: © OpenMapTiles © OpenStreetMap contributors via OpenFreeMap. Terrain: AWS Terrain Tiles.
          </p>
        </footer>
      </main>
    </div>
  );
}
