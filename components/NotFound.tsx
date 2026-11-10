"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

/** Branded not-found page with a search box and a way back to the map. */
export function NotFound() {
  const path = usePathname() ?? "";
  const router = useRouter();
  const m = path.match(/^\/lease\/([^/]+)/);
  const prc = m ? decodeURIComponent(m[1]) : null;
  const [q, setQ] = useState("");
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="flex items-center gap-3 border-b border-line bg-cream/95 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="California Public Lands Map">
          <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-sage-deep text-[14px] font-bold text-paper">CA</span>
          <span className="display hidden text-[17px] text-ink sm:inline">California Public Lands Map</span>
        </Link>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-16">
        <p className="kicker">Not found</p>
        <h1 className="display mt-2 text-[34px] text-ink">{prc ? `There's no lease PRC ${prc} on this map` : "This page isn't on the map"}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          {prc
            ? "This map shows the State Lands Commission's public lease layer. The number may be mistyped, or the lease may have ended or not be mapped."
            : "The link may be old or mistyped."}{" "}
          Search for a PRC number or a place, or go back to the map.
        </p>
        <form
          className="mt-6 flex gap-2"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const t = q.trim();
            router.push(t ? `/?find=${encodeURIComponent(t)}` : "/");
          }}
        >
          <label htmlFor="nf-q" className="sr-only">Search PRC number or place name</label>
          <input
            id="nf-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="PRC number or place (e.g. 1579, Monterey)"
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 text-[14px] text-ink placeholder:text-ink-faint focus:border-ink-soft focus:outline-none"
          />
          <button type="submit" className="rounded-full bg-ink px-5 text-[14px] font-semibold text-paper hover:bg-ink-soft">Search</button>
        </form>
        <Link href="/" className="mt-4 inline-block rounded-full border border-line bg-paper px-4 py-2 text-[14px] font-medium text-ink hover:border-ink-soft">← Back to map</Link>
      </main>
    </div>
  );
}
