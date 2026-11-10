// Pure merge for Commission records (no Node or app imports), so it can be tested on its own.

/** One Commission record: a staff report or meeting item. Source data. */
export type CommissionRecord = { date: string | null; item?: string | number | null; title: string; pages?: string | number | null; url: string };
export type SourcedRecord = CommissionRecord & { sources: string[] };

/** Same document, different spelling of the link: lowercase scheme and host, no fragment, no trailing slash. */
export function urlKey(u: string) {
  try {
    const x = new URL(u.trim());
    x.hash = "";
    x.protocol = x.protocol.toLowerCase().replace("http:", "https:");
    return `${x.protocol}//${x.host.toLowerCase()}${x.pathname.replace(/\/+$/, "")}${x.search}`;
  } catch {
    return u.trim();
  }
}

/** Merge lists from several sources; drop duplicates by URL (keeping the first, noting every source); newest first. */
export function mergeRecords(lists: { source: string; records: CommissionRecord[] }[]): SourcedRecord[] {
  const byUrl = new Map<string, SourcedRecord>();
  for (const { source, records } of lists)
    for (const r of records) {
      if (!r?.url || !r.title) continue;
      const k = urlKey(r.url);
      const seen = byUrl.get(k);
      if (seen) {
        if (!seen.sources.includes(source)) seen.sources.push(source);
        // Fill gaps from later sources without overwriting.
        seen.date ??= r.date ?? null;
        seen.item ??= r.item ?? null;
        seen.pages ??= r.pages ?? null;
      } else byUrl.set(k, { date: r.date ?? null, item: r.item ?? null, title: r.title, pages: r.pages ?? null, url: r.url, sources: [source] });
    }
  return [...byUrl.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}
