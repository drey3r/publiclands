// Builds data/fixtures/leases.geojson: a small sample of the CSLC lease layer
// snapshot (same raw format) for fast development with DATA_SOURCE=fixture.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "data/cslc");
const file = fs.readdirSync(dir).filter((f) => /^leases-.*\.geojson$/.test(f)).sort().at(-1);
const snap = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));

// Keep the featured stories and every 120th lease number.
const keep = new Set(["1579", "944", "791", "415", "1449"]);
const prcs = [...new Set(snap.features.map((f) => f.properties.LeaseNum))];
prcs.forEach((p, i) => i % 120 === 0 && keep.add(p));
const features = snap.features.filter((f) => keep.has(f.properties.LeaseNum));
const out = { ...snap, source: { ...snap.source, fixture: true, note: `FIXTURE: ${keep.size}-lease sample of ${file}` }, features };
fs.mkdirSync(path.join(root, "data/fixtures"), { recursive: true });
fs.writeFileSync(path.join(root, "data/fixtures/leases.geojson"), JSON.stringify(out));
console.log(`fixture: ${keep.size} leases, ${features.length} points`);
