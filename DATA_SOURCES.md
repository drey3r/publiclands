# Data sources

Everything the map shows comes from the public sources below. The build reads only the snapshots committed in `data/`.
The deployed site never calls the State Lands Commission. The only network requests a visitor's browser makes are for
basemap tiles, terrain tiles and place search, and, while Clouds is on, the site's own `/api/clouds` (see Clouds
below).

> **Not legal or survey data.** Positions, boundaries and dates are as published by each source, generalized for display.
> For official records, contact the [California State Lands Commission](https://www.slc.ca.gov/).

## California State Lands Commission (CSLC)

| Layer | Used for | Snapshot |
|---|---|---|
| [Leases](https://services3.arcgis.com/5aaQCuq3e4GRvkFG/arcgis/rest/services/CA_State_Lands_Commission_Leases/FeatureServer/0) (point layer) | Lease sites, facts on each lease page | `data/cslc/leases-YYYY-MM-DD.geojson` |
| [Granted Lands](https://services3.arcgis.com/5aaQCuq3e4GRvkFG/arcgis/rest/services/Granted_Lands/FeatureServer/0) | "CSLC granted lands" layer | `data/layers/granted.geojson` |
| [School Lands (public)](https://services3.arcgis.com/5aaQCuq3e4GRvkFG/arcgis/rest/services/School_Lands_Public/FeatureServer/0) | "CSLC school lands" layer | `data/layers/school.geojson` |
| Administrative maps: [low water line](https://services3.arcgis.com/5aaQCuq3e4GRvkFG/arcgis/rest/services/AdminMapsPublic/FeatureServer/1), [high water line](https://services3.arcgis.com/5aaQCuq3e4GRvkFG/arcgis/rest/services/AdminMapsPublic/FeatureServer/2) | "High & low water lines" layer | `data/layers/waterlines.geojson` |
| Commission staff reports, for example [Staff Report 29, Feb 28, 2023](https://slcprdwordpressstorage.blob.core.windows.net/wordpressdata/2023/02/02-28-23_29.pdf) | Cited case-study facts (`data/curated.json`) | linked, not copied |

**Terms.** The CSLC publishes these as public GIS services and states no license. The
[data.gov record for the lease layer](https://catalog.data.gov/dataset/ca-state-lands-commission-leases-75f4a) says the
data is not suitable for any legal purpose and that the Commission assumes no liability for its use. CSLC describes the
lease layer as incomplete, because leases are added, modified and terminated on an ongoing basis. "Active" in the
`RecordStatus` field is the layer's record status. It is not evidence that a facility is in use.

**What we keep.** Lease fields `OBJECTID`, `RecordStatus`, `LeaseNum`, `GeneralLocation`, `LeaseorPermit`, `TypeofLease`,
`LeaseStartDate`, `LeaseExpirationDate`, `SLCApprovalDate`, `MinuteItem`, `Improvements`, and the point location. Account
fields (`Creator`, `Editor`) are not downloaded. Land layers keep a few descriptive fields, and their polygons are
generalized for the web.

**Attribution:** "California State Lands Commission". For school lands: "California State Lands Commission, Land
Management Division".

## State oil & gas and state sovereign lands

Snapshots are taken by `scripts/fetch-state-oil-gas.ts` (byte-exact pages with sha256 manifests in `data-archive/`, never
committed or deployed; at least 1 second between requests) and built by `scripts/data/build_state_oil_gas.py` into
`data/state-oil-gas/` (see `scripts/data/README.md`). Pull dates and the sources' own last-updated dates are in
`data/state-oil-gas/index.json` and on the map under "Data sources and dates".

| Source | Used for | Built file |
|---|---|---|
| CSLC [Offshore_Lease_Polygons](https://services3.arcgis.com/5aaQCuq3e4GRvkFG/ArcGIS/rest/services/Offshore_Lease_Polygons/FeatureServer/0) | Offshore lease footprints (34), compensatory agreement areas | `offshore-leases.geojson` |
| CSLC [oil and gas leases page](https://www.slc.ca.gov/oil-gas/leases/) and [lease information page](https://www.slc.ca.gov/oil-gas/leases/lease-information/) | Stated statuses, the 47 former (quitclaimed or terminated) leases and their dates | `offshore-leases.geojson`, `former-leases.json` |
| CSLC [Marine_Oil_Terminals](https://services3.arcgis.com/5aaQCuq3e4GRvkFG/ArcGIS/rest/services/Marine_Oil_Terminals/FeatureServer/0) | Marine oil terminals (59 berths) | `marine-oil-terminals.geojson` |
| CalGEM [WellSTAR wells](https://gis.conservation.ca.gov/server/rest/services/WellSTAR/Wells/MapServer/0) | Oil and gas wells on state leases (1,738; this map's selection) | `state-lease-wells.geojson` |
| BOEM [OCS boundary lines, Submerged Lands Act boundary](https://services7.arcgis.com/G5Ma95RzqJRPKsWL/arcgis/rest/services/OCS_BOEM_Offshore_Boundary_Lines/FeatureServer/8) | Seaward edge of state sovereign lands | `sla-boundary.geojson`, `sla-outside.geojson` |
| CSLC [Significant_Lands_Waterbodies](https://services3.arcgis.com/5aaQCuq3e4GRvkFG/ArcGIS/rest/services/Significant_Lands_Waterbodies/FeatureServer/0) | Sovereign lake and lagoon beds (42 records, clipped to California) | `sovereign-waterbodies.geojson` |
| Commission staff reports and meeting records named in `data/reference/*.csv` | Commission records on footprint cards, the former-leases table and lease pages | `data/records/cslc-oil-gas-study/` |
| [Natural Earth](https://www.naturalearthdata.com/) 1:10m land (public domain) | Only to stop the state-waters tint at the Oregon and Mexico lines, beyond the map's pan range | `data/ref/ne-land-near-ca.geojson` |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) coastline via the Overpass API (© OpenStreetMap contributors, ODbL), fetched 2026-11-11 | Land in Baja California and Oregon within the map's pan range, so the state-waters tint stops exactly at the basemap's coast (`scripts/data/osm_land_near_ca.py`) | `data/ref/osm-land-near-ca.geojson` |

The shoreline of the state-waters area inside California is the basemap's own (OpenStreetMap coastline via
OpenFreeMap), so it meets the coast where the map draws it; it is a display line, not the ordinary high water mark.
Grant boundaries for Los Angeles, Long Beach, San Francisco and Oakland are not published; river beds are not shown.

## California Protected Areas Database (CPAD)

- Source: [CPAD units by agency level](https://gis.cnra.ca.gov/arcgis/rest/services/Boundaries/CPAD_AgencyLevel/MapServer/1),
  California Natural Resources Agency service. Snapshot in `data/layers/access.pmtiles`, which
  [tippecanoe](https://github.com/felt/tippecanoe) builds from the downloaded GeoJSON.
- © GreenInfo Network. Free to redistribute and use, with citation:
  "California Protected Areas Database (CPAD), www.calands.org", plus the release. Provided as is; see the CPAD disclaimer
  at [calands.org](https://www.calands.org/).
- Fee-owned protected lands only; easements are not included. "Can you visit?" comes from CPAD's `ACCESS_TYP` field.
  Geometry is generalized (about 50 m) and small slivers are dropped: display only.

## Basemap: OpenFreeMap and OpenStreetMap

- Vector tiles from [OpenFreeMap](https://openfreemap.org/) (OpenMapTiles schema). No key needed.
- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the
  [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/). Tile schema
  © [OpenMapTiles](https://openmaptiles.org/).
- The style in `lib/mapStyle.ts` is original to this project.

## Terrain: AWS Terrain Tiles

- [Terrain Tiles on the Registry of Open Data on AWS](https://registry.opendata.aws/terrain-tiles/) (Terrarium encoding),
  used for hillshade, 3D terrain and the faint sea-floor depth offshore (their bathymetry, from ETOPO1 and GMTED; the
  water deepens only below 150 m, so the shelf and the State sovereign lands tint keep their color). The main map
  draws the sea floor from one small copy of that bathymetry (`data/ref/ocean-depth.png`, `scripts/make-depth.mjs`:
  the zoom 7 tiles around California, smoothed once), in soft bands at 200 m, 500 m and every 500 m after. ETOPO1 has
  one sample about every 1.9 km: the bands show the shape of the canyons and basins, not a chart's detail.
- Required attribution, shown on the map: data sources include USGS 3DEP, SRTM, GMTED2010 and ETOPO1. See the
  [attribution list](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) for the full set.

## Place search: Photon

- [Photon](https://photon.komoot.io/) geocoder by komoot, built on OpenStreetMap data (ODbL). Search is limited to
  California's bounding box. The public endpoint is free for fair use. Self-host Photon if you expect heavy traffic.

## Lessee names

- `data/lessees.json` (`npm run sync:lessees`, from this project's research export `leases.public.json`, schema 3):
  for 1,137 of the 4,206 leases, the current or last lessee as named by the State Lands Commission, with the dated
  Commission item it came from (date, item number, link to the item's PDF). It is the Name field of the newest dated
  item in the Commission's [meeting-item index](https://www.slc.ca.gov/meetings/) whose lease number matches.
  **Source data**, shown on each lease page with that citation.
- **Organizations only.** Names of private individuals and trusts (1,393 leases) are not in the file at all, name or
  source item; 1,676 leases have no item naming a lessee.
- Lease titles read "Lessee · Place". The title shortens the name (drops ", a California corporation" and the like,
  and all but the first of several lessees); the lease page gives it exactly as indexed.
- Caveat: the newest indexed item can lag a later assignment or name change.

## Clouds: Open-Meteo (on by default)

- [Open-Meteo](https://open-meteo.com/) forecast API, "best match" model (in the US, NOAA HRRR and GFS): current low,
  mid and high cloud cover, and the wind at 850, 700 and 300 hPa (which way the low, mid and high cloud drift). The
  three covers are drawn as three layers, passed one after another as the reader zooms in; phones draw one light
  layer from the three together, still. Two sets
  of points: every 0.5° over California and its coastal waters (278 points), and every 3° from 138°W to 102°W and
  23°N to 50°N (130 points: the open Pacific, Oregon, Nevada, Arizona, northern Mexico), about 400 in all. The site's
  server route `app/api/clouds/route.ts` asks Open-Meteo, merges them into one 0.5° grid and caches the answer for
  three hours (data cache and CDN), so Open-Meteo is called about eight times a day per deployment however many people
  use the map. The reader's browser never calls Open-Meteo. Clouds are on by default; for readers who prefer reduced
  motion, nothing is requested until "Clouds" is switched on. If the request fails, the map
  draws no clouds.
- **Terms** (checked 2026-11-10: [terms](https://open-meteo.com/en/terms), [pricing](https://open-meteo.com/en/pricing),
  [licence](https://open-meteo.com/en/licence)): the free API is for non-commercial use only. Open-Meteo lists
  "non-profit websites or apps that do not have subscriptions or advertising" as non-commercial, which fits this site.
  If the site ever carries ads or subscriptions, it needs a paid API key. Limits: under 10,000 calls a day, 5,000 an
  hour, 600 a minute, per IP; Open-Meteo warns that apps on hosts like Vercel may be limited earlier. Each location in
  a request counts as a call: about 400 × 8 = 3,200 calls a day, under the daily limit; one refresh is 400 calls in a
  minute, under the minute limit. Only one deployment calls Open-Meteo: a second deployment sets
  `NEXT_PUBLIC_CLOUDS_URL` to the public map's `/api/clouds` (CDN-cached, readable from any origin) and its pages
  read the clouds from there.
- **License:** data CC BY 4.0. Required credit with a link wherever the data is shown: the map's attribution reads
  "Clouds: Weather data by Open-Meteo.com (CC BY 4.0, drawn as clouds) blended with an illustrative marine layer
  and a few illustrative patches over land" while the clouds are on. The smoothing, noise texture and drift are ours, so the clouds show where cover is
  reported, not the shape of real clouds.
- **Not data: the marine layer, the patches over land and the high wisps.** So the sky is never empty, the low cloud
  is the live cover or an illustrative marine layer, whichever is more at each point: a light deck over the sea that
  reaches the shore (found from the sea mask, `data/ref/ocean-mask.png`), broken into banks with clear water between
  them so the ocean always reads through, at its fullest about 6 in the morning and lightest about 3 in the
  afternoon, California time. Over land, where the live cover has none, there are a few soft, very light patches of
  low cloud, and the high layer always has a few thin wisps. None of these is a forecast or an observation. The map's Sources tab says so, and "Live clouds as of"
  gives the model time of the live part only. Low cloud and fog stay, thinning, to about zoom 9.5; the mid layer is
  passed by about zoom 8 and the high layer by about zoom 7 (on a desktop screen).


## Ocean currents and swell: Open-Meteo Marine (moving wave marks)

- [Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api): the surface current (speed and the
  direction it heads) at 91 sea points, every 1° from 128°W to the coast and 31°N to 43°N, and the swell (direction
  it comes from, period, height), averaged into one coast-wide swell. Open-Meteo's default models here, checked
  2026-11-11 by asking for each model by name and comparing: currents from Météo-France / Mercator Ocean SMOC (0.08°,
  tides included, updated daily), swell from Météo-France MFWAM (0.08°, updated every 12 hours); both "generated using
  E.U. Copernicus Marine Service Information".
- **What the map does with it:** the ocean's wave marks slide along the current where they are, 5 to 14 screen
  pixels a second at every zoom to 11.5 (faster where the current is; a speed chosen to be seen, not to scale), and
  the bands of brighter marks roll in from the swell's direction at its period. The marks thin out toward the
  coast, so the shoreline is not busy. It
  is the look of the water, not a chart: one value per degree, smoothed between. Open-Meteo's own caution: "Accuracy
  at coastal areas is limited. This is not suitable for coastal navigation".
- **How it is fetched:** the server route `app/api/ocean/route.ts`, one request for the 91 points, cached for three
  hours (data cache and CDN) like the clouds; the reader's browser never calls Open-Meteo. It is not asked for where
  the water is a still frame (phones, reduced motion). A second deployment reads the route from the public map, as
  with the clouds.
- **Limits** (same free tier and terms as the clouds, above; non-commercial only): 91 points × about 8 requests a day
  = about 730 calls a day by Open-Meteo's count, on top of the clouds' ~3,200: about 3,900 of the 10,000 a day
  allowed, and at most ~500 in one minute if both refresh together (limit 600).
- **Credit:** in the map's attribution while live data moves the water: "Sea currents and swell: Open-Meteo Marine,
  generated using E.U. Copernicus Marine Service Information (CC BY 4.0; coarse, not for navigation)".
- **If it cannot be loaded:** the marks keep an illustrative drift drawn by hand (south-southeast along the coast,
  stronger offshore, swell from the west-northwest; `SKETCH_FLOW` in `lib/ocean.ts`), and the attribution says "Sea
  drift: illustrative, not data".
- **Where the sea is:** the wave marks are drawn by a shader, which cannot be clipped to the basemap's ocean shapes,
  so it reads `data/ref/ocean-mask.png`: the basemap's own ocean polygons (OpenFreeMap / OpenMapTiles, © OpenStreetMap
  contributors) at zoom 7, drawn into a 2048 px picture by `scripts/make-water.mjs`.


## Water close in: swell lines, bay ripple, glints on fresh water (illustrative)

- From about zoom 9 the open coast has long, soft swell lines that run with the shore, close up toward the beach and
  end in a wash at the water's edge; sheltered bays (San Francisco, San Pablo and Suisun, Tomales, Humboldt, Morro,
  San Diego, Mission Bay, San Pedro Bay behind its breakwaters, and enclosed harbours and lagoons generally) have a
  short, calm ripple instead; the inner part of Monterey Bay keeps the swell lines, gentler. Lakes, reservoirs, wide
  rivers and the Delta have small, sparse glints at every zoom, sized to the water they are on.
- **Illustrative, not data.** The lines are level lines of the distance from the shore, not a wave model: they do
  not show wave height, breaking, or where it is safe. Two things are live, from the swell above: the lines are
  stronger on shores that face the direction the swell comes from, and one line passes about every swell period
  (held between 7.5 and 11 seconds). Nothing measures wind or flow on fresh water.
- **Clipped to the basemap's own water.** `lib/waterfx.ts` triangulates the water shapes of the loaded basemap tiles
  (OpenFreeMap / OpenMapTiles, © OpenStreetMap contributors) and draws them into a picture of the ground in view, so
  the effects end exactly where the drawn water ends, at every zoom and in the tilted view. From zoom 9.5 the
  public-land shapes that lie over water (a state park over a bay, federal parcels over a reservoir) and every lease
  mark and cluster are cut out of it, with a margin. It is drawn right above the water and the sea floor, under every
  land fill, the sovereign-lands tint, lines, names and marks. Nothing is downloaded for it.
- **By hand:** which water is a sheltered bay is a short list of outlines in `lib/waterfx.ts` (`ZONES`). The Delta's
  tidal channels east of Suisun Bay are sea on the basemap (OpenStreetMap's coastline runs up them); they are in that
  list as fresh water.
- Not drawn on phones; one still frame for readers who prefer reduced motion. Nothing animates where no water is in
  view. The open sea's wave marks (above) thin out toward the coast and end at zoom 11.5; the swell lines carry on.
- **No longer used:** `data/ref/water-shimmer.geojson` (lake cells and river runs for the earlier glints and river
  dashes) is not loaded by the map any more.

## County boundaries

- `data/ref/ca-counties.geojson`: California county boundaries derived from US Census Bureau data (public domain), via
  the [click_that_hood](https://github.com/codeforgermany/click_that_hood) project. Used to estimate each
  lease's county, and as the source of the files below.
- `data/ref/ca-outline.geojson`: the counties dissolved into one state outline.
- `data/ref/ca-frame.json` (`node scripts/make-ca-frame.mjs`): California's land border (Oregon, Nevada, Arizona,
  Mexico) and an area polygon closing it through the Pacific (the state plus its bays and coastal waters). The map
  quiets everything outside that area and shows place names only inside it.
- `data/ref/ca-county-lines.geojson` and `ca-county-labels.geojson`: shared county borders and one interior point per
  county, made with [mapshaper](https://github.com/mbloch/mapshaper):
  `mapshaper ca-counties.geojson -innerlines` and `mapshaper ca-counties.geojson -points inner`.

## Public land completeness

- `docs/cpad-audit-2026-11.md`: every CPAD unit is on the map (checked against the live service with
  `node scripts/audit-cpad.mjs`), and a list of accessible public land CPAD does not cover.

## California place names

- `data/ref/ca-labels.geojson`: a short hand-placed list of mountain ranges, major rivers, bays, lakes and road passes,
  so the statewide map has names before the basemap's own labels appear. Positions are approximate label anchors,
  not survey locations. Cities, towns, smaller lakes, rivers and peaks come from the OpenFreeMap basemap
  (OpenStreetMap).

## Fonts

- Inter and Source Serif 4 (SIL Open Font License), loaded with `next/font`.

## Where attribution appears

- On the map: the attribution control credits the CSLC, CPAD (when that layer is on), OpenFreeMap, OpenMapTiles,
  OpenStreetMap contributors and AWS Terrain Tiles, and Open-Meteo while Clouds is on. It also says "Not legal or
  survey data".
- In the list footer and on every lease page: the source label with its pull date, the layer caveats and the disclaimer.
