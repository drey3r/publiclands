# Commission records (per lease)

Lease pages show a "Commission records" section (Source data) from per-lease JSON files.

- Each **source** is a subfolder here (for example `data/records/cslc-minutes/`), or a folder named in
  the `RECORDS_DIRS` env var (comma-separated, relative to the project).
- Each file is `<PRC>.json`: `[{ "date": "2019-06-27", "item": "C41", "title": "Staff report", "pages": "1-12", "url": "https://…" }]`
  (or `{ "records": [ … ] }`). `date`, `item` and `pages` may be null.
- Records from all sources are merged; the same URL (ignoring `http`/`https`, host case, `#fragment`
  and a trailing slash) is shown once. Newest first. Code: `lib/records.ts`, `lib/records-merge.ts`.

Empty for now.
