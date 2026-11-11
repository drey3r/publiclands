#!/usr/bin/env python3
"""
State oil & gas: build the committed map data from the dated snapshots.

    node scripts/fetch-state-oil-gas.ts                       # snapshots -> data-archive/ (never committed)
    python3 scripts/data/state_lease_wells.py --ref data/reference --snapshots data-archive/snapshots \
        --out data-archive/state-lease-wells.geojson --report data-archive/state-lease-wells.report.json
    python3 scripts/data/build_state_oil_gas.py               # -> data/state-oil-gas/, data/records/cslc-oil-gas-study/

Needs Python 3.12 or older (see state_lease_wells.py). No network: reads data-archive/ and data/reference/ only.
Stops with exit 1, writing nothing, if CSLC's pages no longer match the reference CSVs (lease lists, quitclaimed and
terminated tables, statuses): that means CSLC changed its records and a person should look first.

Outputs (committed; scripts/sync-data.mjs copies them to public/data/state-oil-gas/):
  offshore-leases.geojson        34 footprints (CSLC Offshore_Lease_Polygons) + the reconciliation CSV, joined by PRC
  marine-oil-terminals.geojson   59 berths (CSLC Marine_Oil_Terminals)
  state-lease-wells.geojson      CalGEM wells on CSLC state leases (tests A/B/C, FEASIBILITY.md section 3a)
  former-leases.json             47 quitclaimed/terminated leases (CSLC tables) + exact dates from the lease information page
  sla-boundary.geojson           BOEM Submerged Lands Act boundary, clipped to California
  sovereign-waterbodies.geojson  CSLC Significant Lands inventory: 42 sovereign lake and lagoon beds
  index.json                     per dataset: source URL, pulled date, source last-updated date, counts, caveats
"""
import csv, glob, html, json, os, re, sys
from collections import Counter
from datetime import datetime, timezone

import geopandas as gpd
from shapely.geometry import box, mapping, shape

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SNAP = os.path.join(ROOT, "data-archive", "snapshots")
REF = os.path.join(ROOT, "data", "reference")
OUT = os.path.join(ROOT, "data", "state-oil-gas")
REC = os.path.join(ROOT, "data", "records", "cslc-oil-gas-study")
WELLS = os.path.join(ROOT, "data-archive", "state-lease-wells.geojson")
WELLS_REPORT = os.path.join(ROOT, "data-archive", "state-lease-wells.report.json")
LEASES_PAGE = "https://www.slc.ca.gov/oil-gas/leases/"
INFO_PAGE = "https://www.slc.ca.gov/oil-gas/leases/lease-information/"
SR61 = "https://slcprdwordpressstorage.blob.core.windows.net/wordpressdata/2022/04/04-26-22_61.pdf"


def latest(slug):
    for d in sorted(glob.glob(os.path.join(SNAP, slug, "*")), reverse=True):
        mf = os.path.join(d, "manifest.json")
        if os.path.exists(mf):
            m = json.load(open(mf))
            if m.get("complete"):
                return d, m
    sys.exit(f"no complete snapshot for {slug}: run node scripts/fetch-state-oil-gas.ts")


def features(slug):
    d, m = latest(slug)
    feats = []
    for p in m["pages"]:
        feats += json.load(open(os.path.join(d, p["file"])))["features"]
    meta = json.load(open(os.path.join(d, "layer-metadata.json")))
    return feats, m, meta


def page_text(slug):
    d, m = latest(slug)
    t = open(os.path.join(d, m["pages"][0]["file"]), encoding="utf-8", errors="replace").read()
    t = re.sub(r"(?s)<(script|style).*?</\1>", "", t)
    lines = [l.strip() for l in html.unescape(re.sub(r"<[^>]+>", "\n", t)).replace("\xa0", " ").split("\n")]
    return [l for l in lines if l], m


def day(iso):
    return iso[:10] if iso else None


def us_date(s):
    """'July 28, 2026' / 'December 12,\n2017' -> '2026-07-28'."""
    s = re.sub(r"\s+", " ", s).strip().rstrip("*").strip()
    for fmt in ("%B %d, %Y", "%B %d %Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def rnd(geom, nd=5):
    def r(c):
        return [r(x) for x in c] if isinstance(c[0], (list, tuple)) else [round(c[0], nd), round(c[1], nd)]
    g = mapping(geom) if not isinstance(geom, dict) else geom
    return {"type": g["type"], "coordinates": r(g["coordinates"])}


def fc(feats):
    return {"type": "FeatureCollection", "features": feats}


def write_json(path, obj, indent=None):
    with open(path, "w") as f:
        json.dump(obj, f, indent=indent, ensure_ascii=False, separators=None if indent else (",", ":"))
        f.write("\n")


def base(n):
    n = str(n).strip().upper()
    n = re.sub(r"^5-1938-", "", n)
    return re.split(r"[-.]", n.lstrip("E-"))[0]


# ---------------------------------------------------------------- CSLC pages: parse and check against the CSVs
problems = []
qrows = list(csv.DictReader(open(os.path.join(REF, "cslc_quitclaimed_terminated_leases.csv"))))
rrows = list(csv.DictReader(open(os.path.join(REF, "offshore_leases_reconciled.csv"))))

L, leases_manifest = page_text("cslc-page-oil-gas-leases")
i = L.index("Quitclaimed Lease Count")
j = L.index("Total Leases Quitclaimed to Date")
qc = []
for l in L[i + 1:j]:
    if re.fullmatch(r"\d{3,4}\*?(, *\d{3,4}\*?)*", l):
        qc += [x.strip().rstrip("*") for x in l.split(",")]
qc_updated = us_date(L[L.index("Quitclaimed Offshore Oil and Gas Leases Status Summary", L.index("Quitclaimed Lease Count") - 5) + 1].replace("Last Updated:", ""))
k = L.index("Terminated Offshore Oil and Gas Lease Summary")
term_reviewed = us_date(L[k + 1].replace("Last Reviewed:", ""))
term = [L[x] for x in range(k, L.index("Total Leases Terminated: 3") if "Total Leases Terminated: 3" in L else len(L)) if re.fullmatch(r"\d{4}", L[x])]
csv_q = {r["prc"] for r in qrows if r["action"] == "quitclaimed"}
csv_t = {r["prc"] for r in qrows if r["action"] == "terminated"}
if set(qc) != csv_q or len(qc) != 44:
    problems.append(f"quitclaimed table: page {sorted(set(qc) ^ csv_q)} differ from the CSV ({len(qc)} on the page)")
if set(term) != csv_t:
    problems.append(f"terminated table: page {sorted(term)}, CSV {sorted(csv_t)}")

I, info_manifest = page_text("cslc-page-lease-information")
lu = next(l for l in I if l.startswith("Last Updated:"))
info_updated = us_date(lu.replace("Last Updated:", ""))
start = I.index(lu) + 1
current = []
while not re.search(r" - (Quitclaimed|Terminated)$", I[start]):
    current.append(I[start]); start += 1
EXPECTED_CURRENT = ["91", "163", "186", "425", "426", "427", "735", "1482", "1824", "3033", "3314", "3413", "4736", "E-392"]
if current != EXPECTED_CURRENT:
    problems.append(f"lease information page current leases changed: {current}")
if info_updated != "2026-07-28":
    problems.append(f"lease information page Last Updated is now {info_updated} (was 2026-07-28): re-check statuses")

info = {}  # PRC -> {status, action, date}
x = 0
while x < len(I):
    if I[x] == "Lease" and x + 1 < len(I) and I[x + 1].startswith(":"):
        y = x + 1; head = []
        while I[y] != "Lessee":
            head.append(I[y]); y += 1
        z = I.index("Status", y)
        h = re.sub(r"\s+", " ", " ".join(head).lstrip(": ")).strip()
        m = re.match(r"^(E-)?(\d+)(?:\s*[–-]\s*(Quitclaimed|Terminated)\s+(.*))?$", h)
        if m:
            info[(m.group(1) or "") + m.group(2)] = {
                "status": I[z + 1].lstrip(": ").strip(), "action": (m.group(3) or "").lower() or None,
                "date": us_date(m.group(4)) if m.group(4) else None,
            }
        x = z
    x += 1

# stated statuses still consistent with the reconciliation CSV
WORD = {"Producing": "producing", "Not Producing": "not producing", "Not producing": "not producing", "Injecting": "injecting"}
for r in rrows:
    p = r["prc"]; key = "E-392" if p == "392" else base(p)
    s = r["cslc_stated_status"].lower()
    pi = info.get(key)
    if p == "2879" or p == "3455":
        if key in info: problems.append(f"{p} now appears on the lease information page")
        continue
    if not pi:
        problems.append(f"{p}: missing from the lease information page"); continue
    if pi["action"]:
        if pi["action"] not in s: problems.append(f"{p}: page says {pi['action']}, CSV says {r['cslc_stated_status']}")
    elif pi["status"].startswith("Compensatory"):
        if "compensatory" not in s: problems.append(f"{p}: page says compensatory agreement, CSV {r['cslc_stated_status']}")
    elif not s.startswith(WORD.get(pi["status"], "?")):
        problems.append(f"{p}: page status {pi['status']!r}, CSV {r['cslc_stated_status']!r}")

if problems:
    print("CSLC's pages no longer match the reference CSVs. Nothing written. Look before rebuilding:")
    for p in problems: print("  -", p)
    sys.exit(1)

os.makedirs(OUT, exist_ok=True)
os.makedirs(REC, exist_ok=True)
leases_read = day(leases_manifest["pulled_at"]); info_read = day(info_manifest["pulled_at"])


# ---------------------------------------------------------------- Commission records from the staff_reports columns
def records(cell):
    out = []
    for e in [e.strip() for e in (cell or "").split(" | ") if e.strip()]:
        parts = [p.strip() for p in e.split(" — ")]
        if len(parts) != 4:
            sys.exit(f"unexpected staff_reports entry: {e}")
        date, desc, pages, url = parts
        m = re.match(r"^(Staff Report \d+(?: \([^)]*\))?|Calendar Item \w+(?: \([^)]*\))?|Commission meeting voting record, item \d+)[:,]?\s*(.*)$", desc)
        item, title = (m.group(1), m.group(2) or desc) if m else (None, desc)
        out.append({"date": date, "item": item, "title": title[:1].upper() + title[1:] if title else desc,
                    "pages": None if pages == "web page" else pages, "url": url})
    return sorted(out, key=lambda r: r["date"], reverse=True)


rec_by_key = {}
def add_records(key, recs):
    if not recs: return
    have = rec_by_key.setdefault(key, [])
    for r in recs:
        if not any(h["url"] == r["url"] and h["pages"] == r["pages"] for h in have):
            have.append(r)


# ---------------------------------------------------------------- former leases (47)
former = []
for r in qrows:
    p = r["prc"]; pi = info.get(p)
    sources = []
    exact = pi["date"] if pi and pi["action"] == r["action"] and pi["date"] else None
    if exact:
        sources.append({"label": "CSLC lease information page", "url": INFO_PAGE, "date": exact,
                        "sourceUpdated": info_updated, "read": info_read})
    tbl_updated = qc_updated if r["action"] == "quitclaimed" else term_reviewed
    sources.append({"label": "CSLC oil & gas leases page, " + ("quitclaimed" if r["action"] == "quitclaimed" else "terminated") + " table",
                    "url": LEASES_PAGE, "date": r["period_or_date"], "sourceUpdated": tbl_updated,
                    "sourceUpdatedLabel": "last updated" if r["action"] == "quitclaimed" else "last reviewed", "read": leases_read})
    recs = records(r["staff_reports"])
    add_records(p, recs)
    former.append({
        "prc": p, "action": r["action"], "date": exact or r["period_or_date"], "dateSources": sources,
        "lessee": r["lessee"] or None, "acres": r["acres"] or None, "location": r["location"] or None,
        "note": r["note"] or None, "hasFootprint": r["in_offshore_polygon_layer"] == "yes",
        "records": recs,
    })
former.sort(key=lambda f: (f["hasFootprint"] is False, f["prc"].zfill(5)))

# ---------------------------------------------------------------- offshore footprints (34)
polys, pm, pmeta = features("cslc-offshore-lease-polygons")
by_prc = {}
for r in rrows: by_prc.setdefault(r["prc"], r)
pt_feats, ptm, _ = features("cslc-oil-gas-lease-points")
og_nums = {str(f["properties"]["LeaseNum"]).strip() for f in pt_feats}
former_by = {f["prc"]: f for f in former}

PARCEL = {"Leased Lands": "Leased Lands", "State Mineral Lands": "State Mineral Lands", "State Lands": "State Lands"}
fp_out = []
for f in polys:
    pr = f["properties"]; prc = str(pr["PRC"]).strip(); r = by_prc.get(prc)
    if r is None: sys.exit(f"footprint PRC {prc} not in offshore_leases_reconciled.csv")
    join = r["join_to_map_leases"]
    if join == "exact": lease_nums, join_est = [prc], False
    elif join.startswith("base number"): lease_nums, join_est = [base(prc)], False
    elif join.startswith("alias: 91-M"): lease_nums, join_est = ["91-M", "91-N"], False
    elif join.startswith("alias: 5-1938-392"): lease_nums, join_est = ["5-1938-392"], True
    else: lease_nums, join_est = [], False
    notes = (pr.get("Notes") or "").strip() or None
    group = "compensatory" if base(prc) in ("4736", "1482") else "production"
    parcel = next((v for k, v in PARCEL.items() if notes and notes.startswith(k + ".")), None) if base(prc) == "4736" else None
    stated = r["cslc_stated_status"]
    dashed = bool(re.search(r"quitclaim|terminat|not producing", stated, re.I))
    recs = records(r["staff_reports"])
    key = base(prc) if group == "compensatory" else prc
    add_records(key, recs)
    for n in lease_nums: add_records(n, recs)
    fo = former_by.get(prc)
    fp_out.append({"type": "Feature", "properties": {
        "prc": prc, "group": group, "parcelClass": parcel,
        "layerStatus": pr.get("Lease_Stat"), "notes": notes,
        "cslc_stated_status": stated, "cslc_stated_status_source": r["cslc_stated_status_source"],
        "source_last_updated": r["source_last_updated"], "source_read": r["source_read"],
        "exactDate": fo["dateSources"][0] if fo and fo["dateSources"][0]["url"] == INFO_PAGE else None,
        "former": fo["action"] if fo else None,
        "staff_report_61_status_2022": r["staff_report_61_status_2022"] or None,
        "staff_report_61_page": r["staff_report_61_page"] or None,
        "sources_agree": r["sources_agree"], "note": r["note"] or None, "note_sources": r["note_sources"] or None,
        "leaseNums": lease_nums, "joinEstimate": join_est, "dashed": dashed,
        "recordsKey": key, "recordCount": len(recs),
    }, "geometry": rnd(shape(f["geometry"]))})

# ---------------------------------------------------------------- marine oil terminals (59)
terms, tm, tmeta = features("cslc-marine-oil-terminals")
t_out = []
for f in terms:
    p = f["properties"]
    t_out.append({"type": "Feature", "properties": {
        "wo": str(p["WO_"]).strip(), "berth": str(p["WO_Berth_ID"]).strip(), "terminal": (p.get("Terminal_Name") or "").strip(),
        "city": (p.get("City") or "").strip() or None, "county": (p.get("County") or "").strip() or None,
    }, "geometry": rnd(shape(f["geometry"]))})
t_caveat = re.sub(r"<[^>]+>", " ", html.unescape(tmeta.get("description") or ""))
t_caveat = re.sub(r"\s+", " ", t_caveat).strip()

# ---------------------------------------------------------------- wells
STATUS_GROUP = {"Active": "active", "Idle": "idle", "Plugged": "plugged"}
w = json.load(open(WELLS))
wrep = json.load(open(WELLS_REPORT))
fp_status = {f["properties"]["prc"]: f["properties"]["cslc_stated_status"] for f in fp_out}
w_out = []
for f in w["features"]:
    p = f["properties"]; county = (p.get("CountyName") or "").strip()
    fprc = [x for x in (p.get("footprint_prc") or "").split(";") if x]
    lprc = p.get("lease_name_prc") or None
    w_out.append({"type": "Feature", "properties": {
        "api": p.get("API"), "leaseName": p.get("LeaseName"), "wellNumber": p.get("WellNumber"),
        "wellStatus": p.get("WellStatus"), "statusGroup": STATUS_GROUP.get(p.get("WellStatus"), "other"),
        "wellType": p.get("WellTypeLabel"), "operator": p.get("OperatorName"), "field": p.get("FieldName"),
        "county": county or None, "offshore": county.lower().endswith("offshore"),
        "directional": p.get("isDirectionallyDrilled"), "gisSource": p.get("GISSource"),
        "footprintPrc": fprc, "footprintStatus": [fp_status.get(x) for x in fprc],
        "leaseNamePrc": lprc, "leaseNameFormer": (former_by[lprc]["action"] if lprc in former_by else None),
        "cslcOperator": bool(p.get("cslc_operator")),
    }, "geometry": rnd(shape(f["geometry"]), 5)})
w_out.sort(key=lambda f: ["plugged", "other", "idle", "active"].index(f["properties"]["statusGroup"]))  # active drawn last
wc = Counter(f["properties"]["statusGroup"] for f in w_out)
wo = Counter(f["properties"]["offshore"] for f in w_out)
wm = latest("calgem-wells")[1]

# ---------------------------------------------------------------- SLA boundary, clipped to California
sla, sm, smeta = features("boem-sla-boundary")
CA_BOX = box(-124.9, 32.53, -117.0, 42.0)  # Mexico border to the Oregon border, coast and islands
g = shape(sla[0]["geometry"]).intersection(CA_BOX).simplify(0.0001)
sla_out = [{"type": "Feature", "properties": {"type": "S", "name": "Submerged Lands Act boundary"}, "geometry": rnd(g, 5)}]

# ---------------------------------------------------------------- sovereign waterbodies (42)
wb, wbm, wbmeta = features("cslc-sovereign-waterbodies")
wb_out = []
for f in wb:
    p = f["properties"]
    wb_out.append({"type": "Feature", "properties": {
        "name": (p.get("WATERWAY") or "").strip(), "location": (p.get("LOCATION") or "").strip() or None,
        "county": (p.get("COUNTY") or "").strip() or None, "parcel": (p.get("PARCEL") or "").strip() or None,
        "url": (p.get("URL") or "").strip() or None,
    }, "geometry": rnd(shape(f["geometry"]).simplify(0.0001), 5)})

# ---------------------------------------------------------------- write
write_json(os.path.join(OUT, "offshore-leases.geojson"), fc(fp_out))
write_json(os.path.join(OUT, "marine-oil-terminals.geojson"), fc(t_out))
write_json(os.path.join(OUT, "state-lease-wells.geojson"), fc(w_out))
write_json(os.path.join(OUT, "sla-boundary.geojson"), fc(sla_out))
write_json(os.path.join(OUT, "sovereign-waterbodies.geojson"), fc(wb_out))
write_json(os.path.join(OUT, "former-leases.json"), {
    "source": {"leasesPage": LEASES_PAGE, "infoPage": INFO_PAGE, "quitclaimedUpdated": qc_updated,
               "terminatedReviewed": term_reviewed, "infoUpdated": info_updated, "read": leases_read},
    "leases": former}, indent=1)
for old in glob.glob(os.path.join(REC, "*.json")): os.remove(old)
for key, recs in rec_by_key.items():
    write_json(os.path.join(REC, re.sub(r"[^\w.-]", "_", key) + ".json"), sorted(recs, key=lambda r: r["date"], reverse=True), indent=1)


def ds(key, title, source, url, m, count, caveats, note=None, updated=None):
    return {"key": key, "title": title, "source": source, "url": url, "pulledAt": day(m["pulled_at"]),
            "sourceUpdated": updated or day(m.get("source_last_edit")), "sourceNote": note, "count": count, "caveats": caveats}


write_json(os.path.join(OUT, "index.json"), {"generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "datasets": [
    ds("og-footprints", "Offshore oil and gas lease footprints (CSLC)", "California State Lands Commission, Offshore_Lease_Polygons",
       pm["layer_url"], pm, len(fp_out), ["Footprints are approximate. Statuses are CSLC's; where its sources disagree, both are shown."]),
    ds("og-status-pages", "Oil and gas lease status pages (CSLC)", "California State Lands Commission web pages", INFO_PAGE,
       info_manifest, len(info), [f"Lease information page last updated {info_updated}; quitclaimed table {qc_updated}; terminated table last reviewed {term_reviewed}."],
       note="Web pages: dates are the pages' own “Last Updated” lines.", updated=info_updated),
    ds("og-terminals", "Marine oil terminals (CSLC)", "California State Lands Commission, Marine_Oil_Terminals", tm["layer_url"], tm, len(t_out),
       ["Locations are approximate (CSLC). No land-ownership claim."]),
    ds("og-wells", "Oil and gas wells on state leases (CalGEM)", "California Geologic Energy Management Division (CalGEM), WellSTAR wells",
       latest("calgem-wells")[1]["layer_url"], latest("calgem-wells")[1], len(w_out),
       ["Selected by this map (Estimate): inside a CSLC production-lease footprint, a CalGEM lease name naming a CSLC lease, or CSLC as operator.",
        "A well drilled from shore may have its surface location on private land."],
       note="CalGEM publishes no last-updated date for this layer."),
    ds("sla", "Submerged Lands Act boundary (BOEM)", "Bureau of Ocean Energy Management, OCS boundary lines", sm["layer_url"], sm, 1,
       ["Seaward limit of state submerged lands. Clipped to California for display."]),
    ds("sovereign-waterbodies", "Sovereign lake and lagoon beds (CSLC Significant Lands)", "California State Lands Commission, Significant_Lands_Waterbodies",
       wbm["layer_url"], wbm, len(wb_out), ["Not a complete sovereign-lands map."]),
], "terminalsCaveat": t_caveat or None}, indent=1)

print(json.dumps({
    "footprints": len(fp_out), "footprint_groups": dict(Counter(f["properties"]["group"] for f in fp_out)),
    "dashed": sum(f["properties"]["dashed"] for f in fp_out),
    "terminals": len(t_out), "terminal_WO": len({f["properties"]["wo"] for f in t_out}),
    "wells": len(w_out), "wells_by_status": dict(wc), "wells_offshore": wo[True], "wells_onshore": wo[False], "wells_report": wrep,
    "former": len(former), "former_with_footprint": sum(f["hasFootprint"] for f in former),
    "former_exact_dates": [(f["prc"], f["date"]) for f in former if f["dateSources"][0]["url"] == INFO_PAGE],
    "record_files": len(rec_by_key), "sla_parts": len(getattr(g, "geoms", [g])), "waterbodies": len(wb_out),
    "page_info_leases": len(info),
}, indent=1))
