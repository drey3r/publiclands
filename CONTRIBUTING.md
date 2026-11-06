# Contributing

Thanks for helping. This map is only as good as its sources, so corrections are as welcome as code.

## Corrections to a lease

Open an issue titled `PRC <number>: <what's wrong>`. Every lease page has a **Send a correction or source** button that
does this for you. Please include a public source (a Commission staff report, minute item or other record) when you can.
Facts on lease pages come straight from the CSLC lease layer. If the layer itself is wrong, the fix belongs with the
[State Lands Commission](https://www.slc.ca.gov/). We'll still note it.

## Content rules

- **Facts are quoted, estimates are labeled.** Anything not stated in a source is shown as an estimate, with its reason.
- **Sourced, neutral language.** Describe what a record says. No accusations, no characterizations of lessees or agencies.
- **Candidates for review** come from a rule over the state's own lease text (see `scripts/sync/leases.mjs`). To add one
  by hand, add it to `data/curated.json` → `candidates.include` with a reason a reader can check.
- **Case studies** (`data/curated.json` → `caseStudies`) need a public source for every statement.

## Code

```bash
npm install
npm run dev          # http://localhost:3100
npm run typecheck
npm run build
```

- Next.js 15 (App Router), React 19, Tailwind 4, MapLibre GL 6. No paid services or API keys.
- `scripts/sync-data.mjs` runs before `dev` and `build`. It turns the committed snapshots in `data/` into the files the
  app serves. Estimates are computed in `scripts/sync/leases.mjs`.
- Keep pull requests focused, and check the map at phone width (390px) and with reduced motion on.
- Don't commit secrets, `.env` files or generated output (`public/data/`, `data/generated/`, `data/cache/`).

## Refreshing data

```bash
npm run fetch:leases   # CSLC lease layer → data/cslc/leases-YYYY-MM-DD.geojson
npm run fetch:layers   # CPAD + CSLC land layers → data/layers/
```

Both scripts page politely (at most one request per second) and cache raw pages in `data/cache/`. Commit the new snapshot
in its own pull request, with the pull date in the title.
