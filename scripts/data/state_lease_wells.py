#!/usr/bin/env python3
"""
CalGEM wells on CSLC state leases: the v4 rule (FEASIBILITY.md §3a, METHOD.md).
Run 2026-11-11: 1,738 wells (A 778, B only 932, C only 28), identical to the browser result.

Needs Python 3.12 or older for geopandas/pyproj wheels on macOS (pyproj fails to build on 3.14):
    python3.12 -m venv .venv && .venv/bin/pip install --only-binary=:all: geopandas shapely pyogrio 'pyproj<3.7'

A well is included if any of these is true:
  A  surface location inside an Offshore_Lease_Polygons footprint, excluding the
     compensatory agreements 4736 and 1482
  B  LeaseName names a CSLC lease number:
     ^state (prc )?e?-?NNNN(.N)? , with NNNN in the known-PRC list
  C  OperatorName contains "State Lands Commission"

Known-PRC list = polygon PRCs
               + data/reference/cslc_quitclaimed_terminated_leases.csv
               + base LeaseNum of every lease-layer record with TypeofLease
                 'Oil & Gas Lease' or 'Compensatory Agreement'

    # from the dated snapshots written by scripts/fetch-state-oil-gas.ts (no network):
    python3 scripts/data/state_lease_wells.py --ref data/reference --snapshots data-archive/snapshots \
        --out data-archive/state-lease-wells.geojson --report data-archive/state-lease-wells.report.json
    # or straight from the live services (paced, >= 1 s between requests):
    python3 scripts/data/state_lease_wells.py --ref data/reference --out state-lease-wells.geojson
scripts/data/build_state_oil_gas.py turns the output into data/state-oil-gas/state-lease-wells.geojson.
"""
import argparse, csv, glob, json, os, re, time, urllib.parse, urllib.request
from collections import Counter
import geopandas as gpd, pandas as pd

WELLS = "https://gis.conservation.ca.gov/server/rest/services/WellSTAR/Wells/MapServer/0"
CSLC = "https://services3.arcgis.com/5aaQCuq3e4GRvkFG/ArcGIS/rest/services/"
FIELDS = "API,LeaseName,WellNumber,WellStatus,WellTypeLabel,OperatorName,FieldName,CountyName,isDirectionallyDrilled,GISSource"
PAT = re.compile(r"^\s*state\s+(?:prc\s+)?e?-?(\d{2,4})(?:\.\d)?\b", re.I)


def get(url, **p):
    time.sleep(1.0)  # at least 1 s between requests
    return json.loads(urllib.request.urlopen(url + "?" + urllib.parse.urlencode(p), timeout=180).read())


def geo(url, **p):
    fc = get(url + "/query", outSR=4326, f="geojson", **p)
    return gpd.GeoDataFrame.from_features(fc["features"], crs=4326)


def snap(root, slug):
    """All features of the newest complete snapshot of <slug> (byte-exact pages + manifest.json)."""
    for d in sorted(glob.glob(os.path.join(root, slug, "*")), reverse=True):
        mf = os.path.join(d, "manifest.json")
        if not os.path.exists(mf):
            continue
        m = json.load(open(mf))
        if not m.get("complete"):
            continue
        feats = []
        for p in m["pages"]:
            feats += json.load(open(os.path.join(d, p["file"])))["features"]
        return gpd.GeoDataFrame.from_features(feats, crs=4326), m
    raise SystemExit(f"no complete snapshot for {slug} in {root}")


def base(n):
    n = str(n).strip().upper()
    n = re.sub(r"^5-1938-", "", n)
    return re.split(r"[-.]", n.lstrip("E-"))[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", default="data/reference")
    ap.add_argument("--out", default="state-lease-wells.geojson")
    ap.add_argument("--snapshots", help="read data-archive/snapshots instead of the live services")
    ap.add_argument("--report", help="also write the counts as JSON here")
    a = ap.parse_args()

    if a.snapshots:
        off, _ = snap(a.snapshots, "cslc-offshore-lease-polygons")
        og, _ = snap(a.snapshots, "cslc-oil-gas-lease-points")
    else:
        off = geo(CSLC + "Offshore_Lease_Polygons/FeatureServer/0", where="1=1", outFields="PRC,Lease_Stat")
        og = geo(CSLC + "CA_State_Lands_Commission_Leases/FeatureServer/0",
                 where="TypeofLease IN ('Oil & Gas Lease','Compensatory Agreement')", outFields="LeaseNum")
    known = {base(p) for p in off.PRC} | {base(n) for n in og.LeaseNum}
    known |= {r["prc"] for r in csv.DictReader(open(f"{a.ref}/cslc_quitclaimed_terminated_leases.csv"))}

    if a.snapshots:
        w, wm = snap(a.snapshots, "calgem-wells")
        n = wm["server_count"]
        w = w[FIELDS.split(",") + ["geometry"]]
    else:
        n = get(WELLS + "/query", where="1=1", returnCountOnly="true", f="json")["count"]
        frames = []
        for o in range(0, n, 5000):
            frames.append(geo(WELLS, where="1=1", outFields=FIELDS, orderByFields="OBJECTID",
                              resultOffset=o, resultRecordCount=5000))
        w = pd.concat(frames, ignore_index=True)
    assert len(w) == n, f"pulled {len(w)} of {n} wells"

    prod = off[~off.PRC.astype(str).str.match(r"^(4736|1482)")]
    hit = gpd.sjoin(w, prod[["PRC", "geometry"]], predicate="within", how="left")
    footprint = hit.groupby(level=0)["PRC"].agg(lambda s: ";".join(sorted({str(x) for x in s.dropna()})))
    w["footprint_prc"] = footprint.reindex(w.index).fillna("")
    w["lease_name_prc"] = w.LeaseName.fillna("").map(lambda s: (m := PAT.match(s)) and m.group(1) in known and m.group(1) or "")
    w["cslc_operator"] = w.OperatorName.fillna("").str.contains("State Lands Commission", case=False)

    A = w.footprint_prc != ""
    B = w.lease_name_prc != ""
    C = w.cslc_operator
    sel = w[A | B | C].copy()
    sel["included_because"] = [
        "inside CSLC lease footprint " + f if f else ("CalGEM lease name names PRC " + l if l else "CalGEM operator is State Lands Commission")
        for f, l in zip(sel.footprint_prc, sel.lease_name_prc)]
    report = {
        "wells_total": n, "selected": len(sel),
        "A_footprint": int(A.sum()), "B_only": int((B & ~A).sum()), "C_only": int((C & ~A & ~B).sum()),
        "by_status": dict(Counter(sel.WellStatus)),
        "known_prc_count": len(known),
    }
    print(json.dumps(report, indent=2))
    if a.report:
        json.dump(report, open(a.report, "w"), indent=2)
    sel.to_file(a.out, driver="GeoJSON")


if __name__ == "__main__":
    main()
