// Copies the lessee names from the research export (wetsand `leases.public.json`, schema v3+) into
// data/lessees.json, the committed snapshot the map builds from. Run by hand when the export changes:
//
//   npm run sync:lessees                 # reads RESEARCH_DIR, else ../../wetsand/export
//   node scripts/sync/lessees.mjs <path to leases.public.json>
//
// Only organizations are copied. The export withholds the names of private individuals and trusts
// (value null, withheld true); those leases are left out here entirely, source item and all, so the
// public map neither names them nor points at the document that does.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const src = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(root, process.env.RESEARCH_DIR ?? "../../wetsand/export", "leases.public.json");
const exp = JSON.parse(fs.readFileSync(src, "utf8"));
if (!(exp.schemaVersion >= 3)) throw new Error(`${src}: schemaVersion ${exp.schemaVersion}; the lessee field needs 3 or later`);

const lessees = {};
let withheld = 0;
for (const l of exp.leases) {
  const le = l.lessee;
  if (!le) continue;
  if (le.withheld || !le.value) { withheld++; continue; }
  if (!le.source?.url || !le.source?.date) throw new Error(`PRC ${l.prc}: lessee without a dated source item`);
  lessees[l.prc] = { name: le.value.replace(/\s+/g, " ").trim(), source: { label: le.source.label, date: le.source.date, item: le.source.item ?? null, url: le.source.url } };
}
const out = {
  exportSchemaVersion: exp.schemaVersion,
  exportGeneratedAt: exp.generatedAt,
  method: exp.methods?.lessee ?? null,
  counts: { leases: exp.leases.length, named: Object.keys(lessees).length, withheld, none: exp.leases.length - Object.keys(lessees).length - withheld },
  lessees: Object.fromEntries(Object.entries(lessees).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))),
};
if (exp.counts?.lessee && exp.counts.lessee.named !== out.counts.named) throw new Error(`named lessees: export says ${exp.counts.lessee.named}, found ${out.counts.named}`);
fs.writeFileSync(path.join(root, "data/lessees.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`data/lessees.json: ${out.counts.named} organizations named, ${withheld} withheld (left out), ${out.counts.none} with no lessee on file; export ${exp.generatedAt}`);
