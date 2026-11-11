# scripts/data: State oil & gas

Three steps, in order. Every script waits at least 1 second between requests to agency servers.

```bash
node scripts/fetch-state-oil-gas.ts          # byte-exact dated snapshots -> data-archive/ (never committed or deployed)
python3.12 scripts/data/state_lease_wells.py --ref data/reference --snapshots data-archive/snapshots \
  --out data-archive/state-lease-wells.geojson --report data-archive/state-lease-wells.report.json
python3.12 scripts/data/build_state_oil_gas.py   # -> data/state-oil-gas/ and data/records/cslc-oil-gas-study/
```

The fetcher exits 1 (and the build should not be run) if a layer's saved records differ from the server count,
the count fell more than 5% since the previous snapshot, or a required field is missing. The build exits 1,
writing nothing, if CSLC's oil & gas pages no longer match `data/reference/*.csv`.

## Python version

The two Python scripts need **Python 3.12 or older**. On macOS, `pyproj` (a geopandas dependency) has no wheel
for Python 3.14 and fails to build from source. A working setup:

```bash
python3.12 -m venv .venv
.venv/bin/pip install --only-binary=:all: geopandas shapely pyogrio 'pyproj<3.7'
```

(`.venv/` is local; tested with geopandas 1.1.4 and pyproj 3.6.1.)
