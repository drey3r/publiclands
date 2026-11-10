import "server-only";
import fs from "node:fs";
import path from "node:path";
import { mergeRecords, type CommissionRecord, type SourcedRecord } from "./records-merge";

/**
 * Commission records for one lease (staff reports, meeting items), from per-lease JSON files.
 * Each source is a folder of `<PRC>.json` files holding `[{ date, item, title, pages, url }]`
 * (or `{ records: [...] }`). Sources: every subfolder of data/records, plus any folders named in
 * RECORDS_DIRS (comma-separated, relative to this project). Duplicates (same URL) are dropped.
 */
export function loadRecords(prc: string): SourcedRecord[] {
  const root = process.cwd();
  const base = path.join(root, "data/records");
  const dirs: { dir: string; source: string }[] = [];
  try {
    for (const d of fs.readdirSync(base, { withFileTypes: true })) if (d.isDirectory()) dirs.push({ dir: path.join(base, d.name), source: d.name });
  } catch {}
  for (const d of (process.env.RECORDS_DIRS ?? "").split(",").map((x) => x.trim()).filter(Boolean)) dirs.push({ dir: path.resolve(root, d), source: path.basename(d) });

  const safe = prc.replace(/[^\w.-]/g, "_");
  const lists: { source: string; records: CommissionRecord[] }[] = [];
  for (const { dir, source } of dirs) {
    const file = path.join(dir, `${safe}.json`);
    if (!fs.existsSync(file)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(file, "utf8"));
      lists.push({ source, records: Array.isArray(j) ? j : (j.records ?? []) });
    } catch (e) {
      console.warn(`[records] could not read ${file}: ${(e as Error).message}`);
    }
  }
  return mergeRecords(lists);
}
