# Land outside California near its coastal state lines, from OpenStreetMap's own coastline (the same coastline the
# basemap draws). Used only for the State sovereign lands display mask (build_state_oil_gas.py), so the state-waters
# tint stops exactly at the basemap's coast in Baja California and Oregon (Natural Earth's coast was off by up to a few
# hundred meters there, leaving a tinted sliver).
#
# Input: Overpass API JSON for `way["natural"="coastline"](<bbox>); out geom;`, one file per region (fetched once,
# politely; not committed: ~30 MB). Output: data/ref/osm-land-near-ca.geojson with each region's bbox and its land.
# Data © OpenStreetMap contributors, ODbL.
#
#   python3 scripts/data/osm_land_near_ca.py mx.json:23.0,-118.6,32.6,-108.5 or.json:41.95,-126.2,46.0,-123.2
import json, os, sys
from shapely.geometry import LineString, Point, box, mapping
from shapely.ops import polygonize, unary_union
from shapely.strtree import STRtree

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
out = []
for arg in sys.argv[1:]:
    path, bb = arg.split(":")
    s, w, n, e = map(float, bb.split(","))
    region = box(w, s, e, n)
    ways = [LineString([(p["lon"], p["lat"]) for p in el["geometry"]]) for el in json.load(open(path))["elements"] if el.get("geometry") and len(el["geometry"]) > 1]
    # OSM coastlines run with land on the left. Each face of (coastline + region edge) is land or sea; read the side
    # from the nearest coastline segment.
    segs = [LineString([c[i], c[i + 1]]) for wl in ways for c in [list(wl.coords)] for i in range(len(c) - 1)]
    tree = STRtree(segs)
    faces = list(polygonize(unary_union([region.boundary] + [wl.intersection(region) for wl in ways])))
    land = []
    for f in faces:
        if f.area < 1e-12: continue
        pt = f.representative_point()
        sg = segs[tree.nearest(pt)]
        (x1, y1), (x2, y2) = sg.coords
        cross = (x2 - x1) * (pt.y - y1) - (y2 - y1) * (pt.x - x1)
        if cross > 0: land.append(f)
    L = unary_union(land).simplify(0.00005)
    print(f"{path}: {len(ways)} ways, {len(segs)} segments, {len(faces)} faces, {len(land)} land")
    out.append({"type": "Feature", "properties": {"region": [w, s, e, n]}, "geometry": mapping(L)})

def rnd(o):
    if isinstance(o, (list, tuple)): return [rnd(x) for x in o]
    return round(o, 5) if isinstance(o, float) else o
for f in out: f["geometry"]["coordinates"] = rnd(f["geometry"]["coordinates"])
dst = os.path.join(ROOT, "data", "ref", "osm-land-near-ca.geojson")
json.dump({"type": "FeatureCollection", "note": "Land outside California near the Oregon and Mexico lines, from the OpenStreetMap coastline (© OpenStreetMap contributors, ODbL). Display mask only.", "features": out}, open(dst, "w"), separators=(",", ":"))
print("wrote", dst, os.path.getsize(dst))
