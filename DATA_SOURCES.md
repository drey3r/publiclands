# Data sources

Everything the map shows comes from the public sources below. The build reads only the snapshots committed in `data/`.
The deployed site never calls the State Lands Commission. The only network requests a visitor's browser makes are for
basemap tiles, terrain tiles and place search.

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
  used for hillshade and 3D terrain.
- Required attribution, shown on the map: data sources include USGS 3DEP, SRTM, GMTED2010 and ETOPO1. See the
  [attribution list](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) for the full set.

## Place search: Photon

- [Photon](https://photon.komoot.io/) geocoder by komoot, built on OpenStreetMap data (ODbL). Search is limited to
  California's bounding box. The public endpoint is free for fair use. Self-host Photon if you expect heavy traffic.

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
  OpenStreetMap contributors and AWS Terrain Tiles. It also says "Not legal or survey data".
- In the list footer and on every lease page: the source label with its pull date, the layer caveats and the disclaimer.
