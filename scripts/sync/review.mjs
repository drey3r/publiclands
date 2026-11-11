// "What the records show" (Finding): one export/review/<PRC>.json per lease read from the Commission's records
// (wetsand export schema: review/*.json v1). Read from REVIEW_DIR, else RESEARCH_DIR/review, else data/review
// (committed). Every file is checked; a file that doesn't match the schema stops the build with its name and the problem.
import fs from "node:fs";
import path from "node:path";

const isStr = (v) => typeof v === "string";
const strOrNull = (v) => v === null || v === undefined || typeof v === "string";
function check(f, file) {
  const bad = (msg) => { throw new Error(`review: ${file}: ${msg} (expected wetsand export review/*.json schemaVersion 1; see its SCHEMA.md)`); };
  if (f?.schemaVersion !== 1) bad(`schemaVersion is ${JSON.stringify(f?.schemaVersion)}, not 1`);
  if (!isStr(f.prc) || !f.prc) bad("prc missing");
  if (!f.finding || !isStr(f.finding.kind) || !isStr(f.finding.value) || !isStr(f.finding.summary)) bad("finding.kind/value/summary must be text");
  if (!strOrNull(f.whatWasThere)) bad("whatWasThere must be text or null");
  if (!Array.isArray(f.evidence)) bad("evidence must be a list");
  f.evidence.forEach((e, i) => {
    if (!isStr(e?.label) || !isStr(e?.quote)) bad(`evidence[${i}] needs label and quote`);
    if (!strOrNull(e.url) || !(e.page == null || typeof e.page === "number")) bad(`evidence[${i}] url must be text, page a number`);
  });
  if (!Array.isArray(f.documents ?? [])) bad("documents must be a list");
  for (const k of ["group", "groupLabel", "ranking", "followUp", "private"]) if (k in f) bad(`carries a private field "${k}"`);
}

export function buildReview(root) {
  const dir = process.env.REVIEW_DIR
    ? path.resolve(root, process.env.REVIEW_DIR)
    : process.env.RESEARCH_DIR && fs.existsSync(path.resolve(root, process.env.RESEARCH_DIR, "review"))
      ? path.resolve(root, process.env.RESEARCH_DIR, "review")
      : path.join(root, "data/review");
  const out = {};
  if (!fs.existsSync(dir)) return { dir: null, byPrc: out };
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const file = path.join(dir, name);
    let f;
    try { f = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { throw new Error(`review: ${file}: not valid JSON (${e.message})`); }
    check(f, file);
    out[f.prc] = {
      heading: f.heading ?? "What the records show",
      finding: f.finding,
      whatWasThere: f.whatWasThere ?? null,
      evidence: f.evidence.map((e) => ({ label: e.label, date: e.date ?? null, item: e.item ?? null, url: e.url ?? null, page: e.page ?? null, quote: e.quote })),
      documents: (f.documents ?? []).map((d) => ({ date: d.date ?? null, item: d.item ?? null, title: String(d.title ?? ""), url: String(d.url ?? "") })),
      method: f.method ?? null,
      readOn: f.readOn ?? null,
    };
  }
  return { dir, byPrc: out };
}
