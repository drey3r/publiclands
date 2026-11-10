# Changelog

Changes to the California Public Lands Map, newest first. Data snapshots and
counts are unchanged unless an entry says otherwise.

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
