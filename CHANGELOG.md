# Changelog

Changes to the California Public Lands Map, newest first. Data snapshots and
counts are unchanged unless an entry says otherwise.

## 2026-11-11 · A living ocean and live clouds

**Data:** counts unchanged. New: current cloud cover from Open-Meteo (NOAA HRRR and GFS models), via `/api/clouds`.

- **The ocean moves.** Faint wave marks drift slowly shoreward and breathe in and out, like the marks on an engraved
  chart. Past the continental shelf the water deepens, from the terrain tiles' own bathymetry, so Monterey Canyon and
  the basins off Southern California read faintly. Land below sea level is never tinted.
- **Live clouds.** Today's low, mid and high cloud cover over California, drawn as soft clouds with faint shadows,
  drifting gently with the wind. They fade out as you zoom in (gone by zoom 10.5). "Clouds" switch next to 3D terrain,
  on by default, with the model time. Refreshed every three hours (cached, so the weather API is called about eight
  times a day). If the weather can't be loaded, the map simply shows none.
- Animation runs at about 12 frames a second, stops while the tab is hidden, and is a still frame for readers who
  prefer reduced motion.

## 2026-11-11 · Usability: tabs, cards, map clicks

**Data:** counts unchanged (4,206 leases; categories, kinds and Worth watching groups as before). Lease titles are
rewritten from the same location text (393 leases; the full text is unchanged on each lease page).

- **Fixes.** The state sovereign lands tint now stops exactly at the basemap's coast in Baja California and Oregon
  (OpenStreetMap's coastline there, instead of Natural Earth's; no tinted sliver at any zoom). Wells group into count
  marks at zoom 11–13, so dense shores such as Huntington Beach stay readable; click a group to zoom in. The "Quick
  filters" label no longer overlaps its chips. PRC 1579: fully removed September 17, 2025 (out of the lake November
  2024, final shore section September 2025). County lines are a little darker.
- **What the records show** (Finding) on lease pages, where the research export has read the lease's Commission
  records: the outcome or condition, a short summary, the quotes with links to their PDF page, and the staff reports
  read. Every label on a lease page links to its explanation on About.
- **Left panel: one list at a time.** Tabs "Leases" and "Public lands", each with its count in view ("Oil & gas" too
  while that family is on). The tab is kept in the link (`?tab=lands`). Leases sort by screen score. Featured stories
  are gone from the panel (`?story=` links still fly in).
- **Lease cards:** the kind icon under the score; titles from the place, two lines at most, never cut mid-word;
  no data labels on list cards (they are on lease pages); the stage dots are gone from cards (the stage is on the
  lease page). **Public-land cards:** manager under the name; a bubble only when CPAD lists access as restricted or
  none; nothing for open land.
- **Quiet backgrounds:** each card has a soft band in one of five settings (mountains, desert, riverlands,
  farmlands, ocean), picked by a simple rule from the waterbody, region and name (see About).
- **Right panel in tabs:** Views (quick view, layers, 3D, quick filters) · Types (what it is, kinds, color by) · Eras ·
  Status (term, non-operational, candidates, Worth watching, score and place) · Reference (reference layers, State oil
  & gas and sovereign lands keys) · Sources (data sources and dates). The layers are one click away on every tab.
  Bigger switches and hit areas.
- **Clicking the map.** Any green area selects its unit: a dark gold outline, a popup with its name, manager and Fly
  in, and its card first in Public lands. A public-land card fits the map to the whole unit. A lease dot opens a
  popup that stays until you click elsewhere or press Esc; click the popup for the lease page. Map, popup and list
  always agree, both ways.
- **Checks:** `npm run check:ui` (tests/ui.check.mjs) covers both panels' tabs, map and card selection, popups, old
  deep links, search, Fly in, the phone sheet, and clipping at 1280×720, 1440×900, 2000×1086 and 390 px.

## 2026-11-11 · State oil & gas on public lands; state sovereign lands

**Data:** new State oil & gas datasets (pulled 2026-11-11; see Data sources and dates). Lease snapshot unchanged.
Compensatory agreements (12 leases) move from Other to Commercial and industrial (classifier 2026-11-11).

- **State oil & gas** in the layer stack (off by default; quick view "Oil & gas" turns it on and frames the coast from
  Point Conception to Huntington Beach). Its key rows are the switches:
  - Offshore lease footprints (CSLC): outline with a light fill, dashed where CSLC lists the lease as quitclaimed,
    terminated or not producing. Compensatory agreement areas 4736 and 1482 are hatched, with their own labels.
  - Former leases (CSLC's quitclaimed and terminated tables): the platform mark with a dashed ring on the 11 with a
    footprint; all 47 in a "Former state offshore oil leases" table with dates, sources and Commission records.
  - Oil and gas wells on state leases (CalGEM): brown dots by status below zoom 11, the wellhead mark from zoom 11.
    Idle and active on; plugged and other statuses off by default. Cards show CalGEM's fields, onshore or offshore
    from CalGEM's county field, and why each well is included.
  - Marine oil terminals (CSLC), cards grouped by terminal, locations approximate, no land-ownership claim.
  - Footprint cards show the status in CSLC's lease layer next to CSLC's stated status, each with its source and dates,
    and the lease's Commission records.
- **Oil and gas leases** in the lease layer (Oil & Gas Lease, Compensatory Agreement) get the platform icon, as a kind
  under Commercial and industrial. They do not count as infrastructure.
- **State sovereign lands** (off by default): tide and submerged lands from the shoreline to BOEM's Submerged Lands Act
  line, plus CSLC's 42 sovereign lake and lagoon beds (Lake Tahoe clipped to California and drawn once). Granted lands
  are hatched. Stronger tint and a thin line at statewide zoom so the 3-mile band reads at Home.
- **Worth watching** (Estimate, map-wide): this map flags it; the state does not. Each item gives a one-line reason and
  each group a count. Infrastructure leases whose state record says non-operational, abandoned, inactive or out of
  service (46) or that are past their expiration date (113); with State oil & gas on: leases CSLC lists as not producing
  (2), idle wells (206), footprints where CSLC's sources disagree (5), and former leases with a footprint and no
  Commission record on decommissioning among the records this map holds (11).
- **About:** a section on state oil and gas and state sovereign lands, and "Changes to our numbers".
- **Quick views:** the default is now "Lands and leases"; "Everything" includes the two new layers.

## 2026-11-10 · Quieter labels on list cards

- **List cards** (lease cards, the selected-lease preview, featured story cards, public-land cards) now put one
  kind of value per line with one quiet label at the end of the line (source data, estimate, finding),
  instead of a tag after every value. Lease pages and map popups keep the full Source data / Estimate /
  Finding labels.

## 2026-11-10 · Round 4: About, data dates, labels, finishing

**Data:** same snapshots. No counts changed.

- **About and methodology inside the app** (`/about`; no link out to tahoelead.com): what the map is,
  where the data comes from, how leases are categorized (the state's lease type is Source data;
  category and kind are Estimates from the text), the screen score, what "candidate for review" means
  (this map assigns it, the state does not), the 7-stage review, and a dated "Changes to our numbers"
  (Nov 10, 2026: infrastructure 842 → 758, and why).
- **Data dates.** For each dataset (CSLC leases, CPAD 2026a, granted lands, school lands, water lines):
  when it was pulled and the source's own last-updated date where it publishes one (CPAD's release name
  is its version). On the map ("Data sources and dates" in the view panel) and on the About page, with
  CSLC's caveats: approximate locations, incomplete layer, "Active" is not evidence of use.
- **Three labels, everywhere a value is shown:** Source data (the official record), Estimate (this map's
  classification or score, with its reason), Finding (an editorial determination, such as a case study or
  a site's review stage). Added where values had none: map popups, list cards, the selected-lease preview,
  featured story cards, public-land cards, quick filters, the lease key, lease page headers, case studies,
  records and the review stage.
- **Commission records** section on lease pages (Source data, newest first), empty for now. It reads
  per-lease JSON (`data/records/<source>/<PRC>.json`, or folders in `RECORDS_DIRS`) from any number of
  sources and drops duplicates by URL.
- **"Send a correction" removed.** A small **Share** on lease pages and featured stories: copy link, and
  the native share sheet on phones.

## 2026-11-10 · Classifier fixes: missed utilities, bridge mentions

**Data:** same lease snapshot. Infrastructure 744 → **758**; the 7 candidates for review are unchanged.

- **Missed utilities added.** "Overhead wire" and "wire crossing" (8 Right of Way leases) and "power
  conduit" (1) are now Power; water lines named "water transportation/transmission/supply/distribution/
  conveyance line, main or pipe" and "waterline" are now Water (5 more leases). On recreational leases
  these words stay dock accessories.
- **A mention is not a lease.** A road or bridge counts for Roads and bridges only when it is the leased
  facility, not when the text mentions damage to one (PRC 1615, a channel restoration, is now Other).
- Categories: Infrastructure 758 · Roads and bridges 181 · Shoreline protection 148 · Recreation 1,965 ·
  Public agency 696 · Commercial and industrial 214 · Other 244. Primary kind: cable 219, pipeline 139,
  water/outfall 286, power 114 (any kind: 240 / 144 / 302 / 125). Three water pipelines that read
  Pipeline now read Water (3228, 7818, 9350). Screen scores rose for the 14 new infrastructure leases.

## 2026-11-10 · Round 3 icons: kinds you can see and browse

**Data:** same lease snapshot (CSLC layer pulled 2026-11-06, 4,206 leases). Infrastructure is
unchanged at 744; screen scores and the 7 candidates for review are unchanged.

- **Two new categories** (Estimates, not part of Infrastructure): **Roads and bridges** 182
  (123 Streets and Highways leases, which were Public agency, plus 59 Right of Way leases whose text
  names a road, bridge or highway) and **Shoreline protection** 148 (Protective Structure Use:
  seawalls, riprap, bulkheads). Right of Way leases with no text, or with no road or utility words,
  stay in Other. Categories now: Infrastructure 744 · Roads and bridges 182 · Shoreline protection
  148 · Recreation 1,965 · Public agency 697 · Commercial and industrial 214 · Other 256.
- **Every infrastructure kind is kept**, not only the first. 48 infrastructure leases name more
  than one (a pipeline and a cable, say). The first named is the primary and sets the icon; the
  lease page lists all of them; filters match any. Next to water or sewer words, a bare "pipeline"
  ("sewer outfall pipeline") is the water pipe and adds no second Pipeline kind unless the text names
  oil, gas or petroleum. Leases per kind (any): cable 240, pipeline 147, water/outfall 295, power 116.
- **Icons (Set A: gold disc, ink line)** for cable, pipeline, water/outfall, power, roads and
  bridges, and shoreline protection. On the map they appear from zoom 11 at 24px; below that, dots
  and counts as before. Roads and bridges and shoreline protection sit on a lighter gold disc, one
  step quieter than infrastructure. Recreation and the other categories stay dots. In the key the
  icons are 20px. With Color by on, the disc takes that color.
- **Explore by kind:** each row of the lease key shows its statewide count and, in one click, shows
  only that kind (click again for all). Shareable: `?kind=cable`, `?kind=roads`, … Old `?type=`
  and `?cat=` links still work.
- **The classifier is one standalone module:** `lib/lease-classifier.mjs` (no imports; types in
  `lib/lease-classifier.d.ts`), so other projects can reuse it.

## 2026-11-10 · Round 3: lease data you can read

**Data:** same lease snapshot (CSLC layer pulled 2026-11-06, 4,206 leases). The classification
changed, so some estimates changed (see below). The 7 candidates for review are unchanged.

- **Categories from the state's own lease type.** Each lease now has a category (Estimate),
  grouped from the layer's TypeofLease field (Source data): Infrastructure 744 (17.7%) ·
  Recreation 1,965 (46.7%) · Public agency 820 (19.5%) · Commercial and industrial 214 (5.1%) ·
  Other 463 (11.0%). "Other" was 3,255 of 4,206 (77.4%).
- **Infrastructure type (cable, pipeline, water/outfall, power) only from the Improvements text**,
  and only for Infrastructure leases: 219 cable, 142 pipeline, 278 water/outfall, 105 power. It no
  longer reads the lease type text (every "Oil & Gas Lease" used to count as a pipeline), and
  recreational leases no longer count dock accessories ("electrical conduit", "water intake",
  dock "cables") as infrastructure. Among facility words, the first in the text wins.
- **Screen scores:** 221 leases changed (214 down, 7 up), almost all recreational docks and oil
  and gas leases losing the infrastructure points they got from accessory or lease-type words.
- **Priority by strength, not color.** Lease marks stay gold. Infrastructure is the strongest mark
  (full gold, dark outline, larger); public agency and commercial are lighter; recreation and other
  are small and pale but outlined. Color by Category, Type, Era or Score stays opt-in in the lease
  key. Power is purple when coloring by type (gold is the lease color).
- **Filters as plain questions:** What is it? · When was it authorized? · What's its status? (term
  current, expired, or no end date on file; the state's own non-operational wording; candidates for
  review). "Advanced" holds the score slider, region, county and waterbody. Filters stay in the URL
  (`cat=`, `type=`, `era=`, `status=`, `nonop=1`, …); old links still work (`type=other` now means
  the four non-infrastructure categories).
- **Labels:** the state's lease type says Source data; category and infrastructure type say
  Estimate, with the words that triggered them.

## 2026-11-10 · Round 2: greens, every park, layers you peel back (plus Round 1 adjustments)

**Data:** same CPAD snapshot (2026-11-06, CPAD 2026a, 17,930 units) and lease snapshot. The public
land tiles were rebuilt from that snapshot: 40 very small units (0–2.6 acres) that never appeared
at any zoom are now on the map, so "in view" counts for public land can be slightly higher. Every
CPAD unit is drawn from zoom 10. Audit: `docs/cpad-audit-2026-11.md` (`node scripts/audit-cpad.mjs`).

### Round 1 adjustments
- **Right panel never clips.** Compact rows, Quick view as one menu, the 3D switch in the header;
  lease key, filters and reference layers fold away. Everything common fits at 1280×720. If an
  open section runs long, the panel scrolls with a visible "More below" and a fade at the edges.
- **Home always shows all of California** with a small margin, at every window size and after any
  resize (a window grown after loading used to clip San Diego).
- **Place names stay clean.** Public land was drawn over the place names, washing out Chico,
  Salinas, Bakersfield and Los Angeles; it now sits under them. Names under a lease cluster
  slide aside or hide.
- **Outside California: a light landscape** with faint relief, lakes and major rivers, and no
  names. `?mask=flat` shows the flat version.

### Round 2
- **All public land is green; the shade is the owner level** (CPAD's agency level): State lands
  (darkest), Federal lands, Local and nonprofit (counties, cities, special districts, nonprofits,
  and CPAD's few joint, tribal and private holdings).
- **Lease marks are muted gold with a dark outline**, clusters and points. Lease colors can still
  switch to Type or Era ("Lease colors and key").
- **Layer stack in the right panel**, in this order: State lands · Lease sites · Federal lands ·
  Local and nonprofit · Reference layers. Each row is the legend and the switch, with its count.
- **Quick views:** Everything · Leases only · Public lands only · Parks only (land CPAD marks Open
  Access) · State lands only.
- **Deep links:** `?layers=state,leases,federal,local` (add `open` for open land only). Old
  `?layers=spaces,leases` links still work.
- **Access on every public space**, as source data: CPAD's own access type with a plain reading.

## 2026-11-09 · Round 1 fixes: California fills the frame, quiet outside, more names, county lines

No data changes: same CSLC lease snapshot (2026-11-06, 4,206 leases) and CPAD layer.

- **Home fills the map with California** at every window size: the state is fitted to the map area
  (clear of the top-left buttons) instead of reserving a column for the view panel. The view panel
  floats over Nevada and is capped so it ends above California's border at Home; it scrolls inside.
- **The map stays on California:** no zooming out past Home, and panning stays within the Home view
  plus a small margin. Resizing the window re-frames Home if the map was showing it.
- **Quiet outside California:** one flat neutral over neighboring land (no relief, roads or land
  cover), water still drawn as water, neighboring state lines as hairlines. No labels outside the
  state. The coastline comes from the basemap, so it stays exact. `?mask=fade|outline` still compare.
- **More California place names**, tiered by zoom: statewide shows big cities, mountain ranges, the
  ocean and the largest bays and lakes; around zoom 7 towns, main rivers, more lakes and bays, smaller
  ranges and major passes; from zoom 9 villages, the basemap's river and lake names and peaks. A short
  hand-placed list (`data/ref/ca-labels.geojson`) covers ranges, rivers, bays, lakes and passes.
  Labels slide aside or drop rather than sit under a lease mark. Park names start at zoom 10, below
  place names.
- **County lines:** faint shared county borders appear as you zoom in. "County lines" in Reference
  layers makes them stronger and names the counties.
- **List headers:** "Public spaces" and "Leases" headers no longer have the cards' Fly in and
  Visitor info buttons drawn through them while scrolling.

## 2026-11-09 · Round 1: fixes, the California frame, new layout, Fly in

No data changes: same CSLC lease snapshot (2026-11-06, 4,206 leases) and CPAD layer.

### Fixes
- **Filters overflow.** The filters now live inside the right-side view panel, which has a
  max height and scrolls internally; nothing renders above the window on laptop-height screens.
- **Search selection.** A lease picked from search (or opened by `?prc=`) is pinned at the top
  of the list.
- **Enter on a place name.** "Monterey" + Enter goes to Monterey. Enter goes to a lease only when
  the query looks like a PRC number (`1579`, `PRC 944`, `478-26`).
- **Empty and error states.** Searches with no match say so and suggest what to try;
  `?prc=<unknown>` shows a not-found notice; `/lease/<unknown>` and other bad URLs get a
  not-found page with search and "Back to map".
- **Cold load.** Counts read "Loading…" (with placeholder cards) until the data arrives,
  instead of "0 in view".
- Basemap boundary filters no longer warn on missing `admin_level` / `maritime`.

### California frame
- Everything outside California is faded to a quiet neutral, with faint neighboring-state lines
  and a California outline. One setting (`MASK_MODE` in `lib/config.ts`: `fade`, `blank`,
  `outline`); `?mask=` tries another per visit. The outline is dissolved from the committed
  county file (`data/ref/ca-outline.geojson`).
- A California-silhouette **Home** button (top left, with zoom, compass and locate) returns to
  the whole state, framed the same way every time. It replaces the "CA" text button.
- The first view is Home on desktop and phone.
- Map credits collapse to an ⓘ button so they never cover the state.
- New browser-tab icon: the same California outline (SVG that adapts to dark tabs, plus PNG,
  ICO and apple-touch-icon fallbacks).

### New layout
- **Right side of the map:** the view panel holds the layer toggles (Public spaces, Leases) with
  their counts, the 3D terrain switch, lease colors and legend, filters and reference layers.
  It collapses to a bar on small windows and moves into the bottom sheet on phones.
- **Left panel:** content only (stories, lists, lease details), wider: 360 / 420 / 480 px by
  window width. `?panelw=<px>` tries another width.

### Fly in
- "Fly in 3D" is now **Fly in**, and every lease has it: lease cards, the selected-lease preview
  (replacing "Zoom to"), lease pages (`/?prc=<n>&fly=1`) and public-space cards.
- Sites without a tuned camera get an automatic one: pitch 60°, a fixed zoom, and a bearing
  chosen from elevation tiles so terrain doesn't hide the site. PRC 1579 and 944 keep their
  hand-tuned cameras.
- Per-lease camera overrides live in `data/cameras.json` (no code change needed).
- After a fly-in, **Back to previous view** returns to where you were; Home always works.
- Reduced-motion settings jump instead of animating.
