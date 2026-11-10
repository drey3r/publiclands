# Public land completeness (CPAD), November 2026

Run `node scripts/audit-cpad.mjs` to reproduce (needs `tippecanoe-decode`; the "source today"
column queries the live CPAD service).

## Result

- **Every CPAD unit is on the map.** The source, our snapshot (pulled 2026-11-06, CPAD 2026a)
  and the map tiles all hold 17,930 units, with identical counts by agency level and by access
  type (tables below).
- **Gap found and fixed:** before this audit, 40 very small units (0–2.6 acres: pocket parks,
  street triangles, trail access parcels) never appeared at any zoom. Our ~50 m generalization
  collapsed their outlines and tile building dropped them. `fetch:layers` now re-requests any
  collapsed outline at full detail and keeps tiny polygons when tiling.
- **Small parks appear as you zoom in.** Statewide views thin the smallest units so the map stays
  fast (about 7,500 units drawn at zoom 5); every unit is drawn from zoom 10 on. The "in view"
  counts at statewide zoom are therefore approximate.

Units: source 17930 · snapshot 17930 · tiles at full zoom 17930 (any zoom: 17930)

## By agency level (AGNCY_LEV)

| | Source today | Our snapshot | Map tiles |
|---|---:|---:|---:|
| City | 10483 | 10483 | 10483 |
| County | 1396 | 1396 | 1396 |
| Federal | 571 | 571 | 571 |
| Home Owners Association | 44 | 44 | 44 |
| Joint | 71 | 71 | 71 |
| Non Profit | 1100 | 1100 | 1100 |
| Private | 67 | 67 | 67 |
| Special District | 2988 | 2988 | 2988 |
| State | 1205 | 1205 | 1205 |
| Tribal | 5 | 5 | 5 |

## By access type (ACCESS_TYP)

| | Source today | Our snapshot | Map tiles |
|---|---:|---:|---:|
| No Public Access | 1133 | 1133 | 1133 |
| Open Access | 15376 | 15376 | 15376 |
| Restricted Access | 1252 | 1252 | 1252 |
| Unknown Access | 169 | 169 | 169 |

## Units present at each zoom (tiles)

| Zoom | Units |
|---:|---:|
| 4 | 10361 |
| 5 | 7458 |
| 6 | 16761 |
| 7 | 17628 |
| 8 | 17898 |
| 9 | 17927 |
| 10 | 17930 |
| 11 | 17930 |
| 12 | 17930 |

## Accessible public land CPAD does not cover (note for later; no new datasets now)

CPAD maps fee-owned protected open space. Not in it, or only partly:

1. **Conservation easements** (CPAD's companion CCED dataset). Mostly private land with no public
   access, but some easements carry public trails or access.
2. **State sovereign lands: tide and submerged lands, lakebeds and riverbeds** held by the State
   Lands Commission. Beaches below the mean high tide line and navigable waterways are public trust
   land open to the public, but they are not CPAD units. (The CSLC layers on this map cover only
   parts of this.)
3. **Coastal access easements and offers to dedicate** (Coastal Commission and Coastal Conservancy
   accessways across private land).
4. **Public school grounds and other agency land** opened for recreation by joint-use agreements.
5. **Military and other federal land with public access programs** (some bases allow hunting,
   fishing or trail use) where it isn't held as protected open space.
6. **Tribal lands open to visitors**: CPAD lists only a handful of tribal holdings.
7. **Public rights of way used as trails**: rail-trails, levee tops and canal banks, unless an
   agency holds them as a CPAD unit (some, like the Contra Costa Canal Trail, are).
