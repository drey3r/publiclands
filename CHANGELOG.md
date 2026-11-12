# Changelog

Changes to the California Public Lands Map, newest first. Data snapshots and
counts are unchanged unless an entry says otherwise.

## 2026-11-11 · The living map, made to read: sea floor, clouds, moving water

**Data:** counts unchanged (4,206 leases; categories, kinds and Worth watching groups as before). No lease or land
data was touched. Weather requests unchanged (about 3,900 locations a day of Open-Meteo's 10,000).

- **The dark blotches in Monterey Bay were the sea floor.** The depth shading was drawn straight from terrain tiles
  scaled up from zoom 8, and their coarse samples (one about every 1.9 km) showed as soft dark blobs close in. The
  sea floor is now drawn from one smoothed picture of the same bathymetry, in soft bands at 200 m, 500 m and every
  500 m after, whose edges follow the depth contours: Monterey Canyon and the basins off Southern California read
  as sea floor. The bands show shape, not a chart's detail. The shelf still keeps the plain water color.
- **Clouds that look like clouds.** Sheets and banks with ragged edges, drawn out along the wind at each height,
  in place of round puffs. The low layer has broad swells and long streaks in it, so a full deck is never a flat veil.
- **A sky that is never empty, and says what is not data.** The low cloud is now the live cover or an illustrative
  marine layer, whichever is more: a deck over the sea that touches the shore, whole along the coast and broken into
  banks further out, fullest about 6 in the morning and lightest about 3 in the afternoon (California time). The
  high layer always has a few thin wisps. Neither is data. The attribution reads "blended with an illustrative
  marine layer", the Sources tab says so, and the time by the switch now reads "Live clouds as of" (the live part).
- **A longer way down.** High cloud is passed by about zoom 7 and mid cloud by about zoom 8 (desktop); low cloud and
  fog stay, thinning, to about zoom 9.5, then the air is clear. All layers drift at 6 to 13 screen pixels a second.
- **The sea visibly moves.** The wave marks slide along the live current where they are, 5 to 14 screen pixels a
  second at every zoom (they barely moved before), and stay to zoom 11.5. The speed is chosen to be seen, not to scale.
- **Lakes and rivers visibly move, and one part of last round never worked.** The river dashes were a pattern
  sliding along lines cut into 2 km pieces; the pattern starts again with every piece, so the rivers blinked in
  step instead of flowing, and on Tahoe and Clear Lake the sovereign-lands tint covered the glints entirely. Rivers
  are now long runs heading downstream, the glints are brighter and denser with a darker edge so they read on pale
  water, and inland water is drawn right below the clouds (above tints, below county lines, names and marks). Lakes
  and the Delta move from Home; rivers from a little closer; all through zoom 12. Added: nine large reservoirs, the
  Salinas River, and the Delta's wide tidal channels (sea on the basemap, too narrow for the wave marks). Lake cells
  still fade where clusters and lease marks sit; a river run passes under the marks on it.
- **Limits:** idle is still idle where nothing moves (checked at zoom 12 away from water and at zoom 12.6 on the
  Sacramento); reduced motion gets still frames; phones keep one still cloud layer (now with the marine layer, four
  texture lookups a pixel) and no inland water. The moving-water file is now fetched once after the map first rests
  (about 400 KB compressed), not on first zoom. 27 browser checks pass.

## 2026-11-11 · Alive from the sky down: layered clouds, a sea that follows the sea, lakes and rivers

**Data:** counts unchanged (4,206 leases; categories, kinds and Worth watching groups as before). No lease or land
data was touched. New live source: Open-Meteo's Marine API (currents and swell); see DATA_SOURCES.md.

- **Clouds in three layers you come down through.** High, mid and low cloud (or fog) are drawn separately from the
  live cover, each drifting with the wind at its own height (300, 700 and 850 hPa). Zooming in passes them in turn:
  the high layer spreads, thins and is gone about a zoom level below Home, the mid layer about two, the low layer
  three and a half; panning shows a little parallax between them. However overcast the model is, the three together
  stop at 60% opacity, so an overcast sky is a veil the map reads through. County lines, names, clusters and lease
  marks stay above all of it at every zoom. Phones now draw one light, still layer (measured: no change in frame
  rate at 390 px with a 4× CPU slowdown); readers who prefer reduced motion still get clouds only if they switch them on.
- **The ocean moves the way the ocean is moving.** The wave marks drift with the surface current where they are,
  and the bands of brighter marks roll in from the swell's real direction at its real period: Open-Meteo Marine
  (Météo-France currents and swell, E.U. Copernicus Marine Service), 91 sea points, refreshed every three hours
  through the site's own `/api/ocean`, credited in the map's attribution. It is the look of the water, one value
  per degree: not a chart, not for navigation. If the data cannot be loaded the marks keep a hand-drawn drift and
  the attribution says "Sea drift: illustrative, not data". The marks are now drawn on the graphics card instead
  of a canvas redrawn twelve times a second, so the map costs less at rest than before.
- **Lakes and rivers, a little.** A faint glint on Tahoe, Clear Lake, Mono, Shasta, the Salton Sea and the Delta's
  channels; light dashes sliding downstream on the ten major rivers. Illustrative, not data. It runs in the same
  ticker as the ocean, sits below every fill, line, name and mark, and fades out cell by cell (about 2 km) wherever
  a cluster or lease mark sits on the water. Nothing is loaded for it at Home or on phones; it appears from zoom 6.4
  and is gone by zoom 12.
- **Limits:** Open-Meteo is asked for about 3,200 (clouds) + 730 (ocean) = about 3,900 locations a day of the 10,000
  allowed, whoever is using the map. Nothing redraws at rest where nothing is animating; reduced motion gets still frames.
- **Checks:** 27 pass (new: the three cloud layers on the way down, the ocean's live and fallback flow and their
  credits, lake and river shimmer under marks; changed: phones).

## 2026-11-11 · Sea-floor seams, cloud time

**Data:** counts unchanged (4,206 leases; categories, kinds and Worth watching groups as before).

- **Sea floor without seams.** From about zoom 9 the depth shading showed a dark vertical line and lighter rectangles
  off Santa Barbara and Monterey, and went flat closer in. The cause is in the terrain tiles: past zoom 9 most
  coastal tiles carry no bathymetry (the sea is a flat zero) and a few do. The depth shading now reads its own copy
  of the tiles, never deeper than zoom 8, where the ocean-wide bathymetry is complete, and scales it up. The Channel,
  Monterey Canyon and the Golden Gate shade smoothly at every zoom.
- **Clouds "as of".** With clouds on, the panel shows the weather model's time for the grid actually on the map and
  how old it is ("Clouds as of 7:30 AM PST · 55 min old"), in red past four hours. The server reports the oldest of
  its batches, and when its cache hands back a stale grid while refreshing, that answer is kept by the CDN for two
  minutes instead of three hours. The three-hour cache is unchanged.
- **Checks:** 25 pass (new: the depth layer's source, the cloud time caption).

## 2026-11-11 · Surf line, clouds over land, lessees in titles

**Data:** counts unchanged (4,206 leases; categories, kinds and Worth watching groups as before). New: lessee names for
1,137 leases (organizations only), from the State Lands Commission's meeting-item index by way of the research export
(`data/lessees.json`; see DATA_SOURCES.md). 1,137 lease titles changed; nothing else about any lease did.

- **Lease titles are "Lessee · Place"** where the Commission's index names an organization as lessee ("City of
  Petaluma · Petaluma River"), on cards, popups, search and lease pages; the place alone otherwise. Titles drop the
  entity description after the name (", a California corporation") and all but the first of several lessees. Each
  lease page gives the full name as **Source data**, with the dated Commission item it came from and a link to it.
  Names of private individuals and trusts are not shown and are not in the data file.
- **Surf line.** A soft white band along the coast, on the water side, that slowly swells and eases, with brighter
  stretches sliding along the shore. It rides the same 12-a-second ticker as the waves (no extra redraws) and is gone
  by zoom 10. One still frame on phones and for readers who prefer reduced motion.
- **Clouds over land now draw where the model has them.** Three rendering faults, not the data: a lone overcast grid
  point (valley fog is often one point wide) was smoothed to under half and drew nothing; an overcast point could
  fall in a gap of the cloud texture; and plain white had nothing to stand against on pale valley land. Cover is now
  exact at grid points, overcast always draws, and cloud tops carry a pale cool modelling on the side away from the
  light with a slightly stronger ground shadow. The cloud grid is up to three hours old by design.
- **One deployment calls Open-Meteo.** `/api/clouds` can be read from any origin, and a second deployment can set
  `NEXT_PUBLIC_CLOUDS_URL` to it. About 3,200 Open-Meteo calls a day in all (was about 6,400).
- **Checks:** 23 pass (new: the surf line's place, zoom range and redraw rate; lessee titles on card, popup and
  lease page).

## 2026-11-11 · Subtly alive: an idle map, real clouds, swell, county lines

**Data:** counts unchanged (4,206 leases; 7,458 public-land units; Worth watching 367: 46 / 113 / 2 / 206). The cloud
layer now asks Open-Meteo for about 400 points instead of 143 (terms and limits in DATA_SOURCES.md).

- **Idle means idle.** The map was redrawing about 13 times a second at rest (and far faster zoomed in), because the
  panel handed the map a new layer list on every render, the map repainted, and its "idle" event re-rendered the
  panel. Fixed: where nothing animates the map now draws nothing (0 redraws, 0% CPU at rest; it was a full core in the
  test browser). While waves or clouds are in view the map redraws 12 times a second, as designed.
- **Clouds that look like clouds.** Bright, soft white, drawn on the graphics card: feathered billows where the
  model has low and mid cloud, thin streaks for high cloud, the faintest shadow, no gray. They sit above every land
  color, tint and the outside-California mask, and below county and state lines, every name, count, lease mark,
  popup and the selected outline. The weather grid now reaches from 138°W to 102°W and 23°N to 50°N (every 3°), with
  every 0.5° over California, so nothing stops at the state line or in the ocean, and valley fog and Sierra cloud
  land where the model has them. They drift slowly with the real wind at cloud height (850 hPa for low cloud, 300 hPa
  for high). Zooming in, they thin and spread outward as if you descend through them, and are gone by zoom 7.6. On by
  default on desktop; off on phones and for readers who prefer reduced motion (the "Clouds" switch stays, and gives a
  still frame there).
- **Swell.** The wave marks are a little stronger at statewide and regional zoom, and a slow band of brighter marks
  now travels shoreward every seven seconds, so the ocean reads as gentle swell. Still gone by zoom 11.
- **County lines** are a fine dark line, on by default. "County lines" and "County names" are separate switches in
  the Reference tab; switching the lines off is kept in the link (`?counties=0`; names: `?cnames=1`).
- **Checks:** `npm run check:ui` now also covers the cloud layer's order against every land layer and mark, its
  defaults on desktop, phone and reduced motion, the fade by zoom 8, the county switches and their link, and that
  the map draws nothing at rest.

## 2026-11-11 · A living ocean, and clouds on request

**Data:** counts unchanged (4,206 leases; 7,458 public-land units; Worth watching 367: 46 / 113 / 2 / 206). New,
off by default: current cloud cover from Open-Meteo (NOAA HRRR and GFS models), via `/api/clouds`.

- **Sea floor.** Past the continental shelf the water deepens faintly, from the terrain tiles' own bathymetry, so
  Monterey Canyon and the basins off Southern California read. The shelf keeps its color, and so does the State
  sovereign lands tint: the depth sits over it as a light ink, and the lake beds, granted-lands hatch and SLA line stay
  on top. Land below sea level is never tinted.
- **Wave marks.** Faint engraved-chart wave strokes drift slowly shoreward on the open ocean. They fade out by zoom 11,
  before lease icons appear. One still frame for readers who prefer reduced motion, and on phones (the animation cost
  frame rate there).
- **Clouds (off by default).** A "Clouds" switch next to 3D terrain draws today's low, mid and high cloud cover over
  California, fading out by zoom 10.5. Nothing is requested until it is turned on; the answer is cached for three
  hours. If the weather can't be loaded, the map shows none. Credit: "Weather data by Open-Meteo.com" (CC BY 4.0), in
  the map's attribution while clouds are on. Terms and limits in DATA_SOURCES.md.
- Animation runs at about 12 frames a second (clouds 4), stops while the tab is hidden and past the zooms where it has
  faded. Browser checks cover the clouds switch, a failed cloud load, reduced motion and the phone still frame.

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
