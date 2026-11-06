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

## California Protected Areas Database (CPAD)

- Source: [CPAD units by agency level](https://gis.cnra.ca.gov/arcgis/rest/services/Boundaries/CPAD_AgencyLevel/MapServer/1),
  California Natural Resources Agency service. Snapshot in `data/layers/access.geojson`.
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
  the [click_that_hood](https://github.com/codeforgermany/click_that_hood) project. Used only to estimate each
  lease's county.

## Fonts

- Inter and Source Serif 4 (SIL Open Font License), loaded with `next/font`.

## Where attribution appears

- On the map: the attribution control credits the CSLC, CPAD (when that layer is on), OpenFreeMap, OpenMapTiles,
  OpenStreetMap contributors and AWS Terrain Tiles. It also says "Not legal or survey data".
- In the list footer and on every lease page: the source label with its pull date, the layer caveats and the disclaimer.
