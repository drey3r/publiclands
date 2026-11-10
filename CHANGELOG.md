# Changelog

Changes to the California Public Lands Map, newest first. Data snapshots and
counts are unchanged unless an entry says otherwise.

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
